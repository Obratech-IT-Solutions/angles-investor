# Angels Investor — Data Backups

This folder stores **JSON snapshots** of production finance data so you can migrate or restore later.

## Current snapshot

- **`20260724_production_snapshot/`** — exported 2026-07-24
  - 3 finance groups (CUDMC+1, CVMC+2, CHO Med Supplies+2)
  - 21 projects (solo + grouped batches)
  - 6 profiles (admin + financiers)
  - 43 project financier commitments
  - 6 releases + 8 release payments
  - 2 budget pools + 2 system settings
  - `auth_users_reference.json` — UUIDs to recreate in `auth.users` before restore

## Restore on a new Supabase project

1. **Apply schema migrations** on the target project (all migrations through `rename_first_finance_and_sort_last` or newer).

2. **Create auth users** with the same UUIDs as in `profiles.json` (Admin API / dashboard). Profiles reference `auth.users.id`.

3. Set environment variables:
   ```bash
   set SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

4. **Restore data:**
   ```bash
   node scripts/restore-data-backup.mjs supabase/backups/20260724_production_snapshot
   ```

5. Open the app — finances, groups, commitments, and releases should match this snapshot.

## Create a fresh backup

```bash
set SUPABASE_URL=...
set SUPABASE_SERVICE_ROLE_KEY=...
node scripts/export-data-backup.mjs
```

A new timestamped folder is created under `supabase/backups/`.

## Security

- Backup JSON may contain **`pin_hash`** values. Keep this repo/folder private.
- Never commit service role keys. Use env vars only.

## Related

- [docs/18-backup-and-recovery.md](../docs/18-backup-and-recovery.md)
