import { supabase } from '@/lib/supabase'

const STORAGE_KEY = 'fundtrack:supabase-pulse-at'
/** Pulse at most once every 3 days from this browser (free-tier keep-alive backup). */
export const SUPABASE_PULSE_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000

/**
 * Lightweight DB read so Supabase free-tier projects stay warm when someone opens the app.
 * Safe to call on every boot — no-ops until 3 days have passed since the last successful pulse.
 */
export function scheduleSupabasePulse(): void {
  if (typeof window === 'undefined') return

  const run = async () => {
    try {
      const last = Number(window.localStorage.getItem(STORAGE_KEY) || '0')
      if (Number.isFinite(last) && Date.now() - last < SUPABASE_PULSE_INTERVAL_MS) return

      const { error } = await supabase.from('profiles').select('id').limit(1)
      if (error) return

      window.localStorage.setItem(STORAGE_KEY, String(Date.now()))
    } catch {
      /* keep-alive must never break the app */
    }
  }

  // Defer so first paint / auth are not blocked.
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => void run(), { timeout: 5000 })
  } else {
    window.setTimeout(() => void run(), 2500)
  }
}
