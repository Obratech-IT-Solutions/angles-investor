import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { PageHeader, EmptyState } from '@/components/shared/PageBits'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { MoneyInput } from '@/components/ui/money-input'
import { FinanceBudgetPieChart } from '@/components/finance/FinanceBudgetPieChart'
import { useAuth } from '@/contexts/AuthContext'
import { computeEndDate, sumGroupBudget, sumGroupProfit } from '@/lib/finance-group'
import { FINANCIER_COLORS } from '@/lib/financierColors'
import { formatPhp, moneyInputFromValue, toNumber } from '@/lib/money'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import {
  type AdminCreateFinanceGroupResult,
  type FinanceGroupSummary,
  type Profile,
} from '@/types'

type FinancierInviteMode = 'all' | 'selected'

type FinanceLineDraft = {
  clientKey: string
  projectId?: string
  name: string
  capital_required: string
  expected_profit: string
  duration_days: string
}

function emptyLine(index = 0): FinanceLineDraft {
  return {
    clientKey: `line-${Date.now()}-${index}`,
    name: '',
    capital_required: '',
    expected_profit: '',
    duration_days: '',
  }
}

export function AdminFinanceGroupCreatePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [financingDate, setFinancingDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<FinanceLineDraft[]>([emptyLine(0)])
  const [inviteMode, setInviteMode] = useState<FinancierInviteMode>('all')
  const [selectedFinancierIds, setSelectedFinancierIds] = useState<string[]>([])
  const [financiers, setFinanciers] = useState<Profile[]>([])
  const [financiersLoading, setFinanciersLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const financeListRef = useRef<HTMLDivElement>(null)
  const lineRefs = useRef(new Map<string, HTMLDivElement>())
  const [scrollToLineKey, setScrollToLineKey] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void supabase
      .from('profiles')
      .select('id, username, full_name')
      .eq('role', 'financier')
      .eq('account_status', 'active')
      .order('full_name')
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) toast.error(error.message)
        setFinanciers((data as Profile[]) ?? [])
        setFinanciersLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const totals = useMemo(
    () => ({
      budget: sumGroupBudget(lines.map((l) => ({ capitalRequired: l.capital_required }))),
      profit: sumGroupProfit(lines.map((l) => ({ expectedProfit: l.expected_profit }))),
    }),
    [lines],
  )

  const budgetSlices = useMemo(
    () =>
      lines
        .map((line, idx) => ({
          key: line.clientKey,
          name: line.name.trim() || `Finance ${idx + 1}`,
          value: toNumber(line.capital_required),
          color: FINANCIER_COLORS[idx % FINANCIER_COLORS.length],
        }))
        .filter((slice) => slice.value > 0),
    [lines],
  )

  function lineColor(idx: number) {
    return FINANCIER_COLORS[idx % FINANCIER_COLORS.length]
  }

  function updateLine(clientKey: string, patch: Partial<FinanceLineDraft>) {
    setLines((prev) => prev.map((l) => (l.clientKey === clientKey ? { ...l, ...patch } : l)))
  }

  function removeLine(clientKey: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.clientKey !== clientKey)))
  }

  function addLine() {
    const next = emptyLine(lines.length)
    setLines((prev) => [...prev, next])
    setScrollToLineKey(next.clientKey)
  }

  useLayoutEffect(() => {
    if (!scrollToLineKey) return

    const lineEl = lineRefs.current.get(scrollToLineKey)
    if (!lineEl) return

    financeListRef.current?.scrollTo({
      top: financeListRef.current.scrollHeight,
      behavior: 'smooth',
    })
    lineEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' })

    const nameInput = lineEl.querySelector<HTMLInputElement>('input:not([readonly])')
    nameInput?.focus({ preventScroll: true })

    setScrollToLineKey(null)
  }, [scrollToLineKey, lines])

  function toggleFinancier(id: string) {
    setSelectedFinancierIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return

    if (!financingDate) {
      toast.error('Financing date is required')
      return
    }
    if (lines.length < 1) {
      toast.error('Add at least one finance line')
      return
    }
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]
      if (!l.name.trim()) {
        toast.error(`Finance ${i + 1} needs a name`)
        return
      }
      if (toNumber(l.capital_required) <= 0) {
        toast.error(`Finance ${i + 1} needs a positive budget`)
        return
      }
      if (toNumber(l.expected_profit) < 0) {
        toast.error(`Finance ${i + 1} profit cannot be negative`)
        return
      }
      if (Number(l.duration_days) < 1) {
        toast.error(`Finance ${i + 1} needs a positive duration`)
        return
      }
    }
    if (inviteMode === 'selected' && selectedFinancierIds.length === 0) {
      toast.error('Select at least one financier to invite')
      return
    }

    setSaving(true)
    try {
      const { data, error } = await supabase.rpc('admin_create_finance_group', {
        p_financing_date: financingDate,
        p_lines: lines.map((l) => ({
          name: l.name.trim(),
          capital_required: toNumber(l.capital_required),
          expected_profit: toNumber(l.expected_profit),
          duration_days: Number(l.duration_days),
        })),
        p_financier_ids: inviteMode === 'selected' ? selectedFinancierIds : null,
        p_status: 'open_for_funding',
        p_description: null,
        p_notes: notes.trim() || null,
      })
      if (error) {
        toast.error(error.message)
        return
      }
      const result = data as AdminCreateFinanceGroupResult
      if (result.group_id) {
        toast.success(`Batch created with ${result.project_ids?.length ?? lines.length} finances`)
      } else {
        toast.success('Finance created')
      }
      navigate('/admin/finance')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create batch')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2 gap-1 text-muted-foreground">
          <Link to="/admin/finance">
            <ArrowLeft className="h-4 w-4" />
            All finance
          </Link>
        </Button>
        <PageHeader
          title="Create finance"
          description="Add one or more finances with a shared start date. Two or more are grouped as a batch automatically."
        />
      </div>

      <form onSubmit={(e) => void handleSubmit(e)}>
        <Card>
          <CardContent className="space-y-8 pt-6">
            <div className="grid gap-4 lg:grid-cols-[14rem_1fr] lg:items-start lg:gap-8">
              <div className="space-y-2">
                <Label htmlFor="batch_financing_date">Financing date (shared)</Label>
                <Input
                  id="batch_financing_date"
                  type="date"
                  value={financingDate}
                  onChange={(e) => setFinancingDate(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-3 lg:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] lg:items-start lg:justify-end lg:gap-4">
                <div className="grid grid-cols-2 gap-3 sm:max-w-md lg:max-w-none">
                  <div className="rounded-lg bg-muted/40 px-3 py-2.5">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Total budget
                    </p>
                    <p className="mt-0.5 text-base font-semibold tabular-nums">{formatPhp(totals.budget)}</p>
                  </div>
                  <div className="rounded-lg bg-muted/40 px-3 py-2.5">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Total profit
                    </p>
                    <p className="mt-0.5 text-base font-semibold tabular-nums">{formatPhp(totals.profit)}</p>
                  </div>
                </div>
                <FinanceBudgetPieChart
                  slices={budgetSlices}
                  total={totals.budget}
                  className="w-full lg:min-w-[16rem]"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold">Finances</p>
                <p className="text-xs text-muted-foreground">
                  Add each finance with its own name, budget, profit, and duration. Use &quot;Add finance&quot; for a
                  batch — a single line stays a normal finance.
                </p>
              </div>

              <div
                ref={financeListRef}
                className={cn(
                  lines.length > 1 &&
                    'max-h-[min(65vh,28rem)] divide-y overflow-y-auto overscroll-contain rounded-xl border sm:max-h-[min(70vh,36rem)]',
                )}
              >
                {lines.map((line, idx) => {
                  const endDate = computeEndDate(financingDate, Number(line.duration_days) || 0)
                  const color = lineColor(idx)
                  return (
                    <div
                      key={line.clientKey}
                      ref={(node) => {
                        if (node) lineRefs.current.set(line.clientKey, node)
                        else lineRefs.current.delete(line.clientKey)
                      }}
                      className={cn(
                        'space-y-3',
                        lines.length > 1 ? 'border-l-4 p-4 pl-3' : 'pb-1',
                      )}
                      style={lines.length > 1 ? { borderLeftColor: color } : undefined}
                    >
                      {lines.length > 1 ? (
                        <div className="flex items-center justify-between gap-2">
                          <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground md:text-xs md:uppercase md:tracking-wide">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full md:hidden"
                              style={{ backgroundColor: color }}
                            />
                            Finance {idx + 1}
                            {line.name.trim() ? (
                              <span className="normal-case tracking-normal text-foreground">
                                · {line.name.trim()}
                              </span>
                            ) : null}
                          </p>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 text-destructive hover:text-destructive"
                            onClick={() => removeLine(line.clientKey)}
                          >
                            <Trash2 className="h-4 w-4" />
                            Remove
                          </Button>
                        </div>
                      ) : null}

                      <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))] md:items-end">
                        <div className="space-y-2">
                          <Label className="flex items-center gap-1.5">
                            {lines.length === 1 ? (
                              <span
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{ backgroundColor: color }}
                              />
                            ) : null}
                            Name
                          </Label>
                          <Input
                            value={line.name}
                            onChange={(e) => updateLine(line.clientKey, { name: e.target.value })}
                            placeholder="e.g. CUDMC"
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Budget (₱)</Label>
                          <MoneyInput
                            value={line.capital_required}
                            onValueChange={(v) => updateLine(line.clientKey, { capital_required: v })}
                            placeholder="0.00"
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Profit (₱)</Label>
                          <MoneyInput
                            value={line.expected_profit}
                            onValueChange={(v) => updateLine(line.clientKey, { expected_profit: v })}
                            placeholder="0.00"
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Duration</Label>
                          <Input
                            type="number"
                            min={1}
                            value={line.duration_days}
                            onChange={(e) => updateLine(line.clientKey, { duration_days: e.target.value })}
                            placeholder="30"
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>End date</Label>
                          <Input value={endDate ?? '—'} readOnly className="bg-muted/40" />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <Button type="button" variant="outline" className="gap-1" onClick={addLine}>
                <Plus className="h-4 w-4" />
                Add finance
              </Button>
            </div>

            <div className="space-y-6 border-t pt-6">
              <div className="space-y-2">
                <Label htmlFor="batch_notes">Notes</Label>
                <p className="text-xs text-muted-foreground">
                  Optional context for this {lines.length > 1 ? 'batch' : 'finance'}.
                </p>
                <Textarea
                  id="batch_notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={lines.length > 1 ? 'Optional notes for this batch' : 'Optional notes'}
                  rows={3}
                  className="max-w-3xl resize-y"
                />
              </div>

              <div className="space-y-3">
                <div>
                  <Label htmlFor="batch_financier_invite">Financiers to invite</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Selected financiers are invited to every finance{lines.length > 1 ? ' in this batch' : ''}.
                  </p>
                </div>
                <div className="flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
                  <Select
                    value={inviteMode}
                    onValueChange={(v) => setInviteMode(v as FinancierInviteMode)}
                  >
                    <SelectTrigger id="batch_financier_invite" className="w-full sm:max-w-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All active financiers</SelectItem>
                      <SelectItem value="selected">Selected financiers only</SelectItem>
                    </SelectContent>
                  </Select>
                  {inviteMode === 'all' ? (
                    <p className="text-sm text-muted-foreground sm:pt-2">
                      {financiersLoading
                        ? 'Loading financiers…'
                        : `${financiers.length} active financier${financiers.length === 1 ? '' : 's'} will be invited.`}
                    </p>
                  ) : null}
                </div>
                {inviteMode === 'selected' ? (
                  financiersLoading ? (
                    <Skeleton className="h-32 max-w-3xl w-full" />
                  ) : financiers.length === 0 ? (
                    <p className="max-w-3xl rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
                      No active financiers available.
                    </p>
                  ) : (
                    <div className="max-h-48 max-w-3xl space-y-1 overflow-y-auto overscroll-contain rounded-lg border bg-muted/20 p-2">
                      {financiers.map((f) => {
                        const checked = selectedFinancierIds.includes(f.id)
                        return (
                          <label
                            key={f.id}
                            className={cn(
                              'flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                              checked ? 'bg-background shadow-sm' : 'hover:bg-background/60',
                            )}
                          >
                            <input
                              type="checkbox"
                              className="size-4 shrink-0"
                              checked={checked}
                              onChange={() => toggleFinancier(f.id)}
                            />
                            <span>
                              {f.full_name}{' '}
                              <span className="text-muted-foreground">@{f.username}</span>
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  )
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap gap-3 border-t pt-6">
              <Button type="submit" disabled={saving}>
                {saving ? 'Creating…' : lines.length > 1 ? 'Create batch' : 'Create finance'}
              </Button>
              <Button type="button" variant="outline" disabled={saving} onClick={() => navigate('/admin/finance')}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  )
}

export function AdminFinanceGroupDetailPage() {
  const { groupId } = useParams()
  const navigate = useNavigate()
  const [financingDate, setFinancingDate] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<FinanceLineDraft[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!groupId) return
    let cancelled = false
    void (async () => {
      setLoading(true)
      const { data, error } = await supabase.rpc('get_finance_group_summary', { p_group_id: groupId })
      if (cancelled) return
      if (error) {
        toast.error(error.message)
        setLines([])
        setLoading(false)
        return
      }
      const summary = data as FinanceGroupSummary
      setFinancingDate(summary.financing_date)
      setNotes(summary.notes ?? '')
      setLines(
        (summary.lines ?? []).map((line) => ({
          clientKey: line.project_id,
          projectId: line.project_id,
          name: line.name,
          capital_required: moneyInputFromValue(line.capital_required),
          expected_profit: moneyInputFromValue(line.expected_profit),
          duration_days: String(line.duration_days),
        })),
      )
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [groupId])

  const totals = useMemo(
    () => ({
      budget: sumGroupBudget(lines.map((l) => ({ capitalRequired: l.capital_required }))),
      profit: sumGroupProfit(lines.map((l) => ({ expectedProfit: l.expected_profit }))),
    }),
    [lines],
  )

  const budgetSlices = useMemo(
    () =>
      lines
        .map((line, idx) => ({
          key: line.clientKey,
          name: line.name.trim() || `Finance ${idx + 1}`,
          value: toNumber(line.capital_required),
          color: FINANCIER_COLORS[idx % FINANCIER_COLORS.length],
        }))
        .filter((slice) => slice.value > 0),
    [lines],
  )

  function lineColor(idx: number) {
    return FINANCIER_COLORS[idx % FINANCIER_COLORS.length]
  }

  function updateLine(clientKey: string, patch: Partial<FinanceLineDraft>) {
    setLines((prev) => prev.map((l) => (l.clientKey === clientKey ? { ...l, ...patch } : l)))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!groupId) return

    if (!financingDate) {
      toast.error('Financing date is required')
      return
    }
    if (lines.length < 2) {
      toast.error('This page is for finance batches with two or more lines')
      return
    }
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]
      if (!l.projectId) {
        toast.error(`Finance ${i + 1} is missing a project reference`)
        return
      }
      if (!l.name.trim()) {
        toast.error(`Finance ${i + 1} needs a name`)
        return
      }
      if (toNumber(l.capital_required) <= 0) {
        toast.error(`Finance ${i + 1} needs a positive budget`)
        return
      }
      if (toNumber(l.expected_profit) < 0) {
        toast.error(`Finance ${i + 1} profit cannot be negative`)
        return
      }
      if (Number(l.duration_days) < 1) {
        toast.error(`Finance ${i + 1} needs a positive duration`)
        return
      }
    }

    const firstName = lines[0]?.name.trim() ?? 'Finance batch'
    const groupName = lines.length === 1 ? firstName : `${firstName} +${lines.length - 1}`
    const notesValue = notes.trim() || null

    setSaving(true)
    try {
      const groupRes = await supabase
        .from('finance_groups')
        .update({
          name: groupName,
          financing_date: financingDate,
          notes: notesValue,
        })
        .eq('id', groupId)

      if (groupRes.error) {
        toast.error(groupRes.error.message)
        return
      }

      const updates = lines.map((l) =>
        supabase
          .from('projects')
          .update({
            name: l.name.trim(),
            financing_date: financingDate,
            duration_days: Number(l.duration_days),
            capital_required: toNumber(l.capital_required),
            expected_profit: toNumber(l.expected_profit),
            calculated_expected_release: computeEndDate(financingDate, Number(l.duration_days)),
            notes: notesValue,
          })
          .eq('id', l.projectId!),
      )

      const results = await Promise.all(updates)
      const failed = results.find((r) => r.error)
      if (failed?.error) {
        toast.error(failed.error.message)
        return
      }

      toast.success('Finance batch updated')
      navigate('/admin/finance')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update batch')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Skeleton className="h-64 w-full" />
  if (lines.length === 0) return <EmptyState title="Batch not found" />

  return (
    <div>
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2 gap-1 text-muted-foreground">
          <Link to="/admin/finance">
            <ArrowLeft className="h-4 w-4" />
            All finance
          </Link>
        </Button>
        <PageHeader
          title="Edit finance batch"
          description="Update each finance in this group — shared start date, budget, profit, and duration per line."
        />
      </div>

      <form onSubmit={(e) => void handleSubmit(e)}>
        <Card>
          <CardContent className="space-y-8 pt-6">
            <div className="grid gap-4 lg:grid-cols-[14rem_1fr] lg:items-start lg:gap-8">
              <div className="space-y-2">
                <Label htmlFor="edit_batch_financing_date">Financing date (shared)</Label>
                <Input
                  id="edit_batch_financing_date"
                  type="date"
                  value={financingDate}
                  onChange={(e) => setFinancingDate(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-3 lg:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] lg:items-start lg:justify-end lg:gap-4">
                <div className="grid grid-cols-2 gap-3 sm:max-w-md lg:max-w-none">
                  <div className="rounded-lg bg-muted/40 px-3 py-2.5">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Total budget
                    </p>
                    <p className="mt-0.5 text-base font-semibold tabular-nums">{formatPhp(totals.budget)}</p>
                  </div>
                  <div className="rounded-lg bg-muted/40 px-3 py-2.5">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Total profit
                    </p>
                    <p className="mt-0.5 text-base font-semibold tabular-nums">{formatPhp(totals.profit)}</p>
                  </div>
                </div>
                <FinanceBudgetPieChart
                  slices={budgetSlices}
                  total={totals.budget}
                  className="w-full lg:min-w-[16rem]"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold">Finances in this group</p>
                <p className="text-xs text-muted-foreground">
                  Edit the name, budget, profit, and duration for each finance in the batch.
                </p>
              </div>

              <div className="max-h-[min(65vh,28rem)] divide-y overflow-y-auto overscroll-contain rounded-xl border sm:max-h-[min(70vh,36rem)]">
                {lines.map((line, idx) => {
                  const endDate = computeEndDate(financingDate, Number(line.duration_days) || 0)
                  const color = lineColor(idx)
                  return (
                    <div
                      key={line.clientKey}
                      className="space-y-3 border-l-4 p-4 pl-3"
                      style={{ borderLeftColor: color }}
                    >
                      <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground md:text-xs md:uppercase md:tracking-wide">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full md:hidden"
                          style={{ backgroundColor: color }}
                        />
                        Finance {idx + 1}
                        {line.name.trim() ? (
                          <span className="normal-case tracking-normal text-foreground">
                            · {line.name.trim()}
                          </span>
                        ) : null}
                      </p>

                      <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))] md:items-end">
                        <div className="space-y-2">
                          <Label>Name</Label>
                          <Input
                            value={line.name}
                            onChange={(e) => updateLine(line.clientKey, { name: e.target.value })}
                            placeholder="e.g. CUDMC"
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Budget (₱)</Label>
                          <MoneyInput
                            value={line.capital_required}
                            onValueChange={(v) => updateLine(line.clientKey, { capital_required: v })}
                            placeholder="0.00"
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Profit (₱)</Label>
                          <MoneyInput
                            value={line.expected_profit}
                            onValueChange={(v) => updateLine(line.clientKey, { expected_profit: v })}
                            placeholder="0.00"
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Duration</Label>
                          <Input
                            type="number"
                            min={1}
                            value={line.duration_days}
                            onChange={(e) => updateLine(line.clientKey, { duration_days: e.target.value })}
                            placeholder="30"
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>End date</Label>
                          <Input value={endDate ?? '—'} readOnly className="bg-muted/40" />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="space-y-2 border-t pt-6">
              <Label htmlFor="edit_batch_notes">Notes</Label>
              <p className="text-xs text-muted-foreground">Optional context for this batch.</p>
              <Textarea
                id="edit_batch_notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes for this batch"
                rows={3}
                className="max-w-3xl resize-y"
              />
            </div>

            <div className="flex flex-wrap gap-3 border-t pt-6">
              <Button type="submit" disabled={saving}>
                {saving ? 'Updating…' : 'Update'}
              </Button>
              <Button type="button" variant="outline" disabled={saving} onClick={() => navigate('/admin/finance')}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  )
}
