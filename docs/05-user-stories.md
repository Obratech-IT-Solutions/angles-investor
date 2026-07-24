# FundTrack — User Stories

## Document Control

| Field | Value |
| --- | --- |
| Document | `docs/05-user-stories.md` |
| Owner | ObraTech |
| Product | FundTrack — Project Financing and Profit Monitoring System |
| Version | 0.1 |
| Last Updated | 2026-07-23 |
| Approval Status | **READY FOR REVIEW** |

## 1. Purpose

This document defines the MVP user stories for FundTrack, the private web application that replaces ObraTech's spreadsheet-based tracking of project financing, financier commitments, and profit-share releases (see [docs/01-project-brief.md](01-project-brief.md), [docs/02-business-story.md](02-business-story.md)).

Every story below follows the field structure defined in [templates/user-story-template.md](../templates/user-story-template.md). Given/When/Then acceptance criteria may be elaborated into detailed test scenarios using [templates/acceptance-criteria-template.md](../templates/acceptance-criteria-template.md), and every acceptance criterion should ultimately be traced to one or more entries logged with [templates/test-case-template.md](../templates/test-case-template.md) prior to release sign-off.

Business rule references (`BR-XXX`) point to [docs/06-business-rules.md](06-business-rules.md). Screen references point to `docs/09-page-map-and-user-flows.md` (page map, to be authored separately). Financial formula references point to [docs/07-financial-calculations.md](07-financial-calculations.md). Status/workflow references point to [docs/08-project-status-workflow.md](08-project-status-workflow.md).

## 2. Roles

- **Admin** — acts on behalf of ObraTech; full operational control over accounts, projects, invitations, confirmations, release dates, and release recording (see [docs/04-user-roles-and-permissions.md](04-user-roles-and-permissions.md)).
- **Financier** — an invited investor who submits willing contribution amounts and tracks their own commitments and payouts. Financiers never self-register and never confirm their own amounts.

A `viewer`/`auditor` role is reserved for a future phase and is out of scope for this document (see [docs/03-mvp-scope.md](03-mvp-scope.md), Section 4).

## 3. Story Index

