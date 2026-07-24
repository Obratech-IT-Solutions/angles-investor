# FundTrack — Assumptions and Constraints

## Document Control

| Field | Value |
| --- | --- |
| Document | `docs/24-assumptions-and-constraints.md` |
| Approval Status | **READY FOR REVIEW** |

## Assumptions

1. ObraTech operates a small-to-medium private financier base (not public marketplace).
2. Currency is Philippine Peso for all MVP amounts.
3. Business day logic uses Asia/Manila calendar dates.
4. One logical organization; multi-tenant SaaS is out of scope.
5. Administrators are trusted operators; still constrained by audit.
6. Financiers are provisioned by admin only (no self-registration).
7. MVP notifications are in-app only (no SMS/email blast required).
8. Spreadsheet historical import is out of scope unless later approved.
9. Vercel + Supabase remain the hosting pair through production v1.
10. shadcn/ui + Tailwind form the component basis ([docs/28-ui-design-system.md](28-ui-design-system.md)).

## Constraints

1. No application coding until Gates 1–3 approved (Gate 4 authorization).
2. Service-role key must never appear in frontend bundles.
3. Temporary password remains `0000` for MVP despite known risk.
4. No file/image storage in MVP.
5. Viewer/Auditor role deferred.
6. Synthetic Auth emails preclude standard email reset in MVP.
7. Exact legal disclaimer text pending owner (OQ-008).
8. Production domain TBD (OQ-007).

## Related

- [planning/open-questions.md](../planning/open-questions.md)
- [docs/03-mvp-scope.md](03-mvp-scope.md)
