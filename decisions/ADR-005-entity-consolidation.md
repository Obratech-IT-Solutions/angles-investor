# ADR-005: Entity Consolidation for Commitments

## Status

`Proposed`

## Date

2026-07-23

## Context

Master prompt lists `project_financiers`, `financier_commitments`, and `financing_confirmations`. Overlapping fields risk inconsistency.

## Decision

**MVP schema consolidates invitation + willingness + confirmation into `project_financiers`**, with commitment status enum and nullable willing/confirmed amounts. Separate tables:

- `project_releases` — project-level release events
- `financier_release_payments` — per-financier release distribution
- `audit_logs`, `account_security_events`, `notifications`, `system_settings`

History of amount changes is captured via `audit_logs` (and optional JSON snapshots), not parallel commitment tables.

## Consequences

### Positive

- Simpler RLS and transactions
- Single source row per project–financier pair

### Negative

- Less normalized history unless audit is thorough

## Alternatives Considered

1. Separate commitments + confirmations tables — deferred unless audit requirements demand append-only amount history beyond audit_logs

## Related Documents

- [docs/11-database-design.md](../docs/11-database-design.md)
- [docs/12-data-dictionary.md](../docs/12-data-dictionary.md)
