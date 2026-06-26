#!/usr/bin/env bash
set -euo pipefail

TARGET_FILE="${TARGET_FILE:-.env.production}"
OWNER_PASSWORD="${OWNER_PASSWORD:-}"
ALPHA_VANTAGE_API_KEY="${ALPHA_VANTAGE_API_KEY:-}"
MARKET_DATA_TIMEOUT_MS="${MARKET_DATA_TIMEOUT_MS:-8000}"
SESSION_COOKIE_SECURE="${SESSION_COOKIE_SECURE:-true}"
DATABASE_DRIVER="${DATABASE_DRIVER:-pg}"
FORCE="${FORCE:-0}"

if [ -z "$OWNER_PASSWORD" ]; then
  echo "Missing OWNER_PASSWORD. Example:" >&2
  echo "OWNER_PASSWORD='your-login-password' ALPHA_VANTAGE_API_KEY='your-key' bash deploy/generate-production-env.sh" >&2
  exit 1
fi

if [ -z "$ALPHA_VANTAGE_API_KEY" ]; then
  echo "Missing ALPHA_VANTAGE_API_KEY." >&2
  exit 1
fi

if [ -f "$TARGET_FILE" ] && [ "$FORCE" != "1" ]; then
  echo "$TARGET_FILE already exists. Set FORCE=1 to overwrite." >&2
  exit 1
fi

random_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
    return
  fi
  if [ -r /dev/urandom ]; then
    dd if=/dev/urandom bs=32 count=1 2>/dev/null | od -An -tx1 | tr -d ' \n'
    printf '\n'
    return
  fi
  echo "No secure random generator found. Install openssl." >&2
  exit 1
}

cat > "$TARGET_FILE" <<EOF
OWNER_PASSWORD=$OWNER_PASSWORD
SESSION_SECRET=$(random_secret)
SESSION_COOKIE_SECURE=$SESSION_COOKIE_SECURE
INSTRUMENT_TOKEN_SECRET=$(random_secret)
REQUIRE_INSTRUMENT_TOKEN=true
ALPHA_VANTAGE_API_KEY=$ALPHA_VANTAGE_API_KEY
MARKET_DATA_MODE=free
MARKET_DATA_TIMEOUT_MS=$MARKET_DATA_TIMEOUT_MS
DATABASE_DRIVER=$DATABASE_DRIVER
POSTGRES_PASSWORD=$(random_secret)
EOF

chmod 600 "$TARGET_FILE"
echo "Generated $TARGET_FILE with mode 600."
