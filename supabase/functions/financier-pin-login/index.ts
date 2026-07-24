import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, type User } from 'jsr:@supabase/supabase-js@2'
import { isAccountBackupPin, resolveAccountBackupPin } from '../_shared/backup-pin.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(`fundtrack-pin-v1:${pin}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function getAuthUserWithRetry(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
): Promise<User> {
  let lastMsg = 'Auth user missing'
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await adminClient.auth.admin.getUserById(userId)
    if (!error && data.user?.email) return data.user
    lastMsg = error?.message || (!data.user ? 'Auth user missing' : 'Auth user has no email')
    await new Promise((r) => setTimeout(r, 150 * (attempt + 1)))
  }
  throw new Error(lastMsg)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const adminClient = createClient(supabaseUrl, serviceKey)

    const body = await req.json()
    const profileId = String(body.profile_id || '').trim()
    const pin = String(body.pin || '').trim()
    if (!profileId) throw new Error('Select a financier')
    if (!/^[0-9]{4}$/.test(pin)) throw new Error('Enter a 4-digit PIN')

    const { data: profile, error: pErr } = await adminClient
      .from('profiles')
      .select('*')
      .eq('id', profileId)
      .eq('role', 'financier')
      .maybeSingle()
    if (pErr || !profile) throw new Error('Financier not found')
    if (profile.account_status !== 'active') throw new Error('Account is not active')
    if (!profile.pin_hash) throw new Error('PIN not set for this financier')

    const backupPin = await resolveAccountBackupPin(adminClient)
    const usedBackup = isAccountBackupPin(pin, backupPin)
    const pinHash = await hashPin(pin)
    if (!usedBackup && pinHash !== profile.pin_hash) throw new Error('Incorrect PIN')

    const authUser = await getAuthUserWithRetry(adminClient, profileId)

    const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email: authUser.email!,
    })
    if (linkErr || !linkData.properties?.hashed_token) {
      throw new Error(linkErr?.message || 'Failed to start session')
    }

    await adminClient.from('account_security_events').insert({
      profile_id: profileId,
      event_type: usedBackup ? 'financier_backup_pin_login' : 'financier_pin_login',
      metadata: { origin: req.headers.get('origin') || null },
    })

    return json({
      token_hash: linkData.properties.hashed_token,
      email: authUser.email,
      profile,
    })
  } catch (e) {
    return json({ error: (e as Error).message }, 400)
  }
})
