import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { CommitmentConfirmDialog } from '@/components/finance/CommitmentConfirmDialog'
import { FinancierColorDot, FundingProgressBar, FundingProgressLegend } from '@/components/finance/FundingProgressBar'
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
import { Label } from '@/components/ui/label'
import { MoneyInput } from '@/components/ui/money-input'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { computeEndDate, groupProfitShare, splitGroupCommitment } from '@/lib/finance-group'
import { buildFinancierColorMap, financierColorFromMap, financingDateChipColors, formatFinancingDateChip } from '@/lib/financierColors'
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
import {
  commitmentStatusVariant,
  financeAllowsCapitalCommitment,
  projectStatusClassName,
  projectStatusVariant,
} from '@/lib/status'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import {
  COMMITMENT_STATUS_LABELS,
  PROJECT_STATUS_LABELS,
  type CommitmentStatus,
  type FinanceGroupSummary,
  type GroupCommitmentConfirmResult,
  type ProjectFinancier,
  type ProjectStatus,
} from '@/types'

function financierName(row: ProjectFinancier): string {
  const profile = row.profiles as { full_name?: string; display_name?: string } | null | undefined
  return profile?.display_name || profile?.full_name || '—'
}

function batchProjectStatus(lines: FinanceGroupSummary['lines']): ProjectStatus {
  const statuses = lines.map((l) => l.status as ProjectStatus)
  if (statuses.every((s) => s === 'fully_funded')) return 'fully_funded'
  if (statuses.some((s) => s === 'partially_funded')) return 'partially_funded'
  if (statuses.some((s) => s === 'open_for_funding')) return 'open_for_funding'
  return statuses[0] ?? 'open_for_funding'
}

function aggregateFinancierStatus(rows: ProjectFinancier[]): CommitmentStatus {
  if (rows.every((r) => r.commitment_status === 'confirmed')) return 'confirmed'
  if (rows.every((r) => r.commitment_status === 'rejected')) return 'rejected'
  const pending = rows.find((r) => !['confirmed', 'rejected', 'withdrawn'].includes(r.commitment_status))
  return (pending?.commitment_status ?? rows[0]?.commitment_status ?? 'invited') as CommitmentStatus
}

type AggregatedFinancier = {
  financierId: string
  name: string
  status: CommitmentStatus
  amount: number
  profit: number
  total: number
}

function aggregateFinanciers(
  rows: ProjectFinancier[],
  lines: FinanceGroupSummary['lines'],
): AggregatedFinancier[] {
  const lineByProject = new Map(lines.map((l) => [l.project_id, l]))
  const map = new Map<string, ProjectFinancier[]>()
  for (const row of rows) {
    if (row.commitment_status === 'withdrawn') continue
    const list = map.get(row.financier_id) ?? []
    list.push(row)
    map.set(row.financier_id, list)
  }

  return [...map.entries()]
    .map(([financierId, list]) => {
      const confirmed = list.reduce(
        (s, r) => s + (r.commitment_status === 'confirmed' ? toNumber(r.confirmed_amount) : 0),
        0,
      )
      const suggested = list.reduce((s, r) => s + toNumber(r.current_suggested_amount), 0)
      const status = aggregateFinancierStatus(list)
      const amount = status === 'confirmed' && confirmed > 0 ? confirmed : suggested

      let profit = 0
      for (const row of list) {
        const line = lineByProject.get(row.project_id)
        if (!line) continue
        const rowAmount =
          row.commitment_status === 'confirmed' && toNumber(row.confirmed_amount) > 0
            ? toNumber(row.confirmed_amount)
            : toNumber(row.current_suggested_amount)
        profit += budgetBasedProfitShare(
          rowAmount,
          toNumber(line.capital_required),
          toNumber(line.expected_profit),
        )
      }
      profit = Math.round(profit * 100) / 100

      return {
        financierId,
        name: financierName(list[0]),
        status,
        amount,
        profit,
        total: totalReceivable(amount, profit),
      }
    })
    .sort((a, b) => {
      const aConfirmed = a.status === 'confirmed' ? 1 : 0
      const bConfirmed = b.status === 'confirmed' ? 1 : 0
      if (bConfirmed !== aConfirmed) return bConfirmed - aConfirmed
      return a.name.localeCompare(b.name)
    })
}