| ID | Title | Priority |
| ---- | ----- | -------- |
| [US-001](#us-001--admin-creates-a-financier-account) | Admin Creates a Financier Account | Must |
| [US-002](#us-002--financier-is-forced-to-change-temporary-password-on-first-login) | Financier Is Forced to Change Temporary Password on First Login | Must |
| [US-003](#us-003--admin-creates-a-new-financing-project) | Admin Creates a New Financing Project | Must |
| [US-004](#us-004--admin-invites-financiers-to-a-project) | Admin Invites Financiers to a Project | Must |
| [US-005](#us-005--financier-submits-a-willing-contribution-amount) | Financier Submits a Willing Contribution Amount | Must |
| [US-006](#us-006--admin-confirms-financier-allocations) | Admin Confirms Financier Allocations | Must |
| [US-007](#us-007--admin-sets-the-project-release-date) | Admin Sets the Project Release Date | Must |
| [US-008](#us-008--admin-records-a-fund-release) | Admin Records a Fund Release | Must |
| [US-009](#us-009--admin-views-platform-wide-analytics-dashboard) | Admin Views Platform-Wide Analytics Dashboard | Must |
| [US-010](#us-010--financier-views-personal-investment-analytics) | Financier Views Personal Investment Analytics | Must |
| [US-011](#us-011--admin-deactivates-a-financier-account) | Admin Deactivates a Financier Account | Must |
| [US-012](#us-012--admin-resets-a-financiers-password) | Admin Resets a Financier's Password | Must |
| [US-013](#us-013--overdue-status-is-displayed-to-admin-and-financier) | Overdue Status Is Displayed to Admin and Financier | Must |

## 4. User Stories

### US-001 — Admin Creates a Financier Account

#### Role

As an **admin**

#### Goal

I want to **create a new financier account by providing a username and basic profile details**

#### Benefit

So that **I can onboard investors into FundTrack under centralized control, without requiring financiers to self-register or manage an email-based sign-up flow**

#### Priority

`Must`

#### Acceptance Criteria

1. Given I am authenticated as an admin, when I submit a unique username, display name, and optional contact email/phone, then the system creates a new profile with role `financier`, status `Active`, a temporary password of `0000`, and `must_change_password = true`.
2. Given I submit a username that already exists (compared case-insensitively), when I attempt to create the account, then the system rejects the request with a "username already taken" error and creates no account.
3. Given I submit an empty or invalid username (e.g., containing disallowed characters), when I attempt to save, then the system rejects the request with a field-level validation error before any account is created.
4. Given the account is created successfully, when I view the financier list, then the new financier appears with status Active and a "must change password" indicator, and a security event is recorded for the creation.
5. Given I am not authenticated as an admin, when I call the account-creation operation directly, then the request is rejected with an authorization error and no account is created.

#### Business Rules

- [BR-002, BR-004, BR-005, BR-006, BR-007](06-business-rules.md)

#### Screens

- Admin → Financiers → Create Financier (`docs/09-page-map-and-user-flows.md`)

#### Data Entities

- `profiles`, `account_security_events`

#### Non-Functional

- **Security:** Creation is routed through a service-role Edge Function (`admin-create-financier`); the Auth Admin API is never called from the browser (see [ADR-004](../decisions/ADR-004-edge-function-boundaries.md)).
- **Audit:** Account creation is recorded with the acting admin's identity and timestamp.
- **Performance:** Synchronous response expected within normal form-submission latency.

#### Notes

- Real email, if provided, is contact information only and is not used as the Supabase Auth identity for MVP (see [ADR-002](../decisions/ADR-002-username-auth-model.md)).

---

### US-002 — Financier Is Forced to Change Temporary Password on First Login

#### Role

As a **financier**

#### Goal

I want to **be required to set a new password immediately after logging in with my temporary password**

#### Benefit

So that **my account cannot remain protected only by the shared, guessable default password (`0000`), reducing the risk of unauthorized access**

#### Priority

`Must`

#### Acceptance Criteria

1. Given my account has `must_change_password = true`, when I log in successfully with my username and password `0000`, then I am redirected to a "Change Password" screen and blocked from reaching any other screen.
2. Given I am on the Change Password screen, when I submit a new password that does not meet the minimum complexity policy, then the system rejects it with a clear validation message and the password is not changed.
3. Given I submit a valid new password that meets policy, when the change succeeds, then `must_change_password` is set to `false`, the event is recorded as a security event, and I am redirected to my normal dashboard.
4. Given `must_change_password` is `true`, when I attempt to navigate directly to any other protected route (e.g., by URL), then I am redirected back to the Change Password screen.
5. Given I successfully change my password, when I later attempt to log in with the old temporary password, then authentication fails.

#### Business Rules

- [BR-007, BR-008, BR-009](06-business-rules.md)

#### Screens

- Change Password (forced) (`docs/09-page-map-and-user-flows.md`)

#### Data Entities

- `profiles`, `account_security_events`

#### Non-Functional

- **Security:** The route guard is enforced both client-side (for UX) and re-validated server-side via session/profile checks (see [ADR-002](../decisions/ADR-002-username-auth-model.md)); client-only enforcement is never trusted.
- **Audit:** The password-change event is logged.

---

### US-003 — Admin Creates a New Financing Project

#### Role

As an **admin**

#### Goal

I want to **create a new project with its funding target, description, and key details**

#### Benefit

So that **I have a single authoritative, trackable record of the project's financing lifecycle instead of a spreadsheet**

#### Priority

`Must`

#### Acceptance Criteria

1. Given I am authenticated as an admin, when I submit a project name, description, a Target Funding Amount greater than zero, and an optional expected profit figure, then a new project is created with status `Draft`.
2. Given I submit a Target Funding Amount of zero or a negative number, when I attempt to save, then the system rejects the request with a validation error and creates no project.
3. Given the project is created in `Draft` status, when I view its detail screen, then I can still edit the Target Funding Amount and other core fields, and no financiers have yet been invited.
4. Given I am not authenticated as an admin, when I attempt to create a project, then the request is rejected with an authorization error.

#### Business Rules

- [BR-002, BR-013, BR-018](06-business-rules.md)

#### Screens

- Admin → Projects → Create Project (`docs/09-page-map-and-user-flows.md`)

#### Data Entities

- `projects`, `audit_logs`

#### Non-Functional

- **Security:** Row Level Security restricts `INSERT` on `projects` to the admin role.
- **Audit:** Project creation is logged.

---

### US-004 — Admin Invites Financiers to a Project

#### Role

As an **admin**

#### Goal

I want to **invite one or more existing financier accounts to a specific project**

#### Benefit

So that **those financiers can view the project's details and submit a willing contribution amount**

#### Priority

`Must`

#### Acceptance Criteria

1. Given a project exists in `Draft` or `Open for Funding` status, when I select one or more financiers and invite them, then a commitment record is created per financier with status `Invited`.
2. Given a financier is already invited to the project, when I attempt to invite them again, then the system prevents a duplicate record and instead shows their current commitment status.
3. Given I invite financiers while the project is still `Draft`, when I also open the project for funding, then the project transitions to `Open for Funding` (see [docs/08-project-status-workflow.md](08-project-status-workflow.md)).
4. Given a financier has been invited, when they log in, then the project appears in their "My Projects" list with status `Invited`.
5. Given I am not authenticated as an admin, when I attempt to invite a financier, then the request is rejected with an authorization error.

#### Business Rules

- [BR-002, BR-017, BR-027, BR-028](06-business-rules.md)

#### Screens

- Admin → Project Detail → Invite Financiers (`docs/09-page-map-and-user-flows.md`)

#### Data Entities

- `project_financiers`, `notifications`

#### Non-Functional

- **Security:** Invitation actions are restricted to the admin role via Row Level Security.
- **Audit:** Invitations are logged.
- **Performance:** Bulk invitation of multiple financiers in a single action is supported.

---

### US-005 — Financier Submits a Willing Contribution Amount

#### Role

As a **financier**

#### Goal

I want to **enter the amount I am willing to contribute to a project I have been invited to**

#### Benefit

So that **the admin can review my intended commitment and confirm an allocation, while the project shows an accurate live funding preview**

#### Priority

`Must`

#### Acceptance Criteria

1. Given my commitment on a project is `Invited` or `Pending`, when I submit a willing amount greater than zero, then my commitment updates to status `Submitted` with that amount recorded.
2. Given I have already submitted a willing amount (`Submitted` status), when I submit a revised amount, then my existing commitment record is updated in place; no duplicate record is created.
3. Given I submit a willing amount that is zero, negative, or non-numeric, when I attempt to save, then the system rejects the request with a validation error.
4. Given my commitment is already `Confirmed`, when I attempt to submit a new willing amount, then the system blocks the edit and directs me to contact the admin for changes.
5. Given I submit a willing amount, when the project's live funding preview is displayed, then it reflects my submission immediately but is clearly marked as a preview pending admin confirmation.

#### Business Rules

- [BR-015, BR-025, BR-030, BR-036](06-business-rules.md)

#### Screens

- Financier → Project Detail → Submit Willing Amount (`docs/09-page-map-and-user-flows.md`)

#### Data Entities

- `project_financiers`

#### Non-Functional

- **Security:** Row Level Security restricts a financier to updating only their own commitment record and only the permitted columns.
- **Audit:** The submission timestamp is retained on the record.
- **Performance:** Client-side preview renders instantly; the server remains the source of truth for any confirmed figure (see [ADR-003](../decisions/ADR-003-money-precision.md)).

---

### US-006 — Admin Confirms Financier Allocations

#### Role

As an **admin**

#### Goal

I want to **review submitted willing amounts and confirm a specific allocation amount per financier**

#### Benefit

So that **the actual capital allocation for the project is locked in, the total never exceeds the funding target, and only vetted amounts count toward funding progress**

#### Priority

`Must`

#### Acceptance Criteria

1. Given a financier's commitment is `Submitted`, when I confirm an amount that is less than or equal to both the financier's willing amount and the current remaining gap, then the commitment updates to `Confirmed` with that amount, and funding progress recalculates.
2. Given I attempt to confirm an amount greater than the financier's submitted willing amount, when I submit the confirmation, then the system rejects it.
3. Given I attempt to confirm an amount that would push total confirmed amounts above the Target Funding Amount, when I submit the confirmation, then the transaction is rejected atomically and no partial update occurs.
4. Given two admins attempt to confirm overlapping amounts on the same project at nearly the same time, when both submit concurrently, then the server-side transaction ensures only a confirmation that keeps the total within the target succeeds; the conflicting confirmation is rejected with a message indicating the remaining gap has changed.
5. Given a confirmation succeeds and total confirmed amounts now equal the Target Funding Amount, when the transaction commits, then the project status automatically transitions to `Fully Funded`.
6. Given I confirm an amount lower than a financier's submitted willing amount, when the confirmation is saved, then the financier's view clearly distinguishes the confirmed amount from their originally submitted amount.

#### Business Rules

- [BR-031, BR-037, BR-038, BR-039, BR-040, BR-041, BR-042, BR-043, BR-044, BR-045](06-business-rules.md)

#### Screens

- Admin → Project Detail → Confirm Allocations (`docs/09-page-map-and-user-flows.md`)

#### Data Entities

- `project_financiers`, `audit_logs`

#### Non-Functional

- **Security:** Executed via the `confirm-allocations` Edge Function/RPC, which enforces admin role and transactional atomicity (see [ADR-004](../decisions/ADR-004-edge-function-boundaries.md)).
- **Audit:** Any change to a confirmed amount after initial confirmation is logged.
- **Performance:** The atomicity check must complete within normal request timeouts even under concurrent admin actions.

---

### US-007 — Admin Sets the Project Release Date

#### Role

As an **admin**

#### Goal

I want to **set or update the date on which capital and profit are expected to be released to financiers**

#### Benefit

So that **financiers have visibility into when to expect payout, and the system can automatically flag the project as overdue if that date passes without a release**

#### Priority

`Must`

#### Acceptance Criteria

1. Given a project is in `Fully Funded` or `Active` status, when I set a release date, then the date is saved and becomes visible to all invited financiers on the project detail screen.
2. Given a project already has a recorded release (status `Released` or later), when I attempt to change the release date, then the system blocks the edit.
3. Given I set a release date in the past, when I save it, then the system accepts it, and the project may immediately be evaluated as `Overdue` on the next status check.
4. Given I am not authenticated as an admin, when I attempt to set a release date, then the request is rejected with an authorization error.

#### Business Rules

- [BR-055, BR-056, BR-057](06-business-rules.md)

#### Screens

- Admin → Project Detail → Release Date (`docs/09-page-map-and-user-flows.md`)

#### Data Entities

- `projects`, `project_releases`, `audit_logs`

#### Non-Functional

- **Security:** Admin-only write, enforced via Row Level Security.
- **Audit:** Release date changes are logged.
- **Time:** All date comparisons use the Asia/Manila timezone (see [docs/08-project-status-workflow.md](08-project-status-workflow.md)).

---

### US-008 — Admin Records a Fund Release

#### Role

As an **admin**

#### Goal

I want to **record that capital and profit have been released to financiers for a project**

#### Benefit

So that **there is an authoritative, auditable record of the payout event and each financier's exact payment, and the project advances into its post-funding lifecycle stage**

#### Priority

`Must`

#### Acceptance Criteria

1. Given a project is `Active` or `Overdue`, when I record a release, then the system computes each financier's Total to Receive per [docs/07-financial-calculations.md](07-financial-calculations.md), creates one project-level release record (marked `Released`) and one payment record per financier, and transitions the project to `Released`.
2. Given a project has not yet reached `Active` status, when I attempt to record a release, then the system rejects the action.
3. Given a release has already been recorded for a project, when I attempt to record a second release for the same project, then the system rejects the duplicate action.
4. Given the profit-share calculation produces rounding residuals across financiers, when the release is recorded, then the one-centavo adjustment rule (see [docs/07-financial-calculations.md](07-financial-calculations.md)) is applied and logged before the release is finalized.
5. Given the release is successfully recorded, when financiers view their dashboard, then they see their individual payment amount and release date.

#### Business Rules

- [BR-054, BR-058, BR-059](06-business-rules.md)

#### Screens

- Admin → Project Detail → Record Release (`docs/09-page-map-and-user-flows.md`)

#### Data Entities

- `project_releases`, `financier_release_payments`, `audit_logs`, `notifications`

#### Non-Functional

- **Security:** Admin-only, executed via the `record-release` Edge Function/RPC (see [ADR-004](../decisions/ADR-004-edge-function-boundaries.md)).
- **Audit:** The release and any rounding adjustment are logged.
- **Performance:** The release is written as a single atomic, multi-row transaction.

---

### US-009 — Admin Views Platform-Wide Analytics Dashboard

#### Role

As an **admin**

#### Goal

I want to **view aggregate metrics across all projects and financiers, including total capital raised, project status breakdown, and overdue projects**

#### Benefit

So that **I can make informed decisions and monitor overall platform health without manually compiling spreadsheets**

#### Priority

`Must`

#### Acceptance Criteria

1. Given I am authenticated as an admin, when I open the analytics dashboard, then I see the number of projects by status, total Target Funding Amount versus total Confirmed Amount across active projects, and a count of overdue projects.
2. Given at least one project is `Overdue`, when I view the dashboard, then overdue projects are visually distinguished and listed with the number of days overdue (Asia/Manila).
3. Given I filter the dashboard by date range or project status, when I apply the filter, then all displayed metrics recalculate to reflect only the filtered scope.
4. Given I am not authenticated as an admin, when I attempt to access the analytics dashboard route, then I am redirected away with an authorization error.

#### Business Rules

- [BR-002, BR-023, BR-024, BR-057](06-business-rules.md)

#### Screens

- Admin → Analytics Dashboard (`docs/09-page-map-and-user-flows.md`)

#### Data Entities

- `projects`, `project_financiers`, `project_releases`

#### Non-Functional

- **Security:** Admin-only route and Row Level Security.
- **Performance:** Aggregate queries must be indexed to avoid full table scans as data volume grows.
- **Audit:** Dashboard access itself is not audited, being a read-only, non-sensitive aggregate view.

---

### US-010 — Financier Views Personal Investment Analytics

#### Role

As a **financier**

#### Goal

I want to **view a personal dashboard summarizing my confirmed contributions, expected profit shares, and payout history across all my projects**

#### Benefit

So that **I can track my own investment performance and returns without needing to ask the admin directly**

#### Priority

`Must`

#### Acceptance Criteria

1. Given I am authenticated as a financier, when I open my analytics dashboard, then I see, per project I am part of: my Confirmed Amount, Investor %, Expected Profit Share, Total to Receive, and current project status.
2. Given I have received one or more historical releases, when I view my dashboard, then I see a payout history list including dates and amounts.
3. Given a project I am part of is `Overdue`, when I view my dashboard, then that project is flagged as overdue with the expected release date shown.
4. Given I attempt to view another financier's analytics data (directly or via manipulated identifiers), when I make the request, then Row Level Security prevents access and no data for rows that are not mine is returned.

#### Business Rules

- [BR-003, BR-048](06-business-rules.md)

#### Screens

- Financier → My Analytics (`docs/09-page-map-and-user-flows.md`)

#### Data Entities

- `project_financiers`, `financier_release_payments`, `audit_logs` (read-only history)

#### Non-Functional

- **Security:** Row Level Security restricts all reads to rows owned by the authenticated user; see the data-isolation rule in [docs/04-user-roles-and-permissions.md](04-user-roles-and-permissions.md), Section 5.2.
- **Performance:** Dashboard queries are scoped per user and indexed on financier identifier.

---

### US-011 — Admin Deactivates a Financier Account

#### Role

As an **admin**

#### Goal

I want to **deactivate a financier's account so they can no longer log in**

#### Benefit

So that **I can revoke access for financiers who are no longer active participants, without destroying their historical commitment and payout records**

#### Priority

`Must`

#### Acceptance Criteria

1. Given a financier account is `Active`, when I deactivate it, then the account status is set to `Inactive`, all active sessions are revoked, and the account can no longer authenticate.
2. Given an account is deactivated, when I view that financier's historical projects and payment records, then all historical data remains fully visible to admins.
3. Given a deactivated financier attempts to log in, when they submit valid former credentials, then authentication is rejected with a generic "account inactive" message.
4. Given an account is deactivated, when I later reactivate it, then login ability is restored without altering past commitment or release history.
5. Given I am not authenticated as an admin, when I attempt to deactivate an account, then the request is rejected with an authorization error.

#### Business Rules

- [BR-011, BR-012](06-business-rules.md)

#### Screens

- Admin → Financiers → Deactivate Account (`docs/09-page-map-and-user-flows.md`)

#### Data Entities

- `profiles`, `account_security_events`, `audit_logs`

#### Non-Functional

- **Security:** Session revocation is performed via the Auth Admin API inside an Edge Function.
- **Audit:** Deactivation and reactivation events are logged with the acting admin's identity.

---

### US-012 — Admin Resets a Financier's Password

#### Role

As an **admin**

#### Goal

I want to **reset a financier's password back to the temporary default and force them to set a new one**

#### Benefit

So that **financiers can regain access when they forget their password, without the platform relying on self-service email-based recovery**

#### Priority

`Must`

#### Acceptance Criteria

1. Given a financier account exists, when I trigger a password reset, then the account's password is set to `0000`, `must_change_password` is set to `true`, and all active sessions for that account are revoked.
2. Given the reset succeeds, when the financier next logs in with their username and `0000`, then they are forced through the change-password flow before accessing any other screen.
3. Given I reset a password for an account that is currently `Inactive`, when I submit the reset, then the system blocks the action or clearly warns that a password reset alone does not reactivate the account.
4. Given I am not authenticated as an admin, when I attempt to reset another user's password, then the request is rejected with an authorization error.

#### Business Rules

- [BR-010](06-business-rules.md)

#### Screens

- Admin → Financiers → Reset Password (`docs/09-page-map-and-user-flows.md`)

#### Data Entities

- `profiles`, `account_security_events`

#### Non-Functional

- **Security:** Executed via the `admin-reset-password` Edge Function using the service role (see [ADR-004](../decisions/ADR-004-edge-function-boundaries.md)).
- **Audit:** The reset event is logged with the acting admin's identity.

---

### US-013 — Overdue Status Is Displayed to Admin and Financier

#### Role

As an **admin and a financier**

#### Goal

I want to **clearly see when a project has passed its release date without a recorded release**

#### Benefit

So that **there is visibility and urgency around delayed payouts, for both the platform operator and the affected investors**

#### Priority

`Must`

#### Acceptance Criteria

1. Given a project's release date has passed in the Asia/Manila timezone and no release has been recorded, when any authorized user views the project, then its status displays as `Overdue` along with the number of days overdue.
2. Given a project becomes `Overdue`, when the scheduled status check runs, then the transition from `Active` to `Overdue` is recorded with actor `system`.
3. Given an admin subsequently records a release for an overdue project, when the release is recorded, then the status transitions to `Released` and the overdue flag is cleared.
4. Given a financier views a project that is `Overdue`, when they open the project detail screen, then they see the original release date, the current date, and the number of days overdue, but cannot themselves change the status or force a release.
5. Given the server's clock or timezone configuration differs from Asia/Manila, when the overdue check runs, then all date comparisons are explicitly performed in the Asia/Manila timezone regardless of server or client local timezone.

#### Business Rules

- [BR-049, BR-057](06-business-rules.md)

#### Screens

- Admin → Project Detail; Financier → Project Detail (`docs/09-page-map-and-user-flows.md`)

#### Data Entities

- `projects`, `audit_logs`

#### Non-Functional

- **Security:** Overdue status is system-computed and never directly user-editable.
- **Audit:** The automatic transition is logged.
- **Time:** Asia/Manila is the authoritative timezone for all overdue logic (see [docs/08-project-status-workflow.md](08-project-status-workflow.md)).

## 5. Approval Status

**Status: READY FOR REVIEW**

These stories should be approved (using [templates/approval-record-template.md](../templates/approval-record-template.md)) before detailed UI/UX and database design proceed, since screens and RLS policies derive directly from the acceptance criteria above.

## 6. Related Documents

- [docs/01-project-brief.md](01-project-brief.md) — Product identity and goals
- [docs/03-mvp-scope.md](03-mvp-scope.md) — Feature list by role, consistent with these stories
- [docs/04-user-roles-and-permissions.md](04-user-roles-and-permissions.md) — Permission matrix underlying every "who can do this" acceptance criterion
- [docs/06-business-rules.md](06-business-rules.md) — Detailed rules referenced throughout
- [docs/07-financial-calculations.md](07-financial-calculations.md) — Formulas referenced in US-005, US-006, US-008, US-010
- [docs/08-project-status-workflow.md](08-project-status-workflow.md) — Status transitions referenced in US-004, US-006, US-007, US-008, US-013
- [templates/user-story-template.md](../templates/user-story-template.md), [templates/acceptance-criteria-template.md](../templates/acceptance-criteria-template.md), [templates/test-case-template.md](../templates/test-case-template.md)
- [decisions/ADR-002-username-auth-model.md](../decisions/ADR-002-username-auth-model.md), [decisions/ADR-003-money-precision.md](../decisions/ADR-003-money-precision.md), [decisions/ADR-004-edge-function-boundaries.md](../decisions/ADR-004-edge-function-boundaries.md)
