import type { CommitmentStatus, ProjectStatus, ReleaseStatus } from '@/types'

/** Financiers may change committed capital only while funding is still open. */
export function financeAllowsCapitalCommitment(status: ProjectStatus | string): boolean {
  return status === 'open_for_funding' || status === 'partially_funded'
}

/** True while today is still before the financing start date (confirm-by deadline). */
export function financeFundingDeadlineOpen(financingDate: string | null | undefined, now = new Date()): boolean {
  if (!financingDate?.trim()) return true
  const start = new Date(`${financingDate.trim()}T00:00:00`)
  if (Number.isNaN(start.getTime())) return true
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  return today < start
}

/** Financiers may confirm or change funding only before the financing date. */
export function financeAllowsFundingDecision(
  status: ProjectStatus | string,
  financingDate: string | null | undefined,
): boolean {
  return financeAllowsCapitalCommitment(status) && financeFundingDeadlineOpen(financingDate)
}

export function projectStatusVariant(
  status: ProjectStatus,
): 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'destructive' {
  switch (status) {
    case 'draft':
    case 'cancelled':
      return 'secondary'
    case 'open_for_funding':
      return 'destructive'
    case 'active':
      return 'success'
    case 'partially_funded':
      return 'warning'
    case 'overdue':
      return 'destructive'
    case 'fully_funded':
    case 'released':
    case 'completed':
      return 'success'
    default:
      return 'outline'
  }
}

/** Extra classes for finance status badges (colors + beating pulse). */
export function projectStatusClassName(status: ProjectStatus): string {
  if (status === 'active') {
    return 'animate-badge-beat border-transparent bg-emerald-600 text-white shadow-sm shadow-emerald-600/40'
  }
  if (status === 'open_for_funding') {
    return 'animate-badge-beat border-transparent bg-red-600 text-white shadow-sm shadow-red-600/40'
  }
  return ''
}

/** Compact badge styling for tables (avoids oversized pulse in tight cells). */
export function projectStatusTableClassName(status: ProjectStatus): string {
  const compact =
    'inline-flex max-w-full shrink-0 border-transparent text-[10px] sm:text-xs px-1.5 py-0.5 sm:px-2.5 whitespace-nowrap'
  if (status === 'active') {
    return `${compact} animate-badge-beat-table bg-emerald-600 text-white shadow-sm shadow-emerald-600/40`
  }
  if (status === 'open_for_funding') {
    return `${compact} animate-badge-beat-table bg-red-600 text-white shadow-sm shadow-red-600/40`
  }
  return compact
}

export function commitmentStatusVariant(
  status: CommitmentStatus,
): 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'destructive' {
  switch (status) {
    case 'invited':
    case 'pending':
      return 'warning'
    case 'submitted':
      return 'default'
    case 'confirmed':
      return 'success'
    case 'rejected':
      return 'destructive'
    case 'withdrawn':
      return 'secondary'
    default:
      return 'outline'
  }
}

export function releaseStatusVariant(
  status: ReleaseStatus,
): 'default' | 'secondary' | 'outline' | 'success' | 'warning' {
  switch (status) {
    case 'tba':
      return 'secondary'
    case 'scheduled':
      return 'warning'
    case 'released':
      return 'success'
    default:
      return 'outline'
  }
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}
