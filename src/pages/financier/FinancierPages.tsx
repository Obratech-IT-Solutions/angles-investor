import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
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
import {
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
import { financingDateChipColors, formatFinancingDateChip } from '@/lib/financierColors'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import {
  COMMITMENT_STATUS_LABELS,
  PROJECT_STATUS_LABELS,
  RELEASE_STATUS_LABELS,
  type FinancierReleasePayment,
  type Project,
  type ProjectFinancier,
  type ProjectRelease,
} from '@/types'

const COLORS = ['#0b2a4a', '#1a4a73', '#1f7a4d', '#b7791f', '#5b6b7c']
const FINANCE_LIST_PAGE_SIZE = 6

function useFinancierFinanceDetail(onDecisionResolved?: () => void) {
  const { profile } = useAuth()
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailProject, setDetailProject] = useState<Project | null>(null)

  async function openFinanceDetail(projectId: string) {
    const { data, error } = await supabase.from('projects').select('*').eq('id', projectId).single()
    if (error) {
      toast.error(error.message)
      return
    }
    setDetailProject(data as Project)
    setDetailOpen(true)
  }

  const detailDialog = (
    <FinanceDetailDialog
      project={detailProject}
      open={detailOpen}
      onOpenChange={setDetailOpen}
      mode="financier"
      financierId={profile?.id}
      onDecisionResolved={onDecisionResolved}
    />
  )

  return { openFinanceDetail, detailDialog }
}

function FinanceDecisionButton({ projectId, canDecide }: { projectId: string; canDecide: boolean }) {
  return (
    <Button
      asChild
      size="sm"
      variant={canDecide ? 'default' : 'outline'}
      className="h-9 min-w-[5.5rem] shrink-0 px-3 text-xs sm:min-w-[7.5rem] sm:text-sm"
    >
      <Link to={`/app/finance/${projectId}`}>
        {canDecide ? (
          <>
            <span className="sm:hidden">Decide</span>
            <span className="hidden sm:inline">Confirm / Reject</span>
          </>
        ) : (
          'View'
        )}
      </Link>
    </Button>
  )
}

function FinancierDecisionItem({
  row,
  confirmedTotal,
  onOpenDetail,
}: {
  row: ProjectFinancier
  confirmedTotal: number
  onOpenDetail: (projectId: string) => void
}) {
  const capital = toNumber(row.projects?.capital_required)
  const gap = remainingGap(confirmedTotal, capital)
  const suggested = toNumber(row.current_suggested_amount)
  const funded = fundingProgress(confirmedTotal, capital)
  const startDate = row.projects?.financing_date
  const dateChip = startDate ? financingDateChipColors(startDate) : null

  return (
    <li className="rounded-2xl border border-border/30 bg-card p-4 shadow-sm">
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
            <p className="truncate font-semibold leading-tight text-foreground">{row.projects?.name}</p>
          </div>
          <p className="mt-1 text-xs leading-snug text-muted-foreground">
            {formatPercent(funded)} funded · {formatPhp(confirmedTotal)} of {formatPhp(capital)}
          </p>
        </div>
        {row.projects?.status ? (
          <Badge
            variant={projectStatusVariant(row.projects.status)}
            className={cn('shrink-0 self-center', projectStatusTableClassName(row.projects.status))}
          >
            {PROJECT_STATUS_LABELS[row.projects.status]}
          </Badge>
        ) : null}
      </div>

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

      <Button className="mt-4 h-10 w-full" size="sm" onClick={() => void onOpenDetail(row.project_id)}>
        Review & decide
      </Button>
    </li>
  )
}

function FinancierDecisionList({
  rows,
  confirmedByProject,
  onOpenDetail,
}: {
  rows: ProjectFinancier[]
  confirmedByProject: Record<string, number>
  onOpenDetail: (projectId: string) => void
}) {
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <FinancierDecisionItem
          key={r.id}
          row={r}
          confirmedTotal={confirmedByProject[r.project_id] ?? 0}
          onOpenDetail={onOpenDetail}
        />
      ))}
    </ul>
  )
}

function ScrollableFinanceTable({ children }: { children: ReactNode }) {
  return <div className="hidden overflow-x-auto md:block">{children}</div>
}

