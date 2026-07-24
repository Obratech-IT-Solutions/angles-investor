import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { toast } from 'sonner'
import { MIN_PASSWORD_LENGTH, TEMP_PASSWORD, toAuthEmail } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import type { Profile, UserRole } from '@/types'

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  signIn: (username: string, password: string) => Promise<{ error?: string }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<Profile | null>
  establishSession: (session: Session, profileFallback?: Profile | null) => Promise<Profile | null>
  completeForcedPasswordChange: (newPassword: string) => Promise<{ error?: string }>
  changePassword: (newPassword: string) => Promise<{ error?: string }>
  isAdmin: boolean
  isFinancier: boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data: rpcData, error: rpcError } = await supabase.rpc('current_profile')
  if (!rpcError && rpcData) return rpcData as Profile

  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  if (error) {
    console.error('fetchProfile', rpcError ?? error)
    return null
  }
  return data as Profile | null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const establishSession = useCallback(async (nextSession: Session, profileFallback?: Profile | null) => {
    setSession(nextSession)
    let next = await fetchProfile(nextSession.user.id)
    if (!next && profileFallback) next = profileFallback
    setProfile(next)
    return next
  }, [])

  const refreshProfile = useCallback(async () => {
    const {
      data: { session: nextSession },
    } = await supabase.auth.getSession()
    if (!nextSession?.user) {
      setSession(null)
      setProfile(null)
      return null
    }
    return establishSession(nextSession)
  }, [establishSession])

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return
      setSession(data.session)
      if (data.session?.user) {
        const p = await fetchProfile(data.session.user.id)
        if (mounted) setProfile(p)
      }
      if (mounted) setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession)
      if (nextSession?.user) {
        const p = await fetchProfile(nextSession.user.id)
        setProfile(p)
      } else {
        setProfile(null)
      }
      setLoading(false)
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (username: string, password: string) => {
    const email = toAuthEmail(username)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: error.message }

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Unable to load session' }

    const p = await fetchProfile(user.id)
    setProfile(p)

    if (!p) return { error: 'Profile not found. Contact an administrator.' }
    if (p.account_status === 'inactive') {
      await supabase.auth.signOut()
      return { error: 'Account is inactive. Contact an administrator.' }
    }
    if (p.account_status === 'locked') {
      await supabase.auth.signOut()
      return { error: 'Account is locked. Contact an administrator.' }
    }
    return {}
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setProfile(null)
    setSession(null)
  }, [])

  const completeForcedPasswordChange = useCallback(async (newPassword: string) => {
    if (newPassword === TEMP_PASSWORD) return { error: 'New password cannot be the temporary password.' }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` }
    }
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
    if (updateError) return { error: updateError.message }

    const { data, error } = await supabase.rpc('complete_forced_password_change')
    if (error) return { error: error.message }
    setProfile(data as Profile)
    return {}
  }, [])

  const changePassword = useCallback(async (newPassword: string) => {
    if (newPassword === TEMP_PASSWORD) return { error: 'New password cannot be the temporary password.' }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` }
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) return { error: error.message }
    toast.success('Password updated')
    return {}
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      signIn,
      signOut,
      refreshProfile,
      establishSession,
      completeForcedPasswordChange,
      changePassword,
      isAdmin: profile?.role === 'admin',
      isFinancier: profile?.role === 'financier',
    }),
    [
      session,
      profile,
      loading,
      signIn,
      signOut,
      refreshProfile,
      establishSession,
      completeForcedPasswordChange,
      changePassword,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function homePathForRole(role: UserRole | undefined | null): string {
  if (role === 'admin') return '/admin'
  if (role === 'financier') return '/app'
  return '/'
}
