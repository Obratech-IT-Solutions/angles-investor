# FundTrack — Business Story

## Document Control

| Field | Value |
| --- | --- |
| Document | `docs/02-business-story.md` |
| Owner | ObraTech |
| Product | FundTrack — Project Financing and Profit Monitoring System |
| Version | 0.1 |
| Last Updated | 2026-07-23 |
| Status | Narrative / supporting document — informs [docs/01-project-brief.md](01-project-brief.md) and [docs/03-mvp-scope.md](03-mvp-scope.md) |

## 1. Purpose of This Document

This document tells the story of *why* FundTrack exists: the day-to-day pain ObraTech experiences managing project financing in spreadsheets today, the specific situations that expose the weaknesses of that approach, and the goals the new system must meet to fix them. Where [docs/01-project-brief.md](01-project-brief.md) states goals and scope concisely, this document provides the narrative context and worked scenarios behind those goals.

## 2. The Spreadsheet Era

### 2.1 How it works today

Every time ObraTech takes on a project that requires outside financing, someone on the team creates a new spreadsheet (or a new tab in an existing workbook) to track it. The typical structure is:

- A row per financier, with columns for their name, the amount they said they would contribute ("willing amount"), and the amount they actually sent ("confirmed amount").
- A running total row that sums confirmed contributions and compares it against the project's funding target.
- A separate section, often on another tab, that lists disbursement events ("releases") — when money was paid out of the project and how it should be split among financiers.
- A profit-sharing section, calculated manually near the end of the project, that divides the project's profit among financiers in proportion to their confirmed contribution.

This spreadsheet is emailed, shared via chat, or hosted in a shared drive. Financiers who want to know their status message ObraTech directly and wait for someone to check the file and reply.

### 2.2 Why this breaks down

The spreadsheet approach was workable when ObraTech ran one project with two or three financiers. It breaks down as the business scales, for reasons that are structural, not incidental:

- **Version drift.** Once more than one person edits the file, or it is duplicated "just to check something," there is no way to guarantee everyone is looking at the same numbers. ObraTech has had situations where a financier's confirmed amount, quoted verbally, no longer matched what was in the sheet used to compute the final profit split.
- **Formula fragility.** Profit-share formulas reference specific cells. Inserting a row for a new financier, sorting the sheet, or copy-pasting a value as text instead of a number silently breaks downstream totals — often without any visible error.
- **No history.** If a financier's committed amount changes twice before confirmation, the spreadsheet only ever shows the current value. Nobody can answer "what did we agree to on this project three weeks ago, and who changed it?" without digging through file version history (if it even exists) or old email threads.
- **No access boundaries.** Every financier who receives the file can see every other financier's contribution, which ObraTech considers sensitive and would prefer to keep private between each financier and ObraTech.
- **No workflow for exceptions.** Real projects do not always go according to plan — funding can fall short, release dates can slip, and financiers can contribute unevenly. The spreadsheet has no structured way to represent "this release date is not yet fixed" versus "this release is late," so these states end up as inconsistent free-text notes, if they are recorded at all.

### 2.3 What ObraTech actually needs

Distilled from the above, ObraTech needs a system that:

1. Is the **one place** everyone (admin and financiers) looks at for a project's financing status — no copies, no drift.
2. **Computes money accurately and consistently**, using the same rules every time, without manual formula maintenance.
3. **Remembers what changed**, so any figure can be explained after the fact.
4. **Respects privacy** between financiers on the same project.
5. **Has first-class support for the messy realities** of project financing, not just the happy path.
6. Is **simple enough** for a small internal team to operate without dedicated IT staff, and **secure enough** to hold real financial commitments.

These needs map directly onto the goals stated in [docs/01-project-brief.md](01-project-brief.md) and the concrete scope decisions in [docs/03-mvp-scope.md](03-mvp-scope.md).

## 3. Stakeholders

| Stakeholder | Role in the story | What they need from FundTrack |
| --- | --- | --- |
| **ObraTech (business owner / admin)** | Originates projects, invites financiers, confirms amounts, posts releases, manages accounts | A reliable operational tool that replaces manual tracking and reduces time spent reconciling numbers and answering status questions |
| **Financiers** | Individuals or entities who commit capital to one or more ObraTech projects | Trustworthy, self-service visibility into their own commitment, confirmed amount, release history, and profit share — without needing to ask ObraTech directly |
| **ObraTech leadership / decision-makers** | Approve go-live and rely on aggregate figures for business decisions | Confidence that reported totals (funding raised, amounts released, profit distributed) are accurate and defensible |
| **Future auditor / viewer (deferred)** | Not present in the MVP, but anticipated for a later phase | Read-only access to historical records without the ability to alter data — see [docs/04-user-roles-and-permissions.md](04-user-roles-and-permissions.md) |

## 4. Scenarios

The following scenarios are drawn from real patterns ObraTech encounters when financing projects. Each one exposes a specific requirement that the spreadsheet cannot reliably satisfy, and each is a first-class concept FundTrack must model rather than treat as an exception.

### 4.1 Unequal Contributions

**Situation.** A project needs ₱2,000,000 in financing. Three financiers join: Financier A commits ₱1,000,000, Financier B commits ₱600,000, and Financier C commits ₱400,000. Their shares of the total (50%, 30%, 20%) must drive their respective shares of any future profit distribution — but only once each financier's contribution is *confirmed*, not merely *willing*.

