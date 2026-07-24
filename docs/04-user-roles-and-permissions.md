# FundTrack — User Roles and Permissions

## Document Control

| Field | Value |
| --- | --- |
| Document | `docs/04-user-roles-and-permissions.md` |
| Owner | ObraTech |
| Product | FundTrack — Project Financing and Profit Monitoring System |
| Version | 0.1 |
| Last Updated | 2026-07-23 |
| Approval Status | **READY FOR REVIEW** |

## 1. Purpose

This document defines the roles that exist in the FundTrack MVP, what each role can and cannot do, and the authoritative permission matrix that access control (both UI gating and Supabase Row Level Security) must implement. It is the reference for [docs/03-mvp-scope.md](03-mvp-scope.md)'s feature list and should be consulted whenever a new page, API call, or database policy is designed.

**Roles in the MVP:** `admin` and `financier` only. There is no third role in this phase (see Section 6 for the deferred Viewer role).

## 2. Role Model

Each user account (`profiles` row) has exactly one role: `admin` or `financier`. Role is assigned at account creation by an existing admin and is not self-assignable. There is no multi-role or role-elevation mechanism in the MVP — an account is either an admin account or a financier account for its entire lifecycle unless explicitly changed by an admin through an administrative action (itself an audited event).

Authentication and account provisioning mechanics (username login, temporary password `0000`, forced change) are defined in [ADR-002](../decisions/ADR-002-username-auth-model.md) and will be detailed further in `docs/13-authentication-design.md`. This document focuses on *what each role is allowed to do*, not *how login works*.

## 3. Admin Capabilities

Admins act on behalf of ObraTech and have full operational control over the system's business data and user accounts. In summary, an admin can:

- **Manage projects.** Create, edit, and view all projects and their funding targets and statuses.
- **Manage financier participation.** Invite financiers to projects, and view/adjust willing and confirmed amounts for any financier on any project.
- **Confirm financing.** Move a financier's participation from "willing" to "confirmed" for a project, subject to server-side validation of totals.
- **Manage releases.** Create release events (TBA/Scheduled/Released), assign or change scheduled dates, and post the actual release with amount and date.
- **View all financial data.** See every project's full financier list, individual amounts, release history, and profit-share allocations — with no per-financier data isolation applied to admin views.
- **Manage financier accounts.** Create financier accounts (system issues temp password `0000`), reset passwords (resets to `0000`, forces change, revokes sessions), and activate/deactivate/unlock accounts.
- **View the audit trail.** See the full audit log across all projects, financiers, and account security events, with filtering by project, financier, and action type.
- **Manage system settings** relevant to the MVP (e.g., default funding parameters), where such settings exist.

Admins **cannot**: self-register (accounts are provisioned by another existing admin or a bootstrap process outside normal login), and are still subject to the same forced-password-change rule as financiers on temporary or reset passwords.

## 4. Financier Capabilities

Financiers are the individuals or entities who commit capital to ObraTech projects. A financier can:

- **View their own project list.** See every project they participate in, but not projects where they have no participation record.
- **View their own financing status.** See their own willing amount, confirmed amount, and confirmation status per project.
- **Submit/update their willing amount.** Propose or change the amount they intend to contribute to a project, which then awaits admin confirmation.
- **View project-level funding context without peer data.** See aggregate signals such as whether a shared project is fully funded or underfunded, without seeing any other financier's individual willing or confirmed amount on that project.
- **View release status and history for their participation.** See TBA/Scheduled/Released/Overdue status for releases on projects they participate in, and their own payment amount for each release.
- **View their own profit-share allocation** once a project they participate in records profit.
- **Receive in-app notifications** about changes to their own participation (amount updates, release scheduling/completion).
- **Manage their own password**, including completing the forced change flow after temp-password issuance or an admin-initiated reset.

