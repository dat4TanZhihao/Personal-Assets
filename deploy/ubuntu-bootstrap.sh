#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this script as root: sudo bash deploy/ubuntu-bootstrap.sh" >&2
  exit 1
fi

if ! command -v apt-get >/dev/null 2>&1; then
  echo "This bootstrap script supports Ubuntu servers with apt-get." >&2
  exit 1
fi

. /etc/os-release
if [ "${ID:-}" != "ubuntu" ]; then
  echo "This bootstrap script supports Ubuntu only. Detected: ${ID:-unknown}." >&2
  exit 1
fi

apt-get update
apt-get install -y ca-certificates curl gnupg lsb-release nginx openssl ufw

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  ${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

systemctl enable --now docker
systemctl enable --now nginx

ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

mkdir -p /opt/personal-assets

cat <<'EOF'
Bootstrap complete.

Next steps:
1. Upload this project to /opt/personal-assets.
2. Create /opt/personal-assets/.env.production from .env.production.example.
3. Run: cd /opt/personal-assets && bash deploy/server-deploy.sh
4. Configure Nginx with deploy/nginx-personal-assets.conf after your domain is ready.
EOF
