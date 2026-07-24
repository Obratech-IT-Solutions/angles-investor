import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { PageHeader, KpiCard, EmptyState } from '@/components/shared/PageBits'
import { ListPagination, paginateRows } from '@/components/shared/ListPagination'
import { FinanceDetailDialog } from '@/components/finance/FinanceDetailDialog'
import { GroupCommitmentDialog } from '@/components/finance/GroupCommitmentDialog'
import { GroupFinanceDetailDialog } from '@/components/finance/GroupFinanceDetailDialog'
import { CommitmentConfirmDialog } from '@/components/finance/CommitmentConfirmDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/contexts/AuthContext'
import { MoneyInput } from '@/components/ui/money-input'
import { sumGroupBudget, sumGroupProfit } from '@/lib/finance-group'
import {
  budgetBasedProfitShare,
  expectedProfitShare,
  formatPercent,
  formatPhp,
  fundingProgress,
  moneyInputFromValue,
  remainingGap,
  returnOnCapital,
  toNumber,
  totalReceivable,
} from '@/lib/money'
import { commitmentStatusVariant, projectStatusClassName, projectStatusTableClassName, projectStatusVariant, releaseStatusVariant } from '@/lib/status'
import { budgetPoolBorderColors, budgetPoolColorIndexFromId, budgetPoolLeftBorderColors, financingDateChipColors, formatFinancingDateChip, FINANCIER_COLORS } from '@/lib/financierColors'
import { calculateBudgetSummary, type BudgetLenderInput } from '@/lib/budget'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import {
  COMMITMENT_STATUS_LABELS,
  PROJECT_STATUS_LABELS,
  RELEASE_STATUS_LABELS,
  type FinancierReleasePayment,
  type FinancierProjectBudget,
  type Project,
  type ProjectFinancier,
  type ProjectRelease,
} from '@/types'

const COLORS = ['#0b2a4a', '#1a4a73', '#1f7a4d', '#b7791f', '#5b6b7c']
const FINANCE_LIST_PAGE_SIZE = 6

const PROJECT_LIST_SELECT =
  '*, projects:project_id(id, name, status, capital_required, expected_profit, financing_date, release_date, duration_days, group_id, calculated_expected_release)'

function financeIdentityKey(row: ProjectFinancier): string | null {
  const name = row.projects?.name?.trim()
  const date = row.projects?.financing_date
  if (!name || !date) return null
  return `${name.toLowerCase()}|${date}`
}

/** Drop solo rows when the same finance name+date also exists in a group batch. */
function dedupeOverlappingFinancierRows(rows: ProjectFinancier[]): ProjectFinancier[] {
  const groupedKeys = new Set<string>()
  for (const row of rows) {
    const key = financeIdentityKey(row)
    if (key && row.projects?.group_id) groupedKeys.add(key)
  }
  if (groupedKeys.size === 0) return rows
  return rows.filter((row) => {
    const key = financeIdentityKey(row)
    if (!key || row.projects?.group_id) return true
    return !groupedKeys.has(key)
  })
}

async function normalizeFinancierRows(rows: ProjectFinancier[]): Promise<ProjectFinancier[]> {
  const projectIds = [...new Set(rows.map((r) => r.project_id))]
  if (projectIds.length === 0) return rows

  const { data: projects, error } = await supabase.from('projects').select('id, group_id').in('id', projectIds)
  if (error) {
    console.error('normalizeFinancierRows', error)
    return dedupeOverlappingFinancierRows(rows)
  }

  const groupByProject = new Map((projects ?? []).map((p) => [p.id, p.group_id as string | null]))
  const enriched = rows.map((row) => ({
    ...row,
    projects: row.projects
      ? {
          ...row.projects,
          group_id: row.projects.group_id ?? groupByProject.get(row.project_id) ?? null,
        }
      : row.projects,
  }))
  return dedupeOverlappingFinancierRows(enriched)
}

/** Collapse grouped finances into one representative row per batch for list UIs. */
function collapseRowsByGroup(rows: ProjectFinancier[]): ProjectFinancier[] {
  const seenGroups = new Set<string>()
  const out: ProjectFinancier[] = []
  for (const r of rows) {
    const gid = r.projects?.group_id ?? null
    if (gid) {
      if (seenGroups.has(gid)) continue
      seenGroups.add(gid)
    }
    out.push(r)
  }
  return out
}

function groupMateRows(rows: ProjectFinancier[], groupId: string): ProjectFinancier[] {
  return rows.filter((r) => r.projects?.group_id === groupId)
}

type FinancierFinanceTableRow =
  | { kind: 'single'; row: ProjectFinancier }
  | {
      kind: 'group-member'
      row: ProjectFinancier
      groupId: string
      rowSpan: number
      isFirst: boolean
    }

/** Keep batch finances adjacent (same order as admin list). */
function sortFinancierRowsForDisplay(rows: ProjectFinancier[]): ProjectFinancier[] {
  const singles: ProjectFinancier[] = []
  const groups = new Map<string, ProjectFinancier[]>()

  for (const r of rows) {
    const gid = r.projects?.group_id ?? null
    if (gid) {
      const list = groups.get(gid) ?? []
      list.push(r)
      groups.set(gid, list)
    } else {
      singles.push(r)
    }
  }

  type Block = { sortAt: string; items: ProjectFinancier[] }
  const blocks: Block[] = singles.map((r) => ({
    sortAt: r.projects?.financing_date ?? '',
    items: [r],
  }))

  for (const items of groups.values()) {
    const sorted = [...items].sort((a, b) =>
      (a.projects?.name ?? '').localeCompare(b.projects?.name ?? ''),
    )
    blocks.push({
      sortAt: sorted[0]?.projects?.financing_date ?? '',
      items: sorted,
    })
  }

  blocks.sort((a, b) => b.sortAt.localeCompare(a.sortAt))
  return blocks.flatMap((b) => b.items)
}

function buildFinancierFinanceTableRows(items: ProjectFinancier[]): FinancierFinanceTableRow[] {
  const out: FinancierFinanceTableRow[] = []
  let i = 0

  while (i < items.length) {
    const row = items[i]
    const groupId = row.projects?.group_id ?? null
    if (!groupId) {
      out.push({ kind: 'single', row })
      i++
      continue
    }

    const members: ProjectFinancier[] = []
    while (i < items.length && items[i].projects?.group_id === groupId) {
      members.push(items[i])
      i++
    }

    members.forEach((member, idx) => {
      out.push({
        kind: 'group-member',
        row: member,
        groupId,
        rowSpan: members.length,
        isFirst: idx === 0,
      })
    })
  }

  return out
}

function rowDisplayAmount(row: ProjectFinancier): number {
  return row.commitment_status === 'confirmed'
    ? toNumber(row.confirmed_amount)
    : toNumber(row.current_suggested_amount)
}

