import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
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
import { FinanceDetailDialog } from '@/components/finance/FinanceDetailDialog'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatPercent, formatPhp, fundingProgress, remainingGap, toNumber } from '@/lib/money'
import { projectStatusTableClassName, projectStatusVariant } from '@/lib/status'
import { supabase } from '@/lib/supabase'
import { PROJECT_STATUS_LABELS, type Project, type ProjectFinancier } from '@/types'

const STATUS_COLORS = ['#0b2a4a', '#1a4a73', '#b7791f', '#1f7a4d', '#5b6b7c', '#c0392b', '#334e68', '#486581']

export function AdminDashboardPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [financiers, setFinanciers] = useState<ProjectFinancier[]>([])
  const [confirmedByProject, setConfirmedByProject] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailProject, setDetailProject] = useState<Project | null>(null)

  function openFinanceDetail(project: Project) {
    setDetailProject(project)
    setDetailOpen(true)
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [pRes, fRes, cRes] = await Promise.all([
        supabase.from('projects').select('*').order('created_at', { ascending: false }),
        supabase
          .from('project_financiers')
          .select('*, profiles:financier_id(id, username, full_name), projects:project_id(id, name, status)')
          .eq('commitment_status', 'submitted')
          .order('submitted_at', { ascending: false })
          .limit(8),
        supabase
          .from('project_financiers')
          .select('project_id, confirmed_amount, commitment_status')
          .eq('commitment_status', 'confirmed'),
      ])
      if (cancelled) return
      setProjects((pRes.data as Project[]) ?? [])
      setFinanciers((fRes.data as ProjectFinancier[]) ?? [])
      const confirmedMap: Record<string, number> = {}
      for (const row of (cRes.data as Pick<ProjectFinancier, 'project_id' | 'confirmed_amount'>[]) ?? []) {
        confirmedMap[row.project_id] = (confirmedMap[row.project_id] ?? 0) + toNumber(row.confirmed_amount)
      }
      setConfirmedByProject(confirmedMap)
      setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const waitingToFund = useMemo(() => {
    const openStatuses = new Set<Project['status']>(['open_for_funding', 'partially_funded'])
    return projects
      .filter((p) => openStatuses.has(p.status))
      .map((p) => {
        const capital = toNumber(p.capital_required)
        const confirmed = confirmedByProject[p.id] ?? 0
        const funded = fundingProgress(confirmed, capital)
        const gap = remainingGap(confirmed, capital)
        return {
          project: p,
          capital,
          confirmed,
          funded,
          gap,
          percentNeeded: Math.max(0, 100 - funded),
        }
      })
      .sort((a, b) => b.percentNeeded - a.percentNeeded)
  }, [projects, confirmedByProject])

  const stats = useMemo(() => {
    const capital = projects.reduce((sum, p) => sum + toNumber(p.capital_required), 0)
    const byStatus = Object.entries(
      projects.reduce<Record<string, number>>((acc, p) => {
        acc[p.status] = (acc[p.status] ?? 0) + 1
        return acc
      }, {}),
    ).map(([status, count]) => ({
      status: PROJECT_STATUS_LABELS[status as keyof typeof PROJECT_STATUS_LABELS] ?? status,
      count,
      key: status,
    }))
    const capitalByProject = projects.slice(0, 8).map((p) => ({
      name: p.name.length > 16 ? `${p.name.slice(0, 16)}…` : p.name,
      capital: toNumber(p.capital_required),
    }))
    return { capital, byStatus, capitalByProject, count: projects.length }
  }, [projects])

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Dashboard" description="Capital overview and funding activity." />
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <KpiCard label="Finance" value={String(stats.count)} />
        <KpiCard label="Total capital required" value={formatPhp(stats.capital)} />
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Waiting to fund</CardTitle>
            <p className="text-xs text-muted-foreground">
              {waitingToFund.length === 0
                ? 'No open finances need funding'
                : `${waitingToFund.length} finance${waitingToFund.length === 1 ? '' : 's'} still need capital`}
            </p>
          </CardHeader>
          <CardContent>
            {waitingToFund.length === 0 ? (
              <p className="text-sm text-muted-foreground">All finances are fully funded or closed.</p>
            ) : (
              <div className="max-h-40 space-y-3 overflow-y-auto pr-1">
                {waitingToFund.map(({ project, funded, gap, percentNeeded }) => (
                  <button
                    key={project.id}
                    type="button"
                    className="w-full rounded-md border bg-muted/20 p-2 text-left transition-colors hover:bg-muted/40"
                    onClick={() => openFinanceDetail(project)}
                  >
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <span className="truncate text-sm font-medium text-primary">{project.name}</span>
                      <span className="shrink-0 text-xs font-semibold tabular-nums text-destructive">
                        {formatPercent(percentNeeded, 0)} needed
                      </span>
                    </div>
                    <Progress value={funded} className="h-1.5" />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatPercent(funded, 0)} funded · {formatPhp(gap)} remaining
                    </p>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Capital by finance</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {stats.capitalByProject.length === 0 ? (
              <EmptyState title="No finance yet" />
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
          <CardContent className="h-72">
            {stats.byStatus.length === 0 ? (
              <EmptyState title="No status data" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={stats.byStatus} dataKey="count" nameKey="status" innerRadius={50} outerRadius={90}>
                    {stats.byStatus.map((entry, i) => (
                      <Cell key={entry.key} fill={STATUS_COLORS[i % STATUS_COLORS.length]} />
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
          <CardTitle className="text-base">Submitted commitments awaiting review</CardTitle>
        </CardHeader>
        <CardContent>
          {financiers.length === 0 ? (
            <EmptyState title="Nothing pending" description="Submitted willing amounts will appear here." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Finance</TableHead>
                  <TableHead>Financier</TableHead>
                  <TableHead className="text-right">Willing</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {financiers.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.projects?.name ?? '—'}</TableCell>
                    <TableCell>{row.profiles?.full_name ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatPhp(row.willing_amount)}</TableCell>
                    <TableCell className="text-right">
                      {row.project_id ? (
                        <Link className="text-sm text-primary underline-offset-4 hover:underline" to={`/admin/finance/${row.project_id}/funding`}>
                          Review
                        </Link>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent finance</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Capital</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.slice(0, 6).map((p) => (
                  <TableRow key={p.id} className="cursor-pointer" onClick={() => openFinanceDetail(p)}>
                    <TableCell>
                      <span className="font-medium text-primary hover:underline">{p.name}</span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={projectStatusVariant(p.status)}
                        className={projectStatusTableClassName(p.status)}
                      >
                        {PROJECT_STATUS_LABELS[p.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatPhp(p.capital_required)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <FinanceDetailDialog project={detailProject} open={detailOpen} onOpenChange={setDetailOpen} />
    </div>
  )
}
