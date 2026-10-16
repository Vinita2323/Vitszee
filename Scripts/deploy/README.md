# Vitszee deploy

One command to **git pull → npm install → build frontend → restart PM2 → health check**.

## Security first

- **Do not put the root password in any script or git file.**
- Prefer SSH keys. Change the root password if it was shared in chat.
- Keep production secrets only in `backend/.env` on the server (`chmod 600`).

---

## One-time bootstrap (on the server)

SSH in, then paste:

```bash
ssh root@200.234.46.248
```

```bash
export APP_DIR=/var/www/vitszee
export GIT_URL=https://github.com/Vinita2323/Vitszee.git
export DEPLOY_BRANCH=main
# Optional: where nginx serves the SPA
# export WEB_ROOT=/var/www/html

# If repo already exists elsewhere, set APP_DIR to that path instead of cloning again.
curl -fsSL https://raw.githubusercontent.com/Vinita2323/Vitszee/main/scripts/deploy/bootstrap-server.sh -o /tmp/bootstrap-server.sh \
  || git clone --depth 1 "$GIT_URL" /tmp/vitszee-bootstrap

# Prefer running from a clone:
if [ ! -d "$APP_DIR/.git" ]; then
  mkdir -p "$(dirname "$APP_DIR")"
  git clone -b "$DEPLOY_BRANCH" "$GIT_URL" "$APP_DIR"
fi
bash "$APP_DIR/scripts/deploy/bootstrap-server.sh"
```

Then:

1. Ensure ` $APP_DIR/backend/.env ` has production values.
2. Point nginx `root` at frontend `dist` or set `WEB_ROOT` in `/etc/vitszee/deploy.env`.
3. Start PM2 (if not already running):

```bash
cd /var/www/vitszee
pm2 start scripts/deploy/ecosystem.config.cjs
pm2 save
pm2 startup
```

Edit `/etc/vitszee/deploy.env` to match your real paths / PM2 names.

---

## Deploy anytime (on the server)

```bash
vitszee-deploy
```

Same as:

```bash
bash /var/www/vitszee/scripts/deploy/deploy.sh
```

---

## Deploy from your Windows PC

Password is typed interactively (not saved):

```powershell
cd D:\Appzeto\Vitszeemain
powershell -ExecutionPolicy Bypass -File .\scripts\deploy\remote-deploy.ps1
```

Optional args:

```powershell
.\scripts\deploy\remote-deploy.ps1 -HostName 200.234.46.248 -User root -AppDir /var/www/vitszee -Branch main
```

---

## What `deploy.sh` does

1. `git fetch` + `git pull --ff-only` on `DEPLOY_BRANCH`
2. `npm ci` / `npm install` in `backend/`
3. `npm install` + `npm run build` in `frontend/`
4. Optional `rsync` of `frontend/dist` → `WEB_ROOT`
5. `pm2 restart` (configured apps or `all`)
6. Curl `HEALTH_URL` + `READY_URL` until 200 (fails deploy if not ready)

---

## Recommended: SSH key (no password each time)

On your PC (PowerShell):

```powershell
ssh-keygen -t ed25519 -f $env:USERPROFILE\.ssh\vitszee_deploy -N '""'
type $env:USERPROFILE\.ssh\vitszee_deploy.pub | ssh root@200.234.46.248 "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
```

Then:

```powershell
ssh -i $env:USERPROFILE\.ssh\vitszee_deploy root@200.234.46.248 vitszee-deploy
```