function rowDisplayProfit(row: ProjectFinancier): number {
  const amount = rowDisplayAmount(row)
  const capital = toNumber(row.projects?.capital_required)
  const expectedProfit = toNumber(row.projects?.expected_profit)
  if (capital > 0 && amount > 0) {
    return Math.round(budgetBasedProfitShare(amount, capital, expectedProfit) * 100) / 100
  }
  return Math.round(expectedProfit * toNumber(row.confirmed_percentage) * 100) / 100
}

function rowDisplayTotal(row: ProjectFinancier): number {
  const amount = rowDisplayAmount(row)
  return totalReceivable(amount, rowDisplayProfit(row))
}

function rowCanDecide(row: ProjectFinancier): boolean {
  const status = row.projects?.status
  const isOpen =
    status === 'open_for_funding' ||
    status === 'partially_funded' ||
    status === 'active'
  return isOpen && row.commitment_status !== 'withdrawn'
}

function FinancierRowActionButton({
  row,
  onOpen,
}: {
  row: ProjectFinancier
  onOpen: (projectId: string) => void
}) {
  const isConfirmed = row.commitment_status === 'confirmed'
  const isRejected = row.commitment_status === 'rejected'
  const isBatch = Boolean(row.projects?.group_id)
  const canDecide = rowCanDecide(row) && !isBatch

  const label = canDecide
    ? isRejected
      ? 'Accept'
      : isConfirmed
        ? 'Update'
        : 'Confirm / Reject'
    : 'View'

  return (
    <Button
      type="button"
      size="sm"
      variant={canDecide ? 'default' : 'outline'}
      className="h-9 min-w-[5.5rem] shrink-0 px-3 text-xs sm:min-w-[7.5rem] sm:text-sm"
      onClick={() => onOpen(row.project_id)}
    >
      <span className="sm:hidden">
        {canDecide ? (isRejected ? 'Accept' : isConfirmed ? 'Update' : 'Decide') : 'View'}
      </span>
      <span className="hidden sm:inline">{label}</span>
    </Button>
  )
}

function useFinancierFinanceDetail(onDecisionResolved?: () => void) {
  const { profile } = useAuth()
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailProject, setDetailProject] = useState<Project | null>(null)
  const [groupDetailOpen, setGroupDetailOpen] = useState(false)
  const [groupOpen, setGroupOpen] = useState(false)
  const [groupId, setGroupId] = useState<string | null>(null)
  const [groupStartAtDecide, setGroupStartAtDecide] = useState(false)

  async function openFinanceDetail(projectId: string) {
    const { data, error } = await supabase.from('projects').select('*').eq('id', projectId).single()
    if (error) {
      toast.error(error.message)
      return
    }
    setDetailProject(data as Project)
    setDetailOpen(true)
  }

  function openGroupDetail(id: string) {
    setGroupId(id)
    setGroupDetailOpen(true)
  }

  function openGroupCommit(opts?: { update?: boolean }) {
    setGroupStartAtDecide(Boolean(opts?.update))
    setGroupDetailOpen(false)
    setGroupOpen(true)
  }

  const detailDialog = (
    <>
      <FinanceDetailDialog
        project={detailProject}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        mode="financier"
        financierId={profile?.id}
        onDecisionResolved={onDecisionResolved}
      />
      <GroupFinanceDetailDialog
        groupId={groupId}
        open={groupDetailOpen}
        onOpenChange={(open) => {
          setGroupDetailOpen(open)
          if (!open && !groupOpen) setGroupId(null)
        }}
        financierId={profile?.id}
        onDecisionResolved={onDecisionResolved}
        onConfirmBatch={openGroupCommit}
      />
      <GroupCommitmentDialog
        groupId={groupId}
        open={groupOpen}
        startAtDecide={groupStartAtDecide}
        onOpenChange={(open) => {
          setGroupOpen(open)
          if (!open) {
            setGroupId(null)
            setGroupStartAtDecide(false)
          }
        }}
        onConfirmed={onDecisionResolved}
      />
    </>
  )

  return { openFinanceDetail, openGroupDetail, detailDialog }
}

