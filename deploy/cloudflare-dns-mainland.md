# Cloudflare DNS notes for mainland China access

Cloudflare can manage the domain DNS, but it should not be treated as the main acceleration layer for mainland China users.

## Recommended DNS mode

For a mainland China or Hong Kong server:

1. Add an `A` record pointing your domain to the server public IP.
2. Set the Cloudflare proxy status to **DNS only** during initial launch.
3. Verify access from China Unicom, China Mobile, and China Telecom networks if possible.
4. Enable Cloudflare proxy only if testing shows it improves your specific route.

## Mainland server requirement

If the server is physically in mainland China, public website access normally requires ICP filing before binding a domain.

Without ICP filing, use a Hong Kong server as the practical compromise. It does not guarantee optimal mainland latency, but it avoids the filing requirement and is usually easier than Cloudflare Workers/Pages for this app.

## Suggested setup

```text
Domain DNS: Cloudflare DNS only
Compute: Tencent Cloud CVM / Alibaba ECS / Huawei Cloud ECS / Hong Kong VPS
Runtime: Docker Compose
Database: bundled Postgres container or managed Postgres
Reverse proxy: Nginx on the server
HTTPS: certbot or provider certificate after DNS is live
```
