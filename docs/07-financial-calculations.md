# FundTrack — Financial Calculations

## Document Control

| Field | Value |
| --- | --- |
| Document | `docs/07-financial-calculations.md` |
| Owner | ObraTech |
| Product | FundTrack — Project Financing and Profit Monitoring System |
| Version | 0.1 |
| Last Updated | 2026-07-23 |
| Approval Status | **READY FOR REVIEW** |

## 1. Purpose

This document defines the authoritative formulas used throughout FundTrack to calculate each financier's share of a project, their expected profit, their total payout, and their return on capital. It also defines rounding rules, the one-centavo reconciliation adjustment, display conventions, and the division of responsibility between client-side previews and server-side calculation authority, per [ADR-003](../decisions/ADR-003-money-precision.md).

These formulas are referenced by [docs/05-user-stories.md](05-user-stories.md) (notably US-005, US-006, US-008, US-010) and by the business rules in [docs/06-business-rules.md](06-business-rules.md) (Sections 6, 8, and 11).

## 2. Definitions & Variables

| Symbol | Name | Description | Storage Type |
| ------ | ---- | ------------ | ------------- |
| `T` | Target Funding Amount | The project's funding goal, set by the admin. | `NUMERIC(18,2)` |
| `Cᵢ` | Confirmed Amount (financier *i*) | The amount an admin has confirmed for financier *i*. Only amounts with commitment status `Confirmed` are counted. | `NUMERIC(18,2)` |
| `C` | Total Confirmed Amount | The sum of `Cᵢ` across all financiers on the project (`C = ΣCᵢ`). | Derived |
| `P` | Total Expected Profit | The project's total expected profit figure, entered or derived by the admin. | `NUMERIC(18,2)` |
| `Sᵢ` | Investor % (financier *i*) | Financier *i*'s percentage share of the total confirmed capital. | `NUMERIC(8,6)` (derived) |
| `Eᵢ` | Expected Profit Share (financier *i*) | Financier *i*'s share of `P`, proportional to `Sᵢ`. | `NUMERIC(18,2)` |
| `Rᵢ` | Total to Receive (financier *i*) | The full amount financier *i* receives at release: capital plus profit. | `NUMERIC(18,2)` |
| `G` | Remaining Gap | The unfunded portion of the target. | Derived |
| `F` | Funding Progress | Percentage of the target that has been funded. | Derived |
| `ROCᵢ` | Return on Capital (financier *i*) | Financier *i*'s profit expressed as a percentage of their own confirmed capital. | Derived |

All money variables (`T`, `Cᵢ`, `C`, `P`, `Eᵢ`, `Rᵢ`) are Philippine Pesos (PHP), stored server-side as `NUMERIC(18,2)` (see [BR-051](06-business-rules.md)).

## 3. Formulas

### 3.1 Investor % (Share of Capital)

```
Sᵢ = (Cᵢ / C) × 100
```

Financier *i*'s Investor % is their Confirmed Amount as a percentage of the **actual total confirmed capital** (`C`), not the Target Funding Amount (`T`). When a project is `Fully Funded`, `C = T`, so the two are equivalent at that point. Using `C` rather than `T` keeps profit-sharing mathematically consistent even in an edge case where a distribution calculation is previewed before the project reaches 100% funding.

### 3.2 Funding Progress

```
F = (C / T) × 100        (displayed capped at 100%)
```

Funding Progress reflects only `Confirmed` amounts, per [BR-024, BR-025](06-business-rules.md). Submitted-but-not-yet-confirmed willing amounts never contribute to `F`.

### 3.3 Remaining Gap

```
G = MAX(T − C, 0)
```

`G` is floored at zero; it can never be negative, because confirmations cannot exceed `T` (see [BR-023, BR-037](06-business-rules.md)).

### 3.4 Expected Profit Share

```
Eᵢ = Sᵢ × P / 100
   = (Cᵢ / C) × P
```

Each financier's expected profit is proportional to their share of the total confirmed capital. This is the raw, unrounded figure before the rounding and one-centavo adjustment rules in Section 4 are applied.

### 3.5 Total to Receive

```
Rᵢ = Cᵢ + Eᵢ
```

`Rᵢ` represents the full amount returned to financier *i* at release: their original confirmed capital, plus their share of profit. This MVP model assumes full capital return alongside profit distribution at the recorded release event (see [BR-058](06-business-rules.md)). Any alternative structure (for example, partial/staged releases, capital rollover into a new project) is out of scope for this document and would require an explicit ADR amendment.

### 3.6 Return on Capital (ROC)

