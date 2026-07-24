# FundTrack — Business Rules

## Document Control

| Field | Value |
| --- | --- |
| Document | `docs/06-business-rules.md` |
| Owner | ObraTech |
| Product | FundTrack — Project Financing and Profit Monitoring System |
| Version | 0.1 |
| Last Updated | 2026-07-23 |
| Approval Status | **READY FOR REVIEW** |

## 1. Purpose

This document is the authoritative catalog of business rules governing FundTrack's flexible project-financing model: how financing targets and shares work, how financier commitments move through their lifecycle, how overfunding is prevented, who has authority to confirm allocations, how audit trails are maintained, how accounts are deactivated, and how currency is stored and displayed.

Rules are numbered sequentially (`BR-001`, `BR-002`, …) and grouped into sections. Rules are referenced from [docs/05-user-stories.md](05-user-stories.md), [docs/07-financial-calculations.md](07-financial-calculations.md), and [docs/08-project-status-workflow.md](08-project-status-workflow.md), and should be traced from database constraints, RLS policies, and Edge Function validation logic during implementation.

## 2. Roles & Access (BR-001–BR-004)

- **BR-001** — The system defines exactly two operational roles for MVP: `admin` and `financier`. A `viewer`/`auditor` role is reserved for a future phase (see [docs/03-mvp-scope.md](03-mvp-scope.md), Section 4) but is not implemented in MVP.
- **BR-002** — Only users with role `admin` may create, edit, cancel, or activate projects; create or manage financier accounts; invite financiers; confirm allocations; set release dates; and record releases (see the full permission matrix in [docs/04-user-roles-and-permissions.md](04-user-roles-and-permissions.md), Section 5).
- **BR-003** — Financiers may only view and act upon projects to which they have been invited (i.e., a commitment record exists for them on that project), and may never read another financier's individual amounts on a shared project.
- **BR-004** — All privileged administrative actions (account creation, password reset, account status changes, allocation confirmations, release recording) must be enforced server-side via Row Level Security policies and/or Edge Functions. Client-side role checks are for user experience only and are never trusted as the security boundary (see [ADR-004](../decisions/ADR-004-edge-function-boundaries.md)).

## 3. Account Lifecycle (BR-005–BR-012)

- **BR-005** — Financier accounts are created only by an admin; there is no self-registration flow.
- **BR-006** — Every `username` is unique across the system and is case-normalized (stored and compared in lowercase) to prevent duplicate accounts differing only by letter case.
- **BR-007** — New accounts are assigned the temporary password `0000` and flagged `must_change_password = true` at creation.
- **BR-008** — A user with `must_change_password = true` cannot access any application screen other than the "Change Password" screen until the password has been changed.
- **BR-009** — On successful password change, `must_change_password` is set to `false`, and the event is recorded as an account security event.
- **BR-010** — An admin resetting a financier's password sets the password back to `0000`, sets `must_change_password = true`, and revokes all active sessions for that user (see [ADR-002](../decisions/ADR-002-username-auth-model.md)).
- **BR-011** — Deactivating an account is a **soft delete**: the account record is retained, its status is set to `Inactive`, and the user is immediately prevented from authenticating or performing any action. No account or historical data (commitments, releases, audit entries) is hard-deleted.
- **BR-012** — A deactivated account may be reactivated by an admin, which restores login ability but does not alter historical commitment or release records.

## 4. Flexible Financing Model (BR-013–BR-018)

