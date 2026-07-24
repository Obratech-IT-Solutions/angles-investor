/**
 * Restore Angels Investor data from a JSON backup folder created by export-data-backup.mjs
 *
 * Requires:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   node scripts/restore-data-backup.mjs supabase/backups/20260724_production_snapshot
 */
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const backupDir = process.argv[2]
if (!backupDir) {
  console.error('Usage: node scripts/restore-data-backup.mjs <backup-folder>')
  process.exit(1)
}

const url = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running restore.')
  process.exit(1)
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const orderedTables = [
  'finance_groups',
  'projects',
  'profiles',
  'project_financiers',
  'project_releases',
  'financier_release_payments',
  'financier_budget_pools',
  'system_settings',
]

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

async function upsertTable(table, rows) {
  if (!rows.length) {
    console.log(`- ${table}: skipped (0 rows)`)
    return
  }
  const chunkSize = 100
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)
    const { error } = await supabase.from(table).upsert(chunk, { onConflict: 'id' })
    if (error) throw new Error(`${table}: ${error.message}`)
  }
  console.log(`- ${table}: restored ${rows.length} row(s)`)
}

async function main() {
  const manifestPath = path.join(backupDir, 'manifest.json')
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`manifest.json not found in ${backupDir}`)
  }
  const manifest = readJson(manifestPath)
  console.log(`Restoring backup "${manifest.label}" exported at ${manifest.exported_at}`)

  for (const table of orderedTables) {
    const filePath = path.join(backupDir, `${table}.json`)
    if (!fs.existsSync(filePath)) {
      console.log(`- ${table}: file missing, skipped`)
      continue
    }
    const rows = readJson(filePath)
    if (table === 'system_settings') {
      for (const row of rows) {
        const { error } = await supabase.from(table).upsert(row, { onConflict: 'key' })
        if (error) throw new Error(`${table}: ${error.message}`)
      }
      console.log(`- ${table}: restored ${rows.length} row(s)`)
      continue
    }
    await upsertTable(table, rows)
  }

  console.log('Restore complete.')
}

main().catch((err) => {
  console.error(err.message ?? err)
  process.exit(1)
})