```
ROCᵢ = (Eᵢ / Cᵢ) × 100
```

ROC expresses the profit earned as a percentage of the financier's own deployed capital, independent of how large their share of the total project is. Two financiers with very different Confirmed Amounts but the same ROC earned the same percentage return, even though their peso profit differs.

## 4. Rounding, Precision & the One-Centavo Adjustment

### 4.1 Rounding rule

- Investor % (`Sᵢ`) is computed and stored at higher intermediate precision (`NUMERIC(8,6)`, i.e., six decimal places, e.g., `45.000000`) to minimize compounding error, but is displayed rounded to two decimal places as a percentage (e.g., `45.00%`).
- All monetary results (`Eᵢ`, `Rᵢ`) are rounded to two decimal places using **round-half-up** (the digit in the third decimal place, and beyond, determines whether the second decimal place rounds up or stays the same; a value of exactly `.005` at the rounding boundary rounds up).
- Rounding is applied once, at the point a value is persisted or finalized (e.g., at release recording), never repeatedly across intermediate steps, to avoid compounding rounding error.

### 4.2 Why a one-centavo adjustment is needed

Because `Eᵢ` for each financier is rounded independently, the sum of all rounded `Eᵢ` values can differ from `P` by a small residual — typically a single centavo, occasionally a few centavos when many financiers are involved. Since `Rᵢ = Cᵢ + Eᵢ` must reconcile exactly to `C + P` in total (every peso of capital and profit must be accounted for), this residual must be deterministically eliminated before a release is finalized.

### 4.3 One-centavo adjustment algorithm

1. Compute the raw, unrounded `Eᵢ` for every financier: `Eᵢ_raw = (Cᵢ / C) × P`.
2. Round each `Eᵢ_raw` independently to two decimals using round-half-up, producing `Eᵢ`.
3. Compute the residual: `Δ = P − Σ Eᵢ`.
4. If `Δ = 0`, no adjustment is needed.
5. If `Δ ≠ 0`, apply the adjustment in `±₱0.01` increments to the financier with the **largest Confirmed Amount** (`Cᵢ`) first. If `Δ` requires more than one centavo of total adjustment, continue applying to the next-largest confirmed share until `Σ Eᵢ = P` exactly.
6. **Tie-break rule:** if two or more financiers have an equal Confirmed Amount, the adjustment is assigned to the one with the earliest `confirmed_at` timestamp; if still tied, to the financier with the lowest financier identifier. This ensures the outcome is deterministic and reproducible.
7. The adjustment (amount, affected financier(s), and before/after values) is recorded in the audit log at the time the release is recorded (see [BR-046, BR-054](06-business-rules.md)).

### 4.4 Display rule

All monetary values shown to users are formatted with the ₱ symbol, thousands separators, and exactly two decimal places (for example, `₱4,500.01`), regardless of the underlying stored precision (see [BR-053](06-business-rules.md)).

## 5. Frontend Preview vs. Server Truth

- The frontend **may** compute a live preview of Investor %, Expected Profit Share, Total to Receive, Funding Progress, and Remaining Gap using the same formulas described in this document, purely for immediate user feedback (for example, while a financier is typing a willing amount, or while an admin is previewing a confirmation).
- Frontend previews are always visually marked as **estimates** and must never be persisted directly from client input.
- Any action that commits a financial outcome — confirming an allocation, recording a release — **must** revalidate and recompute the final figures server-side (via RPC or Edge Function) using the authoritative `Confirmed` amounts stored in the database at the moment of the transaction.
- If a frontend preview and the server-computed result ever differ (for example, due to a concurrent confirmation by another admin changing `C` in between), the **server-computed value is authoritative** and is what is displayed and stored after the action completes (see [ADR-003](../decisions/ADR-003-money-precision.md), [BR-039](06-business-rules.md)).
- Client-side calculations must never use binary floating-point arithmetic for money; any client preview logic should operate on integer centavos or a decimal-safe representation to avoid visible rounding artifacts, even though the client is never the source of truth.

## 6. Worked Example

This example uses a project with a Target Funding Amount of **₱100,000.00** and three financiers contributing **unequal shares**, to demonstrate every formula above, including the one-centavo adjustment.

### 6.1 Stage 1 — Partially Funded

Assume Financiers B and C have been confirmed, but Financier A has not yet been confirmed:

| Financier | Confirmed Amount (Cᵢ) |
| --------- | ---------------------: |
| B | ₱35,000.00 |
| C | ₱20,000.00 |
| **Total confirmed (C)** | **₱55,000.00** |

