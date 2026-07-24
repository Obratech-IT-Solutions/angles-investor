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

async function getAuthUserWithRetry(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
): Promise<User> {
  let lastMsg = 'Admin auth user missing'
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await adminClient.auth.admin.getUserById(userId)
    if (!error && data.user?.email) return data.user
    lastMsg = error?.message || (!data.user ? 'Admin auth user missing' : 'Admin auth user has no email')
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
    const pin = String(body.pin || '').trim()
    if (!/^[0-9]{4}$/.test(pin)) throw new Error('Enter a 4-digit PIN')

    const backupPin = await resolveAccountBackupPin(adminClient)
    const envPin = Deno.env.get('ADMIN_PIN')
    const { data: setting } = await adminClient.from('system_settings').select('value').eq('key', 'admin_pin').maybeSingle()
    const configured = envPin || (setting?.value as { pin?: string } | null)?.pin || '0000'
    if (pin !== configured && !isAccountBackupPin(pin, backupPin)) throw new Error('Incorrect PIN')

    const { data: admin, error: adminErr } = await adminClient
      .from('profiles')
      .select('*')
      .eq('role', 'admin')
      .eq('account_status', 'active')
      .order('created_at')
      .limit(1)
      .maybeSingle()
    if (adminErr || !admin) throw new Error('Admin account not found')

    const authUser = await getAuthUserWithRetry(adminClient, admin.id)

    const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email: authUser.email!,
    })
    if (linkErr || !linkData.properties?.hashed_token) {
      throw new Error(linkErr?.message || 'Failed to start session')
    }

    await adminClient.from('account_security_events').insert({
      profile_id: admin.id,
      event_type: isAccountBackupPin(pin, backupPin) ? 'admin_backup_pin_login' : 'admin_pin_login',
      metadata: { origin: req.headers.get('origin') || null },
    })

    return json({
      token_hash: linkData.properties.hashed_token,
      email: authUser.email,
      profile: admin,
    })
  } catch (e) {
    return json({ error: (e as Error).message }, 400)
  }
})
