/**
 * Export Angels Investor business data to supabase/backups/<timestamp>/
 *
 * Requires:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   node scripts/export-data-backup.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running export.')
  process.exit(1)
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const tables = [
  'finance_groups',
  'projects',
  'profiles',
  'project_financiers',
  'project_releases',
  'financier_release_payments',
  'financier_budget_pools',
  'system_settings',
]

function stamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

async function fetchAll(table) {
  const { data, error } = await supabase.from(table).select('*')
  if (error) throw new Error(`${table}: ${error.message}`)
  return data ?? []
}

async function main() {
  const outDir = path.join('supabase', 'backups', `${stamp()}_production_snapshot`)
  fs.mkdirSync(outDir, { recursive: true })

  const backup = { exported_at: new Date().toISOString() }
  for (const table of tables) {
    backup[table] = await fetchAll(table)
    fs.writeFileSync(path.join(outDir, `${table}.json`), JSON.stringify(backup[table], null, 2))
    console.log(`- ${table}: ${backup[table].length}`)
  }

  const manifest = {
    label: path.basename(outDir),
    exported_at: backup.exported_at,
    description: 'Full Angels Investor finance data snapshot for migration/restore',
    counts: Object.fromEntries(tables.map((t) => [t, backup[t].length])),
    notes: [
      'Profiles include pin_hash for PIN login restore.',
      'Auth users (auth.users) must exist with matching UUIDs before restore.',
      'Apply all schema migrations first, then run scripts/restore-data-backup.mjs.',
    ],
  }
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log(`\nBackup saved to ${outDir}`)
}

main().catch((err) => {
  console.error(err.message ?? err)
  process.exit(1)
})
