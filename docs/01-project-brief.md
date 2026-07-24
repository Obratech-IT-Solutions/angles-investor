# FundTrack — Project Brief

## Document Control

| Field | Value |
| --- | --- |
| Document | `docs/01-project-brief.md` |
| Owner | ObraTech |
| Product | FundTrack — Project Financing and Profit Monitoring System |
| Version | 0.1 |
| Last Updated | 2026-07-23 |
| Approval Status | **READY FOR REVIEW** |

## 1. Identity

**Product name:** FundTrack

**Tagline:** Project Financing and Profit Monitoring System.

**Owning organization:** ObraTech.

FundTrack is a private, internal web application that lets ObraTech manage how multiple financiers fund a project, track how much each financier has committed and confirmed, record disbursement ("release") events, and monitor each financier's share of profit once a project pays out. It is not a public product and is not intended for financier self-signup, marketing, or general availability outside of ObraTech-managed accounts.

## 2. Owner

**Business owner:** ObraTech.

ObraTech is responsible for:

- Defining and maintaining the business rules encoded in the system (funding targets, profit-sharing formulas, release cadence).
- Provisioning and deactivating user accounts (administrators and financiers).
- Acting as the sole administrative authority during the MVP — there is no multi-tenant or agency model in this phase.

## 3. Problem Statement

ObraTech currently tracks project financing, financier contributions, and profit distribution using spreadsheets. This creates recurring, compounding problems:

- **No single source of truth.** Multiple spreadsheet copies and manual edits lead to inconsistent numbers between what ObraTech reports and what financiers believe they are owed.
- **Manual, error-prone math.** Profit shares, funding gaps, and per-financier release allocations are calculated by hand with formulas that are easy to break, copy incorrectly, or leave stale after edits.
- **No audit trail.** When a number changes (a financier increases their commitment, a release amount is corrected), there is no reliable record of who changed what and when.
- **Poor visibility for financiers.** Financiers have no self-service way to see their own commitment status, confirmed amount, or release history; they depend on ad hoc reports from ObraTech.
- **Fragile access control.** Spreadsheets shared over email or chat have no real authentication, no per-user permissions, and no way to revoke access cleanly when a relationship ends.
- **No structured handling of edge cases** such as underfunded projects, releases with a date "to be advised" (TBA), overdue releases, or projects with several financiers contributing unequal amounts.

See [docs/02-business-story.md](02-business-story.md) for the full narrative and concrete scenarios that motivate this system.

## 4. Goals

FundTrack replaces the spreadsheet workflow with a secure, authoritative, auditable system. Specific goals for the MVP:

1. **Single source of truth** for project financing data: financing targets, financier commitments, confirmed amounts, releases, and profit shares.
2. **Server-authoritative financial calculations.** All money math (funding gap, confirmation totals, profit-share allocation, release distribution) is computed and validated by the backend, never trusted from the client alone.
3. **Role-appropriate visibility.** Administrators see and manage all projects and all financiers. Financiers see only their own commitments, confirmations, and release history across the projects they participate in.
4. **Auditability.** Every sensitive change (amount edits, password resets, account status changes, release postings) is recorded in an audit trail with actor, timestamp, and before/after context.
5. **Secure, simple authentication** suited to a small, closed user base: username-based login with administrator-issued temporary passwords and forced password change on first use.
6. **Correct handling of real-world financing patterns**, including unequal financier contributions, underfunded projects, TBA release dates, overdue releases, and multi-financier projects (see [docs/02-business-story.md](02-business-story.md)).
7. **A lean, deployable MVP** that ObraTech can start using quickly, with clearly deferred features tracked for later phases (see [docs/03-mvp-scope.md](03-mvp-scope.md)).

## 5. Target Users

FundTrack has exactly two user roles in the MVP (see [docs/04-user-roles-and-permissions.md](04-user-roles-and-permissions.md) for the full permission matrix):

| Role | Who they are | Primary needs |
| --- | --- | --- |
| **Admin** | ObraTech staff who manage projects, financiers, releases, and accounts | Create/manage projects, invite and manage financiers, confirm amounts, post releases, manage user accounts, view audit logs |
| **Financier** | Individuals or entities who commit funds to one or more projects | View their own commitments, confirm/adjust their willing amount, view funding/release status, view their profit share and release history |

