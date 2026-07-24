import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Pencil, Plus, Trash2, Wallet } from 'lucide-react'
import { PageHeader, EmptyState } from '@/components/shared/PageBits'
import { ListPagination, paginateRows } from '@/components/shared/ListPagination'
import { FinanceDetailDialog } from '@/components/finance/FinanceDetailDialog'
import { FinanceReleaseDialog } from '@/components/finance/FinanceReleaseDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { MoneyInput } from '@/components/ui/money-input'
import { budgetPoolColorIndexFromId, budgetPoolLeftBorderColors } from '@/lib/financierColors'
import { dedupeOverlappingProjects } from '@/lib/finance-group'
import { formatPercent, formatPhp, fundingProgress, moneyInputFromValue, remainingGap, toNumber, totalReceivable } from '@/lib/money'
import { adminConfirmedAmountDraft } from '@/lib/commitments'
import { commitmentStatusVariant, projectStatusClassName, projectStatusTableClassName, projectStatusVariant } from '@/lib/status'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import {
  COMMITMENT_STATUS_LABELS,
  PROJECT_STATUS_LABELS,
  type Profile,
  type Project,
  type ProjectFinancier,
  type ProjectStatus,
} from '@/types'

const ADMIN_FINANCE_PAGE_SIZE = 10

type AdminFinanceTableRow =
  | { kind: 'single'; project: Project }
  | { kind: 'group-member'; project: Project; groupId: string; rowSpan: number; isFirst: boolean }

/** Keep batch finances adjacent so the vertical Group label can span them. */
function groupProjectsForDisplay(items: Project[]): Project[] {
  const singles: Project[] = []
  const groups = new Map<string, Project[]>()

  for (const p of items) {
    if (p.group_id) {
      const list = groups.get(p.group_id) ?? []
      list.push(p)
      groups.set(p.group_id, list)
    } else {
      singles.push(p)
    }
  }

  type Block = { sortAt: string; projects: Project[] }
  const blocks: Block[] = singles.map((p) => ({ sortAt: p.created_at, projects: [p] }))

  for (const members of groups.values()) {
    const sorted = [...members].sort((a, b) => a.name.localeCompare(b.name))
    const sortAt = sorted.reduce(
      (latest, m) => (m.created_at > latest ? m.created_at : latest),
      sorted[0]?.created_at ?? '',
    )
    blocks.push({ sortAt, projects: sorted })
  }

  blocks.sort((a, b) => b.sortAt.localeCompare(a.sortAt))
  return blocks.flatMap((b) => b.projects)
}

function buildAdminFinanceTableRows(items: Project[]): AdminFinanceTableRow[] {
  const rows: AdminFinanceTableRow[] = []
  let i = 0

  while (i < items.length) {
    const p = items[i]
    if (!p.group_id) {
      rows.push({ kind: 'single', project: p })
      i++
      continue
    }

    const groupId = p.group_id
    const members: Project[] = []
    while (i < items.length && items[i].group_id === groupId) {
      members.push(items[i])
      i++
    }

    members.forEach((project, idx) => {
      rows.push({
        kind: 'group-member',
        project,
        groupId,
        rowSpan: members.length,
        isFirst: idx === 0,
      })
    })
  }

  return rows
}

