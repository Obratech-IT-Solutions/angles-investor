/** Distinct financier colors — green, yellow/amber, then others. */
export const FINANCIER_COLORS = [
  '#1f7a4d',
  '#ca8a04',
  '#0b2a4a',
  '#1a4a73',
  '#c0392b',
  '#7c3aed',
  '#0d9488',
  '#db2777',
] as const

/** Soft background + text pairs for financing-date chips (same date → same color). */
const DATE_CHIP_PALETTE = [
  { bg: 'bg-sky-100', text: 'text-sky-900', border: 'border-sky-200' },
  { bg: 'bg-amber-100', text: 'text-amber-900', border: 'border-amber-200' },
  { bg: 'bg-emerald-100', text: 'text-emerald-900', border: 'border-emerald-200' },
  { bg: 'bg-violet-100', text: 'text-violet-900', border: 'border-violet-200' },
  { bg: 'bg-rose-100', text: 'text-rose-900', border: 'border-rose-200' },
  { bg: 'bg-teal-100', text: 'text-teal-900', border: 'border-teal-200' },
  { bg: 'bg-orange-100', text: 'text-orange-900', border: 'border-orange-200' },
  { bg: 'bg-indigo-100', text: 'text-indigo-900', border: 'border-indigo-200' },
  { bg: 'bg-lime-100', text: 'text-lime-900', border: 'border-lime-200' },
  { bg: 'bg-fuchsia-100', text: 'text-fuchsia-900', border: 'border-fuchsia-200' },
] as const

export type DateChipColors = (typeof DATE_CHIP_PALETTE)[number]

/** Stable hash so the same YYYY-MM-DD always maps to the same chip colors. */
export function financingDateChipColors(date: string | null | undefined): DateChipColors {
  if (!date) return DATE_CHIP_PALETTE[0]
  let hash = 0
  for (let i = 0; i < date.length; i++) {
    hash = (hash * 31 + date.charCodeAt(i)) >>> 0
  }
  return DATE_CHIP_PALETTE[hash % DATE_CHIP_PALETTE.length]
}

/** Format ISO date for compact chip display. */
export function formatFinancingDateChip(date: string | null | undefined): string {
  if (!date) return '—'
  // Prefer local parse of YYYY-MM-DD without timezone shift
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date)
  if (!m) return date
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const month = months[Number(m[2]) - 1] ?? m[2]
  return `${Number(m[3])} ${month}`
}

function financingDateSortKey(date: string | null | undefined): string {
  if (!date?.trim()) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date.trim())
  return m ? `${m[1]}-${m[2]}-${m[3]}` : date.trim()
}

/** Sort newest financing dates first; undated rows last. */
export function compareFinancingDatesDesc(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  const keyA = financingDateSortKey(a)
  const keyB = financingDateSortKey(b)
  if (!keyA && !keyB) return 0
  if (!keyA) return 1
  if (!keyB) return -1
  return keyB.localeCompare(keyA)
}

/** Known team financiers — stable brand colors. */
const FINANCIER_NAME_COLORS: Record<string, string> = {
  JERWIN: '#1f7a4d',
  MAN: '#ca8a04',
  NIKO: '#1a4a73',
  MACKY: '#0b2a4a',
}

/** Stable color per financier on a finance (sorted by id for consistency). */
export function buildFinancierColorMap(financierIds: string[]): Map<string, string> {
  const unique = [...new Set(financierIds)].sort()
  return new Map(unique.map((id, index) => [id, FINANCIER_COLORS[index % FINANCIER_COLORS.length]]))
}

export function financierColorFromMap(map: Map<string, string>, financierId: string, displayName?: string): string {
  if (displayName) {
    const key = displayName.trim().toUpperCase()
    if (FINANCIER_NAME_COLORS[key]) return FINANCIER_NAME_COLORS[key]
  }
  return map.get(financierId) ?? FINANCIER_COLORS[0]
}

/** Border-only colors for multi-finance budget pools (same pool → same border). */
const BUDGET_POOL_BORDER_PALETTE = [
  'border-violet-500',
  'border-sky-500',
  'border-emerald-500',
  'border-amber-500',
  'border-rose-500',
  'border-teal-500',
  'border-indigo-500',
  'border-orange-500',
] as const

const BUDGET_POOL_RING_PALETTE = [
  'ring-violet-400/70',
  'ring-sky-400/70',
  'ring-emerald-400/70',
  'ring-amber-400/70',
  'ring-rose-400/70',
  'ring-teal-400/70',
  'ring-indigo-400/70',
  'ring-orange-400/70',
] as const

export type BudgetPoolBorderClass = (typeof BUDGET_POOL_BORDER_PALETTE)[number]

function normalizePoolColorIndex(colorIndex: number): number {
  const n = BUDGET_POOL_BORDER_PALETTE.length
  return ((Math.trunc(colorIndex) % n) + n) % n
}

/** Stable fallback when pool color_index cannot be loaded from the join. */
export function budgetPoolColorIndexFromId(poolId: string): number {
  let h = 0
  for (let i = 0; i < poolId.length; i++) {
    h = (h * 31 + poolId.charCodeAt(i)) >>> 0
  }
  return h % BUDGET_POOL_BORDER_PALETTE.length
}

export function budgetPoolBorderColors(colorIndex: number | null | undefined): BudgetPoolBorderClass | null {
  if (colorIndex === null || colorIndex === undefined || !Number.isFinite(colorIndex)) return null
  return BUDGET_POOL_BORDER_PALETTE[normalizePoolColorIndex(colorIndex)]
}

export function budgetPoolRingColors(colorIndex: number | null | undefined): string | null {
  if (colorIndex === null || colorIndex === undefined || !Number.isFinite(colorIndex)) return null
  return BUDGET_POOL_RING_PALETTE[normalizePoolColorIndex(colorIndex)]
}

/** Left accent border for table rows (same palette as card borders). */
export function budgetPoolLeftBorderColors(colorIndex: number | null | undefined): string | null {
  const border = budgetPoolBorderColors(colorIndex)
  return border ? border.replace(/^border-/, 'border-l-') : null
}

export const BUDGET_POOL_COLOR_COUNT = BUDGET_POOL_BORDER_PALETTE.length
