import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { Session } from '@supabase/supabase-js'
import { Crown } from 'lucide-react'
import { PinPad } from '@/components/PinPad'
import { MoneyRain } from '@/components/MoneyRain'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { homePathForRole, useAuth } from '@/contexts/AuthContext'
import { playKaChingOnLandingOpen } from '@/lib/kaChing'
import { invokeEdgeFunction } from '@/lib/edgeFunctions'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types'

type DirectoryFinancier = { id: string; full_name: string; display_name: string | null }

async function completePinSession(token_hash: string): Promise<Session> {
  const attempts: Array<'magiclink' | 'email'> = ['magiclink', 'email']
  let lastError: string | null = null

  for (const type of attempts) {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash, type })
    if (!error && data.session) return data.session
    if (error) lastError = error.message
  }

  throw new Error(lastError ?? 'Session not established')
}

export function LandingPage() {
  const { session, profile, loading, establishSession } = useAuth()
  const navigate = useNavigate()
  const [adminOpen, setAdminOpen] = useState(false)
  const [adminPin, setAdminPin] = useState('')
  const [adminBusy, setAdminBusy] = useState(false)

  const [financiers, setFinanciers] = useState<DirectoryFinancier[]>([])
  const [selected, setSelected] = useState<DirectoryFinancier | null>(null)
  const [finPin, setFinPin] = useState('')
  const [finBusy, setFinBusy] = useState(false)

  useEffect(() => {
    void invokeEdgeFunction<{ financiers?: DirectoryFinancier[] }>('list-financiers-public')
      .then((data) => {
        setFinanciers(data.financiers ?? [])
      })
      .catch(() => {
        /* directory load is best-effort on landing */
      })
  }, [])

  // Only play once the landing is actually shown (not while auth is redirecting)
  const showLanding = !loading && !(session && profile && !profile.must_change_password)

  useEffect(() => {
    if (!showLanding) return
    return playKaChingOnLandingOpen()
  }, [showLanding])

  if (!showLanding && !loading && session && profile && !profile.must_change_password) {
    return <Navigate to={homePathForRole(profile.role)} replace />
  }

  if (!showLanding) {
    return (
      <div className="relative min-h-screen overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_#1a4a73_0%,_#0b2a4a_45%,_#071a2e_100%)]" />
      </div>
    )
  }

  async function submitAdminPin(pin: string) {
    setAdminBusy(true)
    try {
      const data = await invokeEdgeFunction<{
        token_hash: string
        profile?: Profile
      }>('admin-pin-login', { pin })
      const authSession = await completePinSession(data.token_hash)
      const nextProfile = await establishSession(authSession, data.profile ?? null)
      if (!nextProfile) throw new Error('Could not load admin profile. Try again.')
      toast.success('Welcome, Admin')
      setAdminOpen(false)
      navigate(homePathForRole(nextProfile.role), { replace: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Admin login failed')
      setAdminPin('')
    } finally {
      setAdminBusy(false)
    }
  }

  async function submitFinancierPin(pin: string) {
    if (!selected) return
    setFinBusy(true)
    try {
      const data = await invokeEdgeFunction<{
        token_hash: string
        profile?: Profile
      }>('financier-pin-login', {
        profile_id: selected.id,
        pin,
      })
      const authSession = await completePinSession(data.token_hash)
      const nextProfile = await establishSession(authSession, data.profile ?? null)
      if (!nextProfile) throw new Error('Could not load your profile. Try again.')
      if (nextProfile.account_status !== 'active') {
        await supabase.auth.signOut()
        throw new Error(
          nextProfile.account_status === 'locked'
            ? 'Account is locked. Contact an administrator.'
            : 'Account is inactive. Contact an administrator.',
        )
      }
      toast.success(`Welcome, ${selected.display_name || selected.full_name}`)
      setSelected(null)
      navigate(homePathForRole(nextProfile.role), { replace: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Login failed')
      setFinPin('')
    } finally {
      setFinBusy(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_#1a4a73_0%,_#0b2a4a_45%,_#071a2e_100%)] md:bg-[radial-gradient(ellipse_at_top,_#1a4a73_0%,_#0b2a4a_50%,_#071a2e_100%)]" />
      <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:48px_48px]" />
      <MoneyRain />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center justify-center px-6 py-16 text-center text-white">
        <h1 className="font-[family-name:var(--font-display)] text-5xl font-bold tracking-tight md:text-6xl lg:text-7xl">
          Angels Investor
        </h1>

        <div className="mt-10 grid w-full max-w-xs grid-cols-1 gap-3 sm:max-w-sm md:max-w-xl md:grid-cols-2 md:gap-4">
          <div className="relative md:col-span-2">
            <Button
              size="lg"
              className="h-12 w-full bg-white text-primary hover:bg-slate-100"
              onClick={() => {
                setAdminPin('')
                setAdminOpen(true)
              }}
            >
              Neil
            </Button>
            <Crown
              className="pointer-events-none absolute -right-1 -top-2.5 h-6 w-6 fill-amber-400 text-amber-500 drop-shadow-md"
              aria-hidden
            />
          </div>

          {financiers.map((f, index) => {
            const label = f.display_name || f.full_name
            const lastOdd =
              financiers.length % 2 === 1 && index === financiers.length - 1
            return (
              <Button
                key={f.id}
                size="lg"
                variant="outline"
                className={`h-12 w-full border-white/40 bg-transparent text-base text-white hover:bg-white/10${
                  lastOdd ? ' md:col-span-2 md:max-w-[calc(50%-0.5rem)] md:justify-self-center' : ''
                }`}
                onClick={() => {
                  setSelected(f)
                  setFinPin('')
                }}
              >
                {label}
              </Button>
            )
          })}
        </div>
      </div>

      <Dialog open={adminOpen} onOpenChange={setAdminOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-primary">Admin access</DialogTitle>
            <DialogDescription>Enter the 4-digit admin PIN.</DialogDescription>
          </DialogHeader>
          <PinPad
            value={adminPin}
            onChange={setAdminPin}
            disabled={adminBusy}
            onComplete={(pin) => void submitAdminPin(pin)}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null)
            setFinPin('')
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-primary">{selected?.display_name || selected?.full_name}</DialogTitle>
            <DialogDescription>Enter your 4-digit PIN.</DialogDescription>
          </DialogHeader>
          <PinPad
            value={finPin}
            onChange={setFinPin}
            disabled={finBusy}
            onComplete={(pin) => void submitFinancierPin(pin)}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function LoginPage() {
  return <Navigate to="/" replace />
}

export function ChangePasswordPage() {
  return <Navigate to="/" replace />
}

export function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-primary">Need access help?</CardTitle>
          <CardDescription>Angels Investor uses name + 4-digit PIN. No passwords.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>Ask the administrator to reset your PIN from Admin → Financiers.</p>
          <Button asChild>
            <Link to="/">Back to home</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

export function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle>Unauthorized</CardTitle>
          <CardDescription>You do not have access to this area.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link to="/">Go home</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle>Page not found</CardTitle>
          <CardDescription>The page you requested does not exist.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link to="/">Go home</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

