# Deployment Notes

## Recommended path for mainland China access

For users in mainland China, do not use Cloudflare Workers or Cloudflare Pages as the primary deployment target. Default Cloudflare domains and routes are not a reliable mainland China access guarantee.

Use one of these instead:

1. **Best reliability:** Tencent Cloud / Alibaba Cloud / Huawei Cloud mainland China server + ICP filing + optional mainland CDN.
2. **No ICP compromise:** Hong Kong server from Tencent Cloud / Alibaba Cloud / AWS / Lightsail / Oracle / similar. This avoids ICP but mainland access still needs real network testing.

The project is now packaged for standard Linux server deployment with Docker, Postgres, and optional Nginx reverse proxy.

## Personal use recommendation

If the goal is only "my computer can be off, but my iPhone can still open the app", the lowest-friction path is:

1. Rent a small Hong Kong Ubuntu VPS.
2. Deploy this project with Docker Compose.
3. Open it on `http://SERVER_IP:3000` first.
4. Set `SESSION_COOKIE_SECURE=false` while using plain HTTP/IP access.
5. Later add a domain and HTTPS, then change `SESSION_COOKIE_SECURE=true`.

This avoids ICP filing and avoids rewriting the app for Cloudflare Workers. It is also closer to the current codebase because the app already includes Next.js API routes, Postgres, Docker, and Nginx deployment files.

`workers.dev` can work for a different architecture, but this app is not a static-only frontend. A Workers deployment would need Cloudflare/OpenNext wiring plus an external Postgres provider such as Neon or Supabase. It is viable, but it is more code and deployment complexity than a personal VPS.

Cloudflare can still be used for DNS management. For mainland access, start with Cloudflare records set to **DNS only** instead of proxied traffic. See:

```text
deploy/cloudflare-dns-mainland.md
```

## Server requirements

- Linux x86_64 VPS
- Docker and Docker Compose
- 1 GB RAM minimum; 2 GB recommended
- Domain name if you want HTTPS
- ICP filing if the server is located in mainland China

For a fresh Ubuntu server, initialize it with:

```bash
sudo bash deploy/ubuntu-bootstrap.sh
```

## Environment

Generate the production env file:

```bash
OWNER_PASSWORD='your-login-password' ALPHA_VANTAGE_API_KEY='your-alpha-vantage-key' bash deploy/generate-production-env.sh
```

The script creates `.env.production`, generates random secrets, and sets file mode `600`.

Alternatively, copy the example env file manually:

```bash
cp .env.production.example .env.production
```

Edit `.env.production`:

```env
OWNER_PASSWORD=your-login-password
SESSION_SECRET=long-random-session-secret
SESSION_COOKIE_SECURE=true
INSTRUMENT_TOKEN_SECRET=long-random-instrument-token-secret
REQUIRE_INSTRUMENT_TOKEN=true
ALPHA_VANTAGE_API_KEY=your-alpha-vantage-key
MARKET_DATA_MODE=free
MARKET_DATA_TIMEOUT_MS=8000
DATABASE_DRIVER=pg
POSTGRES_PASSWORD=strong-postgres-password
```

Do not commit `.env.production`.

`SESSION_SECRET` signs login sessions. `INSTRUMENT_TOKEN_SECRET` signs instrument search results so holdings can only be added after selecting a valid search suggestion.

Use `SESSION_COOKIE_SECURE=false` only for temporary `http://SERVER_IP:3000` testing. Use `SESSION_COOKIE_SECURE=true` when the site has HTTPS.

## Deploy with Docker Compose

```bash
docker compose up -d --build
```

Or run:

```bash
bash deploy/server-deploy.sh
```

The app listens on:

```text
http://SERVER_IP:3000
```

Health check:

```bash
curl http://127.0.0.1:3000/api/health
```

Postgres is initialized from:

```text
scripts/postgres-schema.sql
```

## Nginx reverse proxy

Example config:

```text
deploy/nginx-personal-assets.conf
```

Replace `example.com` with your domain, copy it to Nginx, then reload Nginx.

For HTTPS, use a certificate provider appropriate to the server location. On mainland China servers, complete ICP filing before binding a public website domain.

## Verification after deployment

Automated read-only verification:

```bash
APP_URL=https://your-domain.example OWNER_PASSWORD='your-login-password' bash deploy/verify-production.sh
```

Optional write verification. This creates a test AAPL holding and triggers price sync:

```bash
APP_URL=https://your-domain.example OWNER_PASSWORD='your-login-password' VERIFY_WRITE=1 bash deploy/verify-production.sh
```

1. Open `/login`.
2. Log in with `OWNER_PASSWORD`.
3. Search `AAPL` or `600519` on the holdings page.
4. Confirm invalid symbols cannot be added.
5. Add a valid holding.
6. Run price sync and confirm `sourceStatuses` are returned.
7. Confirm the dashboard reflects latest holdings after snapshot generation.

## Cloudflare status

Cloudflare Workers can be used for a free personal deployment with Neon Postgres. This is useful when the goal is "my computer can be off, but my phone can still open the app". Mainland China access is not guaranteed and should be tested from your own phone/network.

### Cloudflare Workers + Neon

1. Initialize the Neon database schema locally:

```bash
set DATABASE_URL=your-neon-connection-string
npm run db:init
```

PowerShell:

```powershell
$env:DATABASE_URL="your-neon-connection-string"
npm run db:init
```

2. Push the repository to GitHub.

3. In Cloudflare Workers, connect the GitHub repository or deploy with Wrangler.

4. Configure Worker environment variables in Cloudflare. Do not commit these values:

```env
DATABASE_URL=your-neon-connection-string
DATABASE_DRIVER=neon
OWNER_PASSWORD=your-login-password
SESSION_SECRET=long-random-session-secret
SESSION_COOKIE_SECURE=true
INSTRUMENT_TOKEN_SECRET=long-random-instrument-token-secret
REQUIRE_INSTRUMENT_TOKEN=true
ALPHA_VANTAGE_API_KEY=your-alpha-vantage-key
MARKET_DATA_MODE=free
MARKET_DATA_TIMEOUT_MS=8000
```

5. If using GitHub Actions, add these GitHub repository secrets:

```env
CLOUDFLARE_API_TOKEN=your-cloudflare-api-token
CLOUDFLARE_ACCOUNT_ID=your-cloudflare-account-id
```

The workflow is in `.github/workflows/cloudflare-worker.yml`.

6. Build command:

```bash
npm run build:worker
```

7. Deploy command:

```bash
npm run deploy:worker
```

Cloudflare/OpenNext requires `nodejs_compat`; this repository includes `wrangler.jsonc` and `open-next.config.ts` for that deployment path.
