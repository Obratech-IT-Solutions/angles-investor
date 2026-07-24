# FundTrack — Backup and Recovery

## Document Control

| Field | Value |
| --- | --- |
| Document | `docs/18-backup-and-recovery.md` |
| Approval Status | **READY FOR REVIEW** |

## 1. Objectives

Protect financing, allocation, release, and audit data against accidental deletion, bad migrations, and platform outages.

## 2. Backup Strategy

| Layer | Approach |
| --- | --- |
| Database | Supabase managed automatic backups; enable PITR on paid plans for production |
| Logical export | Periodic `pg_dump` / Supabase export before major migrations |
| Edge Functions | Source in git; redeploy from repo |
| Frontend | Vercel immutable deployments; git is source of truth |
| Secrets | Stored in Vercel/Supabase dashboards; not in git; document rotation owners |

## 3. Retention (proposed)

- Daily backups retained per Supabase plan defaults; confirm production retention ≥ 7 days
- Pre-migration manual snapshot labeled with version

## 4. Recovery Procedures

### 4.1 Application-only defect

- Rollback Vercel deployment; no DB restore

### 4.2 Bad migration / data corruption

1. Pause writes (maintenance message)
2. Restore DB to point-in-time or snapshot
3. Redeploy matching app version
4. Verify row counts, latest projects, audit continuity
5. Post-incident review

### 4.3 Accidental project cancel / mis-confirm

- Prefer compensating business action + audit over silent row delete
- If restore needed, restore to staging first and extract rows

## 5. Disaster Recovery

| Item | Target (proposed) |
| --- | --- |
| RPO | ≤ 24h (improve with PITR) |
| RTO | ≤ 8h business hours for MVP scale |

## 6. Testing

- Quarterly restore drill to a throwaway project
- Record results in ops log before Gate 5

## 7. Related

- [docs/17-deployment-plan.md](17-deployment-plan.md)
- [docs/20-production-readiness.md](20-production-readiness.md)
