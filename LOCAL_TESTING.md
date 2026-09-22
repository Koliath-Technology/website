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
- Google Sign-In stays off until `VITE_GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_ID` are the same OAuth Web client id.
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

## 5. Production build smoke

```bash
npm run build
npm run preview
```

Preview defaults to http://localhost:4173. Refresh `/earn`, `/contact`, and `/products` there too.

Confirm the client bundle does not call localhost:

```bash
grep -R "localhost:3000" frontend/dist/assets && echo "FAIL" || echo "OK: no localhost API in the bundle"
```

## 6. Production SPA fallback (koliath.in)

The host must serve `frontend/dist/index.html` for client routes, and proxy `/api` (and `/careers`, `/health`) to the Node process unless `VITE_API_BASE` is an https origin baked in at build time.

Nginx:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:3000;
}
location /careers {
    proxy_pass http://127.0.0.1:3000;
}
location /health {
    proxy_pass http://127.0.0.1:3000;
}
location / {
    try_files $uri $uri/ /index.html;
}
```

`127.0.0.1` in that snippet is the server loopback to Node. It is not a URL shipped to the browser.

Set `NODE_ENV=production` on the API. Then `DATABASE_URL`, `GOOGLE_CLIENT_ID`, and `APP_WEBHOOK_SECRET` must be real values — production does not invent them. Set `CORS_ORIGINS=https://koliath.in,https://www.koliath.in`.