A **Viewer / Auditor** role (read-only, no financial actions) is explicitly deferred beyond the MVP; see [docs/03-mvp-scope.md](03-mvp-scope.md) and [docs/04-user-roles-and-permissions.md](04-user-roles-and-permissions.md).

## 6. Technology Stack

| Layer | Choice |
| --- | --- |
| Frontend | React + Vite + TypeScript + Tailwind CSS, deployed as a single-page application on **Vercel** |
| Backend / Data | **Supabase**: Auth, PostgreSQL, Row Level Security (RLS), Edge Functions for privileged operations |
| Supabase project reference | `jxwvvytzkvtjgtefmxkk` (development/staging target — production values are configured separately via environment variables, never committed to source control) |
| Currency | Philippine Peso (**PHP**), stored as `NUMERIC(18,2)` in the database, formatted to two decimal places in the UI |
| Timezone | **Asia/Manila** for all displayed dates/times and scheduling logic; timestamps are stored in UTC and converted at the presentation layer |
| Authentication model | Username + password login; Supabase Auth email/password under the hood via a synthetic email mapping; administrator-issued temporary password `0000` with a forced change on first login |

Rationale for these choices, along with alternatives considered, is recorded in the Architectural Decision Records: [ADR-001](../decisions/ADR-001-technology-stack.md), [ADR-002](../decisions/ADR-002-username-auth-model.md), [ADR-003](../decisions/ADR-003-money-precision.md), [ADR-004](../decisions/ADR-004-edge-function-boundaries.md), and [ADR-005](../decisions/ADR-005-entity-consolidation.md).

## 7. Out of Scope (High Level)

The following are explicitly excluded from FundTrack's MVP and are not implied by anything in this brief:

- Public/self-service registration for financiers — all accounts are administrator-provisioned.
- File/document storage and attachment management (e.g., contracts, receipts, ID uploads).
- A read-only Viewer/Auditor role.
- Native mobile applications (iOS/Android) — the web app is responsive but not packaged natively.
- Multi-currency support — PHP only for the MVP.
- Integration with external accounting, banking, or payment-rail systems.
- Automated email/SMS notification delivery beyond in-app notifications (unless explicitly approved as a fast-follow).

A complete, itemized breakdown of in-scope, out-of-scope, and deferred functionality is maintained in [docs/03-mvp-scope.md](03-mvp-scope.md), since scope decisions evolve faster than this brief should.

## 8. Success Metrics

FundTrack's MVP will be considered successful when:

1. **Zero spreadsheet dependency.** ObraTech no longer maintains the legacy financing spreadsheet for any active project; FundTrack is the sole system of record.
2. **Calculation accuracy.** 100% of funding totals, confirmed amounts, and profit-share allocations reconcile exactly (down to the centavo) with manual verification during acceptance testing, with any rounding adjustments explicitly logged per [ADR-003](../decisions/ADR-003-money-precision.md).
3. **Financier self-service adoption.** Financiers can log in, view their commitments/releases, and confirm amounts without ObraTech staff manually relaying figures via chat, email, or spreadsheet exports.
4. **Full auditability.** Every financial state change (commitment amount edits, confirmations, release postings) and every account security event (password reset, account lock/unlock) has a corresponding audit log entry with actor and timestamp.
5. **Access control correctness.** Financiers cannot view or infer data belonging to other financiers on shared projects; verified through role-based test cases before go-live (see [docs/04-user-roles-and-permissions.md](04-user-roles-and-permissions.md)).
6. **Operational readiness.** The application is deployed on Vercel against the Supabase project, with environment variables and secrets managed per the security plan, and administrators can independently onboard a new financier end-to-end (create account → temp password → forced change → first login) without engineering support.

## 9. Approval Status

**Status: READY FOR REVIEW**

This brief is submitted for stakeholder review as the foundational identity and goal statement for FundTrack. Approval of this document should be recorded using [templates/approval-record-template.md](../templates/approval-record-template.md) prior to proceeding past the initial project gate.

## Related Documents

- [docs/02-business-story.md](02-business-story.md) — Full narrative and scenario-based justification for the system
- [docs/03-mvp-scope.md](03-mvp-scope.md) — Detailed in-scope / out-of-scope / deferred breakdown
- [docs/04-user-roles-and-permissions.md](04-user-roles-and-permissions.md) — Role capabilities and permission matrix
- [decisions/README.md](../decisions/README.md) — Architectural Decision Record index
