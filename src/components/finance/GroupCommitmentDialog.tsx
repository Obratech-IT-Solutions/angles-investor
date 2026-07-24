import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { CommitmentConfirmDialog } from '@/components/finance/CommitmentConfirmDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { MoneyInput } from '@/components/ui/money-input'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import {
  computeEndDate,
  groupProfitShare,
  splitGroupCommitment,
} from '@/lib/finance-group'
import {
  formatPercent,
  formatPhp,
  fundingProgress,
  moneyInputFromValue,
  toNumber,
} from '@/lib/money'
import { financeAllowsCapitalCommitment, projectStatusClassName, projectStatusVariant } from '@/lib/status'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import {
  PROJECT_STATUS_LABELS,
  type FinanceGroupSummary,
  type GroupCommitmentConfirmResult,
  type ProjectStatus,
} from '@/types'

type Step = 'review' | 'decide'

export function GroupCommitmentDialog({
  groupId,
  open,
  onOpenChange,
  onConfirmed,
  startAtDecide = false,
}: {
  groupId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirmed?: () => void
  startAtDecide?: boolean
}) {
  const [summary, setSummary] = useState<FinanceGroupSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<Step>('review')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    if (!open || !groupId) {
      setSummary(null)
      setStep('review')
      setAmount('')
      setConfirmOpen(false)
      return
    }
    let cancelled = false
    void (async () => {
      setLoading(true)
      const { data, error } = await supabase.rpc('get_finance_group_summary', {
        p_group_id: groupId,
      })
      if (cancelled) return
      if (error) {
        toast.error(error.message)
        setSummary(null)
      } else {
        const s = data as FinanceGroupSummary
        setSummary(s)
        const previous = toNumber(s.my_confirmed)
        if (startAtDecide && previous > 0) {
          setStep('decide')
          setAmount(moneyInputFromValue(previous))
        } else {
          setStep('review')
          setAmount('')
        }
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [open, groupId, startAtDecide])

  const lines = summary?.lines ?? []
  const groupBudget = toNumber(summary?.group_budget)
  const groupProfit = toNumber(summary?.group_profit)
  const groupConfirmed = toNumber(summary?.group_confirmed)
  const myPrevious = toNumber(summary?.my_confirmed)
  const groupRemainingForMe = Math.max(0, groupBudget - (groupConfirmed - myPrevious))
  const mySuggested = toNumber(summary?.my_suggested)
  const effectiveSuggested = Math.min(mySuggested, groupRemainingForMe)
  const suggestedCapped = mySuggested > groupRemainingForMe + 0.001
  const entered = toNumber(amount)
  const hasValid = amount !== '' && entered > 0
  const isUpdate = myPrevious > 0
  const unchanged = isUpdate && hasValid && Math.abs(entered - myPrevious) < 0.01
  const underSuggested = hasValid && effectiveSuggested > 0 && entered < effectiveSuggested - 0.01

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
  const progress = fundingProgress(groupConfirmed, groupBudget)
  const allOpen = lines.every((l) => financeAllowsCapitalCommitment(l.status))
  const canAct = allOpen && lines.length >= 2
  const isRejected = lines.every((l) => l.my_status === 'rejected')
  const isConfirmed = myPrevious > 0 && !isRejected

  function handleAmountChange(value: string) {
    const next = toNumber(value)
    if (next > groupRemainingForMe + 0.001) {
      setAmount(moneyInputFromValue(groupRemainingForMe))
      toast.message(`Adjusted to batch ceiling (${formatPhp(groupRemainingForMe)})`)
      return
    }
    setAmount(value)
  }

  function beginDecide() {
    const startAmount = isUpdate ? myPrevious : effectiveSuggested
    if (startAmount <= 0) {
      toast.error('No amount available to commit for this batch')
      return
    }
    setStep('decide')
    setAmount(moneyInputFromValue(startAmount))
  }

  async function rejectBatch() {
    if (!groupId) return
    setBusy(true)
    const { error } = await supabase.rpc('financier_reject_group_commitment', {
      p_group_id: groupId,
    })
    setBusy(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success(isConfirmed ? 'Batch commitment cancelled' : 'Batch rejected')
    onOpenChange(false)
    onConfirmed?.()
  }

  async function handleConfirm() {
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
          ? `Commitment saved · other financiers notified about the ${formatPhp(groupBudget - groupConfirmed - entered + myPrevious)} gap`
          : `Batch commitment confirmed · profit ~${formatPhp(result.expected_profit_total)}`,
    )
    onOpenChange(false)
    onConfirmed?.()
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[90vh] w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="shrink-0 border-b px-4 py-4 text-left sm:px-6">
            <DialogTitle>{summary?.name ?? 'Finance batch'}</DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
            {loading || !summary ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <>
                <div className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">Batch funding</span>
                    <span className="font-medium tabular-nums">
                      {formatPhp(groupConfirmed)} / {formatPhp(groupBudget)}
                    </span>
                  </div>
                  <Progress value={progress} className="mt-2 h-1.5" />
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Start {summary.financing_date}
                    {step === 'decide' ? (
                      <>
                        {' '}
                        · Max you can commit{' '}
                        <span className="font-medium text-foreground">
                          {formatPhp(groupRemainingForMe)}
                        </span>
                      </>
                    ) : null}
                  </p>
                </div>

                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-xs sm:text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                        <th className="px-2 py-2 font-medium">Finance</th>
                        <th className="px-2 py-2 text-right font-medium">Budget</th>
                        <th className="px-2 py-2 text-right font-medium">Profit</th>
                        <th className="px-2 py-2 text-right font-medium">Days</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l) => (
                        <tr key={l.project_id} className="border-b last:border-0">
                          <td className="px-2 py-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-medium">{l.name}</span>
                              <Badge
                                variant={projectStatusVariant(l.status as ProjectStatus)}
                                className={cn(
                                  'text-[9px]',
                                  projectStatusClassName(l.status as ProjectStatus),
                                )}
                              >
                                {PROJECT_STATUS_LABELS[l.status as ProjectStatus] ?? l.status}
                              </Badge>
                            </div>
                            <p className="text-[10px] text-muted-foreground">
                              Ends{' '}
                              {l.calculated_expected_release ??
                                computeEndDate(l.financing_date, l.duration_days) ??
                                '—'}
                            </p>
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {formatPhp(l.capital_required)}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {formatPhp(l.expected_profit)}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">{l.duration_days}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {step === 'decide' ? (
                  <>
                    <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
                      <Label htmlFor="group_commit_amount">Total amount to commit (₱)</Label>
                      <MoneyInput
                        id="group_commit_amount"
                        value={amount}
                        onValueChange={handleAmountChange}
                        disabled={!canAct || busy}
                      />
                      <div className="space-y-1 text-xs text-muted-foreground">
                        {suggestedCapped ? (
                          <p>
                            Suggested lowered to batch ceiling — only{' '}
                            <span className="font-medium text-foreground">
                              {formatPhp(groupRemainingForMe)}
                            </span>{' '}
                            left (your share was {formatPhp(mySuggested)}).
                          </p>
                        ) : (
                          <p>
                            Suggested for you:{' '}
                            <span className="font-medium text-foreground">
                              {formatPhp(effectiveSuggested)}
                            </span>
                            . You can commit less if needed.
                          </p>
                        )}
                        {underSuggested ? (
                          <p className="text-amber-700 dark:text-amber-300">
                            Below suggested — other financiers will be notified they can cover the
                            gap or ask admin to raise budgets.
                          </p>
                        ) : null}
                      </div>
                    </div>

                    {hasValid ? (
                      <div className="space-y-2 rounded-lg border p-3">
                        <p className="text-sm font-medium">Split by budget weight</p>
                        <table className="w-full text-xs sm:text-sm">
                          <thead>
                            <tr className="text-left text-muted-foreground">
                              <th className="pb-1 font-medium">Finance</th>
                              <th className="pb-1 text-right font-medium">Share</th>
                              <th className="pb-1 text-right font-medium">Amount</th>
                              <th className="pb-1 text-right font-medium">Profit</th>
                            </tr>
                          </thead>
                          <tbody>
                            {splits.map((s) => (
                              <tr key={s.projectId} className="border-t border-border/40">
                                <td className="py-1.5 font-medium">{s.projectName}</td>
                                <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                                  {formatPercent(s.weightRatio * 100)}
                                </td>
                                <td className="py-1.5 text-right tabular-nums">
                                  {formatPhp(s.confirmedAmount)}
                                </td>
                                <td className="py-1.5 text-right tabular-nums">
                                  {formatPhp(s.expectedProfitShare)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div className="flex justify-between border-t pt-2 text-sm font-semibold">
                          <span>Your expected profit</span>
                          <span className="tabular-nums text-primary">{formatPhp(profitTotal)}</span>
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : null}

                {isRejected && step === 'review' ? (
                  <p className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
                    You rejected this batch. You can still accept if you change your mind.
                  </p>
                ) : null}

                {isConfirmed && step === 'review' ? (
                  <p className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
                    You confirmed {formatPhp(myPrevious)} for this batch. Update your amount or cancel if you change
                    your mind.
                  </p>
                ) : null}
              </>
            )}
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t px-4 py-3 sm:grid sm:grid-cols-2 sm:px-6">
            {step === 'review' && canAct ? (
              <>
                {!isRejected ? (
                  <Button
                    type="button"
                    variant={isConfirmed ? 'destructive' : 'outline'}
                    disabled={busy || loading}
                    onClick={() => void rejectBatch()}
                  >
                    {isConfirmed ? 'Cancel commitment' : 'Reject'}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  disabled={busy || loading || (!isUpdate && effectiveSuggested <= 0)}
                  className={isRejected ? 'sm:col-span-2' : undefined}
                  onClick={beginDecide}
                >
                  {isConfirmed ? 'Update amount' : isRejected ? 'Accept batch' : 'Confirm'}
                </Button>
              </>
            ) : step === 'decide' && canAct ? (
              <>
                {!isRejected ? (
                  <Button
                    type="button"
                    variant={isConfirmed ? 'destructive' : 'outline'}
                    disabled={busy || loading}
                    onClick={() => void rejectBatch()}
                  >
                    {isConfirmed ? 'Cancel commitment' : 'Reject'}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  disabled={!hasValid || unchanged || busy || loading}
                  className={isRejected ? 'sm:col-span-2' : undefined}
                  onClick={() => setConfirmOpen(true)}
                >
                  {isUpdate ? 'Update commitment' : isRejected ? 'Accept commitment' : 'Confirm commitment'}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="sm:col-span-2"
                onClick={() => onOpenChange(false)}
                disabled={busy}
              >
                Close
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CommitmentConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        financeName={summary?.name ?? 'this batch'}
        amount={entered}
        stillNeeded={Math.max(0, groupBudget - groupConfirmed + (isUpdate ? myPrevious : 0) - entered)}
        suggested={effectiveSuggested > 0 ? effectiveSuggested : undefined}
        capitalRequired={groupBudget}
        fundedAfter={groupConfirmed - myPrevious + entered}
        isUpdate={isUpdate}
        previousAmount={myPrevious}
        busy={busy}
        splits={splits.map((s) => ({
          projectName: s.projectName,
          confirmedAmount: s.confirmedAmount,
          weightRatio: s.weightRatio,
          expectedProfitShare: s.expectedProfitShare,
        }))}
        expectedProfitTotal={profitTotal}
        onConfirm={() => void handleConfirm()}
      />
    </>
  )
}
