# Open Questions

Decisions still requiring owner confirmation before or during Gate reviews. Locked defaults from the SDLC plan remain in force until changed via ADR/change request.

| ID | Question | Current default | Needed by |
| ---- | -------- | --------------- | --------- |
| OQ-001 | Single admin user or multiple admins in MVP? | Multiple users may hold `admin` role; no finer RBAC | Gate 1 |
| OQ-002 | May financiers see other financiers’ names on a shared project? | Yes names; no other financiers’ amounts until admin policy says otherwise — **recommend: show peer names only, hide peer amounts** | Gate 2 |
| OQ-003 | Can admin edit confirmed amounts after Fully Funded / Active? | Yes with mandatory audit; needs owner policy | Gate 1 |
| OQ-004 | Is withdraw of Submitted commitment allowed after another financier confirmed? | Allowed only while project not Fully Funded and row not Confirmed | Gate 1 |
| OQ-005 | Forgot-password: admin-only reset or email flow? | Admin-only reset to `0000` for MVP | Gate 2 |
| OQ-006 | Staging: separate Supabase project vs branches? | Separate staging project recommended | Gate 3 |
| OQ-007 | Production domain name for Vercel + Auth redirects? | TBD by owner | Gate 5 |
| OQ-008 | Privacy notice / financing disclaimer legal text owner? | ObraTech to supply before production | Gate 5 |
| OQ-009 | Seed admin username for first production account? | TBD; bootstrap via secure one-time process | Phase 3 |
| OQ-010 | Should `Draft` projects be visible to invited financiers? | No — only after Open for Funding | Gate 2 |
| OQ-011 | Final UI font family (distinctive professional vs system Tailwind default)? | Decide at Gate 4 scaffold; tokens otherwise fixed in doc 28 | Gate 2/4 |
| OQ-012 | Show peer financier **names** on shared projects? | Recommend yes names, no peer amounts | Gate 2 |
| OQ-013 | Dark mode in MVP? | No — light navy/gray theme only | Gate 2 |
| OQ-014 | Failed-login lock threshold (attempts / duration)? | Propose 5 attempts / 15 minutes | Gate 3 |

## Resolved by plan defaults (no action unless overridden)

- Currency PHP, timezone Asia/Manila
- Temp password `0000` with forced change
- Username login via synthetic Auth email
- Entity consolidation into `project_financiers`
- Coding blocked until Gates 1–3 approved