- **BR-013** — A project's Target Funding Amount does not have to be reached by a single financier; multiple financiers may jointly fund one project.
- **BR-014** — The amount each financier ultimately contributes (Confirmed Amount) is **not required to be equal** among financiers on the same project; the model explicitly tolerates unequal shares.
- **BR-015** — A financier's Willing Amount (self-declared interest) is **non-binding** until an admin confirms it. A financier may submit, revise, or withdraw a Willing Amount before confirmation.
- **BR-016** — There is no system-enforced minimum contribution amount per financier for MVP; any admin-defined minimum is applied as manual business policy, not a hard database constraint, unless later configured in system settings.
- **BR-017** — A project may have any number of invited financiers, including exactly one.
- **BR-018** — The Target Funding Amount may be edited by an admin only while the project is in `Draft` status. Once funding has opened, the target is fixed to preserve the integrity of already-submitted willing amounts and calculated percentages (see [docs/08-project-status-workflow.md](08-project-status-workflow.md)).

## 5. Suggested Share Formulas (BR-019–BR-022)

- **BR-019** — The system may compute and display a **Suggested Share** per financier as non-binding guidance, calculated as the Remaining Gap divided by the number of currently invited, undecided financiers at the time of invitation, or as a custom figure entered by the admin per financier.
- **BR-020** — The suggested share is presented to the financier as a reference only; it never constrains the value a financier may enter as their Willing Amount.
- **BR-021** — Changing one financier's suggested share does not retroactively affect any other financier's suggested share. Recalculation happens only on demand (e.g., when a new financier is invited or an existing one withdraws).
- **BR-022** — Suggested share values are never used in profit-share or return-on-capital calculations; only the Confirmed Amount is used for financial calculations (see [docs/07-financial-calculations.md](07-financial-calculations.md)).

## 6. Remaining Gap & Funding Progress (BR-023–BR-026)

- **BR-023** — Remaining Gap is calculated as the Target Funding Amount minus the sum of Confirmed Amounts across all financiers with commitment status `Confirmed`, floored at zero.
- **BR-024** — Funding Progress (%) is calculated as the sum of Confirmed Amounts divided by the Target Funding Amount, expressed as a percentage and capped at 100% for display.
- **BR-025** — Willing Amounts that are not yet Confirmed do **not** reduce the Remaining Gap or increase Funding Progress; only Confirmed Amounts count toward these figures.
- **BR-026** — Remaining Gap and Funding Progress must always be recalculated from the authoritative commitment rows at read time, or via an aggregate that is kept consistent by the same transaction that changes a Confirmed Amount. Cached or denormalized values must never be allowed to drift from source rows.

## 7. Commitment Status Lifecycle (BR-027–BR-036)

