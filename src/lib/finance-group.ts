import { distributeProportionalAmounts } from '@/lib/budget'
import { toNumber } from '@/lib/money'

export type FinanceGroupLineInput = {
  projectId: string
  projectName: string
  capitalRequired: number
  expectedProfit: number
  durationDays?: number
}

export type GroupCommitmentSplit = {
  projectId: string
  projectName: string
  weight: number
  weightRatio: number
  confirmedAmount: number
  expectedProfitShare: number
}

/** End date = financing_date + duration_days (date-only, local calendar). */
export function computeEndDate(financingDate: string, durationDays: number): string | null {
  if (!financingDate || !Number.isFinite(durationDays) || durationDays < 0) return null
  const [y, m, d] = financingDate.split('-').map(Number)
  if (!y || !m || !d) return null
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + Math.trunc(durationDays))
  const yy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/** Profit share from budget % of group total. */
export function groupProfitShare(
  totalConfirmed: number | string,
  groupBudget: number | string,
  groupProfit: number | string,
): number {
  const confirmed = toNumber(totalConfirmed)
  const budget = toNumber(groupBudget)
  const profit = toNumber(groupProfit)
  if (confirmed <= 0 || budget <= 0) return 0
  return Math.round(((confirmed / budget) * profit) * 100) / 100
}

export function groupBudgetPct(totalConfirmed: number | string, groupBudget: number | string): number {
  const confirmed = toNumber(totalConfirmed)
  const budget = toNumber(groupBudget)
  if (confirmed <= 0 || budget <= 0) return 0
  return confirmed / budget
}

/**
 * Preview how one total commitment splits across group lines by budget weight.
 * Profit per line uses the same budget % of that line's expected profit.
 */
export function splitGroupCommitment(
  totalAmount: number | string,
  lines: FinanceGroupLineInput[],
): GroupCommitmentSplit[] {
  const amount = toNumber(totalAmount)
  if (lines.length === 0) return []

  const groupBudget = lines.reduce((s, l) => s + toNumber(l.capitalRequired), 0)
  const distributed = distributeProportionalAmounts({
    targets: lines.map((l) => ({
      projectId: l.projectId,
      projectName: l.projectName,
      weight: toNumber(l.capitalRequired),
    })),
    totalOwn: amount,
    totalBorrowed: 0,
    totalProfit: 0,
  })

  const pct = groupBudget > 0 && amount > 0 ? amount / groupBudget : 0

  return distributed.map((d, i) => {
    const line = lines[i]
    const lineProfit = toNumber(line?.expectedProfit)
    return {
      projectId: d.projectId,
      projectName: d.projectName,
      weight: d.weight,
      weightRatio: d.weightRatio,
      confirmedAmount: d.ownCapital,
      expectedProfitShare: Math.round(pct * lineProfit * 100) / 100,
    }
  })
}

export function sumGroupBudget(lines: Array<{ capitalRequired: number | string }>): number {
  return lines.reduce((s, l) => s + toNumber(l.capitalRequired), 0)
}

export function sumGroupProfit(lines: Array<{ expectedProfit: number | string }>): number {
  return lines.reduce((s, l) => s + toNumber(l.expectedProfit), 0)
}
