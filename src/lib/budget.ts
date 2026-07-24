import { toNumber } from '@/lib/money'
import type { LenderPromiseType } from '@/types'

export type BudgetLenderInput = {
  id?: string
  lender_name: string
  borrowed_amount: number | string
  promise_type: LenderPromiseType
  promise_value: number | string
  notes?: string | null
  sort_order?: number
}

export type BudgetWarning = {
  level: 'warning' | 'error'
  code: 'stake_mismatch' | 'profit_overrun' | 'capital_shortfall'
  message: string
}

export type LenderObligation = {
  lender_name: string
  borrowed_amount: number
  promise_type: LenderPromiseType
  promise_value: number
  profit_portion: number | null
  total_payback: number | null
  included_in_totals: boolean
}

export type BudgetSummary = {
  totalOwn: number
  totalBorrowed: number
  stakeTotal: number
  myConfirmed: number
  myProfitShare: number
  myCapitalReturn: number
  totalLenderProfit: number
  totalLenderPayback: number
  myNetProfit: number
  myNetAfterAll: number
  remainingProfitToAllocate: number
  lenders: LenderObligation[]
  warnings: BudgetWarning[]
}

const STAKE_TOLERANCE = 1

export function lenderProfitPortion(
  promiseType: LenderPromiseType,
  borrowedAmount: number,
  promiseValue: number,
  myProfitShare: number,
): number | null {
  switch (promiseType) {
    case 'pct_of_loan':
      return borrowedAmount * (promiseValue / 100)
    case 'pct_of_my_profit':
      return myProfitShare * (promiseValue / 100)
    case 'fixed_profit':
      return promiseValue
    case 'manual':
      return null
  }
}

export function calculateBudgetSummary(input: {
  ownCapital: number | string
  myConfirmed: number | string
  myProfitShare: number | string
  myCapitalReturn: number | string
  lenders: BudgetLenderInput[]
}): BudgetSummary {
  const totalOwn = toNumber(input.ownCapital)
  const myConfirmed = toNumber(input.myConfirmed)
  const myProfitShare = toNumber(input.myProfitShare)
  const myCapitalReturn = toNumber(input.myCapitalReturn)

  const lenders: LenderObligation[] = input.lenders.map((l) => {
    const borrowed = toNumber(l.borrowed_amount)
    const value = toNumber(l.promise_value)
    const profit = lenderProfitPortion(l.promise_type, borrowed, value, myProfitShare)
    const included = l.promise_type !== 'manual'
    return {
      lender_name: l.lender_name.trim() || 'Unnamed',
      borrowed_amount: borrowed,
      promise_type: l.promise_type,
      promise_value: value,
      profit_portion: profit,
      total_payback: profit === null ? null : borrowed + profit,
      included_in_totals: included,
    }
  })

  const totalBorrowed = lenders.reduce((s, l) => s + l.borrowed_amount, 0)
  const stakeTotal = totalOwn + totalBorrowed

  const autoLenders = lenders.filter((l) => l.included_in_totals)
  const totalLenderProfit = autoLenders.reduce((s, l) => s + (l.profit_portion ?? 0), 0)
  const totalLenderPayback = autoLenders.reduce((s, l) => s + (l.total_payback ?? 0), 0)

  const myNetProfit = myProfitShare - totalLenderProfit
  const myNetAfterAll = myCapitalReturn + myProfitShare - totalLenderPayback
  const remainingProfitToAllocate = Math.max(0, myProfitShare - totalLenderProfit)

  const warnings: BudgetWarning[] = []

  if (myConfirmed > 0 && Math.abs(stakeTotal - myConfirmed) > STAKE_TOLERANCE) {
    warnings.push({
      level: 'warning',
      code: 'stake_mismatch',
      message: `Own + chip-ins (${stakeTotal.toFixed(2)}) does not match your confirmed amount (${myConfirmed.toFixed(2)}).`,
    })
  }

  if (totalLenderProfit > myProfitShare + STAKE_TOLERANCE) {
    warnings.push({
      level: 'error',
      code: 'profit_overrun',
      message: 'Chip-in profit you assigned exceeds your project profit share.',
    })
  }

  if (totalBorrowed > myCapitalReturn + STAKE_TOLERANCE) {
    warnings.push({
      level: 'error',
      code: 'capital_shortfall',
      message: 'You may not receive enough capital back to return all chip-ins.',
    })
  }

  return {
    totalOwn,
    totalBorrowed,
    stakeTotal,
    myConfirmed,
    myProfitShare,
    myCapitalReturn,
    totalLenderProfit,
    totalLenderPayback,
    myNetProfit,
    myNetAfterAll,
    remainingProfitToAllocate,
    lenders,
    warnings,
  }
}

export type DistributeTarget = {
  projectId: string
  projectName: string
  weight: number
}

export type DistributedFinanceShare = {
  projectId: string
  projectName: string
  weight: number
  weightRatio: number
  ownCapital: number
  borrowed: number
  profit: number
}

/**
 * Split totals across finances by weight; last row absorbs rounding remainder so sums match.
 * Prefer weight = this financier's confirmed budget for multi-finance pools.
 * If all weights are 0, splits equally.
 */
