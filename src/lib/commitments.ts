import { moneyInputFromValue, toNumber } from '@/lib/money'
import type { ProjectFinancier } from '@/types'

/** Admin allocation input: only show saved confirmed amount; pending rows start at 0. */
export function adminConfirmedAmountDraft(row: ProjectFinancier): string {
  if (row.commitment_status === 'confirmed' && toNumber(row.confirmed_amount) > 0) {
    return moneyInputFromValue(row.confirmed_amount)
  }
  return '0'
}
