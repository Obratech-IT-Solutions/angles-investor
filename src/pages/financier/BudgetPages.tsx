import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, CheckSquare, Plus, Trash2, Wallet } from 'lucide-react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { PageHeader, EmptyState } from '@/components/shared/PageBits'
import { ListPagination, paginateRows } from '@/components/shared/ListPagination'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/contexts/AuthContext'
import { calculateBudgetSummary, computeProfitSplits, distributeProportionalAmounts, redistributeProfitSplits, splitAmountAcrossShares, type ProfitSplitParty } from '@/lib/budget'
import {
  dissolveBudgetPool,
  distributeBudgetsAcrossProjects,
  emptyLenderDraft,
  lendersToDrafts,
  loadBudgetForProject,
  resetBudgetsToSoloDefault,
  upsertBudgetWithLenders,
  type LenderDraft,
} from '@/lib/budget-api'
import { FinancierColorDot, FundingProgressBar, FundingProgressLegend } from '@/components/finance/FundingProgressBar'
import { MoneyInput } from '@/components/ui/money-input'
import {
  FINANCIER_COLORS,
  financingDateChipColors,
  formatFinancingDateChip,
  budgetPoolBorderColors,
  budgetPoolColorIndexFromId,
  budgetPoolLeftBorderColors,
  budgetPoolRingColors,
} from '@/lib/financierColors'
import { budgetBasedProfitShare, formatMoneyInput, formatPhp, moneyInputFromValue, toNumber } from '@/lib/money'
import { projectStatusClassName, projectStatusVariant } from '@/lib/status'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import {
  PROJECT_STATUS_LABELS,
  type FinancierProjectBudget,
  type Project,
  type ProjectFinancier,
} from '@/types'

const BUDGET_LIST_PAGE_SIZE = 8

const PIE_GAP_COLOR = '#cbd5e1'

function lenderAmountInputValue(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return ''
  if (value === 0 || value === '0') return ''
  return formatMoneyInput(String(value).replace(/,/g, ''))
}

function profitInputFromAmount(amount: number): string {
  return amount > 0 ? moneyInputFromValue(amount) : ''
}

function buildPoolProfitParties(
  ownCapital: string | number,
  chipIns: LenderDraft[],
  locks: Set<string>,
): ProfitSplitParty[] {
  return [
    {
      key: 'own',
      capital: toNumber(ownCapital),
      locked: locks.has('own'),
      profit: undefined,
    },
    ...chipIns.map((l) => ({
      key: l.clientKey,
      capital: toNumber(l.borrowed_amount),
      locked: locks.has(l.clientKey),
      profit: l.promise_value,
    })),
  ]
}

function applyDetailProfitSplits(
  parts: Map<string, number>,
  totalPool: number,
  setManualProfit: (value: string) => void,
  setLenders: Dispatch<SetStateAction<LenderDraft[]>>,
  preservePoolInput?: string,
) {
  setManualProfit(preservePoolInput ?? profitInputFromAmount(totalPool))
  setLenders((prev) => {
    let changed = false
    const next = prev.map((l) => {
      const profit = parts.get(l.clientKey) ?? 0
      const nextVal = profitInputFromAmount(profit)
      if (String(l.promise_value ?? '') === nextVal && l.promise_type === 'fixed_profit') return l
      changed = true
      return { ...l, promise_value: nextVal, promise_type: 'fixed_profit' as const }
    })
    return changed ? next : prev
  })
}

function buildDetailProfitParties(
  ownCapital: string | number,
  lenders: LenderDraft[],
  locks: Set<string>,
): ProfitSplitParty[] {
  return [
    { key: 'own', capital: toNumber(ownCapital), locked: locks.has('own') },
    ...lenders.map((l) => ({
      key: l.clientKey,
      capital: toNumber(l.borrowed_amount),
      locked: locks.has(l.clientKey),
      profit: l.promise_value,
    })),
  ]
}

function applyPoolProfitSplits(
  parts: Map<string, number>,
  setTotalProfit: (value: string) => void,
  setPoolChipIns: Dispatch<SetStateAction<LenderDraft[]>>,
  preserveOwnInput?: string,
) {
  const own = parts.get('own') ?? 0
  setTotalProfit(preserveOwnInput ?? profitInputFromAmount(own))
  setPoolChipIns((prev) => {
    let changed = false
    const next = prev.map((l) => {
      const profit = parts.get(l.clientKey) ?? 0
      const nextVal = profitInputFromAmount(profit)
      if (String(l.promise_value ?? '') === nextVal) return l
      changed = true
      return { ...l, promise_value: nextVal }
    })
    return changed ? next : prev
  })
}

type PieSlice = { name: string; value: number; key: string; color?: string }

