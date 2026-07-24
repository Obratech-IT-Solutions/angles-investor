import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { FinancierColorDot, FundingProgressBar, FundingProgressLegend } from '@/components/finance/FundingProgressBar'
import { CommitmentConfirmDialog } from '@/components/finance/CommitmentConfirmDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { MoneyInput } from '@/components/ui/money-input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { buildFinancierColorMap, financierColorFromMap } from '@/lib/financierColors'
import { adminConfirmedAmountDraft } from '@/lib/commitments'
import {
  budgetBasedProfitShare,
  financingTimeProgress,
  formatPercent,
  formatPhp,
  fundingProgress,
  moneyInputFromValue,
  remainingGap,
  toNumber,
  totalReceivable,
} from '@/lib/money'
import { commitmentStatusVariant, financeAllowsCapitalCommitment, projectStatusClassName, projectStatusVariant } from '@/lib/status'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import {
  COMMITMENT_STATUS_LABELS,
  PROJECT_STATUS_LABELS,
  type Profile,
  type Project,
  type FinancierReleasePayment,
  type ProjectFinancier,
} from '@/types'

export type FinanceDetailDialogMode = 'admin' | 'financier'

function releaseEndDate(project: Project): Date {
  const raw = project.release_date || project.calculated_expected_release
  if (raw) return new Date(`${raw}T00:00:00`)
  const start = new Date(`${project.financing_date}T00:00:00`)
  start.setDate(start.getDate() + project.duration_days)
  return start
}

