#!/usr/bin/env bash
# One-time server setup for Vitszee deploy.
# Run AS ROOT on the VPS after cloning the repo.
#
# Example (on server):
#   export APP_DIR=/var/www/vitszee
#   export GIT_URL=https://github.com/Vinita2323/Vitszee.git
#   bash bootstrap-server.sh
#
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/vitszee}"
GIT_URL="${GIT_URL:-https://github.com/Vinita2323/Vitszee.git}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
WEB_ROOT="${WEB_ROOT:-}"
NODE_MAJOR="${NODE_MAJOR:-20}"

log() { echo -e "\n\033[1;32m==>\033[0m $*"; }

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root" >&2
  exit 1
fi

log "Installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl git rsync build-essential ca-certificates

if ! command -v node >/dev/null 2>&1; then
  log "Installing Node.js ${NODE_MAJOR}.x"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi

if ! command -v pm2 >/dev/null 2>&1; then
  log "Installing PM2"
  npm install -g pm2
fi

log "Cloning / updating repo at ${APP_DIR}"
mkdir -p "$(dirname "${APP_DIR}")"
if [[ -d "${APP_DIR}/.git" ]]; then
  git -C "${APP_DIR}" fetch --prune origin
  git -C "${APP_DIR}" checkout "${DEPLOY_BRANCH}"
  git -C "${APP_DIR}" pull --ff-only origin "${DEPLOY_BRANCH}"
else
  git clone -b "${DEPLOY_BRANCH}" "${GIT_URL}" "${APP_DIR}"
fi

log "Writing /etc/vitszee/deploy.env"
mkdir -p /etc/vitszee
cat > /etc/vitszee/deploy.env <<EOF
APP_DIR=${APP_DIR}
DEPLOY_BRANCH=${DEPLOY_BRANCH}
WEB_ROOT=${WEB_ROOT}
HEALTH_URL=http://127.0.0.1:7000/health
READY_URL=http://127.0.0.1:7000/health/ready
PUBLIC_HEALTH_URL=https://vitszee.com/api/health
PM2_APP_NAMES=all
NODE_ENV=production
NPM_INSTALL_FLAGS=--omit=dev
SKIP_FRONTEND=0
SKIP_BACKEND_INSTALL=0
EOF
chmod 600 /etc/vitszee/deploy.env

log "Making deploy.sh executable"
chmod +x "${APP_DIR}/Scripts/deploy/deploy.sh"

# Convenience symlinks: vitszee-deploy and deploy
ln -sfn "${APP_DIR}/Scripts/deploy/deploy.sh" /usr/local/bin/vitszee-deploy
ln -sfn "${APP_DIR}/Scripts/deploy/deploy.sh" /usr/local/bin/deploy

log "IMPORTANT: ensure backend/.env exists with production secrets before first start"
if [[ ! -f "${APP_DIR}/backend/.env" ]]; then
  echo "  Missing ${APP_DIR}/backend/.env — copy from your secrets store before pm2 start"
fi

log "Bootstrap done. Next:"
echo "  1) Put production backend/.env in place"
echo "  2) cd ${APP_DIR}/backend && npm ci --omit=dev"
echo "  3) pm2 start ${APP_DIR}/Scripts/deploy/ecosystem.config.cjs  (or your existing PM2 apps)"
echo "  4) pm2 save && pm2 startup"
echo "  5) Deploy anytime with:  deploy   (or vitszee-deploy)"
echo "     or from your PC:     powershell -File Scripts\\deploy\\remote-deploy.ps1"