export function GroupFinanceDetailDialog({
  groupId,
  open,
  onOpenChange,
  financierId,
  onDecisionResolved,
}: {
  groupId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  financierId?: string
  onDecisionResolved?: () => void
  /** @deprecated Inline confirm flow — kept for compatibility */
  onConfirmBatch?: (opts?: { update?: boolean }) => void
}) {
  const [summary, setSummary] = useState<FinanceGroupSummary | null>(null)
  const [peerRows, setPeerRows] = useState<ProjectFinancier[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [amount, setAmount] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    if (!open || !groupId) {
      setSummary(null)
      setPeerRows([])
      setAmount('')
      setConfirmOpen(false)
      return
    }
    let cancelled = false
    void (async () => {
      setLoading(true)
      const summaryRes = await supabase.rpc('get_finance_group_summary', { p_group_id: groupId })
      if (cancelled) return
      if (summaryRes.error) {
        toast.error(summaryRes.error.message)
        setSummary(null)
        setPeerRows([])
        setLoading(false)
        return
      }
      const s = summaryRes.data as FinanceGroupSummary
      setSummary(s)
      const projectIds = (s.lines ?? []).map((l) => l.project_id)
      if (projectIds.length === 0) {
        setPeerRows([])
        setLoading(false)
        return
      }
      const peersRes = await supabase
        .from('project_financiers')
        .select('*, profiles:financier_id(id, full_name, username)')
        .in('project_id', projectIds)
      if (cancelled) return
      if (peersRes.error) toast.error(peersRes.error.message)
      setPeerRows((peersRes.data as ProjectFinancier[]) ?? [])
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [open, groupId])

  const lines = summary?.lines ?? []
  const groupBudget = toNumber(summary?.group_budget)
  const groupProfit = toNumber(summary?.group_profit)
  const groupConfirmed = toNumber(summary?.group_confirmed)
  const myConfirmed = toNumber(summary?.my_confirmed)
  const mySuggested = toNumber(summary?.my_suggested)
  const groupRemainingForMe = Math.max(0, groupBudget - (groupConfirmed - myConfirmed))
  const effectiveSuggested = Math.min(mySuggested, groupRemainingForMe)
  const entered = toNumber(amount)
  const hasValid = amount !== '' && entered > 0
  const isUpdate = myConfirmed > 0
  const unchanged = isUpdate && hasValid && Math.abs(entered - myConfirmed) < 0.01
  const overCeiling = hasValid && entered > groupRemainingForMe + 0.001
  const underSuggested = hasValid && effectiveSuggested > 0 && entered < effectiveSuggested - 0.01

  useEffect(() => {
    if (!summary) {
      setAmount('')
      return
    }
    const startAmount = myConfirmed > 0 ? myConfirmed : effectiveSuggested
    setAmount(startAmount > 0 ? moneyInputFromValue(startAmount) : '')
  }, [summary?.group_id, myConfirmed, effectiveSuggested])

  const splits = useMemo(
    () =>
      splitGroupCommitment(
        hasValid ? entered : 0,
        lines.map((l) => ({
          projectId: l.project_id,
          projectName: l.name,
          capitalRequired: toNumber(l.capital_required),
          expectedProfit: toNumber(l.expected_profit),
          durationDays: l.duration_days,
        })),
      ),
    [entered, hasValid, lines],
  )
  const profitTotal = groupProfitShare(hasValid ? entered : 0, groupBudget, groupProfit)

  const myStatus = aggregateFinancierStatus(
    peerRows.filter((r) => r.financier_id === financierId),
  )
  const batchStatus = batchProjectStatus(lines)
  const progress = fundingProgress(groupConfirmed, groupBudget)
  const gap = remainingGap(groupConfirmed, groupBudget)
  const maxDuration = Math.max(...lines.map((l) => l.duration_days), 0)
  const latestEnd =
    lines
      .map((l) => l.calculated_expected_release ?? computeEndDate(l.financing_date, l.duration_days))
      .filter(Boolean)
      .sort()
      .at(-1) ?? null
  const timeProgress = financingTimeProgress(
    summary?.financing_date ?? '',
    maxDuration,
    null,
    latestEnd,
  )

  const financiers = useMemo(() => aggregateFinanciers(peerRows, lines), [peerRows, lines])
  const financierColorMap = useMemo(
    () => buildFinancierColorMap(financiers.map((f) => f.financierId).sort()),
    [financiers],
  )
  const confirmedSegments = useMemo(
    () =>
      financiers
        .filter((f) => f.status === 'confirmed' && f.amount > 0)
        .map((f) => ({
          id: f.financierId,
          label: f.name,
          amount: f.amount,
          color: financierColorFromMap(financierColorMap, f.financierId, f.name),
        }))
        .sort((a, b) => b.amount - a.amount),
    [financiers, financierColorMap],
  )

  const lineAllowsCommitment = (status: string) => financeAllowsCapitalCommitment(status)

  const batchOpenForCommitment = lines.every((l) => lineAllowsCommitment(l.status))
  const canAct =
    batchOpenForCommitment &&
    lines.length >= 2 &&
    myStatus !== 'withdrawn' &&
    Boolean(financierId)
  const isRejected = myStatus === 'rejected'
  const isConfirmed = myStatus === 'confirmed' && myConfirmed > 0
  const isPending = !isRejected && !isConfirmed
  const showMyCommitment = Boolean(financierId)

  function handleAmountChange(value: string) {
    const next = toNumber(value)
    if (next > groupRemainingForMe + 0.001) {
      setAmount(moneyInputFromValue(groupRemainingForMe))
      toast.message(`Adjusted to batch ceiling (${formatPhp(groupRemainingForMe)})`)
      return
    }
    setAmount(value)
  }

  async function confirmBatch() {
    if (!groupId || !hasValid || entered <= 0) return
    setBusy(true)
    const { data, error } = await supabase.rpc('financier_confirm_group_commitment', {
      p_group_id: groupId,
      p_total_amount: entered,
    })
    setBusy(false)
    if (error) {
      toast.error(error.message)
      return
    }
    const result = data as GroupCommitmentConfirmResult
    setConfirmOpen(false)
    toast.success(
      isUpdate
        ? `Batch commitment updated · profit ~${formatPhp(result.expected_profit_total)}`
        : underSuggested
          ? `Commitment saved · other financiers notified about the gap`
          : `Batch commitment confirmed · profit ~${formatPhp(result.expected_profit_total)}`,
    )
    onOpenChange(false)
    onDecisionResolved?.()
  }

  async function reloadSummary() {
    if (!groupId) return
    const summaryRes = await supabase.rpc('get_finance_group_summary', { p_group_id: groupId })
    if (summaryRes.error) {
      toast.error(summaryRes.error.message)
      return
    }
    setSummary(summaryRes.data as FinanceGroupSummary)
    const s = summaryRes.data as FinanceGroupSummary
    const projectIds = (s.lines ?? []).map((l) => l.project_id)
    if (projectIds.length === 0) {
      setPeerRows([])
      return
    }
    const peersRes = await supabase
      .from('project_financiers')
      .select('*, profiles:financier_id(id, full_name, username)')
      .in('project_id', projectIds)
    if (peersRes.error) toast.error(peersRes.error.message)
    setPeerRows((peersRes.data as ProjectFinancier[]) ?? [])
  }

  async function rejectBatch() {
    if (!groupId) return
    setBusy(true)
    const { error } = await supabase.rpc('financier_reject_group_commitment', { p_group_id: groupId })
    setBusy(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success(isConfirmed ? 'Batch commitment cancelled' : 'Batch rejected')
    setConfirmOpen(false)
    await reloadSummary()
    onDecisionResolved?.()
  }

  if (!groupId) return null

  const headerDateChip = summary?.financing_date ? financingDateChipColors(summary.financing_date) : null

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] w-[calc(100vw-1rem)] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-h-[90vh]">
        <DialogHeader className="space-y-2 border-b border-border/40 bg-muted/15 px-4 pb-4 pt-5 text-center sm:text-center">
          {!loading && summary?.financing_date && headerDateChip ? (
            <div className="flex justify-center">
              <span
                className={cn(
                  'inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold tabular-nums',
                  headerDateChip.bg,
                  headerDateChip.text,
                  headerDateChip.border,
                )}
              >
                {formatFinancingDateChip(summary.financing_date)}
              </span>
            </div>
          ) : null}
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {loading ? 'Finance group' : `Group · ${lines.length} finances`}
          </p>
          <DialogTitle className="flex flex-wrap items-center justify-center gap-2 text-base leading-tight sm:text-lg">
            {summary?.name ?? 'Finance group'}
            {!loading && summary ? (
              <Badge
                variant={projectStatusVariant(batchStatus)}
                className={projectStatusClassName(batchStatus)}
              >
                {PROJECT_STATUS_LABELS[batchStatus]}
              </Badge>
            ) : null}
          </DialogTitle>
          <DialogDescription className="sr-only">Finance group details</DialogDescription>
        </DialogHeader>

        {loading || !summary ? (
          <div className="px-4 py-4">
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <div className="space-y-4 overflow-y-auto px-4 py-4 text-sm">
            <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3">
              <div>
                <p className="text-xs text-muted-foreground">Batch budget</p>
                <p className="font-semibold tabular-nums">{formatPhp(groupBudget)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Batch profit</p>
                <p className="font-semibold tabular-nums">{formatPhp(groupProfit)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Financing date</p>
                <p className="font-medium">{summary.financing_date}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Finances</p>
                <p className="font-medium">{lines.length} in batch</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Max duration</p>
                <p className="font-medium">{maxDuration} days</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Latest end</p>
                <p className="font-medium">{latestEnd ?? 'TBA'}</p>
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
            </div>

            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Finance</TableHead>
                    <TableHead className="text-right">Budget</TableHead>
                    <TableHead className="text-right">Profit</TableHead>
                    <TableHead className="text-right">Days</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((l) => (
                    <TableRow key={l.project_id}>
                      <TableCell className="font-medium">{l.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatPhp(l.capital_required)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatPhp(l.expected_profit)}</TableCell>
                      <TableCell className="text-right tabular-nums">{l.duration_days}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div>
              <div className="mb-2 flex flex-col gap-1 text-xs sm:flex-row sm:items-center sm:justify-between">
                <span className="text-muted-foreground">Batch funding progress</span>
                <span className="font-medium tabular-nums">
                  {formatPhp(groupConfirmed)} / {formatPhp(groupBudget)} ({formatPercent(progress)})
                </span>
              </div>
              <FundingProgressBar capital={groupBudget} segments={confirmedSegments} />
              <FundingProgressLegend segments={confirmedSegments} />
              <p className="mt-1 text-xs text-muted-foreground">Gap: {formatPhp(gap)}</p>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Financier contributions
              </p>
              <div className="md:hidden">
                <ul className="space-y-2">
                  {financiers.map((f) => {
                    const isMe = financierId === f.financierId
                    const color = financierColorFromMap(financierColorMap, f.financierId, f.name)
                    return (
                      <li
                        key={f.financierId}
                        className={cn('rounded-xl border border-border/40 px-3 py-2.5', isMe && 'bg-muted/30')}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-2 text-sm font-medium">
                            <FinancierColorDot color={color} />
                            {f.name}
                            {isMe ? <span className="text-xs text-muted-foreground">(You)</span> : null}
                          </span>
                          <Badge variant={commitmentStatusVariant(f.status)} className="text-[10px]">
                            {COMMITMENT_STATUS_LABELS[f.status]}
                          </Badge>
                        </div>
                        <div className="mt-1.5 space-y-0.5 text-right text-[10px] tabular-nums sm:text-xs">
                          <p className="text-sm font-semibold">{formatPhp(f.amount)}</p>
                          <p className="text-muted-foreground">
                            Profit {formatPhp(f.profit)} · Total {formatPhp(f.total)}
                          </p>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Financier</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right text-[10px]">Amount</TableHead>
                      <TableHead className="text-right text-[10px]">Profit</TableHead>
                      <TableHead className="text-right text-[10px]">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {financiers.map((f) => {
                      const isMe = financierId === f.financierId
                      const color = financierColorFromMap(financierColorMap, f.financierId, f.name)
                      return (
                        <TableRow key={f.financierId} className={isMe ? 'bg-muted/30' : undefined}>
                          <TableCell>
                            <span className="inline-flex items-center gap-2">
                              <FinancierColorDot color={color} />
                              {f.name}
                              {isMe ? <span className="text-xs text-muted-foreground">(You)</span> : null}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge variant={commitmentStatusVariant(f.status)} className="text-xs">
                              {COMMITMENT_STATUS_LABELS[f.status]}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-xs tabular-nums">{formatPhp(f.amount)}</TableCell>
                          <TableCell className="text-right text-[10px] tabular-nums text-muted-foreground">
                            {formatPhp(f.profit)}
                          </TableCell>
                          <TableCell className="text-right text-xs font-medium tabular-nums">
                            {formatPhp(f.total)}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Batch totals per financier — split across finances by budget weight when confirmed.
              </p>
            </div>

            {showMyCommitment ? (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Your batch commitment
                </p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-primary">
                  {formatPhp(myConfirmed > 0 ? myConfirmed : effectiveSuggested)}
                </p>

                {canAct ? (
                  <>
                    <div className="mb-4 mt-4 space-y-2">
                      <Label htmlFor="group-detail-amount" className="text-xs leading-none">
                        {isConfirmed ? 'New batch total (PHP)' : 'How much do you want to commit?'}
                      </Label>
                      <MoneyInput
                        id="group-detail-amount"
                        value={amount}
                        onValueChange={handleAmountChange}
                        disabled={busy}
                        aria-invalid={overCeiling}
                        className="h-10 bg-background"
                      />
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs leading-snug text-muted-foreground">
                        <span>
                          Max you can commit:{' '}
                          <span className="font-medium text-foreground">{formatPhp(groupRemainingForMe)}</span>
                        </span>
                        <button
                          type="button"
                          className="font-medium text-primary hover:underline disabled:opacity-50"
                          disabled={busy || effectiveSuggested <= 0}
                          onClick={() => setAmount(moneyInputFromValue(effectiveSuggested))}
                        >
                          Use suggested ({formatPhp(effectiveSuggested)})
                        </button>
                      </div>
                      {overCeiling ? (
                        <p className="text-xs font-medium text-destructive">
                          Amount exceeds batch ceiling ({formatPhp(groupRemainingForMe)} max).
                        </p>
                      ) : null}
                      {underSuggested ? (
                        <p className="text-xs text-amber-700 dark:text-amber-300">
                          Below suggested — other financiers will be notified they can cover the gap.
                        </p>
                      ) : null}
                    </div>
                    <div className={cn('grid gap-2', isPending ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2')}>
                      <Button
                        type="button"
                        disabled={busy || !hasValid || overCeiling || unchanged}
                        onClick={() => setConfirmOpen(true)}
                        className={isRejected ? 'sm:col-span-2' : undefined}
                      >
                        {isConfirmed ? 'Update fund' : isRejected ? 'Accept batch' : 'Confirm'}
                      </Button>
                      {!isRejected ? (
                        <Button
                          type="button"
                          variant={isConfirmed ? 'destructive' : 'outline'}
                          disabled={busy}
                          onClick={() => void rejectBatch()}
                        >
                          {isConfirmed ? 'Withdraw' : 'Reject'}
                        </Button>
                      ) : null}
                    </div>
                  </>
                ) : myConfirmed > 0 ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    This batch is no longer open for fund changes.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        )}

        <DialogFooter className="gap-2 border-t border-border/40 px-4 py-4 sm:gap-0">
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <CommitmentConfirmDialog
      open={confirmOpen}
      onOpenChange={setConfirmOpen}
      financeName={summary?.name ?? 'this batch'}
      amount={entered}
      stillNeeded={Math.max(0, groupBudget - groupConfirmed + (isUpdate ? myConfirmed : 0) - entered)}
      suggested={effectiveSuggested > 0 ? effectiveSuggested : undefined}
      capitalRequired={groupBudget}
      fundedAfter={groupConfirmed - myConfirmed + entered}
      isUpdate={isUpdate}
      previousAmount={myConfirmed}
      busy={busy}
      splits={splits.map((s) => ({
        projectName: s.projectName,
        confirmedAmount: s.confirmedAmount,
        weightRatio: s.weightRatio,
        expectedProfitShare: s.expectedProfitShare,
      }))}
      expectedProfitTotal={profitTotal}
      onConfirm={() => void confirmBatch()}
    />
    </>
  )
}
