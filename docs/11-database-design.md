# FundTrack — Database Design

## Document Control

| Field | Value |
| --- | --- |
| Document | `docs/11-database-design.md` |
| Owner | ObraTech |
| Version | 0.1 |
| Last Updated | 2026-07-23 |
| Approval Status | **READY FOR REVIEW** |

## 1. Design Principles

- PostgreSQL via Supabase; money as `NUMERIC(18,2)`.
- Consolidate invitation/willingness/confirmation into `project_financiers` ([ADR-005](../decisions/ADR-005-entity-consolidation.md)).
- Soft deactivate profiles; retain historical financing rows.
- Authoritative math in RPC functions inside transactions.
- No executable SQL in this document — design only.

## 2. Entity Relationship Diagram

```mermaid
erDiagram
  profiles ||--o{ projects : creates
  profiles ||--o{ project_financiers : participates
  projects ||--o{ project_financiers : has
  projects ||--o{ project_releases : has
  project_releases ||--o{ financier_release_payments : distributes
  project_financiers ||--o{ financier_release_payments : receives
  profiles ||--o{ audit_logs : actor
  profiles ||--o{ account_security_events : subject
  profiles ||--o{ notifications : receives
  system_settings ||--|| system_settings : singleton

  profiles {
    uuid id PK
    text username UK
    text full_name
    text email_optional
    text contact_number
    text role
    text account_status
    boolean must_change_password
    timestamptz locked_until
    int failed_login_count
    timestamptz created_at
    timestamptz updated_at
    timestamptz deactivated_at
  }

  projects {
    uuid id PK
    text name
    date financing_date
    int duration_days
    numeric capital_required
    numeric expected_profit
    int max_financiers
    date release_date_nullable
    date calculated_expected_release
    date actual_release_date
    text description
    text notes
    text status
    uuid created_by FK
    timestamptz created_at
    timestamptz updated_at
  }

  project_financiers {
    uuid id PK
    uuid project_id FK
    uuid financier_id FK
    numeric initial_suggested_amount
    numeric initial_suggested_percentage
    numeric current_suggested_amount
    numeric willing_amount
    numeric confirmed_amount
    numeric confirmed_percentage
    text commitment_status
    timestamptz submitted_at
    timestamptz confirmed_at
    uuid confirmed_by FK
    numeric reconciliation_adjustment
  }

  project_releases {
    uuid id PK
    uuid project_id FK
    date scheduled_date
    date actual_date
    text release_status
    numeric capital_released
    numeric profit_released
    uuid recorded_by FK
    timestamptz created_at
  }

  financier_release_payments {
    uuid id PK
    uuid release_id FK
    uuid project_financier_id FK
    numeric capital_amount
    numeric profit_amount
    numeric total_amount
  }

  audit_logs {
    uuid id PK
    uuid actor_id FK
    text entity_type
    uuid entity_id
    text action
    jsonb before_data
    jsonb after_data
    timestamptz created_at
  }

  account_security_events {
    uuid id PK
    uuid profile_id FK
    text event_type
    text ip_optional
    jsonb metadata
    timestamptz created_at
  }

  notifications {
    uuid id PK
    uuid profile_id FK
    text title
    text body
    boolean is_read
    timestamptz created_at
  }

  system_settings {
    text key PK
    jsonb value
    timestamptz updated_at
  }
```

## 3. Enumerations (logical)

| Enum | Values |
| --- | --- |
| role | admin, financier |
| account_status | active, inactive, locked |
| project_status | draft, open_for_funding, partially_funded, fully_funded, active, released, completed, overdue, cancelled |
| commitment_status | invited, pending, submitted, confirmed, rejected, withdrawn |
| release_status | tba, scheduled, released, overdue |

## 4. Keys, Constraints, Indexes (intent)

- `profiles.username` unique, stored lowercased.
- Unique `(project_id, financier_id)` on `project_financiers`.
- Check: money ≥ 0; `confirmed_amount` null or ≥ 0; `max_financiers` ≥ 1; `duration_days` ≥ 1.
- Project-level check enforced in RPC: sum(confirmed_amount) ≤ capital_required.
- Indexes: `projects(status)`, `project_financiers(financier_id)`, `project_financiers(project_id, commitment_status)`, `project_releases(scheduled_date)`, `audit_logs(entity_type, entity_id)`, `account_security_events(profile_id, created_at)`.

## 5. Transaction Boundaries

1. **Confirm allocations:** lock project row → validate sums → update rows → set project status → write audit → commit.
2. **Submit willing amount:** validate status allows edit → update willing + status → audit.
3. **Record release:** insert release → compute payments by confirmed % → update project dates/status → audit.
4. **Create financier:** Edge Function Auth create + profile insert (compensate/rollback Auth user on profile failure).

## 6. Soft Delete

- Profiles: `account_status = inactive`, `deactivated_at` set; no hard delete in MVP.
- Projects: `cancelled` status; no hard delete.
- Financing history never purged by deactivation.

## 7. Related Documents

- [docs/12-data-dictionary.md](12-data-dictionary.md)
- [docs/15-row-level-security-plan.md](15-row-level-security-plan.md)
- [docs/07-financial-calculations.md](07-financial-calculations.md)