Financiers **cannot**: create or edit projects, invite other financiers, confirm any amount (their own or others'), post or edit release events, view any other financier's individual amounts or payment history, manage any account other than their own credentials, or view the audit log.

## 5. Permission Matrix

Legend: **Full** = create/read/update as applicable without restriction · **Own only** = limited to the authenticated user's own records · **Read only** = view but not modify · **—** = no access.

| Resource | Action | Admin | Financier |
| --- | --- | --- | --- |
| **Projects** | Create | Full | — |
| **Projects** | Read | Full (all projects) | Own only (projects where they have a participation record) |
| **Projects** | Update (target, status, details) | Full | — |
| **Projects** | Delete / archive | Full | — |
| **Project Financiers** (willing/confirmed amount, status per project–financier pair) | Create (invite financier to project) | Full | — |
| **Project Financiers** | Read | Full (all financiers, all projects) | Own only (their own row per project) |
| **Project Financiers** | Update — submit/change willing amount | Full (on behalf of any financier) | Own only (their own willing amount) |
| **Project Financiers** | Confirm amount (willing → confirmed) | Full | — |
| **Project Releases** (TBA/Scheduled/Released events) | Create | Full | — |
| **Project Releases** | Read | Full (all releases, all projects) | Read only, own-project scope (aggregate release status only; no other financiers' payment detail) |
| **Project Releases** | Update (set/change date, mark Released) | Full | — |
| **Project Releases** | Delete / cancel | Full | — |
| **Financier Release Payments** (per-financier distribution of a release) | Create (system-computed on release posting) | Full | — |
| **Financier Release Payments** | Read | Full (all financiers) | Own only |
| **Financier Release Payments** | Update / correct | Full (with audit log entry) | — |
| **Profit-Share Allocations** | Compute / record | Full | — |
| **Profit-Share Allocations** | Read | Full (all financiers) | Own only |
| **User Accounts** (`profiles`) | Create (financier account) | Full | — |
| **User Accounts** | Read | Full (all accounts) | Own only (their own profile) |
| **User Accounts** | Update role / status (activate, deactivate, unlock) | Full | — |
| **User Accounts** | Reset password (to temp `0000`, force change, revoke sessions) | Full (on any financier account) | Own only — change own password after login (not a "reset") |
| **Notifications** | Create (system-generated on relevant events) | System-generated | System-generated |
| **Notifications** | Read | Own only (admin-directed notifications, if any) | Own only |
| **Audit Logs** | Read | Full (all entries, filterable) | — |
| **Audit Logs** | Write | System-generated on relevant actions | System-generated on relevant actions |
| **System Settings** | Read / Update | Full | — |

### 5.1 Enforcement Principle

Every row above must be enforced **server-side**, primarily through Supabase Row Level Security policies on the underlying tables and, where RLS alone is insufficient for privileged orchestration (e.g., Auth user creation, password resets), through JWT-verified Edge Functions per [ADR-004](../decisions/ADR-004-edge-function-boundaries.md). UI-level role gating (hiding admin controls from financier views) is a usability convenience only and must never be the sole access control mechanism, consistent with the project's security-first engineering standards.

### 5.2 Data Isolation Between Financiers

The single most important isolation rule in this matrix: **on a shared project, a financier must never be able to read another financier's willing amount, confirmed amount, release payment amount, or profit-share allocation.** This is called out explicitly because it is the access-control requirement most likely to be violated by a convenient-but-incorrect query (e.g., fetching "all participation rows for this project" without filtering by the requesting user). Every query and RLS policy touching `project_financiers` or `financier_release_payments` must be designed and tested against this rule; see the multi-financier scenario in [docs/02-business-story.md](02-business-story.md) (Section 4.5) for the business context.

## 6. Future Role: Viewer / Auditor (Not in MVP)

A **Viewer** (or **Auditor**) role — read-only access to projects, financing status, releases, and profit-share allocations, without any create/update/confirm capability and without administrative account management — has been identified as a likely future need (for example, to give a bookkeeper or external auditor visibility without financial edit rights). It is **explicitly deferred** and is **not implemented in the MVP**:

- No `viewer` value exists in the role enum for the MVP.
- No page, API, or RLS policy should assume a third role is present.
- The technology stack was chosen to make adding this role straightforward later (a new `profiles.role` value plus additive read-only RLS policies) without restructuring the data model — see [ADR-001](../decisions/ADR-001-technology-stack.md).

Introducing this role requires an explicit scope change (see [templates/change-request-template.md](../templates/change-request-template.md)) and an update to this document, including a new row set in the permission matrix above, before implementation begins.

## 7. Approval Status

**Status: READY FOR REVIEW**

This permission matrix should be approved (using [templates/approval-record-template.md](../templates/approval-record-template.md)) before database schema and Row Level Security policies are implemented, since RLS design derives directly from Section 5.

## 8. Related Documents

- [docs/01-project-brief.md](01-project-brief.md) — Target users overview
- [docs/02-business-story.md](02-business-story.md) — Multi-financier privacy scenario underlying Section 5.2
- [docs/03-mvp-scope.md](03-mvp-scope.md) — Feature list by role (Section 6), consistent with this permission matrix
- [decisions/ADR-002-username-auth-model.md](../decisions/ADR-002-username-auth-model.md) — Authentication mechanics for both roles
- [decisions/ADR-004-edge-function-boundaries.md](../decisions/ADR-004-edge-function-boundaries.md) — Where enforcement moves from RLS to Edge Functions
- [decisions/ADR-005-entity-consolidation.md](../decisions/ADR-005-entity-consolidation.md) — Schema shape behind the Project Financiers rows in Section 5
