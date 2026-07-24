# Product Backlog — FundTrack

## Document Control

| Field | Value |
| ----- | ----- |
| Product | FundTrack |
| Owner | ObraTech |
| Status | READY FOR REVIEW |
| Related | [mvp-backlog.md](mvp-backlog.md), [future-backlog.md](future-backlog.md), [../docs/05-user-stories.md](../docs/05-user-stories.md) |

## Ordering Principle

Must-have MVP items first (Phases 3–6), then hardening (Phase 7), then production (Phase 8), then deferred enhancements.

## Epic Index

| Epic | Description | Phase | Priority |
| ---- | ----------- | ----- | -------- |
| E-AUTH | Authentication, roles, forced password change | 3 | Must |
| E-FIN | Financier profile management | 4 | Must |
| E-PROJ | Project lifecycle and statuses | 4 | Must |
| E-FUND | Flexible financing and confirmation | 5 | Must |
| E-REL | Releases, countdowns, overdue | 6 | Must |
| E-ANLY | Admin and financier analytics | 6 | Must |
| E-SEC | Security hardening and RLS verification | 7 | Must |
| E-OPS | Vercel/Supabase deployment and readiness | 8 | Must |
| E-NOTIFY | In-app notifications polish | Future | Should |
| E-VIEWER | Viewer/Auditor role | Future | Could |
| E-RANDPWD | Random temporary passwords | Future | Should |

## Backlog Items (summary)

| ID | Story | Epic | Priority |
| -- | ----- | ---- | -------- |
| US-001 | Admin creates financier | E-FIN | Must |
| US-002 | Forced password change | E-AUTH | Must |
| US-003 | Create project | E-PROJ | Must |
| US-004 | Invite financiers | E-FUND | Must |
| US-005 | Submit willing amount | E-FUND | Must |
| US-006 | Confirm allocations | E-FUND | Must |
| US-007 | Set/update release date | E-REL | Must |
| US-008 | Record release | E-REL | Must |
| US-009 | Admin analytics | E-ANLY | Must |
| US-010 | Financier analytics | E-ANLY | Must |
| US-011 | Deactivate account | E-FIN | Must |
| US-012 | Reset password | E-AUTH | Must |
| US-013 | Overdue display | E-REL | Must |

See [mvp-backlog.md](mvp-backlog.md) for MVP-scoped detail and [future-backlog.md](future-backlog.md) for deferred items.
