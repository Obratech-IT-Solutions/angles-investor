# FundTrack — MVP Scope

## Document Control

| Field | Value |
| --- | --- |
| Document | `docs/03-mvp-scope.md` |
| Owner | ObraTech |
| Product | FundTrack — Project Financing and Profit Monitoring System |
| Version | 0.1 |
| Last Updated | 2026-07-23 |
| Approval Status | **READY FOR REVIEW** |

## 1. Purpose

This document is the authoritative breakdown of what is **in scope**, **out of scope**, and **deferred** for the FundTrack MVP. It exists so that scope questions during design and development have a single answer, and so features are never silently added or dropped without an explicit decision. It expands on the high-level scope statement in [docs/01-project-brief.md](01-project-brief.md) and operationalizes the scenarios in [docs/02-business-story.md](02-business-story.md).

**Roles in scope for the MVP:** `admin` and `financier` only. See [docs/04-user-roles-and-permissions.md](04-user-roles-and-permissions.md) for the full capability breakdown.

## 2. In Scope

### 2.0 Frontend UI System

- React + Vite + TypeScript + Tailwind CSS SPA on Vercel.
- **shadcn/ui** component system (future `components/ui/`), Lucide icons, Recharts via shadcn chart patterns, Sonner toasts.
- Visual language and chart specs documented in [docs/28-ui-design-system.md](28-ui-design-system.md) and [ADR-006](../decisions/ADR-006-shadcn-ui.md).
- **No UI package installation or component code in the documentation phase.**

### 2.1 Authentication & Account Management

- Username + password login (Supabase Auth under a synthetic email mapping per [ADR-002](../decisions/ADR-002-username-auth-model.md)).
- Administrator-created accounts only — no public registration.
- Temporary password `0000` issued on account creation and on admin-initiated reset, with `must_change_password` enforced until the user sets their own password.
- Forced password change flow on first login (and after any admin-triggered reset) before the user can access any other part of the app.
- Admin ability to activate, deactivate, and unlock financier accounts.
- Session revocation on password reset and account deactivation.
- Basic account security event logging (login, failed login, password change, reset, lock/unlock).

### 2.2 Project Management (Admin)

- Create, edit, and view projects, including a funding target amount (PHP) and project status.
- View a consolidated, project-level financing summary: total confirmed, funding gap, number of financiers, release status.
- Invite financiers to a project and manage each financier's participation record (willing amount, confirmed amount, status).
- Confirm or adjust a financier's committed amount for a project, subject to server-side validation.

### 2.3 Financier Participation

- Financiers can view the list of projects they participate in.
- Financiers can view their own willing amount, confirmed amount, and participation status per project.
- Financiers can submit or update their willing amount for a project (subject to admin confirmation workflow).
- Financiers cannot view other financiers' amounts on a shared project (see [docs/04-user-roles-and-permissions.md](04-user-roles-and-permissions.md)).

### 2.4 Funding & Profit Calculations

- Server-side (database function / RPC) calculation of:
  - Total confirmed funding per project and funding gap versus target.
  - Each financier's contribution ratio, derived from confirmed amounts.
  - Profit-share allocation per financier when a project records profit.
- Money stored as `NUMERIC(18,2)` in PHP; no client-side-only financial calculation is treated as authoritative (see [ADR-003](../decisions/ADR-003-money-precision.md)).
- Controlled centavo-level rounding adjustment on final allocations, recorded in the audit log.

### 2.5 Releases (Disbursements)

- Admin can create a release event for a project with one of three states: **TBA** (no date set), **Scheduled** (date set, not yet paid), or **Released** (paid, with recorded amount and date).
- Computed **Overdue** status for any Scheduled release whose date has passed without being marked Released.
- Per-financier release payment records, computed from each financier's confirmed contribution ratio at the time of the release.
- Financiers can view their own release history and payment amounts per project; admins can view all release and payment records across all projects and financiers.

### 2.6 Audit & Notifications

- Audit log entries for: financier amount changes, confirmations, release postings, account status changes, and password resets, each capturing actor, timestamp, and relevant before/after values.
- In-app notifications for financiers (e.g., "your confirmed amount was updated," "a release has been scheduled") — delivered within the application UI.
- Admin-facing audit log view, filterable by project, financier, and action type.

### 2.7 Platform & Non-Functional

- Responsive web UI (desktop and mobile browser) built with React/Vite/TypeScript/Tailwind, deployed on Vercel.
- Supabase Auth/Postgres/RLS/Edge Functions backend, dev target project `jxwvvytzkvtjgtefmxkk`.
- All displayed dates/times in Asia/Manila; all monetary values in PHP.
- Row Level Security enforced on every table containing financier or financial data, so client-side role checks are never the sole enforcement mechanism.

## 3. Out of Scope

The following are **not part of the MVP** and must not be assumed by any design or implementation decision without a documented scope change (see [templates/change-request-template.md](../templates/change-request-template.md)):

