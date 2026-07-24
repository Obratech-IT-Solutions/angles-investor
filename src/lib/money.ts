const phpFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const numberFormatter = new Intl.NumberFormat('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatPhp(value: number | string | null | undefined): string {
  const n = toNumber(value)
  return phpFormatter.format(n)
}

export function formatNumber(value: number | string | null | undefined): string {
  return numberFormatter.format(toNumber(value))
}

export function formatPercent(value: number | string | null | undefined, digits = 2): string {
  const n = toNumber(value)
  return `${n.toFixed(digits)}%`
}

/** Parse money strings that may include commas (e.g. "20,000.50"). */
export function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const cleaned = value.replace(/,/g, '').trim()
  if (cleaned === '' || cleaned === '.') return 0
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : 0
}

/**
 * Format a money draft while typing: 20000 → 20,000 ; 1500000 → 1,500,000
 * Keeps at most one decimal point and up to 2 decimal digits.
 */
export function formatMoneyInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, '')
  if (cleaned === '') return ''

  const firstDot = cleaned.indexOf('.')
  const intRaw = firstDot === -1 ? cleaned : cleaned.slice(0, firstDot)
  const decRaw = firstDot === -1 ? null : cleaned.slice(firstDot + 1).replace(/\./g, '').slice(0, 2)

  const intDigits = intRaw.replace(/^0+(?=\d)/, '') || (decRaw !== null ? '0' : intRaw)
  const withCommas = intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')

  if (decRaw !== null) return `${withCommas}.${decRaw}`
  // Preserve a trailing dot while the user is typing decimals.
  if (firstDot !== -1) return `${withCommas}.`
  return withCommas
}

/** Count digits + decimal point (ignores commas) — used to restore caret after reformat. */
export function countMoneySignificantChars(value: string): number {
  let n = 0
  for (let i = 0; i < value.length; i++) {
    const c = value[i]
    if ((c >= '0' && c <= '9') || c === '.') n++
  }
  return n
}

/** Map a significant-char count back to a caret index in a comma-formatted string. */
export function caretIndexForMoneySignificantCount(formatted: string, significantCount: number): number {
  if (significantCount <= 0) return 0
  let seen = 0
  for (let i = 0; i < formatted.length; i++) {
    const c = formatted[i]
    if ((c >= '0' && c <= '9') || c === '.') {
      seen++
      if (seen >= significantCount) return i + 1
    }
  }
  return formatted.length
}

/**
 * Format while typing and return where the caret should land so editing
 * in the middle/start does not jump to the end.
 */
export function formatMoneyInputWithCaret(
  raw: string,
  selectionStart: number | null | undefined,
): { formatted: string; caret: number } {
  const cursor = Math.max(0, Math.min(selectionStart ?? raw.length, raw.length))
  const significantBefore = countMoneySignificantChars(raw.slice(0, cursor))
  const formatted = formatMoneyInput(raw)
  return {
    formatted,
    caret: caretIndexForMoneySignificantCount(formatted, significantBefore),
  }
}

/** Convert a stored number into a comma-formatted input string (empty when 0). */
export function moneyInputFromValue(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return ''
  const n = toNumber(value)
  if (n === 0) return ''
  return formatMoneyInput(String(n))
}

export function fundingProgress(confirmed: number, capitalRequired: number): number {
  if (capitalRequired <= 0) return 0
  return Math.min(100, (confirmed / capitalRequired) * 100)
}

export function remainingGap(confirmed: number, capitalRequired: number): number {
  return Math.max(0, capitalRequired - confirmed)
}

export function expectedProfitShare(confirmedAmount: number, totalConfirmed: number, expectedProfit: number): number {
  if (totalConfirmed <= 0) return 0
  return (confirmedAmount / totalConfirmed) * expectedProfit
}

/** Profit share from how much of the finance capital you put in (budget ÷ total needed × finance profit). */
export function budgetBasedProfitShare(
  budgetAmount: number,
  capitalRequired: number,
  financeProfit: number,
): number {
  if (capitalRequired <= 0) return 0
  return (budgetAmount / capitalRequired) * financeProfit
}

export function totalReceivable(confirmedAmount: number, profitShare: number): number {
  return confirmedAmount + profitShare
}

export function returnOnCapital(profitShare: number, confirmedAmount: number): number {
  if (confirmedAmount <= 0) return 0
  return (profitShare / confirmedAmount) * 100
}

export type FinancingTimeProgress = {
  percent: number
  elapsedDays: number
  totalDays: number
  remainingDays: number
}

/** Elapsed financing time from start date through duration or release date. */
export function financingTimeProgress(
  financingDate: string,
  durationDays: number,
  releaseDate?: string | null,
  calculatedRelease?: string | null,
): FinancingTimeProgress {
  const start = new Date(`${financingDate}T00:00:00`)
  let end: Date
  const rawEnd = releaseDate || calculatedRelease
  if (rawEnd) {
    end = new Date(`${rawEnd}T00:00:00`)
  } else {
    end = new Date(start)
    end.setDate(end.getDate() + durationDays)
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000))
  const elapsedDays = Math.max(0, Math.ceil((today.getTime() - start.getTime()) / 86_400_000))
  const cappedElapsed = Math.min(elapsedDays, totalDays)
  const percent = Math.min(100, Math.max(0, (cappedElapsed / totalDays) * 100))

  return {
    percent,
    elapsedDays: cappedElapsed,
    totalDays,
    remainingDays: Math.max(0, totalDays - cappedElapsed),
  }
}
