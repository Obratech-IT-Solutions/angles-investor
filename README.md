# FundTrack

**FundTrack – Project Financing and Profit Monitoring System**  
Owned by **ObraTech**.

Private web application for project financing, financier allocation, profit-sharing, release monitoring, and financial analytics.

## Status

```text
Gates 1–4: APPROVED (2026-07-23)
Implementation Authorization: APPROVED
Coding Status: AUTHORIZED
Gate 5 (Production go-live): NOT APPROVED
```

## Stack

| Layer | Choice |
| --- | --- |
| Frontend | React 19, Vite, TypeScript, Tailwind CSS v4, shadcn-style UI, Lucide, Recharts |
| Hosting | Vercel (SPA) |
| Backend | Supabase Auth, PostgreSQL, RLS, Edge Functions |
| Currency / TZ | PHP (`NUMERIC(18,2)`), Asia/Manila |

## Local development

1. Copy env template and fill values from the Supabase project:

```bash
cp .env.example .env.local
```

Required variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

2. Install and run:

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

3. Production build:

```bash
npm run build
npm run preview
```

## Login model

- **Admin:** Home → **Admin** → PIN (default `0000`; change later in Profile)
- **Financier:** Home → tap **name** → PIN (default `0000`; change later in Profile)
- Creating a financier only needs a **name**; PIN starts as `0000`
- Admin can reset a financier PIN back to `0000`

## Bootstrap admin

One-time Edge Function (only works when no admin exists yet):

```bash
curl -X POST "https://jxwvvytzkvtjgtefmxkk.supabase.co/functions/v1/bootstrap-admin" ^
  -H "Content-Type: application/json" ^
  -H "x-bootstrap-secret: fundtrack-bootstrap-change-me" ^
  -d "{\"username\":\"admin\",\"full_name\":\"System Administrator\",\"password\":\"0000\"}"
```

Then open the app and use **Admin** + PIN `2468`.

3. Sign in at `/login` with username `youradmin` / password `0000`, then set a real password.

After that, create financiers from **Admin → Financiers** (Edge Function `admin-create-financier`).

## Deploy (Vercel)

1. Import `Obratech-IT-Solutions/angles-investor` in Vercel (Framework: Vite).
2. Set Environment Variables (Production / Preview):

| Name | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon / publishable key |

3. Deploy. SPA routing is configured in `vercel.json` (`rewrites` → `index.html`).

Build command: `npm run build` · Output: `dist`

## Documentation

- [docs/00-master-index.md](docs/00-master-index.md)
- [docs/28-ui-design-system.md](docs/28-ui-design-system.md)
- [docs/13-authentication-design.md](docs/13-authentication-design.md)