export function AdminProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [status, setStatus] = useState<string>('all')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Pick<Project, 'id' | 'name'> | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailProject, setDetailProject] = useState<Project | null>(null)
  const [releaseOpen, setReleaseOpen] = useState(false)
  const [releaseTarget, setReleaseTarget] = useState<Project | null>(null)

  function openFinanceDetail(project: Project) {
    setDetailProject(project)
    setDetailOpen(true)
  }

  async function loadProjects() {
    setLoading(true)
    const { data, error } = await supabase.from('projects').select('*').order('created_at', { ascending: false })
    if (error) toast.error(error.message)
    setProjects((data as Project[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    void loadProjects()
  }, [])

  const filtered = useMemo(() => {
    const list = projects.filter((p) => {
      if (status !== 'all' && p.status !== status) return false
      if (q && !p.name.toLowerCase().includes(q.toLowerCase())) return false
      return true
    })
    return groupProjectsForDisplay(dedupeOverlappingProjects(list))
  }, [projects, status, q])

  useEffect(() => {
    setPage(1)
  }, [status, q])

  const paged = useMemo(
    () => paginateRows(filtered, page, ADMIN_FINANCE_PAGE_SIZE),
    [filtered, page],
  )

  const tableRows = useMemo(() => buildAdminFinanceTableRows(paged.items), [paged.items])

  return (
    <div>
      <PageHeader
        title="Finance"
        description="Create and manage financing entries."
        actions={
          <Button asChild>
            <Link to="/admin/finance/new">
              <Plus className="h-4 w-4" />
              New finance
            </Link>
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <Input placeholder="Search finance…" value={q} onChange={(e) => setQ(e.target.value)} className="sm:max-w-xs" />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="sm:w-56">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.entries(PROJECT_STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : filtered.length === 0 ? (
            <EmptyState title="No finance" description="Create a finance entry to get started." />
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-9 px-0" aria-label="Group" />
                  <TableHead className="min-w-[9rem]">Name</TableHead>
                  <TableHead className="min-w-[8.5rem] whitespace-nowrap">Status</TableHead>
                  <TableHead className="whitespace-nowrap">Financing date</TableHead>
                  <TableHead className="text-right">Capital</TableHead>
                  <TableHead className="text-right">Expected profit</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Total amount</TableHead>
                  <TableHead className="w-[7.5rem] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableRows.map((row) => {
                  const p = row.project
                  const poolIndex = p.group_id ? budgetPoolColorIndexFromId(p.group_id) : null
                  const poolLeft = budgetPoolLeftBorderColors(poolIndex)
                  return (
                  <TableRow
                    key={p.id}
                    className="cursor-pointer"
                    onClick={() => openFinanceDetail(p)}
                  >
                    {row.kind === 'group-member' && row.isFirst ? (
                      <TableCell
                        rowSpan={row.rowSpan}
                        className="w-9 border-r border-border/60 bg-muted/15 p-0 align-middle"
                      >
                        <Link
                          to={`/admin/finance/group/${row.groupId}`}
                          onClick={(e) => e.stopPropagation()}
                          className={cn(
                            'flex h-full min-h-[2.75rem] w-9 flex-col items-center justify-center border-l-4 px-0.5 py-3 text-[10px] font-bold uppercase tracking-wide text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground',
                            poolLeft,
                          )}
                          title="View finance group"
                        >
                          <span className="select-none [writing-mode:vertical-rl] rotate-180">
                            Group
                          </span>
                        </Link>
                      </TableCell>
                    ) : row.kind === 'single' ? (
                      <TableCell className="w-9 p-0" aria-hidden />
                    ) : null}
                    <TableCell className="max-w-[11rem] sm:max-w-none">
                      <span className="block min-w-0 truncate font-medium text-primary">{p.name}</span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={projectStatusVariant(p.status)}
                        className={cn('whitespace-nowrap', projectStatusTableClassName(p.status))}
                      >
                        {PROJECT_STATUS_LABELS[p.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">{p.financing_date}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatPhp(p.capital_required)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatPhp(p.expected_profit)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatPhp(totalReceivable(toNumber(p.capital_required), toNumber(p.expected_profit)))}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs">
                            More actions
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {p.group_id ? (
                            <DropdownMenuItem asChild>
                              <Link to={`/admin/finance/group/${p.group_id}`} className="gap-2">
                                View batch
                              </Link>
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuItem asChild>
                            <Link to={`/admin/finance/${p.id}/edit`} className="gap-2">
                              <Pencil className="h-4 w-4" />
                              Edit
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="gap-2"
                            disabled={p.status === 'cancelled' || p.status === 'draft'}
                            onSelect={() => {
                              setReleaseTarget(p)
                              setReleaseOpen(true)
                            }}
                          >
                            <Wallet className="h-4 w-4" />
                            Release
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="gap-2 text-destructive focus:text-destructive"
                            onSelect={() => {
                              setDeleteTarget({ id: p.id, name: p.name })
                              setDeleteOpen(true)
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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
              pageSize={ADMIN_FINANCE_PAGE_SIZE}
              onPageChange={setPage}
            />
            </div>
          )}
        </CardContent>
      </Card>

      <FinanceDetailDialog project={detailProject} open={detailOpen} onOpenChange={setDetailOpen} />

      <FinanceReleaseDialog
        project={releaseTarget}
        open={releaseOpen}
        onOpenChange={(open) => {
          setReleaseOpen(open)
          if (!open) setReleaseTarget(null)
        }}
        onReleased={() => void loadProjects()}
      />

      <FinanceDeleteDialog
        project={deleteTarget}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={() => {
          setDeleteTarget(null)
          void loadProjects()
        }}
      />
    </div>
  )
}

type FinancierInviteMode = 'all' | 'selected'

type ProjectFormState = {
  name: string
  financing_date: string
  duration_days: string
  capital_required: string
  expected_profit: string
  max_financiers: string
  release_date: string
  description: string
  notes: string
  status: ProjectStatus
  financierInviteMode: FinancierInviteMode
  selectedFinancierIds: string[]
}

const emptyForm: ProjectFormState = {
  name: '',
  financing_date: new Date().toISOString().slice(0, 10),
  duration_days: '',
  capital_required: '',
  expected_profit: '',
  max_financiers: '2',
  release_date: '',
  description: '',
  notes: '',
  status: 'open_for_funding',
  financierInviteMode: 'all',
  selectedFinancierIds: [],
}

function FinanceDeleteDialog({
  project,
  open,
  onOpenChange,
  onDeleted,
}: {
  project: Pick<Project, 'id' | 'name'> | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted: () => void
}) {
  const [busy, setBusy] = useState(false)

  async function confirmDelete() {
    if (!project) return
    setBusy(true)
    const { error } = await supabase.from('projects').delete().eq('id', project.id)
    setBusy(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success(`"${project.name}" deleted`)
    onOpenChange(false)
    onDeleted()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete finance?</DialogTitle>
          <DialogDescription>
            This will permanently remove <span className="font-medium text-foreground">{project?.name}</span> and all
            related commitments. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={busy} onClick={() => void confirmDelete()}>
            {busy ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ProjectForm({
  initial,
  onSubmit,
  submitLabel,
  onCancel,
  showFinancierInvite = false,
}: {
  initial?: Partial<ProjectFormState>
  onSubmit: (values: ProjectFormState) => Promise<void>
  submitLabel: string
  onCancel?: () => void
  showFinancierInvite?: boolean
}) {
  const [form, setForm] = useState<ProjectFormState>({ ...emptyForm, ...initial })
  const [saving, setSaving] = useState(false)
  const [financiers, setFinanciers] = useState<Profile[]>([])
  const [financiersLoading, setFinanciersLoading] = useState(showFinancierInvite)

  useEffect(() => {
    if (!showFinancierInvite) return
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
  }, [showFinancierInvite])

  function set<K extends keyof ProjectFormState>(key: K, value: ProjectFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function toggleFinancier(id: string) {
    setForm((prev) => ({
      ...prev,
      selectedFinancierIds: prev.selectedFinancierIds.includes(id)
        ? prev.selectedFinancierIds.filter((x) => x !== id)
        : [...prev.selectedFinancierIds, id],
    }))
  }

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault()
        if (showFinancierInvite && form.financierInviteMode === 'selected' && form.selectedFinancierIds.length === 0) {
          toast.error('Select at least one financier to invite')
          return
        }
        setSaving(true)
        try {
          await onSubmit(form)
        } finally {
          setSaving(false)
        }
      }}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="name">Finance name</Label>
          <Input id="name" value={form.name} onChange={(e) => set('name', e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="financing_date">Financing date</Label>
          <Input id="financing_date" type="date" value={form.financing_date} onChange={(e) => set('financing_date', e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="duration_days">Duration (days)</Label>
          <Input id="duration_days" type="number" min={1} value={form.duration_days} onChange={(e) => set('duration_days', e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="capital_required">Capital required (PHP)</Label>
          <MoneyInput
            id="capital_required"
            value={form.capital_required}
            onValueChange={(v) => set('capital_required', v)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="expected_profit">Expected profit (PHP)</Label>
          <MoneyInput
            id="expected_profit"
            value={form.expected_profit}
            onValueChange={(v) => set('expected_profit', v)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="release_date">Release date (optional)</Label>
          <Input id="release_date" type="date" value={form.release_date} onChange={(e) => set('release_date', e.target.value)} />
        </div>
        {!showFinancierInvite ? (
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => set('status', v as ProjectStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PROJECT_STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        {showFinancierInvite ? (
          <div className="space-y-3 md:col-span-2">
            <Label>Financiers to invite</Label>
            <Select
              value={form.financierInviteMode}
              onValueChange={(v) => set('financierInviteMode', v as FinancierInviteMode)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All active financiers</SelectItem>
                <SelectItem value="selected">Selected financiers only</SelectItem>
              </SelectContent>
            </Select>
            {form.financierInviteMode === 'selected' ? (
              financiersLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : financiers.length === 0 ? (
                <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
                  No active financiers available.
                </p>
              ) : (
                <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-3">
                  {financiers.map((f) => {
                    const checked = form.selectedFinancierIds.includes(f.id)
                    return (
                      <label key={f.id} className="flex cursor-pointer items-center gap-2 text-sm">
                        <input type="checkbox" checked={checked} onChange={() => toggleFinancier(f.id)} />
                        <span>
                          {f.full_name} <span className="text-muted-foreground">@{f.username}</span>
                        </span>
                      </label>
                    )
                  })}
                </div>
              )
            ) : (
              <p className="text-sm text-muted-foreground">
                {financiersLoading
                  ? 'Loading financiers…'
                  : `${financiers.length} active financier${financiers.length === 1 ? '' : 's'} will be invited.`}
              </p>
            )}
          </div>
        ) : null}
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" value={form.description} onChange={(e) => set('description', e.target.value)} />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  )
}

export function AdminProjectEditPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleteOpen, setDeleteOpen] = useState(false)

  useEffect(() => {
    if (!id) return
    void supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (error) toast.error(error.message)
        setProject(data as Project | null)
        setLoading(false)
      })
  }, [id])

  if (loading) return <Skeleton className="h-64 w-full" />
  if (!project) return <EmptyState title="Finance not found" />

  return (
    <div>
      <PageHeader title={`Edit · ${project.name}`} />
      <Card>
        <CardContent className="pt-6">
          <ProjectForm
            initial={{
              name: project.name,
              financing_date: project.financing_date,
              duration_days: String(project.duration_days),
              capital_required: moneyInputFromValue(project.capital_required),
              expected_profit: moneyInputFromValue(project.expected_profit),
              max_financiers: String(project.max_financiers),
              release_date: project.release_date ?? '',
              description: project.description ?? '',
              notes: project.notes ?? '',
              status: project.status,
            }}
            submitLabel="Save changes"
            onCancel={() => navigate('/admin/finance')}
            onSubmit={async (form) => {
              const { error } = await supabase
                .from('projects')
                .update({
                  name: form.name.trim(),
                  financing_date: form.financing_date,
                  duration_days: Number(form.duration_days),
                  capital_required: toNumber(form.capital_required),
                  expected_profit: toNumber(form.expected_profit),
                  max_financiers: Number(form.max_financiers),
                  release_date: form.release_date || null,
                  description: form.description || null,
                  notes: form.notes || null,
                  status: form.status,
                })
                .eq('id', project.id)
              if (error) {
                toast.error(error.message)
                return
              }
              toast.success('Finance updated')
              navigate('/admin/finance')
            }}
          />
        </CardContent>
      </Card>

      <div className="mt-4">
        <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
          <Trash2 className="h-4 w-4" />
          Delete finance
        </Button>
      </div>

      <FinanceDeleteDialog
        project={project}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={() => navigate('/admin/finance')}
      />
    </div>
  )
}

export function AdminProjectDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState<Project | null>(null)
  const [rows, setRows] = useState<ProjectFinancier[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteOpen, setDeleteOpen] = useState(false)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    async function load() {
      const [pRes, fRes] = await Promise.all([
        supabase.from('projects').select('*').eq('id', id!).single(),
        supabase
          .from('project_financiers')
          .select('*, profiles:financier_id(id, username, full_name, account_status)')
          .eq('project_id', id!)
          .order('created_at'),
      ])
      if (cancelled) return
      if (pRes.error) toast.error(pRes.error.message)
      setProject((pRes.data as Project | null) ?? null)
      setRows((fRes.data as ProjectFinancier[]) ?? [])
      setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [id])

  const confirmedTotal = rows
    .filter((r) => r.commitment_status === 'confirmed')
    .reduce((s, r) => s + toNumber(r.confirmed_amount), 0)

  if (loading) return <Skeleton className="h-64 w-full" />
  if (!project) return <EmptyState title="Finance not found" />

  const progress = fundingProgress(confirmedTotal, toNumber(project.capital_required))

  return (
    <div>
      <PageHeader
        title={project.name}
        description={project.description ?? undefined}
        actions={
          <>
            <Button asChild variant="outline">
              <Link to={`/admin/finance/${project.id}/edit`}>Edit</Link>
            </Button>
            <Button asChild>
              <Link to={`/admin/finance/${project.id}/funding`}>Funding</Link>
            </Button>
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </>
        }
      />
      <FinanceDeleteDialog
        project={project}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={() => navigate('/admin/finance')}
      />
      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Status</CardTitle>
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
            <CardTitle className="text-sm text-muted-foreground">Capital</CardTitle>
          </CardHeader>
          <CardContent className="tabular-nums text-lg font-semibold">{formatPhp(project.capital_required)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Expected profit</CardTitle>
          </CardHeader>
          <CardContent className="tabular-nums text-lg font-semibold">{formatPhp(project.expected_profit)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Confirmed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-2 tabular-nums text-lg font-semibold">{formatPhp(confirmedTotal)}</div>
            <Progress value={progress} />
            <p className="mt-1 text-xs text-muted-foreground">{formatPercent(progress)} funded · gap {formatPhp(remainingGap(confirmedTotal, toNumber(project.capital_required)))}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="financiers">
        <TabsList>
          <TabsTrigger value="financiers">Financiers</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>
        <TabsContent value="financiers">
          <Card>
            <CardContent className="pt-6">
              {rows.length === 0 ? (
                <EmptyState title="No financiers invited" description="Invite financiers from the Funding page." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Financier</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Suggested</TableHead>
                      <TableHead className="text-right">Willing</TableHead>
                      <TableHead className="text-right">Confirmed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          <div className="font-medium">{r.profiles?.full_name}</div>
                          <div className="text-xs text-muted-foreground">@{r.profiles?.username}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={commitmentStatusVariant(r.commitment_status)}>
                            {COMMITMENT_STATUS_LABELS[r.commitment_status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatPhp(r.current_suggested_amount)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatPhp(r.willing_amount)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatPhp(r.confirmed_amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="details">
          <Card>
            <CardContent className="space-y-2 pt-6 text-sm">
              <p>
                <span className="text-muted-foreground">Financing date:</span> {project.financing_date}
              </p>
              <p>
                <span className="text-muted-foreground">Duration:</span> {project.duration_days} days
              </p>
              <p>
                <span className="text-muted-foreground">Release date:</span> {project.release_date ?? 'TBA'}
              </p>
              <p>
                <span className="text-muted-foreground">Max financiers:</span> {project.max_financiers}
              </p>
              {project.notes ? (
                <p>
                  <span className="text-muted-foreground">Notes:</span> {project.notes}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

export function AdminFundingPage() {
  const { id } = useParams()
  const [project, setProject] = useState<Project | null>(null)
  const [rows, setRows] = useState<ProjectFinancier[]>([])
  const [financiers, setFinanciers] = useState<Profile[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  async function reload() {
    if (!id) return
    const [pRes, fRes, allFin] = await Promise.all([
      supabase.from('projects').select('*').eq('id', id).single(),
      supabase
        .from('project_financiers')
        .select('*, profiles:financier_id(id, username, full_name)')
        .eq('project_id', id)
        .order('created_at'),
      supabase.from('profiles').select('*').eq('role', 'financier').eq('account_status', 'active').order('full_name'),
    ])
    if (pRes.error) toast.error(pRes.error.message)
    setProject((pRes.data as Project | null) ?? null)
    const pf = (fRes.data as ProjectFinancier[]) ?? []
    setRows(pf)
    setAmounts(Object.fromEntries(pf.map((r) => [r.id, adminConfirmedAmountDraft(r)])))
    const invited = new Set(pf.map((r) => r.financier_id))
    setFinanciers(((allFin.data as Profile[]) ?? []).filter((f) => !invited.has(f.id)))
    setLoading(false)
  }

  useEffect(() => {
    void reload()
  }, [id])

  const confirmedTotal = rows
    .filter((r) => r.commitment_status === 'confirmed')
    .reduce((s, r) => s + toNumber(r.confirmed_amount), 0)

  if (loading) return <Skeleton className="h-64 w-full" />
  if (!project) return <EmptyState title="Finance not found" />

  const capital = toNumber(project.capital_required)
  const progress = fundingProgress(confirmedTotal, capital)

  return (
    <div>
      <PageHeader
        title={`Funding · ${project.name}`}
        description="Invite financiers and confirm allocations."
        actions={
          <Button asChild variant="outline">
            <Link to={`/admin/finance/${project.id}`}>Back to finance</Link>
          </Button>
        }
      />

      <Card className="mb-6">
        <CardContent className="space-y-3 pt-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-sm text-muted-foreground">Confirmed funding</div>
              <div className="tabular-nums text-2xl font-semibold text-primary">
                {formatPhp(confirmedTotal)} / {formatPhp(capital)}
              </div>
            </div>
            <div className="text-sm text-muted-foreground">Gap {formatPhp(remainingGap(confirmedTotal, capital))}</div>
          </div>
          <Progress value={progress} />
        </CardContent>
      </Card>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Invite financiers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {financiers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No additional active financiers available.</p>
            ) : (
              <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border p-3">
                {financiers.map((f) => {
                  const checked = selected.includes(f.id)
                  return (
                    <label key={f.id} className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setSelected((prev) => (checked ? prev.filter((x) => x !== f.id) : [...prev, f.id]))
                        }
                      />
                      <span>
                        {f.full_name} <span className="text-muted-foreground">@{f.username}</span>
                      </span>
                    </label>
                  )
                })}
              </div>
            )}
            <Button
              disabled={selected.length === 0 || busy}
              onClick={async () => {
                setBusy(true)
                const { error } = await supabase.rpc('invite_financiers', {
                  p_project_id: project.id,
                  p_financier_ids: selected,
                })
                setBusy(false)
                if (error) {
                  toast.error(error.message)
                  return
                }
                toast.success('Financiers invited')
                setSelected([])
                await reload()
              }}
            >
              Invite selected
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Confirm allocations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Enter confirmed amounts for each financier, then save. Totals cannot exceed capital required.</p>
            <Button
              disabled={busy || rows.length === 0}
              onClick={async () => {
                const allocations = rows
                  .map((r) => ({
                    id: r.id,
                    confirmed_amount: toNumber(amounts[r.id] || 0),
                  }))
                  .filter((c) => c.confirmed_amount > 0)

                if (allocations.length === 0) {
                  toast.error('Enter at least one confirmed amount')
                  return
                }
                setBusy(true)
                const { error } = await supabase.rpc('admin_set_financier_commitments', {
                  p_project_id: project.id,
                  p_allocations: allocations,
                })
                setBusy(false)
                if (error) {
                  toast.error(error.message)
                  return
                }
                toast.success('Financier amounts saved')
                await reload()
              }}
            >
              Save financier amounts
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          {rows.length === 0 ? (
            <EmptyState title="No commitments yet" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Financier</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Suggested</TableHead>
                  <TableHead className="text-right">Willing</TableHead>
                  <TableHead className="text-right">Confirm amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.profiles?.full_name}</TableCell>
                    <TableCell>
                      <Badge variant={commitmentStatusVariant(r.commitment_status)}>
                        {COMMITMENT_STATUS_LABELS[r.commitment_status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatPhp(r.current_suggested_amount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatPhp(r.willing_amount)}</TableCell>
                    <TableCell className="text-right">
                      <MoneyInput
                        className="ml-auto w-36 text-right"
                        value={amounts[r.id] ?? ''}
                        onValueChange={(v) => setAmounts((prev) => ({ ...prev, [r.id]: v }))}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