- **BR-027** — Each financier's participation in a project is represented by exactly one commitment record, holding a single status value: `Invited`, `Pending`, `Submitted`, `Confirmed`, `Rejected`, or `Withdrawn` (see [ADR-005](../decisions/ADR-005-entity-consolidation.md)).
- **BR-028** — `Invited` is the default status when an admin adds a financier to a project; the financier has not yet acted.
- **BR-029** — `Pending` indicates the financier has viewed the invitation but has not yet submitted a willing amount. Where the platform does not distinguish "viewed" from "invited," `Pending` may be treated as synonymous with `Invited` until submission occurs; this is a UX/implementation note, not a data-integrity requirement.
- **BR-030** — `Submitted` indicates the financier has entered a Willing Amount and is awaiting an admin decision. A financier may re-submit (overwrite) a Willing Amount while still in `Submitted` status.
- **BR-031** — `Confirmed` indicates an admin has reviewed and locked in a specific Confirmed Amount for the financier. Only an admin action can set this status (see Section 9).
- **BR-032** — `Rejected` indicates an admin has declined the financier's submitted willing amount for this project. A rejected commitment never counts toward funding, gap, or profit-share calculations. An admin may return a rejected record to `Invited` to allow re-submission.
- **BR-033** — `Withdrawn` indicates the financier (or an admin acting on the financier's behalf) has withdrawn a previously `Submitted` or `Confirmed` commitment. A withdrawn commitment is excluded from all funding, gap, and profit-share calculations from the moment of withdrawal.
- **BR-034** — Withdrawing a `Confirmed` commitment is only permitted while the project is in a pre-`Active` status (`Open for Funding`, `Partially Funded`, or `Fully Funded`). Once a project is `Active`, confirmed commitments are locked and cannot be withdrawn through self-service.
- **BR-035** — Valid forward transitions are `Invited → Pending → Submitted → Confirmed`. Valid side transitions are `Submitted → Rejected`, `Submitted → Withdrawn`, and `Confirmed → Withdrawn` (subject to BR-034). `Rejected` and `Withdrawn` are terminal for that commitment record unless an admin explicitly re-opens it to `Invited`.
- **BR-036** — No commitment may transition directly from `Invited` or `Pending` to `Confirmed` without first passing through `Submitted`; an admin cannot confirm an amount the financier never submitted.

## 8. Overfunding Prevention (BR-037–BR-041)

- **BR-037** — The sum of all `Confirmed` amounts for a project must never exceed the project's Target Funding Amount. This is enforced at the database layer (check constraint and/or transactional validation), not only in the user interface.
- **BR-038** — When an admin attempts to confirm a Willing Amount that would cause total Confirmed Amounts to exceed the Target Funding Amount, the confirmation is rejected; the admin must confirm an amount equal to or less than the Remaining Gap at that moment, or first adjust other commitments.
- **BR-039** — Confirmation of allocations must occur inside a single atomic transaction (RPC) that re-reads the current sum of Confirmed Amounts and validates it against the target before committing, preventing race conditions from concurrent admin actions.
- **BR-040** — A project reaching exactly 100% Funding Progress automatically becomes eligible for the `Fully Funded` status transition (see [docs/08-project-status-workflow.md](08-project-status-workflow.md)); no further confirmations are accepted once the Remaining Gap is zero.
- **BR-041** — If a `Confirmed` commitment is later withdrawn or rejected (per BR-033–BR-034) and Funding Progress drops below 100%, the project reverts from `Fully Funded` to `Partially Funded` and re-accepts confirmations up to the (now larger) Remaining Gap.

## 9. Confirmation Authority (BR-042–BR-045)

- **BR-042** — Only a user with role `admin` may change a commitment's status to `Confirmed` or set/adjust a Confirmed Amount. Financiers can never self-confirm their own willing amount.
- **BR-043** — A Confirmed Amount does not have to equal the financier's originally Submitted Amount; an admin may confirm a lower amount (for example, to fit the Remaining Gap) but may not confirm an amount higher than what the financier submitted, unless the financier first submits a revised, higher Willing Amount.
- **BR-044** — Confirmation actions must be performed through the `confirm-allocations` Edge Function or an equivalent server-side RPC that validates admin role, project status, and overfunding limits atomically (see [ADR-004](../decisions/ADR-004-edge-function-boundaries.md)).
- **BR-045** — Once `Confirmed`, a commitment's amount is treated as authoritative for all funding, gap, and profit-share calculations until and unless it is withdrawn (BR-034) or explicitly changed by an admin (subject to Section 10 audit requirements).

## 10. Audit Requirements on Confirmed Amount Changes (BR-046–BR-050)

- **BR-046** — Any change to a Confirmed Amount after initial confirmation (increase, decrease, or status change to `Withdrawn`/`Rejected`) must write a new audit log entry capturing: acting admin identity, timestamp, project, financier, previous value, new value, and reason (if provided).
- **BR-047** — Audit log entries are append-only; no application role may update or delete an existing audit log entry.
- **BR-048** — A financier must be able to see a read-only history of changes to their own commitment as part of financier analytics/transparency, sourced from the audit log.
- **BR-049** — System-initiated changes (for example, the automatic `Active → Overdue` transition) are also written to the audit log, with the acting identity recorded as `system`.
- **BR-050** — Audit log retention is indefinite for MVP; no automated purge job is implemented.

## 11. Currency, Precision & Rounding (BR-051–BR-054)

- **BR-051** — All monetary amounts are stored in PostgreSQL as `NUMERIC(18,2)` in Philippine Pesos (PHP). Floating-point types are never used for money (see [ADR-003](../decisions/ADR-003-money-precision.md)).
- **BR-052** — Percentage/ratio values used for display (for example, Investor %) are stored or computed as `NUMERIC(8,6)` or derived on read from amount columns; they are never used as the source of truth for money calculations.
- **BR-053** — All monetary values are displayed to end users formatted to exactly two decimal places with the ₱ symbol and thousands separators (for example, ₱100,000.00).
- **BR-054** — Rounding of computed money values (for example, profit share) uses round-half-up to two decimal places. Any residual centavo discrepancy caused by rounding across multiple financiers is resolved per the one-centavo adjustment rule described in [docs/07-financial-calculations.md](07-financial-calculations.md), and the adjustment itself is recorded in the audit log.

## 12. Release & Overdue Rules (BR-055–BR-059)

> **Note on terminology:** [docs/03-mvp-scope.md](03-mvp-scope.md) describes a release *event* with its own sub-states (**TBA** → **Scheduled** → **Released**, with a computed **Overdue** flag on a Scheduled event past its date). The rules below use "Release Date" to mean the date recorded on that event once it is in the `Scheduled` (or later) state. For MVP, a project has exactly one such release event; the project-level `Overdue`/`Released` statuses in [docs/08-project-status-workflow.md](08-project-status-workflow.md) mirror the state of that single release event.

- **BR-055** — Each project has a single release event with a Release Date, set by an admin, representing the date on which capital and profit are expected to be released to financiers.
- **BR-056** — The Release Date may only be set or changed while the project is in `Fully Funded` or `Active` status. Changing it after a release has been recorded is prohibited (see [docs/08-project-status-workflow.md](08-project-status-workflow.md)).
- **BR-057** — A project automatically transitions to `Overdue` when the current date/time in the `Asia/Manila` timezone is strictly after the Release Date and no release record exists yet for that project, provided the project was `Active`. This check runs on a scheduled job and/or is computed on read.
- **BR-058** — Recording a release is an admin-only, atomic operation that: (a) validates the project is `Active` or `Overdue`; (b) computes each financier's Total to Receive per [docs/07-financial-calculations.md](07-financial-calculations.md); (c) writes the project-level release record and the per-financier payment records; and (d) transitions the project status to `Released`.
- **BR-059** — Once a release is recorded, the project can never return to `Active` or `Overdue`; the only forward transition is to `Completed` after admin reconciliation.

## 13. Approval Status

**Status: READY FOR REVIEW**

These rules should be approved (using [templates/approval-record-template.md](../templates/approval-record-template.md)) before database constraints, RLS policies, and Edge Function validation logic are implemented, since schema design derives directly from this document.

## 14. Related Documents

- [docs/01-project-brief.md](01-project-brief.md) — Product identity and goals
- [docs/03-mvp-scope.md](03-mvp-scope.md) — Feature scope, including the release event sub-states referenced in Section 12
- [docs/04-user-roles-and-permissions.md](04-user-roles-and-permissions.md) — Permission matrix underlying Sections 2, 8, 9, and 10
- [docs/05-user-stories.md](05-user-stories.md) — User stories that these rules support
- [docs/07-financial-calculations.md](07-financial-calculations.md) — Formulas that consume Sections 5, 6, 11, and 12
- [docs/08-project-status-workflow.md](08-project-status-workflow.md) — Status transitions that consume Sections 4, 7, 8, and 12
- [decisions/ADR-002-username-auth-model.md](../decisions/ADR-002-username-auth-model.md), [decisions/ADR-003-money-precision.md](../decisions/ADR-003-money-precision.md), [decisions/ADR-004-edge-function-boundaries.md](../decisions/ADR-004-edge-function-boundaries.md), [decisions/ADR-005-entity-consolidation.md](../decisions/ADR-005-entity-consolidation.md)
