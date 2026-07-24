# ADR-003: Money Precision and Calculation Authority

## Status

`Proposed`

## Date

2026-07-23

## Context

Financing amounts, percentages, and profit shares must reconcile exactly. Floating-point JS numbers are unsafe for money.

## Decision

- Store all money fields as PostgreSQL `NUMERIC(18,2)`.
- Store ratios used for display as `NUMERIC(8,6)` or compute from amounts.
- **Source of truth:** database functions / transactional RPCs for confirmation, profit share, funding gap, and release allocations.
- Frontend may show live previews; confirmation always revalidates server-side.
- Display two decimal places in PHP formatting.
- Apply a controlled one-centavo adjustment on the final confirmed allocation when needed; record adjustment in audit log.

## Consequences

### Positive

- Exact reconciliation; no binary float drift
- Tamper-resistant confirmations

### Negative

- More Edge Function / RPC surface to design and test

## Alternatives Considered

1. Client-only calculations — rejected (tampering / drift)
2. Integer centavos only — acceptable alternative; NUMERIC(18,2) chosen for readability

## Related Documents

- [docs/07-financial-calculations.md](../docs/07-financial-calculations.md)
- [docs/11-database-design.md](../docs/11-database-design.md)
