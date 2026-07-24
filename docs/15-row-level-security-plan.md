# FundTrack — Row Level Security Plan

## Document Control

| Field | Value |
| --- | --- |
| Document | `docs/15-row-level-security-plan.md` |
| Owner | ObraTech |
| Version | 0.1 |
| Last Updated | 2026-07-23 |
| Approval Status | **READY FOR REVIEW** |

## 1. Purpose

Define **policy intent** for every business table. **Do not generate executable SQL** until Gate 4 / implementation.

Helper concepts (to be implemented as SQL functions later):

- `auth.uid()` — current user
- `is_admin()` — profile role admin and active
- `is_active_user()` — account_status active and not locked

## 2. profiles

| Operation | Admin | Financier |
| --- | --- | --- |
| SELECT | All profiles | Own row only |
| INSERT | Via Edge Function (service role) only | Denied |
| UPDATE | All (except cannot read passwords — N/A) | Own contact fields only; cannot change role/status/must_change_password except via controlled RPC |
| DELETE | Denied (soft deactivate) | Denied |

`must_change_password` cleared only through approved password-change path.

## 3. projects

| Operation | Admin | Financier |
| --- | --- | --- |
| SELECT | All | Projects where user has `project_financiers` row and status not draft/cancelled (per product rules) |
| INSERT | Yes | No |
| UPDATE | Yes (status rules enforced in RPC/triggers) | No |
| DELETE | No (cancel status) | No |

## 4. project_financiers

| Operation | Admin | Financier |
| --- | --- | --- |
| SELECT | All columns all rows | Own rows only (hide peer amounts by not returning other rows) |
| INSERT | Yes (invite) | No |
| UPDATE | Yes (confirm, reject, adjust with audit) | Own row: willing_amount + status transitions Invited/Pending/Submitted/Withdrawn only when project allows |
| DELETE | Soft via status Rejected/Withdrawn preferred | Withdraw when allowed |

Financier **cannot** set `confirmed_amount`, `confirmed_percentage`, `confirmed_by`, or `commitment_status = confirmed`.

## 5. project_releases

| Operation | Admin | Financier |
| --- | --- | --- |
| SELECT | All | Releases for projects user participates in |
| INSERT/UPDATE | Yes via privileged RPC | No |
| DELETE | No | No |

## 6. financier_release_payments

| Operation | Admin | Financier |
| --- | --- | --- |
| SELECT | All | Own payments only (join to own project_financiers) |
| INSERT/UPDATE | Admin/RPC only | No |
| DELETE | No | No |

## 7. audit_logs

| Operation | Admin | Financier |
| --- | --- | --- |
| SELECT | All | Own actor rows optional (MVP: admin-only viewer) |
| INSERT | Via RPC/Edge/triggers | Via RPC for self-actions only |
| UPDATE/DELETE | Denied for authenticated roles | Denied |

## 8. account_security_events

| Operation | Admin | Financier |
| --- | --- | --- |
| SELECT | All | Own events |
| INSERT | Service/RPC | Service/RPC |
| UPDATE/DELETE | Denied | Denied |

## 9. notifications

| Operation | Admin | Financier |
| --- | --- | --- |
| SELECT/UPDATE | All / any | Own rows (mark read) |
| INSERT | System/admin | No |
| DELETE | Optional admin | Own optional |

## 10. system_settings

| Operation | Admin | Financier |
| --- | --- | --- |
| SELECT | Yes | Denied or public subset only |
| WRITE | Admin only | Denied |

## 11. Storage

MVP has no storage buckets. If added later, separate policies required.

## 12. Verification Plan

- Automated tests: financier cannot SELECT peer `project_financiers`.
- Direct PostgREST calls with financier JWT must fail admin operations.
- Service role never exposed to browser tests.

## 13. Related Documents

- [docs/11-database-design.md](11-database-design.md)
- [docs/14-security-plan.md](14-security-plan.md)
- [docs/16-testing-plan.md](16-testing-plan.md)
