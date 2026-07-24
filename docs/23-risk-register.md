# FundTrack — Risk Register

## Document Control

| Field | Value |
| --- | --- |
| Document | `docs/23-risk-register.md` |
| Approval Status | **READY FOR REVIEW** |

| ID | Title | Category | L | I | Mitigation | Status |
| --- | --- | --- | --- | --- | --- | --- |
| RISK-001 | Shared temp password `0000` guessed | Authentication | H | H | Forced change, lockout, audit; later random temps | Open |
| RISK-002 | Overfunding under concurrency | Financial | M | H | Transactional confirm + locks | Open |
| RISK-003 | Financier data leakage via RLS bug | Security | M | H | Policy tests; peer amount isolation | Open |
| RISK-004 | Service role leaked to Vercel | Security | L | H | Env reviews; no `VITE_` service key | Open |
| RISK-005 | Rounding drift vs spreadsheet expectations | Financial | M | M | NUMERIC + reconciliation ADR-003 | Open |
| RISK-006 | Preview deploy hits production DB | Operational | M | H | Separate staging project | Open |
| RISK-007 | Username enumeration | Security | M | L | Generic login errors; rate limit | Open |
| RISK-008 | Scope creep before Gate 4 | Business | H | M | MVP doc + approval gates | Open |
| RISK-009 | Synthetic email blocks self-serve reset | Authentication | H | M | Admin reset MVP; document UX | Open |
| RISK-010 | Audit gaps on manual admin edits | Financial | M | H | Mandatory audit on confirmed changes | Open |
| RISK-011 | Legal disclaimer incomplete at launch | Business | M | H | Gate 5 docs OQ-008 | Open |
| RISK-012 | Timezone bugs on overdue | Technical | M | M | Asia/Manila rule tests | Open |

Template: [templates/risk-template.md](../templates/risk-template.md)