With `T = ₱100,000.00`:

- Funding Progress: `F = (55,000.00 / 100,000.00) × 100 = 55.00%`
- Remaining Gap: `G = MAX(100,000.00 − 55,000.00, 0) = ₱45,000.00`

The project displays status `Partially Funded` (see [docs/08-project-status-workflow.md](08-project-status-workflow.md)).

### 6.2 Stage 2 — Fully Funded

The admin now confirms Financier A's allocation of exactly the remaining gap, ₱45,000.00:

| Financier | Confirmed Amount (Cᵢ) | Investor % (Sᵢ) |
| --------- | ---------------------: | ---------------: |
| A | ₱45,000.00 | 45.000000% |
| B | ₱35,000.00 | 35.000000% |
| C | ₱20,000.00 | 20.000000% |
| **Total (C)** | **₱100,000.00** | **100.000000%** |

- Funding Progress: `F = (100,000.00 / 100,000.00) × 100 = 100.00%`
- Remaining Gap: `G = ₱0.00`

The project automatically transitions to status `Fully Funded` (per [BR-040](06-business-rules.md)) and becomes eligible for activation.

### 6.3 Profit distribution at release

Assume the admin has set the project's Total Expected Profit as **`P = ₱10,000.01`** (deliberately chosen to demonstrate the rounding residual).

**Raw profit shares** (`Eᵢ_raw = Sᵢ × P / 100`):

| Financier | Calculation | Raw Result |
| --------- | ----------- | ---------: |
| A | 45% × 10,000.01 | 4,500.0045 |
| B | 35% × 10,000.01 | 3,500.0035 |
| C | 20% × 10,000.01 | 2,000.0020 |

**Rounded to two decimals (round-half-up):**

| Financier | Rounded Eᵢ |
| --------- | ---------: |
| A | ₱4,500.00 |
| B | ₱3,500.00 |
| C | ₱2,000.00 |
| **Sum** | **₱10,000.00** |

**Residual check:** `Δ = P − Σ Eᵢ = 10,000.01 − 10,000.00 = ₱0.01`

The rounded shares fall one centavo short of the total expected profit. Per the one-centavo adjustment algorithm (Section 4.3), the missing ₱0.01 is assigned to the financier with the largest Confirmed Amount — **Financier A**.

**Final Expected Profit Share after adjustment:**

| Financier | Confirmed Amount (Cᵢ) | Expected Profit Share (Eᵢ) | Total to Receive (Rᵢ = Cᵢ + Eᵢ) | ROC (Eᵢ / Cᵢ × 100) |
| --------- | ---------------------: | ---------------------------: | --------------------------------: | -------------------: |
| A | ₱45,000.00 | ₱4,500.01 *(adjusted +₱0.01)* | ₱49,500.01 | 10.00% |
| B | ₱35,000.00 | ₱3,500.00 | ₱38,500.00 | 10.00% |
| C | ₱20,000.00 | ₱2,000.00 | ₱22,000.00 | 10.00% |
| **Total** | **₱100,000.00** | **₱10,000.01** | **₱110,000.01** | — |

**Reconciliation check:** `Σ Eᵢ = 4,500.01 + 3,500.00 + 2,000.00 = ₱10,000.01 = P` ✓
`Σ Rᵢ = 49,500.01 + 38,500.00 + 22,000.00 = ₱110,000.01 = C + P = 100,000.00 + 10,000.01` ✓

Both totals reconcile exactly, and no peso or centavo is lost or created by rounding. The one-centavo adjustment to Financier A does not materially change their displayed ROC (still `10.00%` to two decimals), even though their exact underlying return is marginally higher than Financiers B and C's.

This adjustment, including the affected financier and the before/after values, is written to the audit log at the moment the release is recorded (see [BR-046, BR-054](06-business-rules.md), [US-008](05-user-stories.md#us-008--admin-records-a-fund-release)).

## 7. Approval Status

**Status: READY FOR REVIEW**

These formulas should be approved (using [templates/approval-record-template.md](../templates/approval-record-template.md)) before the confirmation and release RPCs are implemented, since they define the exact arithmetic those functions must produce.

## 8. Related Documents

- [docs/05-user-stories.md](05-user-stories.md) — Stories that rely on these calculations
- [docs/06-business-rules.md](06-business-rules.md) — Business rules that define the inputs to these formulas
- [docs/08-project-status-workflow.md](08-project-status-workflow.md) — Status transitions triggered by Funding Progress and release recording
- [ADR-003](../decisions/ADR-003-money-precision.md) — Money precision and calculation authority decision