function FinancierDecisionItem({
  row,
  allRows,
  confirmedTotal,
  onOpenDetail,
  onOpenGroup,
}: {
  row: ProjectFinancier
  allRows: ProjectFinancier[]
  confirmedTotal: number
  onOpenDetail: (projectId: string) => void
  onOpenGroup?: (groupId: string) => void
}) {
  const groupId = row.projects?.group_id ?? null
  const mates = groupId ? groupMateRows(allRows, groupId) : [row]
  const isBatch = Boolean(groupId && mates.length > 1)

  const capital = isBatch
    ? sumGroupBudget(mates.map((m) => ({ capitalRequired: m.projects?.capital_required ?? 0 })))
    : toNumber(row.projects?.capital_required)
  const gap = remainingGap(isBatch ? 0 : confirmedTotal, capital)
  const suggested = isBatch
    ? mates.reduce((s, m) => s + toNumber(m.current_suggested_amount), 0)
    : toNumber(row.current_suggested_amount)
  const funded = fundingProgress(isBatch ? 0 : confirmedTotal, capital)
  const startDate = row.projects?.financing_date
  const dateChip = startDate ? financingDateChipColors(startDate) : null
  const poolBorder = groupId
    ? budgetPoolBorderColors(budgetPoolColorIndexFromId(groupId))
    : null
  const batchProfit = isBatch
    ? sumGroupProfit(mates.map((m) => ({ expectedProfit: m.projects?.expected_profit ?? 0 })))
    : toNumber(row.projects?.expected_profit)

  return (
    <li
      className={cn(
        'rounded-2xl border border-border/30 bg-card p-4 shadow-sm',
        poolBorder ? cn('border-2', poolBorder) : undefined,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {startDate && dateChip ? (
              <span
                className={cn(
                  'shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
                  dateChip.bg,
                  dateChip.text,
                  dateChip.border,
                )}
                title={`Start ${startDate}`}
              >
                {formatFinancingDateChip(startDate)}
              </span>
            ) : null}
            <p className="truncate font-semibold leading-tight text-foreground">
              {isBatch ? `${mates.length} finances · batch` : row.projects?.name}
            </p>
            {isBatch ? (
              <Badge variant="outline" className={cn('text-[10px]', poolBorder)}>
                Batch
              </Badge>
            ) : null}
          </div>
          {isBatch ? (
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {mates.map((m) => (
                <li key={m.id} className="flex justify-between gap-2">
                  <span className="truncate font-medium text-foreground">{m.projects?.name}</span>
                  <span className="shrink-0 tabular-nums">
                    {formatPhp(m.projects?.capital_required)} · {m.projects?.duration_days ?? '—'}d
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs leading-snug text-muted-foreground">
              {formatPercent(funded)} funded · {formatPhp(confirmedTotal)} of {formatPhp(capital)}
            </p>
          )}
        </div>
        {!isBatch && row.projects?.status ? (
          <Badge
            variant={projectStatusVariant(row.projects.status)}
            className={cn('shrink-0 self-center', projectStatusTableClassName(row.projects.status))}
          >
            {PROJECT_STATUS_LABELS[row.projects.status]}
          </Badge>
        ) : null}
      </div>

      {!isBatch ? (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-muted/30 px-3 py-2.5">
            <p className="text-[10px] font-medium uppercase leading-none tracking-wide text-muted-foreground">Still needed</p>
            <p className="mt-1.5 text-sm font-semibold leading-none tabular-nums text-primary">{formatPhp(gap)}</p>
          </div>
          <div className="rounded-lg bg-muted/30 px-3 py-2.5">
            <p className="text-[10px] font-medium uppercase leading-none tracking-wide text-muted-foreground">Suggested for you</p>
            <p className="mt-1.5 text-sm font-semibold leading-none tabular-nums">{formatPhp(suggested)}</p>
          </div>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-muted/30 px-3 py-2.5">
            <p className="text-[10px] font-medium uppercase leading-none tracking-wide text-muted-foreground">Batch budget</p>
            <p className="mt-1.5 text-sm font-semibold leading-none tabular-nums text-primary">{formatPhp(capital)}</p>
          </div>
          <div className="rounded-lg bg-muted/30 px-3 py-2.5">
            <p className="text-[10px] font-medium uppercase leading-none tracking-wide text-muted-foreground">Batch profit</p>
            <p className="mt-1.5 text-sm font-semibold leading-none tabular-nums">{formatPhp(batchProfit)}</p>
          </div>
        </div>
      )}

      <Button
        className="mt-4 h-10 w-full"
        size="sm"
        onClick={() =>
          void (isBatch && groupId && onOpenGroup ? onOpenGroup(groupId) : onOpenDetail(row.project_id))
        }
      >
        {isBatch ? 'Review batch & decide' : 'Review & decide'}
      </Button>
    </li>
  )
}

function FinancierDecisionList({
  rows,
  allRows,
  confirmedByProject,
  onOpenDetail,
  onOpenGroup,
}: {
  rows: ProjectFinancier[]
  allRows?: ProjectFinancier[]
  confirmedByProject: Record<string, number>
  onOpenDetail: (projectId: string) => void
  onOpenGroup?: (groupId: string) => void
}) {
  const source = allRows ?? rows
  const displayRows = collapseRowsByGroup(rows)
  return (
    <ul className="space-y-3">
      {displayRows.map((r) => (
        <FinancierDecisionItem
          key={r.projects?.group_id ? `g-${r.projects.group_id}` : r.id}
          row={r}
          allRows={source}
          confirmedTotal={confirmedByProject[r.project_id] ?? 0}
          onOpenDetail={onOpenDetail}
          onOpenGroup={onOpenGroup}
        />
      ))}
    </ul>
  )
}

function ScrollableFinanceTable({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>
}

function FinancierFinanceList({
  rows,
  onRowClick,
  onOpenGroup,
}: {
  rows: ProjectFinancier[]
  onRowClick: (projectId: string) => void
  onOpenGroup?: (groupId: string) => void
}) {
  const [page, setPage] = useState(1)

  const sortedRows = useMemo(() => sortFinancierRowsForDisplay(rows), [rows])

  const tableRows = useMemo(() => buildFinancierFinanceTableRows(sortedRows), [sortedRows])

  const hasConfirmed = sortedRows.some((r) => r.commitment_status === 'confirmed')

  useEffect(() => {
    setPage(1)
  }, [sortedRows.length])

  const paged = paginateRows(tableRows, page, FINANCE_LIST_PAGE_SIZE)

  return (
    <ScrollableFinanceTable>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-9 px-0" aria-label="Group" />
              <TableHead className="whitespace-nowrap">Start</TableHead>
              <TableHead>Finance</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Commitment</TableHead>
              <TableHead className="text-right">{hasConfirmed ? 'Your amount' : 'Suggested'}</TableHead>
              <TableHead className="text-right">Profit</TableHead>
              <TableHead className="text-right whitespace-nowrap">Total to receive</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.items.map((entry) => {
              const row = entry.row
              const startDate = row.projects?.financing_date ?? null
              const dateChip = startDate ? financingDateChipColors(startDate) : null
              const poolIndex =
                entry.kind === 'group-member' ? budgetPoolColorIndexFromId(entry.groupId) : null
              const poolLeft = budgetPoolLeftBorderColors(poolIndex)

              return (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => void onRowClick(row.project_id)}
                >
                  {entry.kind === 'group-member' && entry.isFirst ? (
                    <TableCell
                      rowSpan={entry.rowSpan}
                      className="w-9 border-r border-border/60 bg-muted/15 p-0 align-middle"
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onOpenGroup?.(entry.groupId)
                        }}
                        className={cn(
                          'flex h-full min-h-[2.75rem] w-9 flex-col items-center justify-center border-l-4 px-0.5 py-3 text-[10px] font-bold uppercase tracking-wide text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground',
                          poolLeft,
                        )}
                        title={`View group (${entry.rowSpan} finances)`}
                      >
                        <span className="select-none [writing-mode:vertical-rl] rotate-180">Group</span>
                      </button>
                    </TableCell>
                  ) : entry.kind === 'single' ? (
                    <TableCell className="w-9 p-0" aria-hidden />
                  ) : null}
                  <TableCell className="whitespace-nowrap">
                    {startDate && dateChip ? (
                      <span
                        className={cn(
                          'inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
                          dateChip.bg,
                          dateChip.text,
                          dateChip.border,
                        )}
                        title={`Start ${startDate}`}
                      >
                        {formatFinancingDateChip(startDate)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="font-medium">
                    <span className="text-primary hover:underline">{row.projects?.name}</span>
                    {entry.kind === 'group-member' ? (
                      <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">· Group batch</span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {row.projects?.status ? (
                      <Badge
                        variant={projectStatusVariant(row.projects.status)}
                        className={projectStatusTableClassName(row.projects.status)}
                      >
                        {PROJECT_STATUS_LABELS[row.projects.status]}
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant={commitmentStatusVariant(row.commitment_status)} className="text-xs">
                      {COMMITMENT_STATUS_LABELS[row.commitment_status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatPhp(rowDisplayAmount(row))}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                    {formatPhp(rowDisplayProfit(row))}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatPhp(rowDisplayTotal(row))}
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <FinancierRowActionButton row={row} onOpen={onRowClick} />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
        <ListPagination
          page={paged.page}
          totalPages={paged.totalPages}
          totalItems={paged.totalItems}
          pageSize={FINANCE_LIST_PAGE_SIZE}
          onPageChange={setPage}
        />
      </ScrollableFinanceTable>
  )
}

function rowExpectedProfit(row: ProjectFinancier): number {
  return rowDisplayProfit(row)
}

export function FinancierDashboardPage() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<ProjectFinancier[]>([])
  const [payments, setPayments] = useState<FinancierReleasePayment[]>([])
  const [confirmedByProject, setConfirmedByProject] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  const reloadDashboard = useCallback(async () => {
    if (!profile) return
    const [cRes, pRes, confirmedRes] = await Promise.all([
      supabase
        .from('project_financiers')
        .select(PROJECT_LIST_SELECT)
        .eq('financier_id', profile.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('financier_release_payments')
        .select('*, project_financiers!inner(financier_id), project_releases(*)')
        .eq('project_financiers.financier_id', profile.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('project_financiers')
        .select('project_id, confirmed_amount, commitment_status')
        .eq('commitment_status', 'confirmed'),
    ])
    setRows(await normalizeFinancierRows((cRes.data as ProjectFinancier[]) ?? []))
    setPayments((pRes.data as FinancierReleasePayment[]) ?? [])
    const confirmedMap: Record<string, number> = {}
    for (const row of (confirmedRes.data as Pick<ProjectFinancier, 'project_id' | 'confirmed_amount'>[]) ?? []) {
      confirmedMap[row.project_id] = (confirmedMap[row.project_id] ?? 0) + toNumber(row.confirmed_amount)
    }
    setConfirmedByProject(confirmedMap)
    setLoading(false)
  }, [profile])

  const { openFinanceDetail, openGroupDetail, detailDialog } = useFinancierFinanceDetail(() => void reloadDashboard())

  useEffect(() => {
    if (!profile) return
    void reloadDashboard()
  }, [profile, reloadDashboard])

  const stats = useMemo(() => {
    const confirmed = rows.filter((r) => r.commitment_status === 'confirmed')
    const deployed = confirmed.reduce((s, r) => s + toNumber(r.confirmed_amount), 0)

    const profitPaidByCommitment = new Map(
      payments.map((p) => [p.project_financier_id, toNumber(p.profit_amount)]),
    )

    let profitReceived = 0
    let profitToReceive = 0
    for (const r of confirmed) {
      const expected = rowExpectedProfit(r)
      const paid = profitPaidByCommitment.get(r.id)
      const status = r.projects?.status
      if (paid != null && paid > 0) {
        profitReceived += paid
      } else if (status === 'released' || status === 'completed') {
        profitReceived += expected
      } else {
        profitToReceive += expected
      }
    }

    const byStatus = Object.entries(
      rows.reduce<Record<string, number>>((acc, r) => {
        const st = r.projects?.status ?? 'draft'
        acc[st] = (acc[st] ?? 0) + 1
        return acc
      }, {}),
    ).map(([status, count]) => ({
      status: PROJECT_STATUS_LABELS[status as keyof typeof PROJECT_STATUS_LABELS] ?? status,
      count,
      key: status,
    }))
    const capitalByProject = confirmed.map((r) => ({
      name: (r.projects?.name ?? 'Finance').slice(0, 14),
      capital: toNumber(r.confirmed_amount),
    }))
    return { deployed, profitReceived, profitToReceive, byStatus, capitalByProject, count: rows.length }
  }, [rows, payments])

  const needsFinance = useMemo(
    () =>
      rows.filter((r) => {
        const isOpen =
          r.projects?.status === 'open_for_funding' || r.projects?.status === 'partially_funded'
        return isOpen && r.commitment_status !== 'confirmed'
      }),
    [rows],
  )

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-24 w-full md:hidden" />
        <div className="hidden gap-4 md:grid md:grid-cols-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Dashboard" description={`Welcome, ${profile?.full_name ?? ''}`} />
      <Card className="mb-6 md:hidden">
        <CardContent className="grid grid-cols-2 gap-3 pt-4">
          <div>
            <p className="text-[10px] leading-tight text-muted-foreground">Assigned finance</p>
            <p className="mt-0.5 text-base font-semibold tabular-nums text-primary">{stats.count}</p>
          </div>
          <div>
            <p className="text-[10px] leading-tight text-muted-foreground">Confirmed capital</p>
            <p className="mt-0.5 text-xs font-semibold tabular-nums text-primary sm:text-sm">{formatPhp(stats.deployed)}</p>
          </div>
          <div>
            <p className="text-[10px] leading-tight text-muted-foreground">Profit received</p>
            <p className="mt-0.5 text-xs font-semibold tabular-nums text-emerald-700 dark:text-emerald-400 sm:text-sm">
              {formatPhp(stats.profitReceived)}
            </p>
          </div>
          <div>
            <p className="text-[10px] leading-tight text-muted-foreground">Profit to receive</p>
            <p className="mt-0.5 text-xs font-semibold tabular-nums text-primary sm:text-sm">
              {formatPhp(stats.profitToReceive)}
            </p>
          </div>
        </CardContent>
      </Card>
      <div className="mb-6 hidden gap-4 md:grid md:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Assigned finance" value={String(stats.count)} />
        <KpiCard label="Confirmed capital" value={formatPhp(stats.deployed)} />
        <KpiCard label="Profit received" value={formatPhp(stats.profitReceived)} />
        <KpiCard label="Profit to receive" value={formatPhp(stats.profitToReceive)} />
      </div>

      <section className="mb-6 md:rounded-xl md:border md:bg-card md:p-4 md:shadow-sm">
        <div className="mb-4 flex items-center justify-center gap-2.5">
          <h2 className="text-base font-semibold leading-none">Needs your decision</h2>
          {needsFinance.length > 0 ? (
            <Badge variant="destructive" className="animate-badge-beat leading-none">
              {needsFinance.length} open
            </Badge>
          ) : null}
        </div>
        {needsFinance.length === 0 ? (
          <EmptyState title="Nothing to decide right now" description="New open finances will appear here." />
        ) : (
          <FinancierDecisionList
            rows={needsFinance}
            allRows={rows}
            confirmedByProject={confirmedByProject}
            onOpenDetail={openFinanceDetail}
            onOpenGroup={openGroupDetail}
          />
        )}
      </section>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Capital by finance</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {stats.capitalByProject.length === 0 ? (
              <EmptyState title="No confirmed capital yet" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.capitalByProject}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d5dee8" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => formatPhp(v)} />
                  <Bar dataKey="capital" fill="#0b2a4a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Finance by status</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {stats.byStatus.length === 0 ? (
              <EmptyState title="No data" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={stats.byStatus} dataKey="count" nameKey="status" innerRadius={45} outerRadius={80}>
                    {stats.byStatus.map((e, i) => (
                      <Cell key={e.key} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent release payments</CardTitle>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <EmptyState title="No release payments yet" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Capital</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.slice(0, 10).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.project_releases?.actual_date ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatPhp(p.capital_amount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatPhp(p.profit_amount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatPhp(p.total_amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {detailDialog}
    </div>
  )
}

export function FinancierProjectsPage() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<ProjectFinancier[]>([])
  const [loading, setLoading] = useState(true)

  const reloadFinanceList = useCallback(async () => {
    if (!profile) return
    const { data, error } = await supabase
      .from('project_financiers')
      .select(PROJECT_LIST_SELECT)
      .eq('financier_id', profile.id)
      .order('created_at', { ascending: false })
    if (error) toast.error(error.message)
    setRows(await normalizeFinancierRows((data as ProjectFinancier[]) ?? []))
    setLoading(false)
  }, [profile])

  const { openFinanceDetail, openGroupDetail, detailDialog } = useFinancierFinanceDetail(() => void reloadFinanceList())

  useEffect(() => {
    if (!profile) return
    void reloadFinanceList()
  }, [profile, reloadFinanceList])

  return (
    <div>
      <PageHeader title="Finance" description="Open finances you can confirm or reject." centered />
      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : rows.length === 0 ? (
        <EmptyState title="No assigned finance" />
      ) : (
        <FinancierFinanceList
          rows={rows}
          onRowClick={openFinanceDetail}
          onOpenGroup={openGroupDetail}
        />
      )}
      {detailDialog}
    </div>
  )
}

export function FinancierProjectDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [row, setRow] = useState<ProjectFinancier | null>(null)
  const [allConfirmed, setAllConfirmed] = useState(0)
  const [pendingFinanciers, setPendingFinanciers] = useState(1)
  const [willing, setWilling] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [groupDetailOpen, setGroupDetailOpen] = useState(false)
  const [groupCommitOpen, setGroupCommitOpen] = useState(false)
  const [groupStartAtDecide, setGroupStartAtDecide] = useState(false)

  async function reload() {
    if (!id || !profile) return
    const { data, error } = await supabase
      .from('project_financiers')
      .select('*, projects:project_id(*)')
      .eq('project_id', id)
      .eq('financier_id', profile.id)
      .maybeSingle()
    if (error) toast.error(error.message)
    const pf = data as ProjectFinancier | null
    setRow(pf)
    if (pf?.commitment_status === 'confirmed') {
      setWilling(moneyInputFromValue(pf.confirmed_amount ?? pf.willing_amount ?? ''))
    } else {
      setWilling(moneyInputFromValue(pf?.willing_amount ?? pf?.current_suggested_amount ?? ''))
    }

    const { data: allRows } = await supabase
      .from('project_financiers')
      .select('confirmed_amount, commitment_status')
      .eq('project_id', id)
    const rows = (allRows as { confirmed_amount: number | string; commitment_status: string }[]) ?? []
    const total = rows
      .filter((r) => r.commitment_status === 'confirmed')
      .reduce((s, r) => s + toNumber(r.confirmed_amount), 0)
    const pending = rows.filter(
      (r) => !['confirmed', 'rejected', 'withdrawn'].includes(r.commitment_status),
    ).length
    setAllConfirmed(total)
    setPendingFinanciers(Math.max(1, pending))
    setLoading(false)
  }

  useEffect(() => {
    void reload()
  }, [id, profile])

  if (loading) return <Skeleton className="h-64 w-full" />
  if (!row || !row.projects) return <EmptyState title="Finance not found or not assigned to you" />

  const project = row.projects as NonNullable<ProjectFinancier['projects']> & {
    description?: string | null
    duration_days?: number
  }
  const capital = toNumber(project.capital_required)
  const progress = fundingProgress(allConfirmed, capital)
  const gap = remainingGap(allConfirmed, capital)
  const myConfirmed = toNumber(row.confirmed_amount)
  const profitShare = expectedProfitShare(myConfirmed, allConfirmed || myConfirmed, toNumber(project.expected_profit))
  const receivable = totalReceivable(myConfirmed, profitShare)
  const roc = returnOnCapital(profitShare, myConfirmed)

  // Ceiling = max total this financier can commit (project cap minus other confirmed amounts).
  const othersConfirmed = Math.max(0, allConfirmed - myConfirmed)
  const ceiling = Math.max(0, capital - othersConfirmed)
  const maxFinanciers = toNumber((project as { max_financiers?: number }).max_financiers)
  const equalShare = maxFinanciers > 0 ? capital / maxFinanciers : ceiling
  const suggested = Math.max(0, Math.min(gap / pendingFinanciers, equalShare, ceiling))
  const additionalAllowed = Math.max(0, ceiling - myConfirmed)
  const enteredAmount = toNumber(willing)
  const hasValidNumber = willing !== '' && enteredAmount > 0
  const overCeiling = hasValidNumber && enteredAmount > ceiling + 0.001
  const unchanged =
    row.commitment_status === 'confirmed' && hasValidNumber && Math.abs(enteredAmount - myConfirmed) < 0.01
  const myName = profile?.full_name ?? 'You'
  const isOpen = project.status === 'open_for_funding' || project.status === 'partially_funded'
  const isConfirmed = row.commitment_status === 'confirmed'
  const canAct = isOpen && row.commitment_status !== 'withdrawn'
  const isRejected = row.commitment_status === 'rejected'
  const batchGroupId = (project as { group_id?: string | null }).group_id ?? null

  useEffect(() => {
    if (batchGroupId) setGroupDetailOpen(true)
  }, [batchGroupId])

  async function confirmCommitment() {
    if (!row) return
    setBusy(true)
    const { error } = await supabase.rpc('financier_confirm_commitment', {
      p_project_financier_id: row.id,
      p_amount: toNumber(willing),
    })
    setBusy(false)
    if (error) {
      toast.error(error.message)
      return
    }
    setConfirmOpen(false)
    toast.success(isConfirmed ? 'Commitment updated' : 'Commitment confirmed')
    await reload()
  }

  async function rejectCommitment() {
    if (!row) return
    setBusy(true)
    const { error } = await supabase.rpc('financier_reject_commitment', {
      p_project_financier_id: row.id,
    })
    setBusy(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Commitment rejected')
    await reload()
  }

  return (
    <div>
      <PageHeader
        title={batchGroupId ? 'Finance batch' : project.name}
        description={
          batchGroupId
            ? 'One total commitment for the whole batch — split by budget weight.'
            : `Suggested ${formatPhp(row.current_suggested_amount)}`
        }
        actions={
          <Button asChild variant="outline">
            <Link to="/app/finance">Back</Link>
          </Button>
        }
      />
      {batchGroupId ? (
        <>
          <GroupFinanceDetailDialog
            groupId={batchGroupId}
            open={groupDetailOpen}
            onOpenChange={(open) => {
              setGroupDetailOpen(open)
              if (!open) navigate('/app/finance')
            }}
            financierId={profile?.id}
            onDecisionResolved={() => void reload()}
            onConfirmBatch={(opts) => {
              setGroupStartAtDecide(Boolean(opts?.update))
              setGroupDetailOpen(false)
              setGroupCommitOpen(true)
            }}
          />
          <GroupCommitmentDialog
            groupId={batchGroupId}
            open={groupCommitOpen}
            startAtDecide={groupStartAtDecide}
            onOpenChange={(open) => {
              setGroupCommitOpen(open)
              if (!open) setGroupStartAtDecide(false)
            }}
            onConfirmed={() => void reload()}
          />
        </>
      ) : (
        <>
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Finance status</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge
              variant={projectStatusVariant(project.status)}
              className={projectStatusClassName(project.status)}
            >
              {PROJECT_STATUS_LABELS[project.status]}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Your commitment</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={commitmentStatusVariant(row.commitment_status)}>
              {COMMITMENT_STATUS_LABELS[row.commitment_status]}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Funding progress</CardTitle>
          </CardHeader>
          <CardContent>
            <Progress value={progress} />
            <p className="mt-2 text-xs text-muted-foreground">
              {formatPercent(progress)} · remaining gap {formatPhp(gap)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your decision</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isConfirmed ? (
              <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">
                You confirmed {formatPhp(myConfirmed)} for this finance.
                {isOpen && additionalAllowed > 0
                  ? ` You can add up to ${formatPhp(additionalAllowed)} more while funding is open.`
                  : ' Update your amount or cancel if you change your mind.'}
              </p>
            ) : isRejected ? (
              <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                You rejected this finance. You can still accept if you change your mind.
              </p>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="willing">Amount you can commit (PHP)</Label>
              <MoneyInput
                id="willing"
                value={willing}
                onValueChange={setWilling}
                disabled={!canAct}
                aria-invalid={overCeiling}
              />
              <p className="text-xs text-muted-foreground">
                {isConfirmed ? (
                  <>
                    Remaining gap: <span className="font-medium">{formatPhp(gap)}</span> · Max total you can commit:{' '}
                    <span className="font-medium">{formatPhp(ceiling)}</span>
                    {additionalAllowed > 0 ? (
                      <>
                        {' '}
                        · You can add up to <span className="font-medium">{formatPhp(additionalAllowed)}</span> more
                      </>
                    ) : null}
                  </>
                ) : (
                  <>
                    Suggested share: <span className="font-medium">{formatPhp(suggested)}</span> · You can commit up to{' '}
                    <span className="font-medium">{formatPhp(ceiling)}</span>
                  </>
                )}
              </p>
              {overCeiling ? (
                <p className="text-xs font-semibold text-destructive">
                  {myName} can only commit up to {formatPhp(ceiling)}. Try {formatPhp(suggested)} instead.
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canAct || suggested <= 0}
                onClick={() => setWilling(String(suggested.toFixed(2)))}
              >
                Use suggested
              </Button>
            </div>

            <div className="flex gap-3">
              <Button
                className="flex-1"
                disabled={!canAct || busy || !hasValidNumber || overCeiling || unchanged}
                onClick={() => setConfirmOpen(true)}
              >
                {isConfirmed ? 'Update amount' : isRejected ? 'Accept' : 'Confirm'}
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                disabled={!canAct || busy}
                onClick={() => void rejectCommitment()}
              >
                {isConfirmed ? 'Cancel commitment' : 'Reject'}
              </Button>
            </div>

            <CommitmentConfirmDialog
              open={confirmOpen}
              onOpenChange={setConfirmOpen}
              financeName={project.name}
              amount={enteredAmount}
              stillNeeded={gap}
              suggested={suggested}
              capitalRequired={capital}
              fundedAfter={
                isConfirmed ? allConfirmed - myConfirmed + enteredAmount : allConfirmed + enteredAmount
              }
              isUpdate={isConfirmed}
              previousAmount={myConfirmed}
              busy={busy}
              onConfirm={() => void confirmCommitment()}
            />

            {!isOpen ? (
              <p className="text-xs text-muted-foreground">
                This finance is {PROJECT_STATUS_LABELS[project.status].toLowerCase()} and is not open for changes.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your confirmed outlook</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              Confirmed capital: <span className="font-semibold tabular-nums">{formatPhp(myConfirmed)}</span>
            </p>
            <p>
              Expected profit share: <span className="font-semibold tabular-nums">{formatPhp(profitShare)}</span>
            </p>
            <p>
              Total receivable: <span className="font-semibold tabular-nums">{formatPhp(receivable)}</span>
            </p>
            <p>
              ROC: <span className="font-semibold tabular-nums">{formatPercent(roc)}</span>
            </p>
            <p className="text-muted-foreground">Release date: {project.release_date ?? 'TBA'}</p>
          </CardContent>
        </Card>
      </div>
        </>
      )}
    </div>
  )
}

export function FinancierCommitmentsPage() {
  const { profile } = useAuth()
  const { openFinanceDetail, detailDialog } = useFinancierFinanceDetail()
  const [rows, setRows] = useState<ProjectFinancier[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile) return
    void supabase
      .from('project_financiers')
      .select('*, projects:project_id(id, name, status, expected_profit, financing_date, group_id)')
      .eq('financier_id', profile.id)
      .order('updated_at', { ascending: false })
      .then(async ({ data, error }) => {
        if (error) toast.error(error.message)
        setRows(await normalizeFinancierRows((data as ProjectFinancier[]) ?? []))
        setLoading(false)
      })
  }, [profile])

  return (
    <div>
      <PageHeader title="My commitments" />
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : rows.length === 0 ? (
            <EmptyState title="No commitments" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Finance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Willing</TableHead>
                  <TableHead className="text-right">Confirmed</TableHead>
                  <TableHead className="text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer"
                    onClick={() => void openFinanceDetail(r.project_id)}
                  >
                    <TableCell className="max-w-[11rem] sm:max-w-none">
                      <div className="flex items-center gap-1.5">
                        <span className="min-w-0 truncate text-primary">{r.projects?.name}</span>
                        {r.projects?.group_id ? (
                          <Badge
                            variant="outline"
                            className="h-5 shrink-0 px-1.5 py-0 text-[10px] leading-none"
                          >
                            Batch
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={commitmentStatusVariant(r.commitment_status)}>
                        {COMMITMENT_STATUS_LABELS[r.commitment_status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatPhp(r.willing_amount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatPhp(r.confirmed_amount)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPercent(toNumber(r.confirmed_percentage) * 100)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {detailDialog}
    </div>
  )
}

export function FinancierReleasesPage() {
  const { profile } = useAuth()
  const [upcoming, setUpcoming] = useState<ProjectFinancier[]>([])
  const [payments, setPayments] = useState<FinancierReleasePayment[]>([])
  const [releases, setReleases] = useState<ProjectRelease[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile) return
    void (async () => {
      const [cRes, payRes, relRes] = await Promise.all([
        supabase
          .from('project_financiers')
          .select('*, projects:project_id(id, name, status, release_date)')
          .eq('financier_id', profile.id)
          .eq('commitment_status', 'confirmed'),
        supabase
          .from('financier_release_payments')
          .select('*, project_financiers!inner(financier_id), project_releases(*)')
          .eq('project_financiers.financier_id', profile.id)
          .order('created_at', { ascending: false }),
        supabase.from('project_releases').select('*, projects:project_id(id, name, status)').order('created_at', { ascending: false }).limit(50),
      ])
      setUpcoming((cRes.data as ProjectFinancier[]) ?? [])
      setPayments((payRes.data as FinancierReleasePayment[]) ?? [])
      setReleases((relRes.data as ProjectRelease[]) ?? [])
      setLoading(false)
    })()
  }, [profile])

  return (
    <div>
      <PageHeader title="Releases" description="Upcoming and historical payouts." />
      {loading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Upcoming</CardTitle>
            </CardHeader>
            <CardContent>
              {upcoming.length === 0 ? (
                <EmptyState title="No upcoming releases" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Finance</TableHead>
                      <TableHead>Release date</TableHead>
                      <TableHead className="text-right">Confirmed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {upcoming.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{r.projects?.name}</TableCell>
                        <TableCell>{r.projects?.release_date ?? 'TBA'}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatPhp(r.confirmed_amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Payment history</CardTitle>
            </CardHeader>
            <CardContent>
              {payments.length === 0 ? (
                <EmptyState title="No payments yet" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>{p.project_releases?.actual_date ?? '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatPhp(p.total_amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {releases.length > 0 ? (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Finance releases</p>
                  {releases.slice(0, 5).map((r) => (
                    <div key={r.id} className="flex items-center justify-between text-sm">
                      <span>{r.projects?.name}</span>
                      <Badge variant={releaseStatusVariant(r.release_status)}>{RELEASE_STATUS_LABELS[r.release_status]}</Badge>
                    </div>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

export function FinancierAnalyticsPage() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<ProjectFinancier[]>([])
  const [budgetByProject, setBudgetByProject] = useState<
    Map<
      string,
      {
        ownCapital: number
        manualProfit: number | null
        lenders: BudgetLenderInput[]
      }
    >
  >(new Map())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile) return
    void (async () => {
      const [pfRes, budgetRes] = await Promise.all([
        supabase
          .from('project_financiers')
          .select('*, projects:project_id(id, name, status, capital_required, expected_profit)')
          .eq('financier_id', profile.id)
          .eq('commitment_status', 'confirmed'),
        supabase
          .from('financier_project_budgets')
          .select(
            'project_id, own_capital, manual_profit, financier_project_lenders(lender_name, borrowed_amount, promise_type, promise_value)',
          )
          .eq('financier_id', profile.id),
      ])
      if (pfRes.error) toast.error(pfRes.error.message)
      if (budgetRes.error) toast.error(budgetRes.error.message)
      setRows((pfRes.data as ProjectFinancier[]) ?? [])

      const map = new Map<
        string,
        { ownCapital: number; manualProfit: number | null; lenders: BudgetLenderInput[] }
      >()
      for (const b of (budgetRes.data as FinancierProjectBudget[]) ?? []) {
        map.set(b.project_id, {
          ownCapital: toNumber(b.own_capital),
          manualProfit:
            b.manual_profit === null || b.manual_profit === undefined ? null : toNumber(b.manual_profit),
          lenders: (b.financier_project_lenders ?? []).map((l) => ({
            lender_name: l.lender_name,
            borrowed_amount: l.borrowed_amount,
            promise_type: l.promise_type,
            promise_value: l.promise_value,
          })),
        })
      }
      setBudgetByProject(map)
      setLoading(false)
    })()
  }, [profile])

  const chart = rows.map((r) => ({
    name: (r.projects?.name ?? 'P').slice(0, 12),
    capital: toNumber(r.confirmed_amount),
    profit: toNumber(r.projects?.expected_profit) * toNumber(r.confirmed_percentage),
  }))

  const totalCapital = chart.reduce((s, r) => s + r.capital, 0)
  const totalProfit = chart.reduce((s, r) => s + r.profit, 0)

  const chipInAnalytics = useMemo(() => {
    type PersonRow = { name: string; capital: number; profit: number; key: string }
    const byPerson = new Map<string, PersonRow>()

    function addPerson(name: string, capital: number, profit: number) {
      const label = name.trim() || 'Chip-in'
      const key = label.toLowerCase()
      const existing = byPerson.get(key) ?? { name: label, capital: 0, profit: 0, key }
      existing.capital += capital
      existing.profit += profit
      byPerson.set(key, existing)
    }

    for (const row of rows) {
      const budget = budgetByProject.get(row.project_id)
      const myConfirmed = toNumber(row.confirmed_amount)
      const capitalRequired = toNumber(row.projects?.capital_required)
      const expectedProfit = toNumber(row.projects?.expected_profit)
      const expectedShare = budgetBasedProfitShare(myConfirmed, capitalRequired, expectedProfit)
      const myProfitShare = budget?.manualProfit ?? expectedShare
      const ownCapital = budget?.ownCapital ?? myConfirmed
      const lenders = budget?.lenders ?? []

      const summary = calculateBudgetSummary({
        ownCapital,
        myConfirmed,
        myProfitShare,
        myCapitalReturn: myConfirmed,
        lenders,
      })

      addPerson('You', summary.totalOwn, summary.myNetProfit)
      for (const lender of summary.lenders) {
        addPerson(lender.lender_name, lender.borrowed_amount, lender.profit_portion ?? 0)
      }
    }

    const people = [...byPerson.values()]
      .filter((p) => p.capital > 0 || p.profit > 0)
      .sort((a, b) => {
        if (a.name === 'You') return -1
        if (b.name === 'You') return 1
        return b.capital - a.capital
      })

    const you = people.find((p) => p.name === 'You')
    const chipIns = people.filter((p) => p.name !== 'You')

    const capitalPie = people
      .filter((p) => p.capital > 0)
      .map((p, i) => ({
        name: p.name,
        value: p.capital,
        key: `cap-${p.key}`,
        color: FINANCIER_COLORS[p.name === 'You' ? 0 : i % FINANCIER_COLORS.length],
      }))

    const profitPie = people
      .filter((p) => p.profit > 0)
      .map((p, i) => ({
        name: p.name,
        value: p.profit,
        key: `profit-${p.key}`,
        color: FINANCIER_COLORS[p.name === 'You' ? 0 : i % FINANCIER_COLORS.length],
      }))

    return {
      people,
      you,
      chipIns,
      capitalPie,
      profitPie,
      chipInCapital: chipIns.reduce((s, p) => s + p.capital, 0),
      chipInProfit: chipIns.reduce((s, p) => s + p.profit, 0),
    }
  }, [rows, budgetByProject])

  return (
    <div>
      <PageHeader title="Analytics" description="Personal capital and expected profit." />
      {loading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <>
          <div className="mb-6 grid gap-4 md:grid-cols-3">
            <KpiCard label="Confirmed capital" value={formatPhp(totalCapital)} />
            <KpiCard label="Expected profit" value={formatPhp(totalProfit)} />
            <KpiCard label="Blended ROC" value={formatPercent(returnOnCapital(totalProfit, totalCapital))} />
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Capital vs expected profit</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              {chart.length === 0 ? (
                <EmptyState title="No confirmed financing yet" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#d5dee8" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => formatPhp(v)} />
                    <Bar dataKey="capital" fill="#0b2a4a" name="Capital" />
                    <Bar dataKey="profit" fill="#1f7a4d" name="Expected profit" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">Budget & chip-in breakdown</CardTitle>
              <p className="text-sm text-muted-foreground">
                Who chipped in to your finances, their capital and gain, and your own share.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {rows.length === 0 ? (
                <EmptyState title="No budget data yet" description="Confirm a finance to see chip-in analytics." />
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <KpiCard
                      label="Your capital"
                      value={formatPhp(chipInAnalytics.you?.capital ?? 0)}
                    />
                    <KpiCard label="Your gain" value={formatPhp(chipInAnalytics.you?.profit ?? 0)} />
                    <KpiCard label="Chip-in capital" value={formatPhp(chipInAnalytics.chipInCapital)} />
                    <KpiCard label="Chip-in gain" value={formatPhp(chipInAnalytics.chipInProfit)} />
                  </div>

                  <div className="grid gap-6 md:grid-cols-2">
                    <AnalyticsPieSplit
                      title="Capital mix"
                      data={chipInAnalytics.capitalPie}
                      emptyMessage="No capital recorded yet."
                    />
                    <AnalyticsPieSplit
                      title="Gain mix"
                      data={chipInAnalytics.profitPie}
                      emptyMessage="No gain allocated yet."
                    />
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-border/50">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Person</TableHead>
                          <TableHead className="text-right">Capital</TableHead>
                          <TableHead className="text-right">Gain</TableHead>
                          <TableHead className="text-right">Total to receive</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {chipInAnalytics.people.map((person) => (
                          <TableRow key={person.key}>
                            <TableCell className="font-medium">
                              {person.name}
                              {person.name === 'You' ? (
                                <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{formatPhp(person.capital)}</TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              {formatPhp(person.profit)}
                            </TableCell>
                            <TableCell className="text-right font-medium tabular-nums">
                              {formatPhp(totalReceivable(person.capital, person.profit))}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {chipInAnalytics.chipIns.length === 0 ? (
                    <p className="text-center text-sm text-muted-foreground">
                      No chip-ins recorded yet. Add them on the Budget page to track who funded with you.
                    </p>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

type AnalyticsPieSlice = { name: string; value: number; key: string; color?: string }

function AnalyticsPieSplit({
  title,
  data,
  emptyMessage,
}: {
  title: string
  data: AnalyticsPieSlice[]
  emptyMessage: string
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-muted/10 p-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      {data.length === 0 ? (
        <p className="flex h-32 items-center justify-center text-center text-sm text-muted-foreground">
          {emptyMessage}
        </p>
      ) : (
        <div className="flex items-center gap-3">
          <ul className="min-w-0 flex-1 space-y-1 text-sm">
            {data.map((entry, i) => {
              const color = entry.color ?? FINANCIER_COLORS[i % FINANCIER_COLORS.length]
              return (
                <li key={entry.key} className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                    <span className="truncate">{entry.name}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{formatPhp(entry.value)}</span>
                </li>
              )
            })}
          </ul>
          <div className="h-28 w-28 shrink-0 sm:h-32 sm:w-32">
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

export function FinancierProfilePage() {
  const { profile, refreshProfile } = useAuth()
  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinBusy, setPinBusy] = useState(false)

  useEffect(() => {
    setFullName(profile?.full_name ?? '')
  }, [profile])

  if (!profile) return null

  return (
    <div>
      <PageHeader title="Profile" />
      <div className="grid max-w-3xl gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Name</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault()
                const { error } = await supabase
                  .from('profiles')
                  .update({
                    full_name: fullName,
                    display_name: fullName,
                  })
                  .eq('id', profile.id)
                if (error) toast.error(error.message)
                else {
                  toast.success('Saved')
                  await refreshProfile()
                }
              }}
            >
              <div className="space-y-2">
                <Label>Full name</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <Button type="submit">Save</Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Change PIN</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">Default PIN is 0000 until you change it.</p>
            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault()
                if (!/^[0-9]{4}$/.test(newPin)) {
                  toast.error('New PIN must be 4 digits')
                  return
                }
                if (newPin !== confirmPin) {
                  toast.error('PINs do not match')
                  return
                }
                setPinBusy(true)
                try {
                  const { data, error } = await supabase.functions.invoke('change-pin', {
                    body: { current_pin: currentPin, new_pin: newPin },
                  })
                  if (error) throw new Error(error.message)
                  if (data?.error) throw new Error(String(data.error))
                  toast.success('PIN updated')
                  setCurrentPin('')
                  setNewPin('')
                  setConfirmPin('')
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'Failed to change PIN')
                } finally {
                  setPinBusy(false)
                }
              }}
            >
              <div className="space-y-2">
                <Label>Current PIN</Label>
                <Input
                  inputMode="numeric"
                  maxLength={4}
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>New PIN</Label>
                <Input
                  inputMode="numeric"
                  maxLength={4}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Confirm new PIN</Label>
                <Input
                  inputMode="numeric"
                  maxLength={4}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  required
                />
              </div>
              <Button type="submit" disabled={pinBusy}>
                {pinBusy ? 'Saving…' : 'Update PIN'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export function FinancierChangePasswordPage() {
  const { changePassword } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  return (
    <div>
      <PageHeader title="Change password" />
      <Card className="max-w-md">
        <CardContent className="pt-6">
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault()
              if (password !== confirm) {
                toast.error('Passwords do not match')
                return
              }
              const result = await changePassword(password)
              if (result.error) toast.error(result.error)
              else {
                setPassword('')
                setConfirm('')
              }
            }}
          >
            <div className="space-y-2">
              <Label>New password</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
            </div>
            <div className="space-y-2">
              <Label>Confirm</Label>
              <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={8} required />
            </div>
            <Button type="submit">Update password</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
