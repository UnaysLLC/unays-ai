# Self-hosting

The included server is a small personal-workspace adapter. It is not the full hosted account, school or team backend. Use a maintained Node.js release, configure your own credentials, and keep the application on a private machine or behind authenticated access unless you have reviewed it for your deployment.

## Configuration

Use `.env.example` as the starting point. Never commit `.env`. `PUBLIC_URL` must match the exact browser origin; API requests from other origins are refused. `OWNER_USERNAME` and a unique 16-character-or-longer `OWNER_PASSWORD` enable the single owner account. Public registration is not implemented. The owner can save personal chats and coding projects on this server.

`GROQ_API_KEY` or `OLLAMA_API_KEY` provides general conversations. `DAHL_API_KEYS` is a JSON array of independently authorized coding keys. Coding uses the server's designated MiniMax model only. A quota-exhausted key is skipped for an hour, transient failures briefly cool down, and an origin-wide access challenge pauses the service for five minutes. Do not use key rotation to bypass suspension or access restrictions. An unavailable coding pool produces an honest retry message, never a substitute model.

Web research currently reads a public RSS search endpoint, caches results for five minutes, and labels unavailable search results. Consider a search adapter with contractual availability for larger deployments.

## Image Worker

The example Worker uses Cloudflare Workers AI. Create your own Worker with the `AI` binding from `worker/wrangler.jsonc`. Set its name before deployment. Generate a high-entropy shared secret, put it in the Worker's secret binding named `ORIGIN_SECRET`, and put the same value in the Node server's `IMAGE_SERVICE_SECRET`. Set `IMAGE_SERVICE_URL=https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev/generate`.

Deploy using Cloudflare's dashboard or current Wrangler CLI. Keep the secret in a secret binding, not in the configuration file or client code. See the official [Workers secrets documentation](https://developers.cloudflare.com/workers/configuration/secrets/) and [Workers AI documentation](https://developers.cloudflare.com/workers-ai/).

Authenticated `GET /health` verifies bridge availability without generating an image. Anonymous access returns 401. The `/generate` route accepts a bounded prompt and returns a JPEG. The Node server handles account/guest checks, origin validation, prompt limits, daily capacity, concurrency, and per-identity limits. Failed images do not count as successful guest requests. Set usage controls in your own Cloudflare account; upstream services may charge for your usage.

## Deployment boundary

- Keep `HOST=127.0.0.1`; terminate HTTPS at a maintained reverse proxy.
- Proxy only to the loopback app port. Do not serve the repository root with a general-purpose static server.
- Set `PUBLIC_URL` to your HTTPS origin. Restrict access with your reverse proxy or identity gateway for a personal installation.
- Preserve Content Security Policy, no-store API responses, secure cookies and preview sandbox headers. Do not add `allow-same-origin` to untrusted preview frames.
- The community server does not trust forwarding IP headers. A shared reverse proxy therefore shares some rate limits; add your own reviewed proxy integration before scaling to many users.
- Keep private configuration and `data/` accessible only to the service account. Back up conversations, guest quota records and preview snapshots. Browser Files/Knowledge data must be exported from that browser separately.
- Run the service with an unprivileged account and a process manager. Add monitoring, storage limits, backups and patch management suitable for your installation.

The starter does not execute arbitrary generated programs on the host. Browser HTML previews run in restricted frames. Server-side Python and other language execution require a separately hardened sandbox adapter, which is not included here.

Local instances are `noindex` by default to avoid indexing private clones and duplicate pages. For a reviewed public deployment, configure your own canonical URLs, metadata, sitemap and crawler policy. Changing robots settings does not guarantee search indexing.
