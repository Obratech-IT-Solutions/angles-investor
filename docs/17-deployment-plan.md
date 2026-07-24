# FundTrack — Deployment Plan

## Document Control

| Field | Value |
| --- | --- |
| Document | `docs/17-deployment-plan.md` |
| Approval Status | **READY FOR REVIEW** |

**Note:** Document only. Do not create `vercel.json`, GitHub Actions, or deploy until Gate 4/5 authorization.

## 1. Target Architecture (Vercel-ready)

- SPA built with Vite → static assets on Vercel
- Client-side routing requires SPA fallback rewrite to `index.html` (to be added at implementation)
- Environment variables: only publishable Supabase values in frontend

## 2. Local Development

| Item | Guidance |
| --- | --- |
| Node.js | LTS 20.x or 22.x (pin in README at scaffold time) |
| Package manager | npm (default) unless team standardizes pnpm |
| App env | `.env.local` with `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| Secrets | Service role only in Supabase Edge secrets — never in `.env` committed files |
| DB | Supabase project `jxwvvytzkvtjgtefmxkk` for early dev |
| Seed | Documented test admin + financiers after Phase 3 (not now) |

## 3. Staging

- Vercel Preview or dedicated staging project
- **Separate** Supabase staging project (recommended) — never point previews at production DB
- Auth redirect URLs include preview domains or use a stable staging domain
- Seed anonymized/fictional financial data
- Run UAT + security checks here

## 4. Production

- Vercel Production deploy from `main` (or release tags)
- Production Supabase project
- Custom domain + HTTPS (Vercel default)
- Supabase Auth allow-list: production URL + change-password routes
- Backups enabled; monitoring active
- Rollback: previous Vercel deployment + DB migration reverse plan

## 5. Environment Variable Matrix

| Name | Local | Vercel Preview | Vercel Prod | Notes |
| --- | --- | --- | --- | --- |
| `VITE_SUPABASE_URL` | Dev URL | Staging URL | Prod URL | Public |
| `VITE_SUPABASE_ANON_KEY` | Dev anon | Staging anon | Prod anon | Public; RLS enforced |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge secret only | Edge secret only | Edge secret only | **Never** in Vite |

## 6. Auth Redirect URLs (checklist)

- `http://localhost:5173/**` (dev)
- Staging domain(s)
- Production domain
- Site URL matches primary app URL

## 7. CI/CD (planned)

1. PR → lint, unit tests, build
2. Merge → staging deploy
3. Manual promote → production after Gate 5

## 8. Rollback Procedure

1. Revert Vercel to last known good deployment
2. If migration applied: run documented down migration or restore backup (prefer forward-fix)
3. Invalidate bad Edge Function version if applicable
4. Communicate to admins; verify smoke tests

## 9. Related

- [docs/18-backup-and-recovery.md](18-backup-and-recovery.md)
- [docs/20-production-readiness.md](20-production-readiness.md)
- [ADR-001](../decisions/ADR-001-technology-stack.md)