function BudgetPieSplit({
  title,
  data,
  emptyMessage,
}: {
  title: string
  data: PieSlice[]
  emptyMessage: string
}) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:mb-2 sm:text-xs">
        {title}
      </p>
      {data.length === 0 ? (
        <p className="flex h-16 items-center justify-center px-1 text-center text-[10px] leading-snug text-muted-foreground sm:h-24 sm:px-2 sm:text-xs md:h-32 md:text-sm">
          {emptyMessage}
        </p>
      ) : (
        <div className="flex items-center gap-1.5 sm:gap-3">
          <ul className="min-w-0 flex-1 space-y-0.5 text-[10px] sm:space-y-1 sm:text-xs md:text-sm">
            {data.map((entry, i) => {
              const color = entry.color ?? FINANCIER_COLORS[i % FINANCIER_COLORS.length]
              return (
              <li key={entry.key} className="flex items-center justify-between gap-1">
                <span className="flex min-w-0 items-center gap-1 sm:gap-1.5">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full sm:h-2 sm:w-2"
                    style={{ backgroundColor: color }}
                  />
                  <span className="truncate">{entry.name}</span>
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{formatPhp(entry.value)}</span>
              </li>
              )
            })}
          </ul>
          <div className="h-16 w-16 shrink-0 sm:h-24 sm:w-24 md:h-32 md:w-32">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="52%"
                  outerRadius="88%"
                  paddingAngle={data.length > 1 ? 2 : 0}
                >
                  {data.map((entry, i) => (
                    <Cell
                      key={entry.key}
                      fill={entry.color ?? FINANCIER_COLORS[i % FINANCIER_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatPhp(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}

type BudgetListRow = {
  projectId: string
  projectName: string
  status: Project['status']
  financingDate: string | null
  durationDays: number
  capitalRequired: number
  projectExpectedProfit: number
  myConfirmed: number
  expectedProfitShare: number
  ownCapital: number | null
  totalBorrowed: number | null
  manualProfit: number | null
  hasBudget: boolean
  poolId: string | null
  poolColorIndex: number | null
  chipIns: Array<{ name: string; amount: number; profit: number }>
}

function BudgetRowStatsTable({
  row,
  profit,
  compactDuration,
}: {
  row: BudgetListRow
  profit: number
  compactDuration?: boolean
}) {
  const total = row.myConfirmed + profit
  const duration =
    row.durationDays > 0 ? `${row.durationDays}${compactDuration ? 'd' : ' days'}` : '—'

  const th =
    'border border-border/50 bg-muted/40 px-1.5 py-1 text-center text-[9px] font-medium uppercase tracking-wide text-muted-foreground sm:text-[10px]'
  const td =
    'border border-border/50 px-1.5 py-1.5 text-center text-[11px] font-medium tabular-nums text-foreground sm:text-xs'

  return (
    <div className="space-y-1.5">
      <table className="w-full table-fixed border-collapse">
        <thead>
          <tr>
            <th className={th}>Needed</th>
            <th className={th}>Fin. profit</th>
            <th className={th}>Duration</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className={td}>{formatPhp(row.capitalRequired)}</td>
            <td className={td}>{formatPhp(row.projectExpectedProfit)}</td>
            <td className={td}>{duration}</td>
          </tr>
        </tbody>
      </table>
      <table className="w-full table-fixed border-collapse">
        <thead>
          <tr>
            <th className={th}>Budget</th>
            <th className={th}>Profit</th>
            <th className={th}>Total</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className={td}>{formatPhp(row.myConfirmed)}</td>
            <td className={td}>{formatPhp(profit)}</td>
            <td className={td}>{formatPhp(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

export function FinancierBudgetListPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [rows, setRows] = useState<BudgetListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [allocateOpen, setAllocateOpen] = useState(false)
  const [draftSelectedIds, setDraftSelectedIds] = useState<string[]>([])
  const [pickerQ, setPickerQ] = useState('')
  const [totalOwn, setTotalOwn] = useState('')
  const [totalProfit, setTotalProfit] = useState('')
  const [poolChipIns, setPoolChipIns] = useState<LenderDraft[]>([])
  const [distributing, setDistributing] = useState(false)
  const profitLocksRef = useRef<Set<string>>(new Set())
  const chipInListRef = useRef<HTMLDivElement | null>(null)

  const loadRows = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    const [pfRes, budgetRes, poolsRes] = await Promise.all([
      supabase
        .from('project_financiers')
        .select(
          'project_id, confirmed_amount, commitment_status, projects:project_id(id, name, status, capital_required, expected_profit, financing_date, duration_days)',
        )
        .eq('financier_id', profile.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('financier_project_budgets')
        .select(
          'project_id, own_capital, manual_profit, pool_id, financier_project_lenders(lender_name, borrowed_amount, promise_value), financier_budget_pools(id, color_index)',
        )
        .eq('financier_id', profile.id),
      supabase
        .from('financier_budget_pools')
        .select('id, color_index')
        .eq('financier_id', profile.id),
    ])

    if (pfRes.error) toast.error(pfRes.error.message)
    if (budgetRes.error) toast.error(budgetRes.error.message)
    if (poolsRes.error) toast.error(poolsRes.error.message)

    const pfRows =
      (pfRes.data as unknown as Array<{
        project_id: string
        confirmed_amount: number | string | null
        projects: Pick<
          Project,
          'id' | 'name' | 'status' | 'capital_required' | 'expected_profit' | 'financing_date' | 'duration_days'
        > | null
      }>) ?? []

    const poolColorById = new Map<string, number>()
    for (const p of (poolsRes.data as { id: string; color_index: number }[] | null) ?? []) {
      poolColorById.set(p.id, p.color_index)
    }

    const budgetByProject = new Map<
      string,
      {
        own: number
        borrowed: number
        manualProfit: number | null
        poolId: string | null
        poolColorIndex: number | null
        chipIns: Array<{ name: string; amount: number; profit: number }>
      }
    >()
    for (const b of (budgetRes.data as unknown as FinancierProjectBudget[]) ?? []) {
      const lenders = b.financier_project_lenders ?? []
      const borrowed = lenders.reduce((s, l) => s + toNumber(l.borrowed_amount), 0)
      const manual =
        b.manual_profit === null || b.manual_profit === undefined ? null : toNumber(b.manual_profit)
      const poolId = b.pool_id ?? null
      const pool = b.financier_budget_pools
      const poolColorIndex =
        poolId == null
          ? null
          : (pool?.color_index ??
            poolColorById.get(poolId) ??
            budgetPoolColorIndexFromId(poolId))
      const chipIns = lenders
        .map((l) => ({
          name: (l.lender_name ?? '').trim() || 'Chip-in',
          amount: toNumber(l.borrowed_amount),
          profit: toNumber(l.promise_value),
        }))
        .filter((c) => c.amount > 0 || c.profit > 0)
      budgetByProject.set(b.project_id, {
        own: toNumber(b.own_capital),
        borrowed,
        manualProfit: manual,
        poolId,
        poolColorIndex,
        chipIns,
      })
    }

    const list: BudgetListRow[] = pfRows
      .filter((r) => r.projects)
      .map((r) => {
        const budget = budgetByProject.get(r.project_id)
        const myConfirmed = toNumber(r.confirmed_amount)
        const capitalRequired = toNumber(r.projects!.capital_required)
        const projectExpectedProfit = toNumber(r.projects!.expected_profit)
        const expected = budgetBasedProfitShare(myConfirmed, capitalRequired, projectExpectedProfit)
        return {
          projectId: r.project_id,
          projectName: r.projects!.name,
          status: r.projects!.status,
          financingDate: r.projects!.financing_date ?? null,
          durationDays: r.projects!.duration_days ?? 0,
          capitalRequired,
          projectExpectedProfit,
          myConfirmed,
          expectedProfitShare: expected,
          ownCapital: budget ? budget.own : null,
          totalBorrowed: budget ? budget.borrowed : null,
          manualProfit: budget ? budget.manualProfit : null,
          hasBudget: Boolean(budget),
          poolId: budget?.poolId ?? null,
          poolColorIndex: budget?.poolColorIndex ?? null,
          chipIns: budget?.chipIns ?? [],
        }
      })

    setRows(list)
    setSelectedIds((prev) => prev.filter((id) => list.some((r) => r.projectId === id)))
    setLoading(false)
  }, [profile])

  useEffect(() => {
    void loadRows()
  }, [loadRows])

  useEffect(() => {
    setPage(1)
  }, [q])

  const filtered = useMemo(
    () => rows.filter((r) => !q || r.projectName.toLowerCase().includes(q.toLowerCase())),
    [rows, q],
  )
  const paged = useMemo(() => paginateRows(filtered, page, BUDGET_LIST_PAGE_SIZE), [filtered, page])

  const selectedRows = useMemo(
    () => rows.filter((r) => selectedIds.includes(r.projectId)),
    [rows, selectedIds],
  )

  const pickerRows = useMemo(
    () =>
      rows.filter(
        (r) =>
          !pickerQ ||
          r.projectName.toLowerCase().includes(pickerQ.toLowerCase()) ||
          (r.financingDate ?? '').includes(pickerQ),
      ),
    [rows, pickerQ],
  )

  const selectedTotalCost = useMemo(
    () => selectedRows.reduce((s, r) => s + r.myConfirmed, 0),
    [selectedRows],
  )
  const selectedExpectedProfit = useMemo(
    () => selectedRows.reduce((s, r) => s + r.expectedProfitShare, 0),
    [selectedRows],
  )
  const totalBorrowed = useMemo(
    () => poolChipIns.reduce((s, l) => s + toNumber(l.borrowed_amount), 0),
    [poolChipIns],
  )
  const totalChipInProfit = useMemo(
    () => poolChipIns.reduce((s, l) => s + toNumber(l.promise_value), 0),
    [poolChipIns],
  )
  /** Pool ceiling = this financier's confirmed budget across selected finances (not full finance capital). */
  const poolBudgetMax = selectedTotalCost
  /** Max profit for the pool = this financier's expected profit share across selected finances. */
  const poolProfitMax = selectedExpectedProfit
  const chipInGap = useMemo(
    () => Math.max(0, poolBudgetMax - toNumber(totalOwn) - totalBorrowed),
    [poolBudgetMax, totalOwn, totalBorrowed],
  )
  const allocateOverBudget = useMemo(
    () => Math.max(0, toNumber(totalOwn) + totalBorrowed - poolBudgetMax),
    [totalOwn, totalBorrowed, poolBudgetMax],
  )
  const allocateOverProfit = useMemo(
    () => Math.max(0, toNumber(totalProfit) + totalChipInProfit - poolProfitMax),
    [totalProfit, totalChipInProfit, poolProfitMax],
  )
  const allocateExceedsMax = allocateOverBudget > 0 && poolBudgetMax > 0
  const allocateExceedsProfitMax = allocateOverProfit > 0 && poolProfitMax > 0
  const allocateProfitShortfall = useMemo(
    () => Math.max(0, poolProfitMax - toNumber(totalProfit) - totalChipInProfit),
    [poolProfitMax, totalProfit, totalChipInProfit],
  )
  const allocateProfitKulang = allocateProfitShortfall > 0.05 && poolProfitMax > 0
  const allocateOverRef = useRef(false)
  const allocateProfitOverRef = useRef(false)
  const allocateProfitKulangRef = useRef(false)
  const capitalSigRef = useRef('')
  const keepLoadedProfitsRef = useRef(false)

  const capitalSignature = useMemo(
    () =>
      `${totalOwn}|${poolChipIns.map((l) => `${l.clientKey}:${String(l.borrowed_amount)}`).join('|')}`,
    [totalOwn, poolChipIns],
  )

  useEffect(() => {
    if (allocateExceedsMax && !allocateOverRef.current) {
      toast.error(
        `Max is ${formatPhp(poolBudgetMax)}. Own + chip-in cannot exceed your confirmed budget.`,
      )
    }
    allocateOverRef.current = allocateExceedsMax
  }, [allocateExceedsMax, poolBudgetMax])

  useEffect(() => {
    if (allocateExceedsProfitMax && !allocateProfitOverRef.current) {
      toast.error(
        `Sobra / max profit is ${formatPhp(poolProfitMax)}. Your profit + chip-in profits cannot exceed this.`,
      )
    }
    allocateProfitOverRef.current = allocateExceedsProfitMax
  }, [allocateExceedsProfitMax, poolProfitMax])

  useEffect(() => {
    if (allocateProfitKulang && !allocateProfitKulangRef.current && !allocateExceedsProfitMax) {
      toast.error(
        `Kulang by ${formatPhp(allocateProfitShortfall)}. Total profit must equal ${formatPhp(poolProfitMax)}.`,
      )
    }
    allocateProfitKulangRef.current = allocateProfitKulang
  }, [allocateProfitKulang, allocateProfitShortfall, poolProfitMax, allocateExceedsProfitMax])

  /** Default profit = same % of pool profit as each person's budget is of the pool budget max. */
  useEffect(() => {
    if (selectedRows.length === 0) return

    const capitalChanged = capitalSignature !== capitalSigRef.current
    if (capitalChanged) {
      capitalSigRef.current = capitalSignature
      if (keepLoadedProfitsRef.current) {
        keepLoadedProfitsRef.current = false
        return
      }
      profitLocksRef.current = new Set()
    } else if (profitLocksRef.current.size > 0) {
      return
    }

    if (poolProfitMax <= 0) {
      setTotalProfit((prev) => (prev === '' ? prev : ''))
      setPoolChipIns((prev) => {
        if (prev.every((l) => !l.promise_value)) return prev
        return prev.map((l) => ({ ...l, promise_value: '' }))
      })
      return
    }

    const parts = computeProfitSplits({
      totalProfitPool: poolProfitMax,
      capitalBase: poolBudgetMax > 0 ? poolBudgetMax : undefined,
      parties: buildPoolProfitParties(totalOwn, poolChipIns, profitLocksRef.current),
    })

    applyPoolProfitSplits(parts, setTotalProfit, setPoolChipIns)
  }, [
    selectedRows.length,
    poolProfitMax,
    poolBudgetMax,
    capitalSignature,
    totalOwn,
    poolChipIns,
  ])

  const distributionPreview = useMemo(() => {
    if (selectedRows.length === 0) return []
    return distributeProportionalAmounts({
      targets: selectedRows.map((r) => ({
        projectId: r.projectId,
        projectName: r.projectName,
        // Split by this financier's confirmed budget per finance (login scope).
        weight: r.myConfirmed,
      })),
      totalOwn: toNumber(totalOwn),
      totalBorrowed,
      totalProfit: toNumber(totalProfit),
    })
  }, [selectedRows, totalOwn, totalBorrowed, totalProfit])

  const financeColorById = useMemo(() => {
    const map = new Map<string, string>()
    selectedRows.forEach((r, i) => {
      map.set(r.projectId, FINANCIER_COLORS[i % FINANCIER_COLORS.length])
    })
    return map
  }, [selectedRows])

  /** Capital mix by finance — same colors as the pooling budget bar / table. */
  const allocateCapitalPieData = useMemo(() => {
    const slices: PieSlice[] = []
    for (const s of distributionPreview) {
      const amount = s.ownCapital + s.borrowed
      if (amount <= 0) continue
      slices.push({
        name: s.projectName,
        value: amount,
        key: s.projectId,
        color: financeColorById.get(s.projectId) ?? FINANCIER_COLORS[0],
      })
    }
    if (chipInGap > 0) {
      slices.push({ name: 'Still needed', value: chipInGap, key: 'gap', color: PIE_GAP_COLOR })
    }
    return slices
  }, [distributionPreview, financeColorById, chipInGap])

  /** Profit mix by finance — same finance color coding. */
  const allocateProfitPieData = useMemo(() => {
    const slices: PieSlice[] = []
    for (const s of distributionPreview) {
      if (s.profit <= 0) continue
      slices.push({
        name: s.projectName,
        value: s.profit,
        key: `profit-${s.projectId}`,
        color: financeColorById.get(s.projectId) ?? FINANCIER_COLORS[0],
      })
    }
    const allocated = slices.reduce((sum, s) => sum + s.value, 0)
    const unallocated = Math.max(0, poolProfitMax - allocated)
    if (unallocated > 0.05) {
      slices.push({
        name: 'Unallocated',
        value: unallocated,
        key: 'profit-gap',
        color: PIE_GAP_COLOR,
      })
    }
    return slices
  }, [distributionPreview, financeColorById, poolProfitMax])

  const poolPutSegments = useMemo(
    () =>
      distributionPreview.map((s) => ({
        id: s.projectId,
        label: s.projectName,
        amount: s.ownCapital + s.borrowed,
        color: financeColorById.get(s.projectId) ?? FINANCIER_COLORS[0],
      })),
    [distributionPreview, financeColorById],
  )

  const poolPutTotal = useMemo(
    () => poolPutSegments.reduce((s, seg) => s + seg.amount, 0),
    [poolPutSegments],
  )

  /** Per-finance people: You + each chip-in, with capital and profit split for the table. */
  const peopleBreakdownByFinance = useMemo(() => {
    const map = new Map<string, Array<{ name: string; capital: number; profit: number }>>()
    for (const s of distributionPreview) map.set(s.projectId, [])
    if (distributionPreview.length === 0) return map

    const yourProfitParts = splitAmountAcrossShares(toNumber(totalProfit), distributionPreview)
    for (const s of distributionPreview) {
      const yourProfit = yourProfitParts.get(s.projectId) ?? 0
      if (s.ownCapital > 0 || yourProfit > 0) {
        const list = map.get(s.projectId) ?? []
        list.push({ name: 'You', capital: s.ownCapital, profit: yourProfit })
        map.set(s.projectId, list)
      }
    }

    for (const chip of poolChipIns) {
      const name = chip.lender_name.trim() || 'Chip-in'
      const capitalParts = splitAmountAcrossShares(toNumber(chip.borrowed_amount), distributionPreview)
      const profitParts = splitAmountAcrossShares(toNumber(chip.promise_value), distributionPreview)
      for (const s of distributionPreview) {
        const capital = capitalParts.get(s.projectId) ?? 0
        const profit = profitParts.get(s.projectId) ?? 0
        if (capital <= 0 && profit <= 0) continue
        const list = map.get(s.projectId) ?? []
        list.push({ name, capital, profit })
        map.set(s.projectId, list)
      }
    }
    return map
  }, [poolChipIns, distributionPreview, totalProfit])

  const poolProfitSegments = useMemo(() => {
    const segs: Array<{ id: string; label: string; amount: number; color: string }> = []
    const yours = toNumber(totalProfit)
    if (yours > 0) {
      segs.push({ id: 'you-profit', label: 'You', amount: yours, color: FINANCIER_COLORS[0] })
    }
    poolChipIns.forEach((l, i) => {
      const profit = toNumber(l.promise_value)
      if (profit <= 0) return
      segs.push({
        id: `profit-${l.clientKey}`,
        label: l.lender_name.trim() || `Chip-in ${i + 1}`,
        amount: profit,
        color: FINANCIER_COLORS[(i + 1) % FINANCIER_COLORS.length],
      })
    })
    return segs
  }, [totalProfit, poolChipIns])

  const poolProfitTotal = useMemo(
    () => poolProfitSegments.reduce((s, seg) => s + seg.amount, 0),
    [poolProfitSegments],
  )

  function updatePoolChipIn(clientKey: string, patch: Partial<LenderDraft>) {
    if (patch.borrowed_amount !== undefined) {
      profitLocksRef.current = new Set()
      setPoolChipIns((prev) => prev.map((l) => (l.clientKey === clientKey ? { ...l, ...patch } : l)))
      return
    }
    if (patch.promise_value !== undefined && poolProfitMax > 0) {
      profitLocksRef.current = new Set([clientKey])
      const parts = redistributeProfitSplits({
        totalProfitPool: poolProfitMax,
        capitalBase: poolBudgetMax > 0 ? poolBudgetMax : undefined,
        parties: buildPoolProfitParties(totalOwn, poolChipIns, new Set()),
        editedKey: clientKey,
        editedProfit: toNumber(patch.promise_value),
      })
      setPoolChipIns((prev) =>
        prev.map((l) => {
          if (l.clientKey === clientKey) return { ...l, ...patch }
          const profit = parts.get(l.clientKey) ?? 0
          return { ...l, promise_value: profitInputFromAmount(profit) }
        }),
      )
      const own = parts.get('own') ?? 0
      setTotalProfit(profitInputFromAmount(own))
      return
    }
    setPoolChipIns((prev) => prev.map((l) => (l.clientKey === clientKey ? { ...l, ...patch } : l)))
  }

  function removePoolChipIn(clientKey: string) {
    setPoolChipIns((prev) => prev.filter((l) => l.clientKey !== clientKey))
  }

  function addPoolChipIn() {
    setPoolChipIns((prev) => [emptyLenderDraft(prev.length), ...prev])
    requestAnimationFrame(() => {
      chipInListRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    })
  }

  function setOwnAmount(value: string) {
    profitLocksRef.current = new Set()
    setTotalOwn(value)
  }

  function setYourProfit(value: string) {
    if (poolProfitMax <= 0) {
      setTotalProfit(value)
      return
    }
    profitLocksRef.current = new Set(['own'])
    const parts = redistributeProfitSplits({
      totalProfitPool: poolProfitMax,
      capitalBase: poolBudgetMax > 0 ? poolBudgetMax : undefined,
      parties: buildPoolProfitParties(totalOwn, poolChipIns, new Set()),
      editedKey: 'own',
      editedProfit: toNumber(value),
    })
    applyPoolProfitSplits(parts, setTotalProfit, setPoolChipIns, value)
  }

  function openPicker() {
    // If current selection includes a pooled finance, pre-select all mates in that pool.
    let initial = selectedIds
    if (selectedIds.length > 0) {
      const pooled = rows.find((r) => selectedIds.includes(r.projectId) && r.poolId)
      if (pooled?.poolId) {
        const mates = rows.filter((r) => r.poolId === pooled.poolId).map((r) => r.projectId)
        initial = [...new Set([...selectedIds, ...mates])]
      }
    }
    setDraftSelectedIds(initial)
    setPickerQ('')
    setPickerOpen(true)
  }

  function fillOwnProfitFromRows(mates: BudgetListRow[]) {
    const ownSum = mates.reduce((s, r) => s + toNumber(r.ownCapital), 0)
    const profitSum = mates.reduce((s, r) => s + toNumber(r.manualProfit), 0)
    keepLoadedProfitsRef.current = true
    setTotalOwn(ownSum > 0 ? moneyInputFromValue(ownSum) : '')
    setTotalProfit(profitSum > 0 ? moneyInputFromValue(profitSum) : '')
  }

  async function loadPoolChipIns(mates: BudgetListRow[]) {
    if (!profile || mates.length === 0) {
      setPoolChipIns([])
      return
    }
    try {
      const budgets = await Promise.all(
        mates.map((m) => loadBudgetForProject(profile.id, m.projectId)),
      )
      const merged = new Map<string, { name: string; amount: number; profit: number }>()
      for (const b of budgets) {
        for (const l of b?.financier_project_lenders ?? []) {
          const name = l.lender_name.trim()
          if (!name) continue
          const key = name.toLowerCase()
          const cur = merged.get(key) ?? { name, amount: 0, profit: 0 }
          cur.amount += toNumber(l.borrowed_amount)
          cur.profit += toNumber(l.promise_value)
          merged.set(key, cur)
        }
      }
      keepLoadedProfitsRef.current = true
      setPoolChipIns(
        [...merged.values()].map((c, i) => ({
          ...emptyLenderDraft(i),
          lender_name: c.name,
          borrowed_amount: c.amount > 0 ? moneyInputFromValue(c.amount) : '',
          promise_value: c.profit > 0 ? moneyInputFromValue(c.profit) : '',
        })),
      )
    } catch {
      setPoolChipIns([])
    }
  }

  /** Click any pooled finance → open the full multi-finance group in the allocate popup. */
  function openPoolGroup(poolId: string) {
    const mates = rows.filter((r) => r.poolId === poolId)
    if (mates.length === 0) return
    setSelectedIds(mates.map((r) => r.projectId))
    fillOwnProfitFromRows(mates)
    void loadPoolChipIns(mates)
    setAllocateOpen(true)
  }

  function activateBudgetRow(r: BudgetListRow) {
    if (r.poolId) {
      openPoolGroup(r.poolId)
      return
    }
    navigate(`/app/budget/${r.projectId}`)
  }

  /** Fresh multi-allocate: leave own/profit empty so the user fills them in. */
  function clearAllocateAmounts() {
    capitalSigRef.current = ''
    keepLoadedProfitsRef.current = false
    profitLocksRef.current = new Set()
    setPoolChipIns([])
    setTotalOwn('')
    setTotalProfit('')
  }

  function applyDefaultYouOwnAll(_mates?: BudgetListRow[]) {
    clearAllocateAmounts()
  }

  /** Clear pool badge immediately in UI, then persist solo default (you own all). */
  async function ungroupProjectIds(projectIds: string[]) {
    if (!profile || projectIds.length === 0) return
    const toReset = new Set(projectIds)
    for (const poolId of [...new Set(rows.map((r) => r.poolId).filter(Boolean))] as string[]) {
      const mates = rows.filter((r) => r.poolId === poolId)
      const remaining = mates.filter((r) => !toReset.has(r.projectId))
      if (remaining.length > 0 && remaining.length < 2) {
        for (const r of remaining) toReset.add(r.projectId)
      }
    }
    const ids = [...toReset]
    setRows((prev) =>
      prev.map((r) =>
        ids.includes(r.projectId)
          ? {
              ...r,
              poolId: null,
              poolColorIndex: null,
              chipIns: [],
              ownCapital: r.myConfirmed,
              manualProfit: r.expectedProfitShare,
              hasBudget: true,
            }
          : r,
      ),
    )
    setDraftSelectedIds((prev) => prev.filter((id) => !ids.includes(id)))
    setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)))
    try {
      await resetBudgetsToSoloDefault({ financierId: profile.id, projectIds: ids })
      await loadRows()
      toast.success(
        ids.length === 1
          ? 'Ungrouped — Pooled removed; you own all fund and profit'
          : `Ungrouped ${ids.length} finances — Pooled removed`,
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to ungroup')
      await loadRows()
    }
  }

  async function handleDissolvePool(poolId: string, e?: React.MouseEvent) {
    e?.stopPropagation()
    e?.preventDefault()
    if (!profile) return
    const mates = rows.filter((r) => r.poolId === poolId)
    if (mates.length === 0) return
    setRows((prev) =>
      prev.map((r) =>
        r.poolId === poolId
          ? {
              ...r,
              poolId: null,
              poolColorIndex: null,
              chipIns: [],
              ownCapital: r.myConfirmed,
              manualProfit: r.expectedProfitShare,
              hasBudget: true,
            }
          : r,
      ),
    )
    const mateIds = new Set(mates.map((m) => m.projectId))
    setDraftSelectedIds((prev) => prev.filter((id) => !mateIds.has(id)))
    setSelectedIds((prev) => prev.filter((id) => !mateIds.has(id)))
    try {
      await dissolveBudgetPool({ financierId: profile.id, poolId })
      await loadRows()
      clearSelection()
      toast.success('Pool removed — each finance is back to default')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove pool')
      await loadRows()
    }
  }

  function toggleDraftSelected(projectId: string) {
    const row = rows.find((r) => r.projectId === projectId)
    setDraftSelectedIds((prev) => {
      const isSelected = prev.includes(projectId)
      if (isSelected) {
        // Unchecking a pooled finance removes the Pooled badge / group membership now.
        if (row?.poolId) {
          void ungroupProjectIds([projectId])
        }
        return prev.filter((id) => id !== projectId)
      }
      if (row?.poolId) {
        const mates = rows.filter((r) => r.poolId === row.poolId).map((r) => r.projectId)
        return [...new Set([...prev, ...mates])]
      }
      return [...prev, projectId]
    })
  }

  function applyPickerSelection() {
    setSelectedIds(draftSelectedIds)
    setPickerOpen(false)
    const mates = rows.filter((r) => draftSelectedIds.includes(r.projectId))
    if (mates.length === 0) {
      clearSelection()
      return
    }

    const selectedSet = new Set(draftSelectedIds)
    const sharedPoolIds = [...new Set(mates.map((r) => r.poolId).filter(Boolean))] as string[]
    const fullPoolSize =
      sharedPoolIds.length === 1
        ? rows.filter((r) => r.poolId === sharedPoolIds[0]).length
        : 0
    const isCompleteSinglePool =
      sharedPoolIds.length === 1 &&
      mates.every((r) => r.poolId === sharedPoolIds[0]) &&
      mates.length === fullPoolSize

    const orphanIds: string[] = []
    for (const poolId of [...new Set(rows.map((r) => r.poolId).filter(Boolean))] as string[]) {
      const poolMates = rows.filter((r) => r.poolId === poolId)
      const selectedInPool = poolMates.filter((r) => selectedSet.has(r.projectId))
      if (selectedInPool.length === 0 || selectedInPool.length === poolMates.length) continue
      for (const r of poolMates) {
        if (!selectedSet.has(r.projectId)) orphanIds.push(r.projectId)
      }
    }

    if (isCompleteSinglePool) {
      // Multiple select → start blank; user enters amounts. (View pool group still loads saved.)
      clearAllocateAmounts()
    } else {
      applyDefaultYouOwnAll(mates)
    }

    if (orphanIds.length > 0) {
      void ungroupProjectIds(orphanIds)
    }

    setAllocateOpen(true)
  }

  function clearSelection() {
    setAllocateOpen(false)
    setSelectedIds([])
    setTotalOwn('')
    setTotalProfit('')
    setPoolChipIns([])
    profitLocksRef.current = new Set()
  }

  function openChangeSelection() {
    setAllocateOpen(false)
    openPicker()
  }

  async function handleDistribute() {
    if (!profile || selectedRows.length === 0) return
    if (distributionPreview.length === 0) {
      toast.error('Nothing to distribute')
      return
    }
    if (poolBudgetMax > 0 && toNumber(totalOwn) + totalBorrowed > poolBudgetMax) {
      toast.error(
        `Max is ${formatPhp(poolBudgetMax)}. Own + chip-in cannot exceed your confirmed budget.`,
      )
      return
    }
    if (poolProfitMax > 0 && toNumber(totalProfit) + totalChipInProfit > poolProfitMax) {
      toast.error(
        `Max profit is ${formatPhp(poolProfitMax)}. Your profit + chip-in profits cannot exceed your expected profit for this pool.`,
      )
      return
    }
    if (poolProfitMax > 0 && allocateProfitShortfall > 0.05) {
      toast.error(
        `Kulang by ${formatPhp(allocateProfitShortfall)}. Total profit must equal ${formatPhp(poolProfitMax)}.`,
      )
      return
    }
    for (const l of poolChipIns) {
      if (!l.lender_name.trim()) {
        toast.error('Each chip-in needs a name')
        return
      }
    }
    setDistributing(true)
    try {
      // Reuse an existing shared pool if all selected rows already share one.
      const existingPoolIds = [...new Set(selectedRows.map((r) => r.poolId).filter(Boolean))] as string[]
      const reusePoolId = existingPoolIds.length === 1 ? existingPoolIds[0] : null

      const lendersByProject = new Map<string, LenderDraft[]>()
      for (const s of distributionPreview) {
        lendersByProject.set(s.projectId, [])
      }

      for (const [chipIndex, chip] of poolChipIns.entries()) {
        const amountParts = splitAmountAcrossShares(
          toNumber(chip.borrowed_amount),
          distributionPreview,
        )
        const profitParts = splitAmountAcrossShares(
          toNumber(chip.promise_value),
          distributionPreview,
        )
        for (const s of distributionPreview) {
          const amount = amountParts.get(s.projectId) ?? 0
          const profit = profitParts.get(s.projectId) ?? 0
          if (amount <= 0 && profit <= 0) continue
          const list = lendersByProject.get(s.projectId) ?? []
          list.push({
            clientKey: `pooled-${s.projectId}-${chipIndex}`,
            lender_name: chip.lender_name.trim(),
            borrowed_amount: amount > 0 ? String(amount) : '',
            promise_type: 'fixed_profit',
            promise_value: profit > 0 ? String(profit) : '',
            notes: '',
            sort_order: chipIndex,
          })
          lendersByProject.set(s.projectId, list)
        }
      }

      await distributeBudgetsAcrossProjects({
        financierId: profile.id,
        poolId: reusePoolId,
        shares: distributionPreview.map((s) => ({
          projectId: s.projectId,
          ownCapital: s.ownCapital,
          profit: s.profit,
          lenders: lendersByProject.get(s.projectId) ?? [],
        })),
      })
      toast.success(
        distributionPreview.length < 2
          ? 'Saved as individual budget'
          : `Pooled across ${distributionPreview.length} finance(s)`,
      )
      await loadRows()
      clearSelection()
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to distribute budgets')
    } finally {
      setDistributing(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Budget"
        description="Track your own money, chip-ins from others, and profit you choose to share per finance."
        actions={
          <Button type="button" variant="outline" className="gap-2" onClick={openPicker} disabled={loading || rows.length === 0}>
            <CheckSquare className="h-4 w-4" />
            Multiple select
            {selectedIds.length > 0 ? (
              <Badge variant="secondary" className="ml-0.5 tabular-nums">
                {selectedIds.length}
              </Badge>
            ) : null}
          </Button>
        }
      />
      <Input
        className="mb-4 max-w-sm"
        placeholder="Search finance…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <Dialog
        open={allocateOpen && selectedRows.length > 0}
        onOpenChange={(open) => {
          if (!open) clearSelection()
        }}
      >
        <DialogContent className="flex max-h-[90vh] w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="shrink-0 border-b px-4 py-4 text-left sm:px-6">
            <DialogTitle>Multi-finance allocate</DialogTitle>
            <DialogDescription>
              Split your own money, chip-ins, and profit across {selectedRows.length} selected finance
              {selectedRows.length === 1 ? '' : 's'}.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
              <div className="grid grid-cols-2 gap-2 sm:gap-4">
                <BudgetPieSplit
                  title="Capital mix"
                  data={allocateCapitalPieData}
                  emptyMessage="Enter budget amounts to see the mix by finance."
                />
                <BudgetPieSplit
                  title="Profit mix"
                  data={allocateProfitPieData}
                  emptyMessage="Enter profits to see the mix by finance."
                />
              </div>

              <div className="rounded-lg border p-2.5 sm:p-3">
                <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
                  <div className="min-w-0 space-y-1">
                    <p className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                      Pooling budget
                    </p>
                    {poolBudgetMax > 0 ? (
                      <>
                        <p className="text-xs font-semibold tabular-nums sm:text-sm">
                          {formatPhp(poolPutTotal)} / {formatPhp(poolBudgetMax)} (
                          {((poolPutTotal / poolBudgetMax) * 100).toFixed(2)}%)
                        </p>
                        <FundingProgressBar capital={poolBudgetMax} segments={poolPutSegments} />
                        <FundingProgressLegend segments={poolPutSegments.filter((s) => s.amount > 0)} />
                        {chipInGap > 0 ? (
                          <p className="text-[10px] text-muted-foreground">
                            Gap: {formatPhp(chipInGap)}
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <p className="text-[10px] text-muted-foreground">
                        Confirm budgets on these finances first to set the pool max.
                      </p>
                    )}
                  </div>

                  <div className="min-w-0 space-y-1 border-t pt-3 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-4">
                    <p className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                      Pooling profit
                    </p>
                    {poolProfitMax > 0 ? (
                      <>
                        <p
                          className={cn(
                            'text-xs font-semibold tabular-nums sm:text-sm',
                            allocateExceedsProfitMax || allocateProfitKulang
                              ? 'text-destructive'
                              : undefined,
                          )}
                        >
                          {formatPhp(poolProfitTotal)} / {formatPhp(poolProfitMax)}
                          {allocateExceedsProfitMax
                            ? ` · sobra ${formatPhp(allocateOverProfit)}`
                            : null}
                          {allocateProfitKulang ? ` · kulang ${formatPhp(allocateProfitShortfall)}` : null}
                        </p>
                        {poolProfitSegments.length > 0 ? (
                          <>
                            <FundingProgressBar capital={poolProfitMax} segments={poolProfitSegments} />
                            <FundingProgressLegend segments={poolProfitSegments} />
                          </>
                        ) : (
                          <p className="text-[10px] text-muted-foreground">
                            Defaults follow each person&apos;s budget share.
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-[10px] text-muted-foreground">
                        Confirm budgets first to set expected profit.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-0 table-fixed text-[10px] leading-tight sm:text-sm sm:leading-normal">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                      <th className="w-[22%] px-1.5 py-1.5 font-medium sm:px-3 sm:py-2">Finance</th>
                      <th className="w-[14%] px-1.5 py-1.5 text-right font-medium sm:px-3 sm:py-2">Share</th>
                      <th className="w-[32%] px-1.5 py-1.5 text-right font-medium sm:px-3 sm:py-2">Budget</th>
                      <th className="w-[32%] px-1.5 py-1.5 text-right font-medium sm:px-3 sm:py-2">Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {distributionPreview.map((s) => {
                      const color = financeColorById.get(s.projectId) ?? FINANCIER_COLORS[0]
                      const people = peopleBreakdownByFinance.get(s.projectId) ?? []
                      return (
                        <tr key={s.projectId} className="border-b last:border-0">
                          <td className="px-1.5 py-1.5 font-medium sm:px-3 sm:py-2">
                            <span className="inline-flex min-w-0 items-center gap-1.5">
                              <FinancierColorDot color={color} className="h-2 w-2 sm:h-2.5 sm:w-2.5" />
                              <span className="truncate">{s.projectName}</span>
                            </span>
                          </td>
                          <td className="px-1.5 py-1.5 text-right tabular-nums text-muted-foreground sm:px-3 sm:py-2">
                            {(s.weightRatio * 100).toFixed(1)}%
                          </td>
                          <td className="px-1.5 py-1.5 text-right sm:px-3 sm:py-2">
                            {people.length === 0 ? (
                              <span className="tabular-nums">{formatPhp(0)}</span>
                            ) : (
                              <div className="space-y-1">
                                {people.map((p, i) =>
                                  p.capital > 0 ? (
                                    <div key={`cap-${p.name}-${i}`} className="leading-tight">
                                      <p className="truncate text-[9px] font-semibold text-foreground sm:text-[10px]">
                                        {p.name}
                                      </p>
                                      <p className="tabular-nums text-muted-foreground">
                                        {formatPhp(p.capital)}
                                      </p>
                                    </div>
                                  ) : null,
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-1.5 py-1.5 text-right sm:px-3 sm:py-2">
                            {people.every((p) => p.profit <= 0) ? (
                              <span className="tabular-nums">{formatPhp(0)}</span>
                            ) : (
                              <div className="space-y-1">
                                {people.map((p, i) =>
                                  p.profit > 0 ? (
                                    <div key={`prf-${p.name}-${i}`} className="leading-tight">
                                      <p className="truncate text-[9px] font-semibold text-foreground sm:text-[10px]">
                                        {p.name}
                                      </p>
                                      <p className="tabular-nums text-muted-foreground">
                                        {formatPhp(p.profit)}
                                      </p>
                                    </div>
                                  ) : null,
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Your money</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1 rounded-lg border p-2">
                      <Label htmlFor="alloc_own" className="text-xs">
                        Own amount (₱)
                      </Label>
                      <MoneyInput
                        id="alloc_own"
                        value={totalOwn}
                        onValueChange={setOwnAmount}
                        placeholder=""
                        aria-invalid={allocateExceedsMax}
                        className={cn(
                          'h-8 text-sm',
                          allocateExceedsMax
                            ? 'border-destructive focus-visible:ring-destructive'
                            : undefined,
                        )}
                      />
                    </div>
                    <div className="space-y-1 rounded-lg border p-2">
                      <Label htmlFor="alloc_profit" className="text-xs">
                        Your profit
                      </Label>
                      <MoneyInput
                        id="alloc_profit"
                        value={totalProfit}
                        onValueChange={setYourProfit}
                        placeholder=""
                        aria-invalid={allocateExceedsProfitMax}
                        className={cn(
                          'h-8 text-sm',
                          allocateExceedsProfitMax
                            ? 'border-destructive focus-visible:ring-destructive'
                            : undefined,
                        )}
                      />
                    </div>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-1 sm:w-auto"
                  onClick={addPoolChipIn}
                >
                  <Plus className="h-4 w-4" />
                  Add chip-in
                </Button>

                {poolChipIns.length > 0 ? (
                  <div
                    ref={chipInListRef}
                    className="max-h-64 space-y-2 overflow-y-auto overscroll-contain rounded-xl border bg-muted/20 p-2 sm:max-h-80"
                  >
                    {poolChipIns.map((l, idx) => (
                      <div key={l.clientKey} className="space-y-2 rounded-xl border bg-card p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium">Chip-in {idx + 1}</p>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => removePoolChipIn(l.clientKey)}
                            aria-label={`Remove chip-in ${idx + 1}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="space-y-2">
                          <Label>Name</Label>
                          <Input
                            value={l.lender_name}
                            onChange={(e) => updatePoolChipIn(l.clientKey, { lender_name: e.target.value })}
                            placeholder="e.g. Mom, Juan"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-2">
                            <Label>Amount (₱)</Label>
                            <MoneyInput
                              value={lenderAmountInputValue(l.borrowed_amount)}
                              onValueChange={(v) =>
                                updatePoolChipIn(l.clientKey, {
                                  borrowed_amount: v,
                                })
                              }
                              placeholder=""
                              aria-invalid={allocateExceedsMax}
                              className={
                                allocateExceedsMax
                                  ? 'border-destructive focus-visible:ring-destructive'
                                  : undefined
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Their profit (₱)</Label>
                            <MoneyInput
                              value={lenderAmountInputValue(l.promise_value)}
                              onValueChange={(v) =>
                                updatePoolChipIn(l.clientKey, {
                                  promise_value: v,
                                })
                              }
                              placeholder=""
                              aria-invalid={allocateExceedsProfitMax}
                              className={
                                allocateExceedsProfitMax
                                  ? 'border-destructive focus-visible:ring-destructive'
                                  : undefined
                              }
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t px-4 py-3 sm:flex-row sm:px-6">
            <Button
              className="w-full sm:flex-1"
              disabled={
                distributing ||
                allocateExceedsMax ||
                allocateExceedsProfitMax ||
                (poolProfitMax > 0 && allocateProfitShortfall > 0.05)
              }
              onClick={() => void handleDistribute()}
            >
              {distributing ? 'Saving…' : 'Save & distribute'}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              disabled={distributing}
              onClick={openChangeSelection}
            >
              Change selection
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              disabled={distributing}
              onClick={clearSelection}
            >
              Clear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : filtered.length === 0 ? (
        <EmptyState title="No finances yet" description="Join a finance first, then set up its budget here." />
      ) : (
        <>
          <ul className="space-y-3 md:hidden">
            {paged.items.map((r) => {
              const dateChip = r.financingDate ? financingDateChipColors(r.financingDate) : null
              const profit = r.expectedProfitShare
              const poolBorder = budgetPoolBorderColors(r.poolColorIndex)
              const poolRing = budgetPoolRingColors(r.poolColorIndex)
              const inActiveGroup = selectedIds.includes(r.projectId)
              return (
                <li key={r.projectId}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => activateBudgetRow(r)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        activateBudgetRow(r)
                      }
                    }}
                    className={cn(
                      'flex cursor-pointer flex-col rounded-2xl border bg-card p-4 shadow-sm transition-colors hover:bg-muted/30',
                      poolBorder ? cn('border-2', poolBorder) : undefined,
                      inActiveGroup && poolRing ? cn('ring-2', poolRing) : undefined,
                    )}
                  >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        {r.financingDate && dateChip ? (
                          <span
                            className={cn(
                              'shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
                              dateChip.bg,
                              dateChip.text,
                              dateChip.border,
                            )}
                          >
                            {formatFinancingDateChip(r.financingDate)}
                          </span>
                        ) : null}
                        <p className="truncate font-semibold">{r.projectName}</p>
                        {r.poolId ? (
                          <Badge variant="outline" className={cn('text-[10px]', poolBorder)}>
                            Pooled
                          </Badge>
                        ) : null}
                      </div>
                      <Badge
                        variant={projectStatusVariant(r.status)}
                        className={cn('mt-2', projectStatusClassName(r.status))}
                      >
                        {PROJECT_STATUS_LABELS[r.status]}
                      </Badge>
                    </div>
                    <Wallet className="h-5 w-5 shrink-0 text-muted-foreground" />
                  </div>
                  <div className="mt-3">
                    <BudgetRowStatsTable row={r} profit={profit} compactDuration />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="flex h-9 flex-1 items-center justify-center rounded-md border border-input bg-background px-3 text-center text-sm font-medium leading-none">
                      {r.poolId
                        ? 'View pool group'
                        : r.hasBudget
                          ? 'Edit / Details'
                          : 'Set up budget'}
                    </span>
                    {r.poolId ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-9 shrink-0"
                          onClick={(e) => void handleDissolvePool(r.poolId!, e)}
                        >
                          Ungroup
                        </Button>
                        <Button
                          asChild
                          variant="outline"
                          size="sm"
                          className="h-9 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Link to={`/app/budget/${r.projectId}`}>Edit one</Link>
                        </Button>
                      </>
                    ) : null}
                  </div>
                  </div>
                </li>
              )
            })}
          </ul>

          <Card className="hidden md:block">
            <CardContent className="pt-6">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-3 font-medium">Date</th>
                      <th className="pb-3 font-medium">Finance</th>
                      <th className="pb-3 font-medium">Status</th>
                      <th className="pb-3 text-right font-medium">Total needed</th>
                      <th className="pb-3 text-right font-medium">Fin. profit</th>
                      <th className="pb-3 text-right font-medium">Budget</th>
                      <th className="pb-3 text-right font-medium">Profit</th>
                      <th className="pb-3 text-right font-medium">Total</th>
                      <th className="pb-3 text-right font-medium">Duration</th>
                      <th className="pb-3 text-right font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.items.map((r) => {
                      const dateChip = r.financingDate ? financingDateChipColors(r.financingDate) : null
                      const profit = r.expectedProfitShare
                      const total = r.myConfirmed + profit
                      const poolBorder = budgetPoolBorderColors(r.poolColorIndex)
                      const poolLeft = budgetPoolLeftBorderColors(r.poolColorIndex)
                      const poolRing = budgetPoolRingColors(r.poolColorIndex)
                      const inActiveGroup = selectedIds.includes(r.projectId)
                      return (
                        <tr
                          key={r.projectId}
                          className={cn(
                            'cursor-pointer border-b last:border-0 hover:bg-muted/40',
                            poolLeft ? cn('border-l-4', poolLeft) : undefined,
                            inActiveGroup && poolRing ? cn('bg-muted/30 ring-1', poolRing) : undefined,
                          )}
                          onClick={() => activateBudgetRow(r)}
                        >
                          <td className="py-3">
                            {r.financingDate && dateChip ? (
                              <span
                                className={cn(
                                  'inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
                                  dateChip.bg,
                                  dateChip.text,
                                  dateChip.border,
                                )}
                              >
                                {formatFinancingDateChip(r.financingDate)}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-3 font-medium">
                            <span className="inline-flex items-center gap-2">
                              {r.projectName}
                              {r.poolId ? (
                                <Badge variant="outline" className={cn('text-[10px]', poolBorder)}>
                                  Pooled
                                </Badge>
                              ) : null}
                            </span>
                          </td>
                          <td className="py-3">
                            <Badge
                              variant={projectStatusVariant(r.status)}
                              className={projectStatusClassName(r.status)}
                            >
                              {PROJECT_STATUS_LABELS[r.status]}
                            </Badge>
                          </td>
                          <td className="py-3 text-right tabular-nums">{formatPhp(r.capitalRequired)}</td>
                          <td className="py-3 text-right tabular-nums">{formatPhp(r.projectExpectedProfit)}</td>
                          <td className="py-3 text-right tabular-nums">{formatPhp(r.myConfirmed)}</td>
                          <td className="py-3 text-right tabular-nums">{formatPhp(profit)}</td>
                          <td className="py-3 text-right tabular-nums font-medium">{formatPhp(total)}</td>
                          <td className="py-3 text-right tabular-nums">
                            {r.durationDays > 0 ? `${r.durationDays} days` : '—'}
                          </td>
                          <td className="py-3 text-right" onClick={(e) => e.stopPropagation()}>
                            {r.poolId ? (
                              <div className="flex justify-end gap-2">
                                <Button type="button" variant="default" size="sm" onClick={() => openPoolGroup(r.poolId!)}>
                                  View pool
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => void handleDissolvePool(r.poolId!)}
                                >
                                  Ungroup
                                </Button>
                                <Button asChild variant="outline" size="sm">
                                  <Link to={`/app/budget/${r.projectId}`}>Edit one</Link>
                                </Button>
                              </div>
                            ) : (
                              <Button asChild variant="outline" size="sm">
                                <Link to={`/app/budget/${r.projectId}`}>
                                  {r.hasBudget ? 'Edit / Details' : 'Set up budget'}
                                </Link>
                              </Button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <ListPagination
            page={paged.page}
            totalPages={paged.totalPages}
            totalItems={paged.totalItems}
            pageSize={BUDGET_LIST_PAGE_SIZE}
            onPageChange={setPage}
          />
        </>
      )}

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="border-b px-4 py-4 text-left sm:px-6">
            <DialogTitle>Select finances</DialogTitle>
            <DialogDescription>
              Pick finances to allocate. Uncheck a pooled finance to remove its Pooled badge and ungroup it (you own all fund and profit). Or use Ungroup on the list.
            </DialogDescription>
          </DialogHeader>
          <div className="border-b px-4 py-3 sm:px-6">
            <Input
              placeholder="Search by name or date…"
              value={pickerQ}
              onChange={(e) => setPickerQ(e.target.value)}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {draftSelectedIds.length} selected
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 sm:px-4">
            {pickerRows.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">No finances match.</p>
            ) : (
              <ul className="space-y-1">
                {pickerRows.map((r) => {
                  const checked = draftSelectedIds.includes(r.projectId)
                  const dateChip = r.financingDate ? financingDateChipColors(r.financingDate) : null
                  const profit = r.expectedProfitShare
                  const poolBorder = budgetPoolBorderColors(r.poolColorIndex)
                  return (
                    <li key={r.projectId}>
                      <button
                        type="button"
                        onClick={() => toggleDraftSelected(r.projectId)}
                        className={cn(
                          'flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors',
                          checked ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-muted/60',
                          poolBorder ? cn('border border-2', poolBorder) : undefined,
                        )}
                      >
                        <span
                          className={cn(
                            'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[10px]',
                            checked
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-muted-foreground/40',
                          )}
                          aria-hidden
                        >
                          {checked ? '✓' : ''}
                        </span>
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            {r.financingDate && dateChip ? (
                              <span
                                className={cn(
                                  'shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
                                  dateChip.bg,
                                  dateChip.text,
                                  dateChip.border,
                                )}
                              >
                                {formatFinancingDateChip(r.financingDate)}
                              </span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">No date</span>
                            )}
                            <span className="truncate font-semibold text-foreground">{r.projectName}</span>
                            {r.poolId ? (
                              <Badge variant="outline" className={cn('text-[10px]', poolBorder)}>
                                Pooled
                              </Badge>
                            ) : null}
                          </div>
                          <div className="mt-1">
                            <BudgetRowStatsTable row={r} profit={profit} />
                          </div>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          <DialogFooter className="gap-2 border-t px-4 py-3 sm:px-6">
            <Button type="button" variant="outline" onClick={() => setPickerOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={applyPickerSelection}>
              Apply ({draftSelectedIds.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function FinancierBudgetDetailPage() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [project, setProject] = useState<Project | null>(null)
  const [myConfirmed, setMyConfirmed] = useState(0)
  const [releasedProfit, setReleasedProfit] = useState<number | null>(null)
  const [releasedCapital, setReleasedCapital] = useState<number | null>(null)
  const [budgetId, setBudgetId] = useState<string | null>(null)
  const [ownCapital, setOwnCapital] = useState('')
  const [manualProfit, setManualProfit] = useState('')
  const [notes, setNotes] = useState('')
  const [lenders, setLenders] = useState<LenderDraft[]>([])
  const profitLocksRef = useRef<Set<string>>(new Set())
  const capitalSigRef = useRef('')
  const skipAutoProfitRef = useRef(false)

  useEffect(() => {
    if (!profile || !projectId) return
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const [projectRes, pfRes, paymentRes, budget] = await Promise.all([
          supabase.from('projects').select('*').eq('id', projectId).single(),
          supabase
            .from('project_financiers')
            .select('*')
            .eq('project_id', projectId)
            .eq('financier_id', profile.id)
            .maybeSingle(),
          supabase
            .from('financier_release_payments')
            .select('capital_amount, profit_amount, project_financiers!inner(financier_id, project_id)')
            .eq('project_financiers.financier_id', profile.id)
            .eq('project_financiers.project_id', projectId)
            .maybeSingle(),
          loadBudgetForProject(profile.id, projectId).catch((err: Error) => {
            toast.error(err.message)
            return null
          }),
        ])

        if (cancelled) return

        if (projectRes.error || !projectRes.data) {
          toast.error(projectRes.error?.message ?? 'Finance not found')
          navigate('/app/budget')
          return
        }
        if (!pfRes.data) {
          toast.error('You are not on this finance')
          navigate('/app/budget')
          return
        }

        const pf = pfRes.data as ProjectFinancier

        setProject(projectRes.data as Project)
        setMyConfirmed(toNumber(pf.confirmed_amount))

        if (paymentRes.data) {
          const pay = paymentRes.data as { capital_amount: number | string; profit_amount: number | string }
          setReleasedCapital(toNumber(pay.capital_amount))
          setReleasedProfit(toNumber(pay.profit_amount))
        } else {
          setReleasedCapital(null)
          setReleasedProfit(null)
        }

        if (budget) {
          setBudgetId(budget.id)
          setOwnCapital(moneyInputFromValue(budget.own_capital))
          setManualProfit(
            budget.manual_profit === null || budget.manual_profit === undefined
              ? ''
              : moneyInputFromValue(budget.manual_profit),
          )
          setNotes(budget.notes ?? '')
          setLenders(lendersToDrafts(budget.financier_project_lenders ?? []))
          skipAutoProfitRef.current = (budget.financier_project_lenders ?? []).some(
            (l) => toNumber(l.promise_value) > 0,
          )
        } else {
          setBudgetId(null)
          const confirmed = toNumber(pf.confirmed_amount)
          setOwnCapital(confirmed > 0 ? moneyInputFromValue(confirmed) : '')
          setManualProfit('')
          setNotes('')
          setLenders([])
        }
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : 'Failed to load budget')
          navigate('/app/budget')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [profile, projectId, navigate])

  const expectedProfit = toNumber(project?.expected_profit)
  const expectedShare = budgetBasedProfitShare(myConfirmed, toNumber(project?.capital_required), expectedProfit)
  const profitPoolMax = releasedProfit !== null ? releasedProfit : expectedShare
  const manualProfitDraft = manualProfit.trim()
  const manualProfitEntered = manualProfitDraft !== ''
  const myProfitShare =
    releasedProfit !== null
      ? releasedProfit
      : manualProfitEntered
        ? toNumber(manualProfit)
        : expectedShare
  const myCapitalReturn = releasedCapital !== null ? releasedCapital : myConfirmed

  const capitalSignature = useMemo(
    () => `${ownCapital}|${lenders.map((l) => `${l.clientKey}:${String(l.borrowed_amount)}`).join('|')}`,
    [ownCapital, lenders],
  )

  useEffect(() => {
    if (releasedProfit !== null || profitPoolMax <= 0) return

    const capitalChanged = capitalSignature !== capitalSigRef.current
    if (capitalChanged) {
      capitalSigRef.current = capitalSignature
      if (skipAutoProfitRef.current) {
        skipAutoProfitRef.current = false
        return
      }
      profitLocksRef.current = new Set()
    } else if (profitLocksRef.current.size > 0) {
      return
    }

    const hasCapital = toNumber(ownCapital) > 0 || lenders.some((l) => toNumber(l.borrowed_amount) > 0)
    if (!hasCapital) return

    const totalPool = manualProfitEntered ? toNumber(manualProfit) : profitPoolMax
    const parts = computeProfitSplits({
      totalProfitPool: totalPool,
      capitalBase: myConfirmed > 0 ? myConfirmed : undefined,
      parties: buildDetailProfitParties(ownCapital, lenders, profitLocksRef.current),
    })

    applyDetailProfitSplits(parts, totalPool, setManualProfit, setLenders)
  }, [
    capitalSignature,
    profitPoolMax,
    myConfirmed,
    releasedProfit,
    ownCapital,
    lenders,
    manualProfitEntered,
    manualProfit,
  ])

  const profitSource: 'released' | 'manual' | 'expected' =
    releasedProfit !== null ? 'released' : manualProfitEntered ? 'manual' : 'expected'

  const summary = useMemo(
    () =>
      calculateBudgetSummary({
        ownCapital,
        myConfirmed,
        myProfitShare,
        myCapitalReturn,
        lenders,
      }),
    [ownCapital, myConfirmed, myProfitShare, myCapitalReturn, lenders],
  )

  const capitalPieData = useMemo(() => {
    const slices: PieSlice[] = []
    const own = toNumber(ownCapital)
    if (own > 0) {
      slices.push({ name: 'You', value: own, key: 'you', color: FINANCIER_COLORS[0] })
    }
    let i = 1
    for (const l of lenders) {
      const amount = toNumber(l.borrowed_amount)
      if (amount <= 0) continue
      slices.push({
        name: l.lender_name.trim() || 'Chip-in',
        value: amount,
        key: l.clientKey,
        color: FINANCIER_COLORS[i % FINANCIER_COLORS.length],
      })
      i++
    }
    return slices
  }, [ownCapital, lenders])

  const profitPieData = useMemo(() => {
    const slices: PieSlice[] = []
    const yours = summary.myNetProfit
    if (yours > 0) {
      slices.push({ name: 'You', value: yours, key: 'you-profit', color: FINANCIER_COLORS[0] })
    }
    let i = 1
    for (const l of summary.lenders) {
      const profit = l.profit_portion ?? 0
      if (profit <= 0) continue
      slices.push({
        name: l.lender_name,
        value: profit,
        key: `profit-${l.lender_name}-${l.borrowed_amount}`,
        color: FINANCIER_COLORS[i % FINANCIER_COLORS.length],
      })
      i++
    }
    return slices
  }, [summary])

  function updateLender(clientKey: string, patch: Partial<LenderDraft>) {
    if (patch.borrowed_amount !== undefined) {
      profitLocksRef.current = new Set()
      setLenders((prev) => prev.map((l) => (l.clientKey === clientKey ? { ...l, ...patch } : l)))
      return
    }
    if (patch.promise_value !== undefined && releasedProfit === null) {
      const pool = manualProfitEntered ? toNumber(manualProfit) : profitPoolMax
      if (pool > 0) {
        profitLocksRef.current = new Set([clientKey])
        const parts = redistributeProfitSplits({
          totalProfitPool: pool,
          capitalBase: myConfirmed > 0 ? myConfirmed : undefined,
          parties: buildDetailProfitParties(ownCapital, lenders, new Set()),
          editedKey: clientKey,
          editedProfit: toNumber(patch.promise_value),
        })
        setLenders((prev) =>
          prev.map((l) => {
            if (l.clientKey === clientKey) {
              return { ...l, ...patch, promise_type: 'fixed_profit' as const }
            }
            const profit = parts.get(l.clientKey) ?? 0
            return { ...l, promise_value: profitInputFromAmount(profit), promise_type: 'fixed_profit' as const }
          }),
        )
        return
      }
    }
    setLenders((prev) => prev.map((l) => (l.clientKey === clientKey ? { ...l, ...patch } : l)))
  }

  function handleOwnCapitalChange(value: string) {
    profitLocksRef.current = new Set()
    setOwnCapital(value)
  }

  function handleManualProfitChange(value: string) {
    if (releasedProfit !== null) return
    const newPool = toNumber(value)
    profitLocksRef.current = new Set()
    const pool = newPool > 0 ? newPool : profitPoolMax
    const parts = computeProfitSplits({
      totalProfitPool: pool,
      capitalBase: myConfirmed > 0 ? myConfirmed : undefined,
      parties: buildDetailProfitParties(ownCapital, lenders, new Set()),
    })
    applyDetailProfitSplits(parts, pool, setManualProfit, setLenders, value)
  }

  function removeLender(clientKey: string) {
    setLenders((prev) => prev.filter((l) => l.clientKey !== clientKey))
  }

  async function handleSave() {
    if (!profile || !projectId) return
    for (const l of lenders) {
      if (!l.lender_name.trim()) {
        toast.error('Each chip-in needs a name')
        return
      }
    }
    setSaving(true)
    try {
      const saved = await upsertBudgetWithLenders({
        financierId: profile.id,
        projectId,
        ownCapital: toNumber(ownCapital),
        manualProfit: manualProfit.trim() === '' ? null : toNumber(manualProfit),
        notes: notes.trim() || null,
        existingBudgetId: budgetId,
        lenders,
      })
      setBudgetId(saved.id)
      setLenders(lendersToDrafts(saved.financier_project_lenders ?? []))
      setManualProfit(
        saved.manual_profit === null || saved.manual_profit === undefined
          ? ''
          : moneyInputFromValue(saved.manual_profit),
      )
      toast.success('Budget saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save budget')
    } finally {
      setSaving(false)
    }
  }

  if (loading || !project) {
    return (
      <div>
        <Skeleton className="mb-4 h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2 gap-1 text-muted-foreground">
          <Link to="/app/budget">
            <ArrowLeft className="h-4 w-4" />
            All budgets
          </Link>
        </Button>
        <PageHeader title={project.name} />
      </div>

      <Card className="mb-4">
        <CardContent className="space-y-4 pt-3 sm:space-y-6 sm:pt-4">
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            <div>
              <p className="text-[10px] text-muted-foreground sm:text-xs">Budget</p>
              <p className="text-sm font-semibold tabular-nums sm:text-lg">{formatPhp(myConfirmed)}</p>
            </div>
            <div>
              <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                <p className="text-[10px] text-muted-foreground sm:text-xs">Profit</p>
                <Badge variant="secondary" className="w-fit px-1 py-0 text-[9px] uppercase tracking-wide sm:text-[10px]">
                  {profitSource === 'released' ? 'Released' : profitSource === 'manual' ? 'Manual' : 'Expected'}
                </Badge>
              </div>
              <p className="text-sm font-semibold tabular-nums sm:text-lg">{formatPhp(myProfitShare)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground sm:text-xs">Total money</p>
              <p className="text-sm font-semibold tabular-nums sm:text-lg">{formatPhp(myConfirmed + myProfitShare)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:gap-6">
            <BudgetPieSplit
              title="Capital split"
              data={capitalPieData}
              emptyMessage="Add own capital or chip-ins to see the split."
            />
            <BudgetPieSplit
              title="Profit split"
              data={profitPieData}
              emptyMessage="Set profit or chip-in shares to see the split."
            />
          </div>

          <div className="space-y-2 border-t pt-3 text-xs sm:space-y-3 sm:text-sm">
            {summary.warnings.length > 0 ? (
              <div className="space-y-2">
                {summary.warnings.map((w) => (
                  <div
                    key={w.code}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-xs',
                      w.level === 'error'
                        ? 'border-destructive/40 bg-destructive/10 text-destructive'
                        : 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200',
                    )}
                  >
                    {w.message}
                  </div>
                ))}
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-3">
              <span className="font-medium">You</span>
              <span className="tabular-nums text-muted-foreground">
                {formatPhp(toNumber(ownCapital))} chip-in ·{' '}
                <span className={cn(summary.myNetProfit < 0 ? 'text-destructive' : 'text-emerald-700')}>
                  {formatPhp(summary.myNetProfit)} profit
                </span>
              </span>
            </div>

            {summary.lenders.map((l, i) => (
              <div key={`${l.lender_name}-${i}`} className="flex items-center justify-between gap-3">
                <span className="truncate font-medium">{l.lender_name}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {formatPhp(l.borrowed_amount)} chip-in · {formatPhp(l.profit_portion ?? 0)} profit
                </span>
              </div>
            ))}

            <div className="space-y-2 border-t pt-3">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Chip-in profit total</span>
                <span className="font-medium tabular-nums">{formatPhp(summary.totalLenderProfit)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="font-medium">Total</span>
                <span className="font-semibold tabular-nums">{formatPhp(summary.myNetAfterAll)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Profit left</span>
                <span className="font-medium tabular-nums">{formatPhp(summary.remainingProfitToAllocate)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Budget</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="own_capital">Own capital (₱)</Label>
                <MoneyInput
                  id="own_capital"
                  value={ownCapital}
                  onValueChange={handleOwnCapitalChange}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="manual_profit">Profit (₱)</Label>
                <MoneyInput
                  id="manual_profit"
                  value={manualProfit}
                  onValueChange={handleManualProfitChange}
                  placeholder={releasedProfit !== null ? undefined : profitInputFromAmount(profitPoolMax) || 'Expected share if empty'}
                  disabled={releasedProfit !== null}
                />
                {releasedProfit !== null ? (
                  <p className="text-xs text-muted-foreground">Released profit is locked.</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Auto-fills from your budget share. Edit to override — chip-in profits adjust to match.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Chip-ins</span>
                <span className="font-medium tabular-nums">{formatPhp(summary.totalBorrowed)}</span>
              </div>
              <div className="mt-1 flex justify-between gap-2">
                <span className="text-muted-foreground">Total budget</span>
                <span className="font-medium tabular-nums">{formatPhp(summary.stakeTotal)}</span>
              </div>
            </div>

            {lenders.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Chip-ins</p>
                <div className="max-h-64 space-y-2 overflow-y-auto overscroll-contain rounded-xl border bg-muted/20 p-2 sm:max-h-80">
                {lenders.map((l, idx) => (
                  <div key={l.clientKey} className="space-y-2 rounded-xl border bg-card p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">Chip-in {idx + 1}</p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => removeLender(l.clientKey)}
                        aria-label={`Remove chip-in ${idx + 1}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="space-y-2">
                      <Label>Name</Label>
                      <Input
                        value={l.lender_name}
                        onChange={(e) => updateLender(l.clientKey, { lender_name: e.target.value })}
                        placeholder="e.g. Mom, Juan"
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Chip in (₱)</Label>
                        <MoneyInput
                          value={lenderAmountInputValue(l.borrowed_amount)}
                          onValueChange={(v) =>
                            updateLender(l.clientKey, {
                              borrowed_amount: v,
                            })
                          }
                          placeholder=""
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Their profit (₱)</Label>
                        <MoneyInput
                          value={lenderAmountInputValue(l.promise_value)}
                          onValueChange={(v) =>
                            updateLender(l.clientKey, {
                              promise_value: v,
                              promise_type: 'fixed_profit',
                            })
                          }
                          placeholder=""
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">Auto from budget share — edit to override; others adjust.</p>
                  </div>
                ))}
                </div>
              </div>
            ) : null}

            <Button
              type="button"
              variant="outline"
              className="w-full gap-1"
              onClick={() => setLenders((prev) => [...prev, emptyLenderDraft(prev.length)])}
            >
              <Plus className="h-4 w-4" />
              Add chip-in
            </Button>

          <Button className="w-full" disabled={saving} onClick={() => void handleSave()}>
            {saving ? 'Saving…' : 'Save budget'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
