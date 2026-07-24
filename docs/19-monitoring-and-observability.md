# FundTrack — Monitoring and Observability

## Document Control

| Field | Value |
| --- | --- |
| Document | `docs/19-monitoring-and-observability.md` |
| Approval Status | **READY FOR REVIEW** |

## 1. Goals

Detect auth failures, Edge Function errors, slow queries, and client crashes without logging secrets or personal financial payloads unnecessarily.

## 2. Telemetry Sources

| Source | What to watch |
| --- | --- |
| Vercel | Build failures, edge/network errors, deployment status |
| Supabase | API errors, Auth errors, DB CPU/connections, Edge Function logs |
| Frontend | Error boundary reports (Sentry or similar — choose at Phase 7) |
| App audit | Business anomalies (repeated confirm failures) |

## 3. Key Alerts (proposed)

- Spike in Auth failed logins
- Edge Function error rate > threshold
- Database connection saturation
- Vercel production deploy failed
- RLS/policy errors surge (may indicate attack or bug)

## 4. Dashboards

- Ops: uptime, error rate, latency
- Product (admin app): overdue projects, awaiting confirmation — in-app analytics, not ops tools

## 5. Log Hygiene

- Never log passwords, JWTs, service role keys, or full card-like secrets (N/A)
- Prefer event type + entity id over full financial snapshots in external APM; full snapshots stay in `audit_logs`

## 6. On-Call / Ownership

- ObraTech designates primary responder before production
- Runbook links to rollback and backup docs

## 7. Related

- [docs/14-security-plan.md](14-security-plan.md)
- [docs/17-deployment-plan.md](17-deployment-plan.md)