export function distributeProportionalAmounts(input: {
  targets: DistributeTarget[]
  totalOwn: number
  totalBorrowed: number
  totalProfit: number
}): DistributedFinanceShare[] {
  const targets = input.targets.filter((t) => t.weight >= 0)
  if (targets.length === 0) return []

  const weightSum = targets.reduce((s, t) => s + t.weight, 0)
  const useEqual = weightSum <= 0
  const effectiveWeights = targets.map((t) => (useEqual ? 1 : t.weight))
  const denom = effectiveWeights.reduce((s, w) => s + w, 0)

  const shares: DistributedFinanceShare[] = []
  let ownLeft = roundMoney(input.totalOwn)
  let borrowedLeft = roundMoney(input.totalBorrowed)
  let profitLeft = roundMoney(input.totalProfit)

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i]
    const ratio = effectiveWeights[i] / denom
    const isLast = i === targets.length - 1

    const ownCapital = isLast ? roundMoney(ownLeft) : roundMoney(input.totalOwn * ratio)
    const borrowed = isLast ? roundMoney(borrowedLeft) : roundMoney(input.totalBorrowed * ratio)
    const profit = isLast ? roundMoney(profitLeft) : roundMoney(input.totalProfit * ratio)

    ownLeft = roundMoney(ownLeft - ownCapital)
    borrowedLeft = roundMoney(borrowedLeft - borrowed)
    profitLeft = roundMoney(profitLeft - profit)

    shares.push({
      projectId: t.projectId,
      projectName: t.projectName,
      weight: t.weight,
      weightRatio: ratio,
      ownCapital,
      borrowed,
      profit,
    })
  }

  return shares
}

function roundMoney(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100
}

export type ProfitSplitParty = {
  key: string
  capital: number
  profit?: number | string
  locked?: boolean
}

/**
 * Split profit among parties by capital share. Locked parties keep their profit;
 * unlocked parties share the remainder proportionally.
 */
export function computeProfitSplits(input: {
  totalProfitPool: number
  parties: ProfitSplitParty[]
  /** Total budget max to measure % against (gap stays unallocated). */
  capitalBase?: number
}): Map<string, number> {
  const pool = roundMoney(input.totalProfitPool)
  const result = new Map<string, number>()
  if (input.parties.length === 0) return result

  if (pool <= 0) {
    for (const p of input.parties) result.set(p.key, 0)
    return result
  }

  const locked = input.parties.filter((p) => p.locked)
  const lockedSum = roundMoney(locked.reduce((s, p) => s + roundMoney(toNumber(p.profit ?? 0)), 0))
  const remaining = roundMoney(pool - lockedSum)
  const unlocked = input.parties.filter((p) => !p.locked)

  for (const p of locked) {
    result.set(p.key, roundMoney(toNumber(p.profit ?? 0)))
  }

  if (unlocked.length === 0) {
    for (const p of input.parties) {
      if (!result.has(p.key)) result.set(p.key, 0)
    }
    return result
  }

  const unlockedParts = splitProfitByCapitalShares({
    totalProfitPool: Math.max(0, remaining),
    capitalBase: input.capitalBase,
    parties: unlocked.map((p) => ({ key: p.key, capital: p.capital })),
  })

  for (const p of unlocked) {
    result.set(p.key, unlockedParts.get(p.key) ?? 0)
  }

  return result
}

/** Lock one party's profit and redistribute the remainder among the others. */
export function redistributeProfitSplits(input: {
  totalProfitPool: number
  parties: ProfitSplitParty[]
  capitalBase?: number
  editedKey: string
  editedProfit: number
}): Map<string, number> {
  const parties = input.parties.map((p) =>
    p.key === input.editedKey
      ? { ...p, profit: roundMoney(input.editedProfit), locked: true }
      : p,
  )
  return computeProfitSplits({
    totalProfitPool: input.totalProfitPool,
    capitalBase: input.capitalBase,
    parties,
  })
}

/** Split one pool-level chip-in person's amount/profit across finance shares by weightRatio. */
export function splitAmountAcrossShares(
  total: number,
  shares: Array<{ projectId: string; weightRatio: number }>,
): Map<string, number> {
  const result = new Map<string, number>()
  if (shares.length === 0) return result
  let left = roundMoney(total)
  for (let i = 0; i < shares.length; i++) {
    const isLast = i === shares.length - 1
    const part = isLast ? roundMoney(left) : roundMoney(total * shares[i].weightRatio)
    left = roundMoney(left - part)
    result.set(shares[i].projectId, part)
  }
  return result
}

/**
 * Default profit shares from budget %.
 * - With capitalBase (e.g. pool budget max): each party gets capital/base × profit pool.
 *   Unfilled budget (gap) leaves that profit unallocated — not all dumped on you.
 * - Without capitalBase: split the full profit pool among parties who put capital in
 *   (last entry absorbs rounding remainder).
 */
export function splitProfitByCapitalShares(input: {
  totalProfitPool: number
  parties: Array<{ key: string; capital: number }>
  /** Total budget max to measure % against (pool confirmed). Gap stays unallocated. */
  capitalBase?: number
}): Map<string, number> {
  const result = new Map<string, number>()
  const parties = input.parties.filter((p) => p.capital > 0)
  if (parties.length === 0) return result

  const enteredCap = parties.reduce((s, p) => s + p.capital, 0)
  const pool = roundMoney(input.totalProfitPool)
  const base =
    input.capitalBase != null && input.capitalBase > 0 ? input.capitalBase : enteredCap

  if (base <= 0 || pool <= 0) {
    for (const p of parties) result.set(p.key, 0)
    return result
  }

  // % of pool budget max → same % of profit (do not force leftover onto last person).
  if (input.capitalBase != null && input.capitalBase > 0) {
    for (const p of parties) {
      result.set(p.key, roundMoney(pool * (p.capital / base)))
    }
    return result
  }

  let left = pool
  for (let i = 0; i < parties.length; i++) {
    const isLast = i === parties.length - 1
    const part = isLast ? roundMoney(left) : roundMoney(pool * (parties[i].capital / enteredCap))
    left = roundMoney(left - part)
    result.set(parties[i].key, part)
  }
  return result
}