function formatTimeRemaining(project: Project): string {
  const end = releaseEndDate(project)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = Math.ceil((end.getTime() - today.getTime()) / 86_400_000)
  if (days > 1) return `${days} days remaining`
  if (days === 1) return '1 day remaining'
  if (days === 0) return 'Due today'
  return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`
}

function financierName(row: ProjectFinancier): string {
  const profile = row.profiles as { full_name?: string; display_name?: string } | null | undefined
  return profile?.display_name || profile?.full_name || '—'
}

function commitmentAmount(row: ProjectFinancier): string {
  return formatPhp(commitmentAmountValue(row))
}

function commitmentAmountValue(row: ProjectFinancier): number {
  if (row.commitment_status === 'confirmed' && toNumber(row.confirmed_amount) > 0) {
    return toNumber(row.confirmed_amount)
  }
  if (row.commitment_status === 'submitted' && toNumber(row.willing_amount) > 0) {
    return toNumber(row.willing_amount)
  }
  return toNumber(row.current_suggested_amount)
}

function rowProfitShare(row: ProjectFinancier, capitalRequired: number, expectedProfit: number): number {
  const amount = commitmentAmountValue(row)
  return Math.round(budgetBasedProfitShare(amount, capitalRequired, expectedProfit) * 100) / 100
}

function AdminAllocationMobileList({
  rows,
  financierColorMap,
  adminAmounts,
  canEdit,
  onAmountChange,
}: {
  rows: ProjectFinancier[]
  financierColorMap: Map<string, string>
  adminAmounts: Record<string, string>
  canEdit: boolean
  onAmountChange: (id: string, value: string) => void
}) {
  return (
    <ul className="space-y-3 md:hidden">
      {rows.map((r) => {
        const color = financierColorFromMap(financierColorMap, r.financier_id, financierName(r))
        return (
          <li key={r.id} className="rounded-xl border border-border/40 bg-muted/15 p-3">
            <div className="flex items-start justify-between gap-2">
              <span className="inline-flex min-w-0 items-center gap-2 font-medium">
                <FinancierColorDot color={color} />
                <span className="truncate">{financierName(r)}</span>
              </span>
              <Badge variant={commitmentStatusVariant(r.commitment_status)} className="shrink-0 text-[10px]">
                {COMMITMENT_STATUS_LABELS[r.commitment_status]}
              </Badge>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-background/60 px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Suggested</p>
                <p className="mt-0.5 text-sm font-medium tabular-nums">{formatPhp(r.current_suggested_amount)}</p>
              </div>
              <div className="rounded-lg bg-background/60 px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Confirmed</p>
                {canEdit ? (
                  <MoneyInput
                    className="mt-1 h-9 w-full min-w-0 text-right"
                    value={adminAmounts[r.id] ?? ''}
                    onValueChange={(v) => onAmountChange(r.id, v)}
                  />
                ) : (
                  <p className="mt-0.5 text-sm font-medium tabular-nums">{commitmentAmount(r)}</p>
                )}
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function FinancierContributionsMobileList({
  rows,
  financierColorMap,
  financierId,
  capitalRequired,
  expectedProfit,
}: {
  rows: ProjectFinancier[]
  financierColorMap: Map<string, string>
  financierId?: string
  capitalRequired: number
  expectedProfit: number
}) {
  return (
    <ul className="space-y-2 md:hidden">
      {rows.map((r) => {
        const isMe = Boolean(financierId && r.financier_id === financierId)
        const color = financierColorFromMap(financierColorMap, r.financier_id, financierName(r))
        const amount = commitmentAmountValue(r)
        const profit = rowProfitShare(r, capitalRequired, expectedProfit)
        const total = totalReceivable(amount, profit)
        return (
          <li
            key={r.id}
            className={cn('rounded-xl border border-border/40 px-3 py-2.5', isMe && 'bg-muted/30')}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex min-w-0 items-center gap-2 text-sm font-medium">
                <FinancierColorDot color={color} />
                <span className="truncate">
                  {financierName(r)}
                  {isMe ? <span className="ml-1 text-xs font-normal text-muted-foreground">(You)</span> : null}
                </span>
              </span>
              <Badge variant={commitmentStatusVariant(r.commitment_status)} className="shrink-0 text-[10px]">
                {COMMITMENT_STATUS_LABELS[r.commitment_status]}
              </Badge>
            </div>
            <div className="mt-1.5 space-y-0.5 text-right text-[10px] tabular-nums sm:text-xs">
              <p className="text-sm font-semibold">{formatPhp(amount)}</p>
              <p className="text-muted-foreground">
                Profit {formatPhp(profit)} · Total {formatPhp(total)}
              </p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export function FinanceDetailDialog({
  project,
  open,
  onOpenChange,
  mode = 'admin',
  financierId,
  onDecisionResolved,
}: {
  project: Project | null
  open: boolean
  onOpenChange: (open: boolean) => void
  mode?: FinanceDetailDialogMode
  financierId?: string
  onDecisionResolved?: () => void
}) {
  const [rows, setRows] = useState<ProjectFinancier[]>([])
  const [myRow, setMyRow] = useState<ProjectFinancier | null>(null)
  const [availableFinanciers, setAvailableFinanciers] = useState<Profile[]>([])
  const [selectedInviteIds, setSelectedInviteIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [myReleasePayment, setMyReleasePayment] = useState<FinancierReleasePayment | null>(null)
  const [confirmingReceived, setConfirmingReceived] = useState(false)
  const [willing, setWilling] = useState('')
  const [decisionBusy, setDecisionBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [adminAmounts, setAdminAmounts] = useState<Record<string, string>>({})
  const [savingAllocations, setSavingAllocations] = useState(false)

  async function loadData() {
    if (!project) return
    setLoading(true)
    const queries = [
      supabase
        .from('project_financiers')
        .select('*, profiles:financier_id(id, full_name, username)')
        .eq('project_id', project.id)
        .order('confirmed_amount', { ascending: false, nullsFirst: false }),
    ] as const

    if (mode === 'admin') {
      const [rowsRes, allFinRes] = await Promise.all([
        queries[0],
        supabase.from('profiles').select('id, username, full_name').eq('role', 'financier').eq('account_status', 'active').order('full_name'),
      ])
      if (rowsRes.error) toast.error(rowsRes.error.message)
      const enrolled = (rowsRes.data as ProjectFinancier[]) ?? []
      setRows(enrolled)
      const invited = new Set(enrolled.map((r) => r.financier_id))
      setAvailableFinanciers(((allFinRes.data as Profile[]) ?? []).filter((f) => !invited.has(f.id)))
      setSelectedInviteIds([])
    } else if (financierId) {
      const [rowsRes, myRes] = await Promise.all([
        queries[0],
        supabase
          .from('project_financiers')
          .select('*, projects:project_id(*)')
          .eq('project_id', project.id)
          .eq('financier_id', financierId)
          .maybeSingle(),
      ])
      if (rowsRes.error) toast.error(rowsRes.error.message)
      if (myRes.error) toast.error(myRes.error.message)
      const my = (myRes.data as ProjectFinancier | null) ?? null
      setRows((rowsRes.data as ProjectFinancier[]) ?? [])
      setMyRow(my)

      if (my) {
        const { data: payData, error: payError } = await supabase
          .from('financier_release_payments')
          .select('*, project_releases(*)')
          .eq('project_financier_id', my.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (payError) toast.error(payError.message)
        setMyReleasePayment((payData as FinancierReleasePayment | null) ?? null)
      } else {
        setMyReleasePayment(null)
      }
    } else {
      const { data, error } = await queries[0]
      if (error) toast.error(error.message)
      setRows((data as ProjectFinancier[]) ?? [])
    }
    setLoading(false)
  }

  useEffect(() => {
    if (!open || !project) {
      setRows([])
      setMyRow(null)
      setMyReleasePayment(null)
      setAvailableFinanciers([])
      setSelectedInviteIds([])
      return
    }
    void loadData()
  }, [open, project?.id, mode, financierId])

  useEffect(() => {
    if (!myRow) {
      setWilling('')
      return
    }
    setWilling(
      moneyInputFromValue(
        myRow.commitment_status === 'confirmed'
          ? (myRow.confirmed_amount ?? myRow.willing_amount ?? '')
          : (myRow.willing_amount ?? myRow.current_suggested_amount ?? ''),
      ),
    )
  }, [myRow?.id, myRow?.commitment_status, myRow?.confirmed_amount, myRow?.willing_amount, myRow?.current_suggested_amount])

  useEffect(() => {
    if (mode !== 'admin') return
    setAdminAmounts(Object.fromEntries(rows.map((r) => [r.id, adminConfirmedAmountDraft(r)])))
  }, [mode, rows])

  const inviteLabel = useMemo(() => {
    if (!project) return ''
    const ids = project.invite_financier_ids
    if (ids && ids.length > 0) return `${ids.length} selected financier${ids.length === 1 ? '' : 's'}`
    return 'All active financiers'
  }, [project])

  const canInviteMore =
    mode === 'admin' &&
    project &&
    ['draft', 'open_for_funding', 'partially_funded'].includes(project.status)

  const invited = useMemo(
    () =>
      rows
        .filter((r) => r.commitment_status !== 'rejected' && r.commitment_status !== 'withdrawn')
        .sort((a, b) => {
          const aConfirmed = a.commitment_status === 'confirmed' ? 1 : 0
          const bConfirmed = b.commitment_status === 'confirmed' ? 1 : 0
          if (bConfirmed !== aConfirmed) return bConfirmed - aConfirmed
          return financierName(a).localeCompare(financierName(b))
        }),
    [rows],
  )

  const financierColorMap = useMemo(() => {
    const ids = invited
      .slice()
      .sort((a, b) => financierName(a).localeCompare(financierName(b)))
      .map((r) => r.financier_id)
    return buildFinancierColorMap(ids)
  }, [invited])

  const confirmedSegments = useMemo(
    () =>
      invited
        .filter((r) => r.commitment_status === 'confirmed' && toNumber(r.confirmed_amount) > 0)
        .map((r) => ({
          id: r.financier_id,
          label: financierName(r),
          amount: toNumber(r.confirmed_amount),
          color: financierColorFromMap(financierColorMap, r.financier_id, financierName(r)),
        }))
        .sort((a, b) => b.amount - a.amount),
    [invited, financierColorMap],
  )

  if (!project) return null

  const confirmedTotal = rows
    .filter((r) => r.commitment_status === 'confirmed')
    .reduce((s, r) => s + toNumber(r.confirmed_amount), 0)
  const myConfirmedAmount = toNumber(myRow?.confirmed_amount)
  const othersConfirmed =
    confirmedTotal -
    (myRow?.commitment_status === 'confirmed' ? myConfirmedAmount : 0)
  const progress = fundingProgress(confirmedTotal, toNumber(project.capital_required))
  const releaseLabel = project.release_date || project.calculated_expected_release || 'TBA'
  const timeProgress = financingTimeProgress(
    project.financing_date,
    project.duration_days,
    project.release_date,
    project.calculated_expected_release,
  )

  const releaseIsLive =
    myReleasePayment?.project_releases?.release_status === 'released' ||
    project.status === 'released' ||
    project.status === 'completed'
  const canConfirmReceived = Boolean(
    mode === 'financier' && myReleasePayment && releaseIsLive && !myReleasePayment.received_at,
  )

  const financeIsOpen = financeAllowsCapitalCommitment(project.status)
  const isGroupFinance = Boolean(project.group_id)
  const canManageCommitment = Boolean(
    mode === 'financier' &&
      myRow &&
      financeIsOpen &&
      myRow.commitment_status !== 'withdrawn' &&
      !isGroupFinance,
  )
  const isRejected = myRow?.commitment_status === 'rejected'
  const isConfirmedCommitment = myRow?.commitment_status === 'confirmed'
  const gap = remainingGap(confirmedTotal, toNumber(project.capital_required))
  const suggested = toNumber(myRow?.current_suggested_amount)
  const ceiling = Math.max(0, toNumber(project.capital_required) - othersConfirmed)
  const enteredAmount = toNumber(willing)
  const hasValidNumber = willing !== '' && enteredAmount > 0
  const overCeiling = hasValidNumber && enteredAmount > ceiling + 0.001
  const unchanged =
    isConfirmedCommitment && hasValidNumber && Math.abs(enteredAmount - myConfirmedAmount) < 0.01
  const canAdminSetAllocations = mode === 'admin' && !['cancelled', 'completed'].includes(project.status)
  const adminDraftTotal = invited.reduce((s, r) => s + toNumber(adminAmounts[r.id] || 0), 0)
  const adminOverCapital = adminDraftTotal > toNumber(project.capital_required)

  async function confirmCommitment() {
    if (!myRow) return
    setDecisionBusy(true)
    const { error } = await supabase.rpc('financier_confirm_commitment', {
      p_project_financier_id: myRow.id,
      p_amount: enteredAmount,
    })
    setDecisionBusy(false)
    if (error) {
      toast.error(error.message)
      return
    }
    setConfirmOpen(false)
    toast.success(isConfirmedCommitment ? 'Commitment updated' : 'Commitment confirmed')
    onDecisionResolved?.()
    void loadData()
  }

  async function rejectCommitment() {
    if (!myRow) return
    setDecisionBusy(true)
    const { error } = await supabase.rpc('financier_reject_commitment', {
      p_project_financier_id: myRow.id,
    })
    setDecisionBusy(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success(isConfirmedCommitment ? 'Commitment cancelled' : 'Commitment rejected')
    onDecisionResolved?.()
    onOpenChange(false)
  }

  async function confirmReceived() {
    if (!myReleasePayment) return
    setConfirmingReceived(true)
    const { error } = await supabase.rpc('financier_confirm_release_received', {
      p_payment_id: myReleasePayment.id,
    })
    setConfirmingReceived(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Payout marked as received')
    onDecisionResolved?.()
    void loadData()
  }

  async function inviteSelected() {
    if (!project || selectedInviteIds.length === 0) return
    setInviting(true)
    const { error } = await supabase.rpc('invite_financiers', {
      p_project_id: project.id,
      p_financier_ids: selectedInviteIds,
    })
    setInviting(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Financiers invited')
    void loadData()
  }

  async function saveAdminAllocations() {
    if (!project) return
    const allocations = invited
      .map((r) => ({
        id: r.id,
        confirmed_amount: toNumber(adminAmounts[r.id] || 0),
      }))
      .filter((a) => a.confirmed_amount > 0)

    if (allocations.length === 0) {
      toast.error('Enter at least one confirmed amount')
      return
    }

    const draftTotal = allocations.reduce((s, a) => s + a.confirmed_amount, 0)
    if (draftTotal > toNumber(project.capital_required)) {
      toast.error('Total confirmed exceeds capital required')
      return
    }

    setSavingAllocations(true)
    const { error } = await supabase.rpc('admin_set_financier_commitments', {
      p_project_id: project.id,
      p_allocations: allocations,
    })
    setSavingAllocations(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Financier amounts saved')
    void loadData()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] w-[calc(100vw-1rem)] max-w-lg overflow-x-hidden overflow-y-auto p-4 sm:max-h-[90vh] sm:p-6">
        <DialogHeader className="text-center">
          <DialogTitle className="flex flex-wrap items-center justify-center gap-2 text-base sm:text-lg">
            {project.name}
            <Badge variant={projectStatusVariant(project.status)} className={projectStatusClassName(project.status)}>
              {PROJECT_STATUS_LABELS[project.status]}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            {mode === 'admin'
              ? 'Finance overview and commitments'
              : isGroupFinance
                ? 'Finance details — confirm or update your amount from the Group view'
                : 'Finance details and your commitment'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {canConfirmReceived && myReleasePayment ? (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
              <p className="text-sm font-semibold text-primary">Payout ready — confirm receipt</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Admin released {formatPhp(myReleasePayment.total_amount)} for you. Please confirm once you receive it.
              </p>
              <Button
                size="sm"
                className="mt-3 w-full sm:w-auto"
                disabled={confirmingReceived}
                onClick={() => void confirmReceived()}
              >
                {confirmingReceived ? 'Saving…' : 'I received the money'}
              </Button>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3">
            <div>
              <p className="text-xs text-muted-foreground">Capital required</p>
              <p className="font-semibold tabular-nums">{formatPhp(project.capital_required)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Expected profit</p>
              <p className="font-semibold tabular-nums">{formatPhp(project.expected_profit)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Financing date</p>
              <p className="font-medium">{project.financing_date}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Release date</p>
              <p className="font-medium">{releaseLabel}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Duration</p>
              <p className="font-medium">{project.duration_days} days</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Time remaining</p>
              <p className="font-semibold text-primary">{formatTimeRemaining(project)}</p>
            </div>
          </div>

          <div>
            <div className="mb-2 flex flex-col gap-1 text-xs sm:flex-row sm:items-center sm:justify-between">
              <span className="text-muted-foreground">Time elapsed</span>
              <span className="font-medium tabular-nums">
                {timeProgress.elapsedDays} / {timeProgress.totalDays} days ({formatPercent(timeProgress.percent)})
              </span>
            </div>
            <Progress value={timeProgress.percent} className="h-1.5" />
            <p className="mt-1 text-xs text-muted-foreground">
              {timeProgress.remainingDays > 0
                ? `${timeProgress.remainingDays} day${timeProgress.remainingDays === 1 ? '' : 's'} until release`
                : 'Financing term complete'}
              {!project.release_date && !project.calculated_expected_release
                ? ` · based on ${project.duration_days}-day duration from financing date`
                : null}
            </p>
          </div>

          {mode === 'financier' && myRow ? (
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your commitment</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge variant={commitmentStatusVariant(myRow.commitment_status)} className="mt-1">
                    {COMMITMENT_STATUS_LABELS[myRow.commitment_status]}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Suggested amount</p>
                  <p className="font-semibold tabular-nums">{formatPhp(myRow.current_suggested_amount)}</p>
                </div>
                {toNumber(myRow.confirmed_amount) > 0 ? (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">Confirmed amount</p>
                    <p className="font-semibold tabular-nums text-primary">{formatPhp(myRow.confirmed_amount)}</p>
                  </div>
                ) : null}
              </div>

              {myReleasePayment && releaseIsLive ? (
                <div className="mt-3 border-t pt-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your payout</p>
                  <div className="space-y-1 text-sm">
                    <p>
                      Capital returned:{' '}
                      <span className="font-semibold tabular-nums">{formatPhp(myReleasePayment.capital_amount)}</span>
                    </p>
                    <p>
                      Profit share:{' '}
                      <span className="font-semibold tabular-nums">{formatPhp(myReleasePayment.profit_amount)}</span>
                    </p>
                    <p>
                      Total received:{' '}
                      <span className="font-semibold tabular-nums text-primary">
                        {formatPhp(myReleasePayment.total_amount)}
                      </span>
                    </p>
                    {myReleasePayment.project_releases?.actual_date ? (
                      <p className="text-xs text-muted-foreground">
                        Released on {myReleasePayment.project_releases.actual_date}
                      </p>
                    ) : null}
                  </div>
                  {myReleasePayment.received_at ? (
                    <p className="mt-2 rounded-md bg-success/10 px-3 py-2 text-xs text-success">
                      You confirmed receipt on{' '}
                      {new Date(myReleasePayment.received_at).toLocaleDateString('en-PH', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                  ) : canConfirmReceived ? (
                    <Button
                      size="sm"
                      className="mt-3"
                      disabled={confirmingReceived}
                      onClick={() => void confirmReceived()}
                    >
                      {confirmingReceived ? 'Saving…' : 'Mark as received'}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          <div>
            <div className="mb-2 flex flex-col gap-1 text-xs sm:flex-row sm:items-center sm:justify-between">
              <span className="text-muted-foreground">Funding progress</span>
              <span className="font-medium tabular-nums">
                {formatPhp(confirmedTotal)} / {formatPhp(project.capital_required)} ({formatPercent(progress)})
              </span>
            </div>
            <FundingProgressBar capital={project.capital_required} segments={confirmedSegments} />
            <FundingProgressLegend segments={confirmedSegments} />
            <p className="mt-1 text-xs text-muted-foreground">
              Gap: {formatPhp(remainingGap(confirmedTotal, toNumber(project.capital_required)))}
            </p>
          </div>

          {mode === 'admin' ? (
            <div>
              <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Financier allocations</p>
                <span className="text-xs text-muted-foreground">{inviteLabel}</span>
              </div>
              {canAdminSetAllocations ? (
                <p className="mb-2 text-xs leading-snug text-muted-foreground">
                  Enter how much each financier committed. Use this when a financier cannot confirm in the app.
                </p>
              ) : null}
              {loading ? (
                <Skeleton className="h-24 w-full" />
              ) : invited.length === 0 ? (
                <p className="rounded-md border border-dashed px-3 py-4 text-center text-muted-foreground">
                  No financiers invited yet
                </p>
              ) : (
                <div className="max-h-56 overflow-y-auto overscroll-contain rounded-md border md:max-h-64">
                  <div className="p-2 md:hidden">
                    <AdminAllocationMobileList
                      rows={invited}
                      financierColorMap={financierColorMap}
                      adminAmounts={adminAmounts}
                      canEdit={canAdminSetAllocations}
                      onAmountChange={(id, value) =>
                        setAdminAmounts((prev) => ({ ...prev, [id]: value }))
                      }
                    />
                  </div>
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-card">
                        <TableRow>
                          <TableHead>Financier</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Suggested</TableHead>
                          <TableHead className="text-right">Confirmed amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invited.map((r) => {
                          const color = financierColorFromMap(financierColorMap, r.financier_id, financierName(r))
                          return (
                            <TableRow key={r.id}>
                              <TableCell>
                                <span className="inline-flex items-center gap-2">
                                  <FinancierColorDot color={color} />
                                  {financierName(r)}
                                </span>
                              </TableCell>
                              <TableCell>
                                <Badge variant={commitmentStatusVariant(r.commitment_status)} className="text-xs">
                                  {COMMITMENT_STATUS_LABELS[r.commitment_status]}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-muted-foreground">
                                {formatPhp(r.current_suggested_amount)}
                              </TableCell>
                              <TableCell className="text-right">
                                {canAdminSetAllocations ? (
                                  <MoneyInput
                                    className="ml-auto w-full max-w-32 text-right"
                                    value={adminAmounts[r.id] ?? ''}
                                    onValueChange={(v) =>
                                      setAdminAmounts((prev) => ({ ...prev, [r.id]: v }))
                                    }
                                  />
                                ) : (
                                  <span className="tabular-nums">{commitmentAmount(r)}</span>
                                )}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {canAdminSetAllocations && invited.length > 0 ? (
                <div className="mt-3 space-y-2">
                  <p className={cn('text-xs', adminOverCapital ? 'font-medium text-destructive' : 'text-muted-foreground')}>
                    Draft total: {formatPhp(adminDraftTotal)} / {formatPhp(project.capital_required)}
                    {adminOverCapital ? ' · exceeds capital required' : null}
                  </p>
                  <Button
                    size="sm"
                    className="h-10 w-full sm:w-auto"
                    disabled={savingAllocations || adminOverCapital || invited.length === 0}
                    onClick={() => void saveAdminAllocations()}
                  >
                    {savingAllocations ? 'Saving…' : 'Save financier amounts'}
                  </Button>
                </div>
              ) : null}

              {canInviteMore && availableFinanciers.length > 0 ? (
                <div className="mt-3 space-y-2 rounded-md border p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Invite more</p>
                  <div className="max-h-32 space-y-2 overflow-y-auto">
                    {availableFinanciers.map((f) => {
                      const checked = selectedInviteIds.includes(f.id)
                      return (
                        <label key={f.id} className="flex cursor-pointer items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setSelectedInviteIds((prev) =>
                                checked ? prev.filter((x) => x !== f.id) : [...prev, f.id],
                              )
                            }
                          />
                          <span>
                            {f.full_name} <span className="text-muted-foreground">@{f.username}</span>
                          </span>
                        </label>
                      )
                    })}
                  </div>
                  <Button
                    size="sm"
                    disabled={selectedInviteIds.length === 0 || inviting}
                    onClick={() => void inviteSelected()}
                  >
                    {inviting ? 'Inviting…' : `Invite selected (${selectedInviteIds.length})`}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Financier contributions
              </p>
              {loading ? (
                <Skeleton className="h-24 w-full" />
              ) : invited.length === 0 ? (
                <p className="rounded-md border border-dashed px-3 py-4 text-center text-muted-foreground">
                  No financiers on this finance yet
                </p>
              ) : (
                <div className="max-h-56 overflow-y-auto overscroll-contain rounded-md border md:max-h-52">
                  <div className="p-2 md:hidden">
                    <FinancierContributionsMobileList
                      rows={invited}
                      financierColorMap={financierColorMap}
                      financierId={financierId}
                      capitalRequired={toNumber(project.capital_required)}
                      expectedProfit={toNumber(project.expected_profit)}
                    />
                  </div>
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-card">
                        <TableRow>
                          <TableHead>Financier</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right text-[10px]">Amount</TableHead>
                          <TableHead className="text-right text-[10px]">Profit</TableHead>
                          <TableHead className="text-right text-[10px]">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invited.map((r) => {
                          const isMe = Boolean(financierId && r.financier_id === financierId)
                          const color = financierColorFromMap(financierColorMap, r.financier_id, financierName(r))
                          const amount = commitmentAmountValue(r)
                          const capitalRequired = toNumber(project.capital_required)
                          const expectedProfit = toNumber(project.expected_profit)
                          const profit = rowProfitShare(r, capitalRequired, expectedProfit)
                          const total = totalReceivable(amount, profit)
                          return (
                            <TableRow key={r.id} className={isMe ? 'bg-muted/30' : undefined}>
                              <TableCell>
                                <span className="inline-flex items-center gap-2">
                                  <FinancierColorDot color={color} />
                                  {financierName(r)}
                                  {isMe ? <span className="text-xs text-muted-foreground">(You)</span> : null}
                                </span>
                              </TableCell>
                              <TableCell>
                                <Badge variant={commitmentStatusVariant(r.commitment_status)} className="text-xs">
                                  {COMMITMENT_STATUS_LABELS[r.commitment_status]}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right text-xs tabular-nums">{formatPhp(amount)}</TableCell>
                              <TableCell className="text-right text-[10px] tabular-nums text-muted-foreground">
                                {formatPhp(profit)}
                              </TableCell>
                              <TableCell className="text-right text-xs font-medium tabular-nums">
                                {formatPhp(total)}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Confirmed amounts count toward funding progress. Invited financiers show their suggested share until
                they decide.
              </p>
            </div>
          )}

          {project.description ? (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</p>
              <p className="text-muted-foreground">{project.description}</p>
            </div>
          ) : null}

          {mode === 'financier' && myRow && isConfirmedCommitment && !canManageCommitment && !isGroupFinance ? (
            <div className="rounded-lg border border-border/40 bg-muted/20 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your commitment</p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-primary">{formatPhp(myConfirmedAmount)}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                This finance is {PROJECT_STATUS_LABELS[project.status] ?? project.status} — capital can no longer be
                changed.
              </p>
            </div>
          ) : null}

          {canManageCommitment && myRow ? (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {isConfirmedCommitment ? 'Manage commitment' : 'Your decision'}
              </p>
              {isRejected ? (
                <p className="mb-3 text-xs text-muted-foreground">
                  You rejected this finance. You can still accept if you change your mind.
                </p>
              ) : isConfirmedCommitment ? (
                <p className="mb-3 text-xs text-muted-foreground">
                  You confirmed {formatPhp(myConfirmedAmount)}. Update your amount or cancel if you change your mind.
                </p>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="finance-detail-willing" className="text-xs leading-none">
                  How much do you want to commit?
                </Label>
                <MoneyInput
                  id="finance-detail-willing"
                  value={willing}
                  onValueChange={setWilling}
                  disabled={decisionBusy}
                  aria-invalid={overCeiling}
                  className="h-10 bg-background"
                />
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs leading-snug text-muted-foreground">
                  <span>
                    Max you can commit:{' '}
                    <span className="font-medium text-foreground">{formatPhp(ceiling)}</span>
                  </span>
                  <button
                    type="button"
                    className="font-medium text-primary hover:underline disabled:opacity-50"
                    disabled={decisionBusy || suggested <= 0}
                    onClick={() => setWilling(moneyInputFromValue(suggested))}
                  >
                    Use suggested ({formatPhp(suggested)})
                  </button>
                </div>
                {overCeiling ? (
                  <p className="text-xs font-medium text-destructive">
                    Amount exceeds what&apos;s still needed ({formatPhp(ceiling)} max).
                  </p>
                ) : null}
              </div>
              <div className={cn('mt-4 grid gap-2', isConfirmedCommitment || isRejected ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2')}>
                <Button
                  className="h-10"
                  size="sm"
                  disabled={decisionBusy || !hasValidNumber || overCeiling || unchanged}
                  onClick={() => setConfirmOpen(true)}
                >
                  {isConfirmedCommitment ? 'Update amount' : isRejected ? 'Accept' : 'Confirm'}
                </Button>
                {!isRejected ? (
                  <Button
                    variant={isConfirmedCommitment ? 'destructive' : 'outline'}
                    className="h-10"
                    size="sm"
                    disabled={decisionBusy}
                    onClick={() => void rejectCommitment()}
                  >
                    {isConfirmedCommitment ? 'Cancel commitment' : 'Reject'}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          {mode === 'financier' && myRow && isGroupFinance && financeIsOpen ? (
            <div className="rounded-lg border border-border/40 bg-muted/20 p-4">
              <p className="text-xs text-muted-foreground">
                This finance is part of a batch. Use the{' '}
                <span className="font-semibold text-foreground">Group</span> label in the finance list to confirm or
                update your total batch commitment.
              </p>
            </div>
          ) : null}

          {project.notes && mode === 'admin' ? (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</p>
              <p className="text-muted-foreground">{project.notes}</p>
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>

        {canManageCommitment && myRow ? (
          <CommitmentConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            financeName={project.name}
            amount={enteredAmount}
            stillNeeded={gap}
            suggested={suggested}
            capitalRequired={toNumber(project.capital_required)}
            fundedAfter={confirmedTotal - (isConfirmedCommitment ? myConfirmedAmount : 0) + enteredAmount}
            isUpdate={isConfirmedCommitment}
            previousAmount={myConfirmedAmount}
            busy={decisionBusy}
            onConfirm={() => void confirmCommitment()}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
