# FundTrack — Traceability Matrix

## Document Control

| Field | Value |
| --- | --- |
| Document | `docs/26-traceability-matrix.md` |
| Approval Status | **READY FOR REVIEW** |

Maps stories → rules → screens → entities → tests (IDs). Expand during implementation.

| Story | Business rules | Pages | Entities | Tests |
| --- | --- | --- | --- | --- |
| US-001 Create financier | BR account create, temp pw | CreateFinancier | profiles | TC auth create |
| US-002 Forced password change | BR must_change | ForcePasswordChange | profiles | TC force pw |
| US-003 Create project | BR project fields | CreateProject | projects | TC project create |
| US-004 Invite financiers | BR suggested share | FundingAllocation | project_financiers | TC invite |
| US-005 Submit willing | BR willing nullable | SubmitWillingAmount | project_financiers | TC willing |
| US-006 Confirm allocations | BR overfund, admin only | CommitmentConfirmation | project_financiers, projects | TC confirm, concurrency |
| US-007 Release date | BR countdown | ReleaseManagement | projects | TC countdown |
| US-008 Record release | BR release payments | ReleaseManagement | project_releases, financier_release_payments | TC release |
| US-009 Admin analytics | BR metrics defs | AdminDashboard | views/RPC | TC analytics admin |
| US-010 Financier analytics | BR metrics defs | PersonalAnalytics | views/RPC | TC analytics fin |
| US-011 Deactivate account | BR soft deactivate | AccountStatus | profiles | TC deactivate |
| US-012 Reset password | BR reset revoke | ResetFinancierPassword | profiles, Auth | TC reset session |
| US-013 Overdue display | BR overdue Manila | Dashboards | projects | TC overdue |

Sources: [docs/05-user-stories.md](05-user-stories.md), [docs/06-business-rules.md](06-business-rules.md), [docs/09-page-map-and-user-flows.md](09-page-map-and-user-flows.md), [docs/16-testing-plan.md](16-testing-plan.md)
