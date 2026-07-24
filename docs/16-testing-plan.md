# FundTrack — Testing Plan

## Document Control

| Field | Value |
| --- | --- |
| Document | `docs/16-testing-plan.md` |
| Approval Status | **READY FOR REVIEW** |

## 1. Strategy

| Layer | Focus | Tools (planned) |
| --- | --- | --- |
| Unit | Formulas, rounding, countdowns, status transition helpers | Vitest |
| Integration | Auth flows, RPCs, Edge Functions, RLS | Vitest + Supabase test project |
| Security | IDOR, role bypass, overfunding, temp password | Manual + automated API tests |
| UAT | Business scenarios with admin/financier personas | Checklist scripts |
| Regression | Prior defects + critical path smoke | CI on PR |

Coding of tests is blocked until Gate 4. This document defines what must be tested.

## 2. Unit Testing

- Investor %, profit share, total receivable, funding progress, remaining gap, ROC
- Flexible reallocation suggested amounts
- One-centavo reconciliation
- Release countdown strings (TBA, N days, today, overdue) in Asia/Manila
- Status transition guards
- Analytics aggregations (pure functions)

## 3. Integration Testing

- Login success/failure; forced password change blocks dashboard
- Admin create financier (Edge)
- Project create/invite
- Willing amount submit/update/withdraw
- Confirm allocations within capital; reject overfunding
- Concurrent confirmation attempts (one wins, one errors)
- Record release + payment rows
- Audit log rows created
- Deactivate blocks login

## 4. Security Testing

- Financier cannot read other financier rows/amounts
- Financier cannot access `/admin/*`
- Unauthenticated access denied
- Manipulated UUIDs rejected by RLS
- Client-side amount tampering ignored on confirm
- Overfunding attempt fails
- Direct PostgREST with financier JWT cannot confirm
- Service role absent from bundle/env of frontend
- Reuse of `0000` after change rejected for business access without reset
- Locked account cannot login
- Session invalid after admin reset

## 5. UAT Scenarios

| ID | Persona | Scenario |
| --- | --- | --- |
| UAT-01 | Admin | Create project, invite 5, confirm unequal amounts to full capital |
| UAT-02 | Financier | First login 0000 → forced change → submit willing |
| UAT-03 | Admin | Underfunded project shows gap; confirm partial → Partially Funded |
| UAT-04 | Admin | Set release date; financier sees countdown |
| UAT-05 | Admin | Past release date → Overdue messaging |
| UAT-06 | Admin | Record release; financier sees history |
| UAT-07 | Admin | Reset password; old session dies |
| UAT-08 | Financier | Attempt peer data access fails |

## 6. Quality Gates

- Phase 7: unit + integration + security suites green on staging
- Gate 5: UAT sign-off + production smoke

## 7. Related

- [templates/test-case-template.md](../templates/test-case-template.md)
- [docs/07-financial-calculations.md](07-financial-calculations.md)