function FinancierFinanceSummaryCard({
  row,
  confirmedTotal,
  pendingPayout,
  onOpen,
}: {
  row: ProjectFinancier
  confirmedTotal: number
  pendingPayout?: number
  onOpen: (projectId: string) => void
}) {
  const capital = toNumber(row.projects?.capital_required)
  const funded = fundingProgress(confirmedTotal, capital)
  const isConfirmed = row.commitment_status === 'confirmed'
  const displayAmount = isConfirmed ? toNumber(row.confirmed_amount) : toNumber(row.current_suggested_amount)
  const startDate = row.projects?.financing_date
  const dateChip = startDate ? financingDateChipColors(startDate) : null

  return (
    <li>
      <button
        type="button"
        className="w-full rounded-2xl border border-border/30 bg-card p-4 text-left shadow-sm transition-colors active:bg-muted/30"
        onClick={() => void onOpen(row.project_id)}
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
              <p className="truncate font-semibold leading-tight text-foreground">{row.projects?.name}</p>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {row.projects?.status ? (
                <Badge
                  variant={projectStatusVariant(row.projects.status)}
                  className={cn('text-[10px]', projectStatusTableClassName(row.projects.status))}
                >
                  {PROJECT_STATUS_LABELS[row.projects.status]}
                </Badge>
              ) : null}
              <Badge variant={commitmentStatusVariant(row.commitment_status)} className="text-[10px]">
                {COMMITMENT_STATUS_LABELS[row.commitment_status]}
              </Badge>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground/60" aria-hidden />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-muted/30 px-3 py-2">
            <p className="text-[10px] font-medium uppercase leading-none tracking-wide text-muted-foreground">
              {isConfirmed ? 'Your commitment' : 'Suggested'}
            </p>
            <p className="mt-1 text-sm font-semibold leading-none tabular-nums">{formatPhp(displayAmount)}</p>
          </div>
          <div className="rounded-lg bg-muted/30 px-3 py-2">
            <p className="text-[10px] font-medium uppercase leading-none tracking-wide text-muted-foreground">Funded</p>
            <p className="mt-1 text-sm font-semibold leading-none tabular-nums">{formatPercent(funded)}</p>
          </div>
        </div>

        <Progress value={funded} className="mt-3 h-1.5" />
        <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
          {formatPhp(confirmedTotal)} of {formatPhp(capital)} raised
        </p>
        {pendingPayout != null && pendingPayout > 0 ? (
          <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
            <p className="text-xs font-medium text-primary">Payout ready: {formatPhp(pendingPayout)}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Tap to open and confirm you received the money.</p>
          </div>
        ) : null}
      </button>
    </li>
  )
}

