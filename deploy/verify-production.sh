#!/usr/bin/env bash
set -euo pipefail

APP_URL="${APP_URL:-}"
OWNER_PASSWORD="${OWNER_PASSWORD:-}"
VERIFY_WRITE="${VERIFY_WRITE:-0}"

if [ -z "$APP_URL" ]; then
  echo "Missing APP_URL. Example: APP_URL=https://assets.example.com bash deploy/verify-production.sh" >&2
  exit 1
fi

if [ -z "$OWNER_PASSWORD" ]; then
  echo "Missing OWNER_PASSWORD. Pass the same password configured on the server." >&2
  exit 1
fi

APP_URL="${APP_URL%/}"
COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

echo "Checking health..."
curl -fsS "$APP_URL/api/health" >/dev/null

echo "Checking login..."
curl -fsS \
  -c "$COOKIE_JAR" \
  -H 'content-type: application/json' \
  -d "{\"password\":\"$OWNER_PASSWORD\"}" \
  "$APP_URL/api/auth/login" >/dev/null

echo "Checking authenticated session..."
curl -fsS -b "$COOKIE_JAR" "$APP_URL/api/me" >/dev/null

echo "Checking instrument search..."
SEARCH_RESPONSE="$(curl -fsS -b "$COOKIE_JAR" "$APP_URL/api/instruments/search?q=AAPL&assetType=STOCK")"
printf '%s' "$SEARCH_RESPONSE" | grep -q 'AAPL'
INSTRUMENT_TOKEN="$(printf '%s' "$SEARCH_RESPONSE" | sed -n 's/.*"symbol":"AAPL"[^}]*"token":"\([^"]*\)".*/\1/p')"
if [ -z "$INSTRUMENT_TOKEN" ]; then
  echo "Instrument search did not return a token for AAPL." >&2
  exit 1
fi

if [ "$VERIFY_WRITE" = "1" ]; then
  echo "Checking invalid holding rejection..."
  INVALID_STATUS="$(curl -sS -o /dev/null -w '%{http_code}' \
    -b "$COOKIE_JAR" \
    -H 'content-type: application/json' \
    -d '{"assetType":"STOCK","symbol":"NOT_A_REAL_SYMBOL_FOR_PAT","name":"Not real","quantity":1,"costAmount":1,"costCurrency":"USD","source":"MANUAL","active":true}' \
    "$APP_URL/api/holdings")"

  if [ "$INVALID_STATUS" != "422" ]; then
    echo "Expected invalid holding status 422, got $INVALID_STATUS" >&2
    exit 1
  fi

  echo "Checking valid holding write and price sync..."
  curl -fsS \
    -b "$COOKIE_JAR" \
    -H 'content-type: application/json' \
    -d "{\"assetType\":\"STOCK\",\"symbol\":\"AAPL\",\"name\":\"Apple Inc.\",\"instrumentToken\":\"$INSTRUMENT_TOKEN\",\"quantity\":1,\"costAmount\":1,\"costCurrency\":\"USD\",\"source\":\"MANUAL\",\"active\":true}" \
    "$APP_URL/api/holdings" >/dev/null

  SYNC_RESPONSE="$(curl -fsS -b "$COOKIE_JAR" -X POST "$APP_URL/api/sync/prices")"
  printf '%s' "$SYNC_RESPONSE" | grep -q 'sourceStatuses'

  echo "Checking snapshot generation and dashboard curve data..."
  curl -fsS \
    -b "$COOKIE_JAR" \
    -H 'content-type: application/json' \
    -d '{"generatedBy":"MANUAL"}' \
    "$APP_URL/api/snapshots/generate" >/dev/null
  DASHBOARD_RESPONSE="$(curl -fsS -b "$COOKIE_JAR" "$APP_URL/api/dashboard?range=1M")"
  printf '%s' "$DASHBOARD_RESPONSE" | grep -q '"series":\['
fi

echo "Production verification passed."
