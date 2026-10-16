#!/usr/bin/env bash
# Vitszee production deploy: git pull → install → build frontend → restart PM2 → health checks
set -euo pipefail

########################################
# Config (override via env or deploy.env)
########################################
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Repo root = Scripts/deploy -> ../..
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Prefer external config so secrets / paths stay outside git
for CANDIDATE in \
  "${DEPLOY_ENV_FILE:-}" \
  "/etc/vitszee/deploy.env" \
  "${REPO_ROOT}/.deploy.env" \
  "${SCRIPT_DIR}/deploy.env"
do
  if [[ -n "${CANDIDATE}" && -f "${CANDIDATE}" ]]; then
    # shellcheck disable=SC1090
    source "${CANDIDATE}"
    echo "==> Loaded config: ${CANDIDATE}"
    break
  fi
done

APP_DIR="${APP_DIR:-$REPO_ROOT}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
WEB_ROOT="${WEB_ROOT:-}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:7000/health}"
READY_URL="${READY_URL:-http://127.0.0.1:7000/health/ready}"
PUBLIC_HEALTH_URL="${PUBLIC_HEALTH_URL:-}"
PM2_APP_NAMES="${PM2_APP_NAMES:-all}"
NODE_ENV="${NODE_ENV:-production}"
NPM_INSTALL_FLAGS="${NPM_INSTALL_FLAGS:---omit=dev}"
SKIP_FRONTEND="${SKIP_FRONTEND:-0}"
SKIP_BACKEND_INSTALL="${SKIP_BACKEND_INSTALL:-0}"
HEALTH_RETRIES="${HEALTH_RETRIES:-20}"
HEALTH_SLEEP_SEC="${HEALTH_SLEEP_SEC:-3}"

log()  { echo -e "\n\033[1;32m==>\033[0m $*"; }
warn() { echo -e "\033[1;33m[!]\033[0m $*"; }
die()  { echo -e "\033[1;31m[x]\033[0m $*" >&2; exit 1; }

need() { command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"; }

need git
need node
need npm

log "Deploy start $(date -u +%Y-%m-%dT%H:%M:%SZ)"
log "APP_DIR=${APP_DIR}  BRANCH=${DEPLOY_BRANCH}"

cd "${APP_DIR}" || die "APP_DIR not found: ${APP_DIR}"

########################################
# 1) Git pull
########################################
log "Fetching ${DEPLOY_BRANCH}"
git fetch --prune origin "${DEPLOY_BRANCH}"
CURRENT="$(git rev-parse --abbrev-ref HEAD)"
if [[ "${CURRENT}" != "${DEPLOY_BRANCH}" ]]; then
  warn "On branch ${CURRENT}; checking out ${DEPLOY_BRANCH}"
  git checkout "${DEPLOY_BRANCH}"
fi

# Keep local .env / builds; abort on dirty tracked files that would block pull
if ! git diff --quiet || ! git diff --cached --quiet; then
  warn "Working tree has local changes — stashing (including untracked except .env)"
  git stash push -u -m "deploy-auto-stash-$(date +%s)" -- . ':!.env' ':!backend/.env' ':!frontend/.env' ':!.deploy.env' || true
fi

BEFORE="$(git rev-parse --short HEAD)"
git pull --ff-only origin "${DEPLOY_BRANCH}"
AFTER="$(git rev-parse --short HEAD)"
log "Git ${BEFORE} → ${AFTER}"

########################################
# 2) Backend deps
########################################
if [[ "${SKIP_BACKEND_INSTALL}" != "1" ]]; then
  log "Installing backend dependencies"
  cd "${APP_DIR}/backend"
  if [[ -f package-lock.json ]]; then
    npm ci ${NPM_INSTALL_FLAGS} || npm install ${NPM_INSTALL_FLAGS}
  else
    npm install ${NPM_INSTALL_FLAGS}
  fi
else
  warn "Skipping backend install"
fi

########################################
# 3) Frontend deps + build
########################################
if [[ "${SKIP_FRONTEND}" != "1" ]]; then
  log "Installing frontend dependencies + building"
  cd "${APP_DIR}/frontend"
  if [[ -f package-lock.json ]]; then
    npm ci || npm install
  else
    npm install
  fi
  npm run build

  DIST_DIR="${APP_DIR}/frontend/dist"
  [[ -d "${DIST_DIR}" ]] || die "Frontend build missing: ${DIST_DIR}"

  if [[ -n "${WEB_ROOT}" ]]; then
    log "Syncing frontend dist → ${WEB_ROOT}"
    need rsync
    mkdir -p "${WEB_ROOT}"
    rsync -a --delete "${DIST_DIR}/" "${WEB_ROOT}/"
  else
    warn "WEB_ROOT empty — leaving dist in place (configure nginx to serve ${DIST_DIR} or set WEB_ROOT)"
  fi
else
  warn "Skipping frontend build"
fi

########################################
# 4) Restart backend (PM2)
########################################
cd "${APP_DIR}"
if command -v pm2 >/dev/null 2>&1; then
  log "Restarting PM2 (${PM2_APP_NAMES})"
  if [[ "${PM2_APP_NAMES}" == "all" ]]; then
    pm2 restart all --update-env || pm2 reload all --update-env
  else
    # shellcheck disable=SC2086
    pm2 restart ${PM2_APP_NAMES} --update-env || pm2 reload ${PM2_APP_NAMES} --update-env
  fi
  pm2 save || true
  pm2 status || true
else
  warn "pm2 not found — restart backend manually"
fi

########################################
# 5) Health checks
########################################
check_url() {
  local url="$1"
  local label="$2"
  local code
  code="$(curl -sS -o /tmp/vitszee-health.json -w "%{http_code}" --max-time 10 "${url}" || echo "000")"
  if [[ "${code}" == "200" ]]; then
    echo "  OK  ${label} (${url}) → ${code}"
    return 0
  fi
  echo "  FAIL ${label} (${url}) → ${code}"
  [[ -f /tmp/vitszee-health.json ]] && head -c 400 /tmp/vitszee-health.json && echo
  return 1
}

log "Health checks (up to ${HEALTH_RETRIES} attempts)"
OK=0
for i in $(seq 1 "${HEALTH_RETRIES}"); do
  echo "  attempt ${i}/${HEALTH_RETRIES}..."
  if check_url "${HEALTH_URL}" "liveness" && check_url "${READY_URL}" "readiness"; then
    OK=1
    break
  fi
  sleep "${HEALTH_SLEEP_SEC}"
done

if [[ "${OK}" != "1" ]]; then
  die "Health checks failed after deploy. Inspect: pm2 logs"
fi

if [[ -n "${PUBLIC_HEALTH_URL}" ]]; then
  log "Public health: ${PUBLIC_HEALTH_URL}"
  check_url "${PUBLIC_HEALTH_URL}" "public" || warn "Public health check failed (CDN/nginx cache?)"
fi

log "Deploy complete ✓  commit=${AFTER}  $(date -u +%Y-%m-%dT%H:%M:%SZ)"
