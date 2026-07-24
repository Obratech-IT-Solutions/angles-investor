/**
 * Vercel Cron / manual keep-alive for Supabase free-tier projects.
 * Hits a tiny REST read so the project does not pause after ~7 days idle.
 *
 * Schedule: every 3 days (see vercel.json crons).
 * Uses the same VITE_SUPABASE_* env vars already set on Vercel.
 */
export const config = { runtime: 'edge' }

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000

export default async function handler(request: Request): Promise<Response> {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

  if (!url || !key) {
    return Response.json(
      { ok: false, error: 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY' },
      { status: 500 },
    )
  }

  // Allow Vercel Cron, or a simple GET/POST from anywhere (anon read only).
  const isCron = request.headers.get('x-vercel-cron') === '1'
  const method = request.method.toUpperCase()
  if (method !== 'GET' && method !== 'POST' && method !== 'HEAD') {
    return Response.json({ ok: false, error: 'Method not allowed' }, { status: 405 })
  }

  try {
    const endpoint = `${url.replace(/\/$/, '')}/rest/v1/profiles?select=id&limit=1`
    const started = Date.now()
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
      },
    })
    const ms = Date.now() - started
    const text = await res.text()

    if (!res.ok) {
      return Response.json(
        {
          ok: false,
          cron: isCron,
          status: res.status,
          ms,
          nextPulseHintMs: THREE_DAYS_MS,
          body: text.slice(0, 200),
        },
        { status: 502 },
      )
    }

    return Response.json({
      ok: true,
      cron: isCron,
      status: res.status,
      ms,
      nextPulseHintMs: THREE_DAYS_MS,
      at: new Date().toISOString(),
    })
  } catch (err) {
    return Response.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'Keep-alive failed',
      },
      { status: 502 },
    )
  }
}
