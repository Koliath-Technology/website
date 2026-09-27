# Deploy koliath.in on Railway

One Node service. It builds the Vite app, then the Express API listens on `PORT` and serves `frontend/dist`. Client routes such as `/earn`, `/contact`, and `/products` return `index.html`. `/api/*`, `/health`, `/api/health`, and `POST /careers` stay on that same origin, so leave `VITE_API_BASE` empty.

Do not commit secrets. Production boots only when `DATABASE_URL` is set. An empty `GOOGLE_CLIENT_ID` or `APP_WEBHOOK_SECRET` does not invent credentials: sign-in and webhooks fail closed.

## 1. Connect the repo

1. In Railway, create a project and choose **Deploy from GitHub repo**.
2. Select `Koliath-Technology/website`.
3. Set the deploy branch to `cursor/local-testing-earn-contact-ddd3` until this PR merges. After merge, use `solver/shipping-bar-fixes` if that is still the default branch.
4. Railway reads [`railway.toml`](railway.toml) and [`nixpacks.toml`](nixpacks.toml). The build uses **Node 22** (`NIXPACKS_NODE_VERSION=22`, Nix package `nodejs_22`, and root `engines.node`). Vite 7 does not build on Node 18. Install runs from the root `package.json` (`postinstall` installs frontend and backend, including Vite’s dev dependencies), then `npm run build`, then `npm start`.

Add the **Postgres** plugin to the same project and attach its `DATABASE_URL` to this service. Do not paste a guessed connection string.

## 2. Variables

Set these on the Railway service before the first deploy. Railway exposes them to both the image build and the running process. Vite reads `VITE_*` only at build time.

| Variable | Value |
|----------|--------|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | From the Railway Postgres plugin (`${{Postgres.DATABASE_URL}}`). The API accepts Railway’s certificate (`rejectUnauthorized: false`). The process still exits if this variable is missing. |
| `GOOGLE_CLIENT_ID` | Your Google OAuth Web client id. Same value as `VITE_GOOGLE_CLIENT_ID`. |
| `VITE_GOOGLE_CLIENT_ID` | Same Web client id. Required at **build** time or Sign-In stays off. |
| `APP_WEBHOOK_SECRET` | A long random string you generate and store in Railway. Not in git. |
| `CORS_ORIGINS` | `https://koliath.in,https://www.koliath.in` |
| `VITE_API_BASE` | Leave unset. The browser calls same-origin `/api`. |
| `VITE_CONTACT_EMAIL` | Optional. Defaults to `hello@koliath.in`. |

`PORT` is set by Railway. Do not hardcode it.

Copy names from [`backend/.env.example`](backend/.env.example) and [`frontend/.env.example`](frontend/.env.example). Those files contain no live credentials.

Google Cloud authorized JavaScript origins must include `https://koliath.in` and `https://www.koliath.in`.

## 3. Custom domain and DNS

Public DNS for koliath.in currently has **A records at `127.0.0.1` on Cloudflare**. That does not point at Railway. Leave those records until the service is healthy, then:

1. In the Railway service, add custom domains `koliath.in` and `www.koliath.in`.
2. Replace the Cloudflare `127.0.0.1` A records with the target Railway shows (usually a CNAME to `*.up.railway.app`, or the A/AAAA records Railway prints for the apex).
3. Use Cloudflare SSL mode **Full**. Railway terminates HTTPS on its side.

Until DNS changes, the `*.up.railway.app` URL is the way to open the deploy.

## 4. What “healthy” looks like

- `GET /health` and `GET /api/health` return `{"ok":true,"service":"koliath-rewards"}`.
- `GET /`, `/earn`, `/contact`, and `/products` return the SPA HTML, including on refresh.
- `POST /api/contact` returns 202.
- Sign-in works only after a rebuild that included `VITE_GOOGLE_CLIENT_ID`, with the same id in `GOOGLE_CLIENT_ID`.

A production process with no `DATABASE_URL` exits at startup. That is intentional.
