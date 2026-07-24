# Future Backlog

Items deferred after MVP. Not authorized for Phase 3–8 implementation scope unless promoted via change request.

| ID | Item | Rationale for deferral |
| ---- | ---- | ---------------------- |
| F-001 | Viewer / Auditor read-only role | MVP has admin + financier only |
| F-002 | Random temporary passwords | Business requires `0000` for MVP; security hardening later |
| F-003 | Real email as Auth identity + self-serve forgot password | Username login is MVP requirement |
| F-004 | In-app notification center polish / email notifications | Basic notifications table reserved; delivery channels later |
| F-005 | File attachments (contracts, proofs) | No storage in MVP |
| F-006 | Multi-admin RBAC with fine-grained permissions | Single admin role sufficient for MVP |
| F-007 | Multi-currency and FX | PHP only |
| F-008 | Append-only commitment history tables | Audit logs cover MVP |
| F-009 | Native mobile applications | Responsive web only |
| F-010 | Automated payout integrations | Manual release recording in MVP |
| F-011 | Advanced BI export (Excel/PDF packs) | Dashboard metrics first |
| F-012 | Supabase Branching for every PR | Staging project separation first |

Promotion path: file change request using [templates/change-request-template.md](../templates/change-request-template.md).