**Why it matters.** Willingness and confirmation are different states with different implications: a financier might say they intend to contribute ₱1,000,000 but only actually transfer ₱800,000. Profit-sharing and release allocations must be computed from confirmed amounts, and any recalculation triggered by a change in confirmed amount must be transparent to all affected financiers on that project — each seeing only their own figures, per [docs/04-user-roles-and-permissions.md](04-user-roles-and-permissions.md).

**System requirement.** Track willing amount and confirmed amount as distinct fields per financier per project; compute each financier's contribution ratio from confirmed amounts; recompute and log profit-share allocations whenever confirmed totals change.

### 4.2 Underfunded Project

**Situation.** The same ₱2,000,000 project only attracts ₱1,450,000 in confirmed commitments by the time ObraTech needs to proceed. There is a **funding gap** of ₱550,000.

**Why it matters.** ObraTech needs a clear, at-a-glance signal — not a manually maintained "TODO: still need money" note — showing which projects are fully funded, which are underfunded and by how much, and needs this number to be trustworthy enough to decide whether to proceed, seek additional financiers, or scale back project scope.

**System requirement.** The system computes and surfaces the funding gap (target minus total confirmed) per project at all times, server-side, so it is never stale or manually recalculated. Underfunded status must be visible to admins across all projects and to each financier for the projects they participate in.

### 4.3 TBA (To Be Advised) Release

**Situation.** A project is confirmed and funded, but the exact date of the next capital release to financiers (e.g., a partial profit distribution or a return of principal) is not yet fixed — it depends on external factors (a buyer's payment schedule, a permit approval, etc.). ObraTech wants to communicate "a release is planned" without committing to a false date.

**Why it matters.** In the spreadsheet world, this is usually represented by leaving a date cell blank or writing "TBA" as text, which cannot be filtered, sorted, or alerted on, and is often mistaken for a data-entry omission.

**System requirement.** A release event must support an explicit **TBA state** distinct from "scheduled" (has a date) and "released" (has actually occurred), so financiers see accurate expectations rather than an empty or ambiguous field, and so overdue detection (4.4) does not misfire on releases that were never dated in the first place.

### 4.4 Overdue Release

**Situation.** A release was scheduled for a specific date. That date has passed and the release has not been recorded as completed.

**Why it matters.** In spreadsheets, an overdue release is invisible unless someone manually checks dates against today. ObraTech needs this surfaced proactively so it can follow up, and financiers reasonably expect visibility into whether they are waiting on a late payment.

**System requirement.** The system must distinguish a release's lifecycle (TBA → Scheduled → Released, with the possibility of Overdue as a computed status when a Scheduled release's date has passed without being marked Released) and reflect Overdue prominently for both admins and the affected financiers, without requiring a manual audit of dates.

### 4.5 Multi-Financier Project

**Situation.** A single project has several financiers simultaneously, each with independent willing/confirmed amounts, independent visibility needs, and a shared release schedule that affects all of them proportionally.

**Why it matters.** This is the normal case, not an edge case — most projects ObraTech runs involve more than one financier. The system must aggregate correctly at the project level (total funding, total released, total profit) while strictly partitioning at the financier level (each financier's own stake, confirmations, and payment history), so that:

- Admins get a consolidated view of the whole project across all financiers.
- Each financier sees only their own numbers, never another financier's commitment or payment amounts.
- When a release is posted, the system computes each financier's share of that specific release based on their confirmed contribution ratio at the time of the release, and records it per-financier for their individual history.

**System requirement.** Data model and access control must support many-to-many project↔financier relationships with per-pair state (willing/confirmed/status) and per-release, per-financier payment records, enforced via Row Level Security so financiers cannot see other financiers' rows even on shared projects — see [decisions/ADR-005-entity-consolidation.md](../decisions/ADR-005-entity-consolidation.md).

## 5. From Pain to System Goals

| Spreadsheet pain (Section 2) | Scenario that exposes it (Section 4) | System goal it drives (see [docs/01-project-brief.md](01-project-brief.md)) |
| --- | --- | --- |
| Version drift, no single source of truth | Unequal contributions, multi-financier | Single authoritative system of record for all financing data |
| Formula fragility, manual money math | Unequal contributions, underfunded project | Server-authoritative, auditable financial calculations |
| No history of changes | Unequal contributions | Audit logging of every amount and status change |
| No access boundaries between financiers | Multi-financier | Role-based access with per-financier data isolation |
| No structured handling of exceptional states | TBA release, overdue release, underfunded project | First-class status modeling instead of free-text notes |

## 6. Related Documents

- [docs/01-project-brief.md](01-project-brief.md) — Concise statement of identity, goals, and success metrics
- [docs/03-mvp-scope.md](03-mvp-scope.md) — What of this story is addressed now versus deferred
- [docs/04-user-roles-and-permissions.md](04-user-roles-and-permissions.md) — How admin/financier visibility boundaries from Section 4.5 are enforced
- [decisions/ADR-003-money-precision.md](../decisions/ADR-003-money-precision.md) — How confirmed-amount math (Section 4.1) is computed authoritatively
- [decisions/ADR-005-entity-consolidation.md](../decisions/ADR-005-entity-consolidation.md) — How willing/confirmed/status per financier (Section 4.1, 4.5) is modeled in the schema