- **File/document storage.** No upload, storage, or attachment of contracts, receipts, proof-of-payment images, or identification documents. Any references to supporting documents remain outside the system (e.g., email, physical filing) for the MVP.
- **Viewer / Auditor role.** No third, read-only role exists in the MVP. Only `admin` and `financier` are implemented — see Section 5 and [docs/04-user-roles-and-permissions.md](04-user-roles-and-permissions.md).
- **Native mobile application.** No iOS or Android app, and no app-store distribution. The responsive web app is the only supported client.
- **Public self-service registration.** Financiers cannot create their own accounts; all provisioning is admin-initiated.
- **Multi-currency support.** PHP only; no currency selection, conversion, or multi-currency reporting.
- **External system integrations.** No bank feed integration, payment gateway integration, accounting software sync, or e-signature integration.
- **Automated outbound email/SMS.** In-app notifications only; no transactional email or SMS delivery pipeline in the MVP.
- **Financier-to-financier communication or messaging features.**
- **Multi-tenancy.** The system supports a single owning organization (ObraTech); no concept of multiple independent tenant organizations.
- **Advanced reporting/BI** (custom report builder, data export/BI dashboards beyond the core financing and release views).

## 4. Deferred (Candidates for Post-MVP Phases)

These items are acknowledged as valuable but intentionally deferred; they are not scheduled and require a new approval before being added to any build phase:

| Deferred item | Why it's deferred | Precondition to revisit |
| --- | --- | --- |
| Viewer / Auditor read-only role | Not required for initial ObraTech operations; adds RLS/policy surface | MVP roles proven stable in production; explicit business request |
| Document/file attachment support | Requires Supabase Storage design, file validation, and antivirus/scanning considerations | Business need for in-system document retention is confirmed |
| Real email-based login/password reset | Current username model (synthetic email) satisfies MVP UX; real email reset needs a design change (see [ADR-002](../decisions/ADR-002-username-auth-model.md)) | Financiers request self-service password recovery independent of admin |
| Automated email/SMS notifications | Requires a transactional messaging provider and deliverability/security review | In-app notifications proven insufficient in practice |
| Native mobile app | Responsive web is expected to meet MVP usage patterns | Demonstrated need for offline access or push notifications |
| Multi-currency support | ObraTech's current operations are PHP-only | Business expands to non-PHP-denominated projects |
| Advanced reporting/export/BI | Core dashboards expected to cover MVP decision-making needs | Business requests exportable/aggregated analytics beyond core views |

## 5. Explicit Non-Goals

To avoid ambiguity, the MVP explicitly does **not** attempt to:

- Store or manage supporting files/documents of any kind (see Section 3).
- Introduce a Viewer role or any role beyond `admin` and `financier` (see Section 3 and [docs/04-user-roles-and-permissions.md](04-user-roles-and-permissions.md)).
- Ship a native mobile application, or optimize for offline use.
- Replace ObraTech's accounting/bookkeeping systems — FundTrack tracks financing, confirmation, releases, and profit share; it is not a general ledger.
- Automate financier onboarding beyond admin-initiated account creation.

## 6. MVP Feature List by Role

### 6.1 Admin — MVP Features

1. Log in with username/password; complete forced password change on first login.
2. Create and edit projects (name, funding target, status, currency fixed to PHP).
3. Invite a financier to a project and record their willing amount.
4. Confirm or adjust a financier's confirmed amount for a project.
5. View project-level financing summary: total confirmed, funding gap, financier count.
6. Create a release event in TBA state; later assign a scheduled date; later mark as Released with an amount and date.
7. View computed Overdue status on Scheduled releases past their date.
8. View per-financier release payment breakdown for any release.
9. View project-level and system-level profit-share allocation once profit is recorded.
10. Create financier accounts (system issues temp password `0000`, forces change on first login).
11. Reset a financier's password (resets to `0000`, forces change, revokes existing sessions).
12. Activate, deactivate, or unlock a financier account.
13. View the full audit log across all projects, financiers, and account events, with filtering.
14. View all financiers' data across all shared projects (no per-financier data isolation for admins).

### 6.2 Financier — MVP Features

1. Log in with username/password; complete forced password change on first login (and after any admin-initiated reset).
2. View the list of projects they participate in.
3. View their own willing amount, confirmed amount, and confirmation status per project.
4. Submit or update their willing amount for a project (subject to admin confirmation).
5. View their own project-level funding context (e.g., overall funding gap) without seeing other financiers' individual amounts.
6. View release status (TBA / Scheduled / Released / Overdue) for projects they participate in.
7. View their own release payment history and amounts.
8. View their own profit-share allocation once a project records profit.
9. Receive in-app notifications for changes affecting their own participation (amount updates, release scheduling, release completion).
10. View their own basic account security history (e.g., last login) where applicable.

## 7. Approval Status

**Status: READY FOR REVIEW**

This scope document should be approved (using [templates/approval-record-template.md](../templates/approval-record-template.md)) before detailed design work (data model, page map, API/Edge Function design) proceeds, so that design effort is not spent on out-of-scope or deferred functionality.

## 8. Related Documents

- [docs/01-project-brief.md](01-project-brief.md) — Overall identity, goals, and success metrics
- [docs/02-business-story.md](02-business-story.md) — Narrative and scenarios this scope addresses
- [docs/04-user-roles-and-permissions.md](04-user-roles-and-permissions.md) — Detailed permission matrix for `admin` and `financier`
- [decisions/README.md](../decisions/README.md) — Architectural Decision Records underpinning these scope choices
- [templates/change-request-template.md](../templates/change-request-template.md) — Process for proposing changes to this scope
