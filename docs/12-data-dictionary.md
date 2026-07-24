# FundTrack — Data Dictionary

## Document Control

| Field | Value |
| --- | --- |
| Document | `docs/12-data-dictionary.md` |
| Owner | ObraTech |
| Version | 0.1 |
| Last Updated | 2026-07-23 |
| Approval Status | **READY FOR REVIEW** |

Logical column definitions for MVP entities. Types are PostgreSQL-oriented. Executable DDL is out of scope until Gate 4.

## profiles

| Column | Type | Null | Description |
| --- | --- | --- | --- |
| id | uuid | N | PK; equals `auth.users.id` |
| username | text | N | Unique login name (normalized) |
| full_name | text | N | Display name |
| email | text | Y | Optional contact email (not Auth identity in MVP) |
| contact_number | text | Y | Optional phone |
| role | text | N | `admin` \| `financier` |
| account_status | text | N | `active` \| `inactive` \| `locked` |
| must_change_password | boolean | N | Force change gate |
| failed_login_count | int | N | Failed attempt counter |
| locked_until | timestamptz | Y | Temporary lock expiry |
| created_at | timestamptz | N | Created |
| updated_at | timestamptz | N | Updated |
| deactivated_at | timestamptz | Y | Soft deactivate time |

## projects

| Column | Type | Null | Description |
| --- | --- | --- | --- |
| id | uuid | N | PK |
| name | text | N | Project name |
| financing_date | date | N | Date financed |
| duration_days | int | N | Financing duration |
| capital_required | numeric(18,2) | N | Required capital PHP |
| expected_profit | numeric(18,2) | N | Expected profit PHP |
| max_financiers | int | N | Cap on financiers |
| release_date | date | Y | Admin-provided or overridden release date |
| calculated_expected_release | date | Y | financing_date + duration_days |
| actual_release_date | date | Y | When capital/profit actually released |
| description | text | Y | Optional |
| notes | text | Y | Optional |
| status | text | N | Project status enum |
| created_by | uuid | N | FK profiles |
| created_at | timestamptz | N | Auto |
| updated_at | timestamptz | N | Auto |

## project_financiers

| Column | Type | Null | Description |
| --- | --- | --- | --- |
| id | uuid | N | PK |
| project_id | uuid | N | FK projects |
| financier_id | uuid | N | FK profiles |
| initial_suggested_amount | numeric(18,2) | N | Capital / max_financiers at invite |
| initial_suggested_percentage | numeric(8,6) | N | 1 / max_financiers |
| current_suggested_amount | numeric(18,2) | N | Dynamic remaining suggestion |
| willing_amount | numeric(18,2) | Y | Financier willingness |
| confirmed_amount | numeric(18,2) | Y | Admin-confirmed |
| confirmed_percentage | numeric(8,6) | Y | confirmed / capital |
| commitment_status | text | N | Commitment enum |
| submitted_at | timestamptz | Y | When willing submitted |
| confirmed_at | timestamptz | Y | When confirmed |
| confirmed_by | uuid | Y | Admin profile |
| reconciliation_adjustment | numeric(18,2) | Y | Centavo adjustment if any |

## project_releases

| Column | Type | Null | Description |
| --- | --- | --- | --- |
| id | uuid | N | PK |
| project_id | uuid | N | FK |
| scheduled_date | date | Y | Planned release |
| actual_date | date | Y | Actual release |
| release_status | text | N | tba/scheduled/released/overdue |
| capital_released | numeric(18,2) | Y | Capital portion |
| profit_released | numeric(18,2) | Y | Profit portion |
| recorded_by | uuid | N | Admin |
| created_at | timestamptz | N | Created |

## financier_release_payments

| Column | Type | Null | Description |
| --- | --- | --- | --- |
| id | uuid | N | PK |
| release_id | uuid | N | FK project_releases |
| project_financier_id | uuid | N | FK project_financiers |
| capital_amount | numeric(18,2) | N | Share of capital |
| profit_amount | numeric(18,2) | N | Share of profit |
| total_amount | numeric(18,2) | N | capital + profit |

## audit_logs / account_security_events / notifications / system_settings

See [docs/11-database-design.md](11-database-design.md) ERD for columns. Audit rows are immutable from clients. Security events track login failures, locks, resets. Notifications are in-app for MVP. System settings store key/value operational flags.

## Derived Metrics (not stored columns)

Financier and admin dashboard metrics are computed from confirmed amounts, release payments, and project statuses as defined in business analytics requirements — prefer views/RPCs over duplicated columns.
