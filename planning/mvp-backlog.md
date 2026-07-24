# MVP Backlog — FundTrack

## Document Control

| Field | Value |
| ----- | ----- |
| Status | READY FOR REVIEW |
| Scope | [../docs/03-mvp-scope.md](../docs/03-mvp-scope.md) |
| Stories | [../docs/05-user-stories.md](../docs/05-user-stories.md) |

## MVP Definition

A usable private web app where an administrator can create financiers and projects, invite financiers, confirm flexible allocations without overfunding, set release dates, record releases, and view portfolio analytics; each financier can log in (forced password change from `0000`), submit willingness, and view personal financing analytics—hosted later on Vercel against Supabase.

## Ordered MVP Work Packages

### WP-1 Foundation (Phase 3)

- Vite React TS Tailwind scaffold (post Gate 4)
- Supabase client with publishable keys only
- Login (admin + financier), protected routes
- Forced password-change gate
- Base admin/financier layouts

### WP-2 People & Projects (Phase 4)

- Financier CRUD (via Edge Function for Auth create)
- Activate / deactivate / unlock
- Admin password reset to `0000` + session revoke
- Project create/edit/cancel and status display

### WP-3 Flexible Financing (Phase 5)

- Invite financiers; suggested amounts
- Willing amount submit/update/withdraw (when allowed)
- Remaining funding gap and dynamic suggestions
- Admin confirmation RPC (transactional, no overfunding)
- Audit on confirmed amount changes

### WP-4 Release & Analytics (Phase 6)

- Release date TBA / countdown / overdue (Asia/Manila)
- Record project release and per-financier payments
- Admin dashboard metrics
- Financier dashboard metrics

### WP-5 Harden & Ship (Phases 7–8)

- RLS and security tests
- Formula and concurrency tests
- Staging on Vercel preview + staging Supabase
- Production checklist (no service role in frontend)

## Explicitly Out of MVP

- File/image storage
- Viewer/Auditor role
- Random temporary passwords
- Native mobile apps
- Email-based Auth identity as primary login
- Real-time collaborative editing

## Exit Criteria for MVP

- Gates 1–3 approved; Gate 4 authorizes coding
- All Must stories US-001–US-013 accepted in UAT
- Gate 5 before production go-live
