# Local testing before deploy (koliath.in)

Copy-paste from the repo root. No live API keys are required for a smoke test.

## 1. Install

```bash
npm install
```

That installs frontend and backend dependencies. You can also install a package on its own:

```bash
npm install --prefix frontend
npm install --prefix backend
```

## 2. Env files

```bash
cp frontend/.env.example frontend/.env
cp backend/.env.example backend/.env
```

Leave the placeholders blank for a UI smoke test. Do not commit `.env` files.

- Frontend calls same-origin `/api`. Vite proxies that to `http://localhost:3000` in dev only. That proxy is not part of the production bundle.
- Do not set `VITE_API_BASE=http://localhost:3000` for a production build. Production ignores a localhost API base and uses same-origin `/api`.
- Google sign-in stays off until the public `VITE_FIREBASE_*` web config is set and the frontend is restarted or rebuilt. The API still rejects tokens until `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` are set. Steps are in [SECURITY_AUDIT.md](SECURITY_AUDIT.md).
- Postgres (`DATABASE_URL`) is only needed for sign-in, rewards, careers, and referral validation. Contact logging and `/health` do not need it.

## 3. Run

Terminal A — site (http://localhost:5173):

```bash
npm run dev
```

Terminal B — API (http://localhost:3000), optional for the brochure and hub pages:

```bash
npm run dev:backend
```

`/health` should return `{"ok":true,"service":"koliath-rewards"}` even if Postgres is down. Database routes log an error until Postgres is up on port 5433 (or whatever `DATABASE_URL` says).

## 4. URLs to click

| URL | What you should see |
|-----|---------------------|
| http://localhost:5173/ | Studio homepage: brochure + app hub, products, Earn |
| http://localhost:5173/products | App briefs, download / request buttons, “list your app” |
| http://localhost:5173/login | Login. Google button, or setup copy if the public client id is blank |
| http://localhost:5173/earn | Points and referral UX. Sample gifts if the API is off |
| http://localhost:5173/contact | Contact form. Without the API, it offers `hello@koliath.in` |
| http://localhost:5173/about | About |
| http://localhost:5173/service | Services |
| http://localhost:5173/careers | Careers |
| http://localhost:5173/blog | Blog |
| http://localhost:5173/reward?ref=KL-TEST | Redirects to `/earn?ref=KL-TEST` |
| http://localhost:5173/rewards | Redirects to `/earn` |
| http://localhost:5173/referrals | Redirects to `/earn` |
| http://localhost:5173/diabetic-app | Diabetic Buddy download page |

Refresh each of those paths. Vite’s dev server is an SPA: a refresh serves `index.html` and React Router picks the route.

There are no `/legal/*` pages in this repo. If you add them as client routes, they need the same SPA fallback as the paths above.

Referral check: open `http://localhost:5173/products?ref=KL-TEST`. The products page should say that code is saved. Download buttons call the existing referral tracker (`install_attempt`). With the API down, the code is still stored locally and tracking fails closed (logged, not thrown).

## 5. Production-like build (one process)

`npm run build` builds the Vite app and the API. `npm start` runs Express, which serves `frontend/dist` and returns `index.html` for client routes. Leave `VITE_API_BASE` empty.

Production refuses to boot without `DATABASE_URL`. This local URL is only the dev default so you can prove the process serves HTML and `/api/health`. It is not a Railway credential. Postgres does not need to be up for this check.

```bash
npm run build
NODE_ENV=production PORT=3000 \
  DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/mydb \
  npm start
```

Then:

```bash
curl -s http://localhost:3000/api/health
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/earn
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/contact
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/products
```

`/api/health` is JSON. `/earn`, `/contact`, and `/products` are HTML (`200`). Refresh is the same GET.

Confirm the client bundle does not call localhost:

```bash
grep -R "localhost:3000" frontend/dist/assets && echo "FAIL" || echo "OK: no localhost API in the bundle"
```

`npm run preview` still serves the Vite build alone on http://localhost:4173. The command above is the one that matches Railway.

## 6. Production on Railway

See [RAILWAY.md](RAILWAY.md). One service builds both packages and runs the API. You do not need a separate static host or an nginx SPA fallback.

Set `NODE_ENV=production`. `DATABASE_URL` must be the Railway Postgres plugin URL. `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, and `APP_WEBHOOK_SECRET` must be real values you create — this repo does not contain them. Set the public `VITE_FIREBASE_*` web fields at build time. Set `CORS_ORIGINS=https://koliath.in,https://www.koliath.in`. Leave `VITE_API_BASE` unset.

There are no `/legal/*` pages. If you add them as client routes, the same `index.html` fallback covers them.
