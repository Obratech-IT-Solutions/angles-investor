import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { KeyRound, MoreHorizontal, Plus } from 'lucide-react'
import {
  AdminFinancierPinResetDialog,
  AdminFinancierSetPinDialog,
} from '@/components/admin/AdminFinancierPinDialog'
import { PageHeader, EmptyState } from '@/components/shared/PageBits'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import type { AccountStatus, AuditLog, Profile } from '@/types'

async function invokeAdminCreateFinancier(payload: {
  full_name: string
  email?: string | null
  contact_number?: string | null
}) {
  const { data, error } = await supabase.functions.invoke('admin-create-financier', { body: payload })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(String(data.error))
  return data as { profile: Profile; pin: string }
}

export function AdminFinanciersPage() {
  const [rows, setRows] = useState<Profile[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [pinTarget, setPinTarget] = useState<Profile | null>(null)
  const [setPinOpen, setSetPinOpen] = useState(false)
  const [resetPinOpen, setResetPinOpen] = useState(false)

  function openSetPin(profile: Profile) {
    setPinTarget(profile)
    setSetPinOpen(true)
  }

  function openResetPin(profile: Profile) {
    setPinTarget(profile)
    setResetPinOpen(true)
  }

  useEffect(() => {
    void supabase
      .from('profiles')
      .select('*')
      .eq('role', 'financier')
      .order('full_name')
      .then(({ data, error }) => {
        if (error) toast.error(error.message)
        setRows((data as Profile[]) ?? [])
        setLoading(false)
      })
  }, [])

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          !q ||
          r.full_name.toLowerCase().includes(q.toLowerCase()),
      ),
    [rows, q],
  )

  return (
    <div>
      <PageHeader
        title="Financiers"
        description="Provision accounts and manage status."
        actions={
          <Button asChild>
            <Link to="/admin/financiers/new">
              <Plus className="h-4 w-4" />
              New financier
            </Link>
          </Button>
        }
      />
      <Input className="mb-4 max-w-sm" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : filtered.length === 0 ? (
            <EmptyState title="No financiers" />
          ) : (
            <>
              <div className="space-y-3 md:hidden">
                {filtered.map((r) => (
                  <div key={r.id} className="rounded-xl border bg-background p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-2">
                        <Link
                          to={`/admin/financiers/${r.id}`}
                          className="block truncate font-medium text-primary hover:underline"
                        >
                          {r.full_name}
                        </Link>
                        <Badge
                          variant={
                            r.account_status === 'active'
                              ? 'success'
                              : r.account_status === 'locked'
                                ? 'destructive'
                                : 'secondary'
                          }
                        >
                          {r.account_status}
                        </Badge>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="icon" className="shrink-0" aria-label={`Actions for ${r.full_name}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openSetPin(r)}>
                            <KeyRound className="h-4 w-4" />
                            Change PIN
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openResetPin(r)}>Reset to 0000</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[120px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          <Link to={`/admin/financiers/${r.id}`} className="font-medium text-primary hover:underline">
                            {r.full_name}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              r.account_status === 'active'
                                ? 'success'
                                : r.account_status === 'locked'
                                  ? 'destructive'
                                  : 'secondary'
                            }
                          >
                            {r.account_status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="sm">
                                <MoreHorizontal className="h-4 w-4" />
                                Actions
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openSetPin(r)}>
                                <KeyRound className="h-4 w-4" />
                                Change PIN
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openResetPin(r)}>Reset to 0000</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <AdminFinancierSetPinDialog
        profile={pinTarget}
        open={setPinOpen}
        onOpenChange={setSetPinOpen}
      />
      <AdminFinancierPinResetDialog
        profile={pinTarget}
        open={resetPinOpen}
        onOpenChange={setResetPinOpen}
      />
    </div>
  )
}

export function AdminFinancierCreatePage() {
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [saving, setSaving] = useState(false)

  return (
    <div>
      <PageHeader
        title="Create financier"
        description="Enter the name only. Default PIN is 0000 — they can change it later in Profile."
      />
      <Card>
        <CardContent className="pt-6">
          <form
            className="grid max-w-xl gap-4"
            onSubmit={async (e) => {
              e.preventDefault()
              setSaving(true)
              try {
                const data = await invokeAdminCreateFinancier({
                  full_name: fullName,
                })
                toast.success(`${fullName} created — default PIN 0000`)
                navigate(`/admin/financiers/${data.profile.id}`)
              } catch (err) {
                toast.error(err instanceof Error ? err.message : 'Failed to create financier')
              } finally {
                setSaving(false)
              }
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="full_name">Financier name</Label>
              <Input
                id="full_name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. man"
                required
                minLength={2}
              />
            </div>
            <Button type="submit" disabled={saving || !fullName.trim()} className="h-12 text-base">
              {saving ? 'Creating…' : fullName.trim() ? `Create ${fullName.trim()}` : 'Create financier'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export function AdminFinancierDetailPage() {
  const { id } = useParams()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [resetOpen, setResetOpen] = useState(false)
  const [setPinOpen, setSetPinOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!id) return
    void supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (error) toast.error(error.message)
        setProfile(data as Profile | null)
        setLoading(false)
      })
  }, [id])

  if (loading) return <Skeleton className="h-48 w-full" />
  if (!profile) return <EmptyState title="Financier not found" />

  return (
    <div>
      <PageHeader title={profile.full_name} description="Financier profile" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault()
                setSaving(true)
                const { error } = await supabase
                  .from('profiles')
                  .update({
                    full_name: profile.full_name,
                    display_name: profile.full_name,
                    account_status: profile.account_status,
                  })
                  .eq('id', profile.id)
                setSaving(false)
                if (error) toast.error(error.message)
                else toast.success('Saved')
              }}
            >
              <div className="space-y-2">
                <Label>Full name</Label>
                <Input
                  value={profile.full_name}
                  onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Account status</Label>
                <Select
                  value={profile.account_status}
                  onValueChange={(v) => setProfile({ ...profile, account_status: v as AccountStatus })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">active</SelectItem>
                    <SelectItem value="inactive">inactive</SelectItem>
                    <SelectItem value="locked">locked</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={saving}>
                Save changes
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">PIN access</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Set a new 4-digit PIN for this financier, or reset to the default <span className="font-medium text-foreground">0000</span>.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => setSetPinOpen(true)}>
                Change PIN
              </Button>
              <Button variant="outline" onClick={() => setResetOpen(true)}>
                Reset to 0000
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <AdminFinancierSetPinDialog profile={profile} open={setPinOpen} onOpenChange={setSetPinOpen} />
      <AdminFinancierPinResetDialog profile={profile} open={resetOpen} onOpenChange={setResetOpen} />
    </div>
  )
}

export function AdminAuditPage() {
  const [rows, setRows] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void supabase
      .from('audit_logs')
      .select('*, profiles:actor_id(id, username, full_name)')
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data, error }) => {
        if (error) toast.error(error.message)
        setRows((data as AuditLog[]) ?? [])
        setLoading(false)
      })
  }, [])

  return (
    <div>
      <PageHeader title="Audit log" description="Immutable activity trail." />
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : rows.length === 0 ? (
            <EmptyState title="No audit events" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-xs">{new Date(r.created_at).toLocaleString()}</TableCell>
                    <TableCell>{r.profiles?.full_name ?? r.profiles?.username ?? '—'}</TableCell>
                    <TableCell className="font-medium">{r.action}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.entity_type}
                      {r.entity_id ? ` · ${r.entity_id.slice(0, 8)}` : ''}
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

export function AdminProfilePage() {
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
      <PageHeader title="Admin profile" />
      <div className="grid max-w-3xl gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
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
                  toast.success('Profile updated')
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
            <p className="mb-4 text-sm text-muted-foreground">
              Forgot your PIN? Use backup PIN <span className="font-medium text-foreground">1111</span> on the landing page,
              then set a new PIN here.
            </p>
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
