import fs from 'node:fs'
import path from 'node:path'

const exportFile = process.argv[2]
const outDir = process.argv[3] ?? path.join('supabase', 'backups', '20260724_production_snapshot')

if (!exportFile) {
  console.error('Usage: node scripts/extract-backup-from-export.mjs <export.txt> [outDir]')
  process.exit(1)
}

let raw = fs.readFileSync(exportFile, 'utf8').trim()
if (raw.startsWith('{')) {
  try {
    const outer = JSON.parse(raw)
    if (typeof outer.result === 'string') raw = outer.result
  } catch {
    // fall through — file may be plain text export
  }
}

const marker = '[{"backup":'
const start = raw.indexOf(marker)
if (start < 0) throw new Error('Could not find backup JSON in export file')

const endTag = '</untrusted-data'
const endBoundary = raw.indexOf(endTag, start)
const sliceEnd = endBoundary > start ? endBoundary : raw.length
const jsonText = raw.slice(start, sliceEnd).trim()

const parsed = JSON.parse(jsonText)
const backup = parsed[0]?.backup
if (!backup) throw new Error('Backup payload missing')

fs.mkdirSync(outDir, { recursive: true })

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

const manifest = {
  label: path.basename(outDir),
  exported_at: backup.exported_at,
  description: 'Full Angels Investor finance data snapshot for migration/restore',
  counts: Object.fromEntries(tables.map((t) => [t, (backup[t] ?? []).length])),
  notes: [
    'Profiles include pin_hash for PIN login restore.',
    'Auth users (auth.users) must exist with matching UUIDs before restore.',
    'Apply all schema migrations first, then run scripts/restore-data-backup.mjs.',
  ],
}

fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
for (const table of tables) {
  fs.writeFileSync(path.join(outDir, `${table}.json`), JSON.stringify(backup[table] ?? [], null, 2))
}

console.log(`Backup written to ${outDir}`)