function FinancierFinanceList({
  rows,
  confirmedByProject,
  pendingPayoutByProject,
  onRowClick,
  onOpenDecision,
}: {
  rows: ProjectFinancier[]
  confirmedByProject: Record<string, number>
  pendingPayoutByProject?: Record<string, number>
  onRowClick: (projectId: string) => void
  onOpenDecision?: (projectId: string) => void
}) {
  const [page, setPage] = useState(1)

  const needsDecision = rows.filter((r) => {
    const isOpen = r.projects?.status === 'open_for_funding' || r.projects?.status === 'partially_funded'
    return isOpen && r.commitment_status !== 'confirmed'
  })
  const otherRows = rows.filter((r) => !needsDecision.some((n) => n.id === r.id))

  useEffect(() => {
    setPage(1)
  }, [rows.length])

  const mobilePage = paginateRows(otherRows, page, FINANCE_LIST_PAGE_SIZE)
  const desktopPage = paginateRows(rows, page, FINANCE_LIST_PAGE_SIZE)

  return (
    <>
      <div className="space-y-6 md:hidden">
        {needsDecision.length > 0 ? (
          <section>
            <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Needs your decision
            </p>
            <FinancierDecisionList
              rows={needsDecision}
              confirmedByProject={confirmedByProject}
              onOpenDetail={(projectId) => (onOpenDecision ?? onRowClick)(projectId)}
            />
          </section>
        ) : null}

        {otherRows.length > 0 ? (
          <section>
            {needsDecision.length > 0 ? (
              <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Your finances
              </p>
            ) : null}
            <ul className="space-y-3">
              {mobilePage.items.map((r) => (
                <FinancierFinanceSummaryCard
                  key={r.id}
                  row={r}
                  confirmedTotal={confirmedByProject[r.project_id] ?? 0}
                  pendingPayout={pendingPayoutByProject?.[r.project_id]}
                  onOpen={onRowClick}
                />
              ))}
            </ul>
            <ListPagination
              page={mobilePage.page}
              totalPages={mobilePage.totalPages}
              totalItems={mobilePage.totalItems}
              pageSize={FINANCE_LIST_PAGE_SIZE}
              onPageChange={setPage}
            />
          </section>
        ) : null}
      </div>

      <ScrollableFinanceTable>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Start</TableHead>
              <TableHead>Finance</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Commitment</TableHead>
              <TableHead className="text-right">Suggested</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {desktopPage.items.map((r) => {
              const isOpen =
                r.projects?.status === 'open_for_funding' || r.projects?.status === 'partially_funded'
              const canDecide = isOpen && r.commitment_status !== 'confirmed'
              const startDate = r.projects?.financing_date
              const dateChip = startDate ? financingDateChipColors(startDate) : null
              return (
                <TableRow
                  key={r.id}
                  className="cursor-pointer"
                  onClick={() => void onRowClick(r.project_id)}
                >
                  <TableCell>
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
                    <span className="text-primary hover:underline">{r.projects?.name}</span>
                  </TableCell>
                  <TableCell>
                    {r.projects?.status ? (
                      <Badge
                        variant={projectStatusVariant(r.projects.status)}
                        className={projectStatusTableClassName(r.projects.status)}
                      >
                        {PROJECT_STATUS_LABELS[r.projects.status]}
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant={commitmentStatusVariant(r.commitment_status)} className="text-xs">
                      {COMMITMENT_STATUS_LABELS[r.commitment_status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatPhp(r.current_suggested_amount)}</TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <FinanceDecisionButton projectId={r.project_id} canDecide={canDecide} />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
        <ListPagination
          page={desktopPage.page}
          totalPages={desktopPage.totalPages}
          totalItems={desktopPage.totalItems}
          pageSize={FINANCE_LIST_PAGE_SIZE}
          onPageChange={setPage}
        />
      </ScrollableFinanceTable>
    </>
  )
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
        .select('*, projects:project_id(id, name, status, capital_required, expected_profit, financing_date, release_date)')
        .eq('financier_id', profile.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('financier_release_payments')
        .select('*, project_financiers!inner(financier_id), project_releases(*)')
        .eq('project_financiers.financier_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('project_financiers')
        .select('project_id, confirmed_amount, commitment_status')
        .eq('commitment_status', 'confirmed'),
    ])
    setRows((cRes.data as ProjectFinancier[]) ?? [])
    setPayments((pRes.data as FinancierReleasePayment[]) ?? [])
    const confirmedMap: Record<string, number> = {}
    for (const row of (confirmedRes.data as Pick<ProjectFinancier, 'project_id' | 'confirmed_amount'>[]) ?? []) {
      confirmedMap[row.project_id] = (confirmedMap[row.project_id] ?? 0) + toNumber(row.confirmed_amount)
    }
    setConfirmedByProject(confirmedMap)
    setLoading(false)
  }, [profile])

  const { openFinanceDetail, detailDialog } = useFinancierFinanceDetail(() => void reloadDashboard())

  useEffect(() => {
    if (!profile) return
    void reloadDashboard()
  }, [profile, reloadDashboard])

  const stats = useMemo(() => {
    const confirmed = rows.filter((r) => r.commitment_status === 'confirmed')
    const deployed = confirmed.reduce((s, r) => s + toNumber(r.confirmed_amount), 0)
    const expectedProfit = confirmed.reduce((s, r) => {
      const totalConfirmed = toNumber(r.confirmed_amount) // personal view approximation when project total unknown
      void totalConfirmed
      const projectProfit = toNumber(r.projects?.expected_profit)
      const pct = toNumber(r.confirmed_percentage)
      return s + projectProfit * pct
    }, 0)
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
    return { deployed, expectedProfit, byStatus, capitalByProject, count: rows.length }
  }, [rows])

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
        <div className="hidden gap-4 md:grid md:grid-cols-3">
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
        <CardContent className="grid grid-cols-3 gap-2 pt-4">
          <div>
            <p className="text-[10px] leading-tight text-muted-foreground">Assigned finance</p>
            <p className="mt-0.5 text-base font-semibold tabular-nums text-primary">{stats.count}</p>
          </div>
          <div>
            <p className="text-[10px] leading-tight text-muted-foreground">Confirmed capital</p>
            <p className="mt-0.5 text-xs font-semibold tabular-nums text-primary sm:text-sm">{formatPhp(stats.deployed)}</p>
          </div>
          <div>
            <p className="text-[10px] leading-tight text-muted-foreground">Expected profit</p>
            <p className="mt-0.5 text-xs font-semibold tabular-nums text-primary sm:text-sm">
              {formatPhp(stats.expectedProfit)}
            </p>
          </div>
        </CardContent>
      </Card>
      <div className="mb-6 hidden gap-4 md:grid md:grid-cols-3">
        <KpiCard label="Assigned finance" value={String(stats.count)} />
        <KpiCard label="Confirmed capital" value={formatPhp(stats.deployed)} />
        <KpiCard label="Expected profit share" value={formatPhp(stats.expectedProfit)} />
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
            confirmedByProject={confirmedByProject}
            onOpenDetail={openFinanceDetail}
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
                {payments.map((p) => (
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
  const [confirmedByProject, setConfirmedByProject] = useState<Record<string, number>>({})
  const [pendingPayoutByProject, setPendingPayoutByProject] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  const reloadFinanceList = useCallback(async () => {
    if (!profile) return
    const [rowsRes, confirmedRes, payoutRes] = await Promise.all([
      supabase
        .from('project_financiers')
        .select('*, projects:project_id(id, name, status, capital_required, expected_profit, financing_date, release_date)')
        .eq('financier_id', profile.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('project_financiers')
        .select('project_id, confirmed_amount, commitment_status')
        .eq('commitment_status', 'confirmed'),
      supabase
        .from('financier_release_payments')
        .select('total_amount, received_at, project_financiers!inner(financier_id, project_id)')
        .eq('project_financiers.financier_id', profile.id)
        .is('received_at', null),
    ])
    if (rowsRes.error) toast.error(rowsRes.error.message)
    setRows((rowsRes.data as ProjectFinancier[]) ?? [])
    const confirmedMap: Record<string, number> = {}
    for (const row of (confirmedRes.data as Pick<ProjectFinancier, 'project_id' | 'confirmed_amount'>[]) ?? []) {
      confirmedMap[row.project_id] = (confirmedMap[row.project_id] ?? 0) + toNumber(row.confirmed_amount)
    }
    setConfirmedByProject(confirmedMap)
    const payoutMap: Record<string, number> = {}
    type PayoutRow = {
      total_amount: number | string
      project_financiers: { project_id: string } | { project_id: string }[] | null
    }
    for (const row of (payoutRes.data as PayoutRow[] | null) ?? []) {
      const pf = row.project_financiers
      const projectId = Array.isArray(pf) ? pf[0]?.project_id : pf?.project_id
      if (projectId) payoutMap[projectId] = toNumber(row.total_amount)
    }
    setPendingPayoutByProject(payoutMap)
    setLoading(false)
  }, [profile])

  const { openFinanceDetail, detailDialog } = useFinancierFinanceDetail(() => void reloadFinanceList())

  useEffect(() => {
    if (!profile) return
    void reloadFinanceList()
  }, [profile, reloadFinanceList])

  return (
    <div>
      <PageHeader title="Finance" description="Open finances you can confirm or reject." centered />
      {loading ? (
        <div className="space-y-3 md:hidden">
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title="No assigned finance" />
      ) : (
        <FinancierFinanceList
          rows={rows}
          confirmedByProject={confirmedByProject}
          pendingPayoutByProject={pendingPayoutByProject}
          onRowClick={openFinanceDetail}
          onOpenDecision={openFinanceDetail}
        />
      )}
      {detailDialog}
    </div>
  )
}

export function FinancierProjectDetailPage() {
  const { id } = useParams()
  const { profile } = useAuth()
  const [row, setRow] = useState<ProjectFinancier | null>(null)
  const [allConfirmed, setAllConfirmed] = useState(0)
  const [pendingFinanciers, setPendingFinanciers] = useState(1)
  const [willing, setWilling] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

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
  const canAct = isOpen && row.commitment_status !== 'rejected'

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
        title={project.name}
        description={`Suggested ${formatPhp(row.current_suggested_amount)}`}
        actions={
          <Button asChild variant="outline">
            <Link to="/app/finance">Back</Link>
          </Button>
        }
      />
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
                  : null}
              </p>
            ) : row.commitment_status === 'rejected' ? (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                You rejected this finance.
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
                {isConfirmed ? 'Update amount' : 'Confirm'}
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                disabled={!canAct || busy}
                onClick={() => void rejectCommitment()}
              >
                Reject
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
      .select('*, projects:project_id(id, name, status, expected_profit)')
      .eq('financier_id', profile.id)
      .order('updated_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) toast.error(error.message)
        setRows((data as ProjectFinancier[]) ?? [])
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
                    <TableCell>
                      <span className="text-primary hover:underline">{r.projects?.name}</span>
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
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile) return
    void supabase
      .from('project_financiers')
      .select('*, projects:project_id(id, name, status, expected_profit)')
      .eq('financier_id', profile.id)
      .eq('commitment_status', 'confirmed')
      .then(({ data, error }) => {
        if (error) toast.error(error.message)
        setRows((data as ProjectFinancier[]) ?? [])
        setLoading(false)
      })
  }, [profile])

  const chart = rows.map((r) => ({
    name: (r.projects?.name ?? 'P').slice(0, 12),
    capital: toNumber(r.confirmed_amount),
    profit: toNumber(r.projects?.expected_profit) * toNumber(r.confirmed_percentage),
  }))

  const totalCapital = chart.reduce((s, r) => s + r.capital, 0)
  const totalProfit = chart.reduce((s, r) => s + r.profit, 0)

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
        </>
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
