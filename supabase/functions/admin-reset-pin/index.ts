import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { DEFAULT_FINANCIER_PIN } from '../_shared/pin-defaults.ts'

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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing authorization')

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const adminClient = createClient(supabaseUrl, serviceKey)

    const {
      data: { user },
    } = await userClient.auth.getUser()
    if (!user) throw new Error('Unauthorized')
    const { data: caller } = await adminClient.from('profiles').select('*').eq('id', user.id).single()
    if (!caller || caller.role !== 'admin') throw new Error('Admin only')

    const body = await req.json()
    const profile_id = String(body.profile_id || body.user_id || '').trim()
    if (!profile_id) throw new Error('profile_id required')

    const pin = String(body.pin || DEFAULT_FINANCIER_PIN).trim()
    if (!/^[0-9]{4}$/.test(pin)) throw new Error('PIN must be 4 digits')

    const { data: target, error: targetErr } = await adminClient
      .from('profiles')
      .select('*')
      .eq('id', profile_id)
      .single()
    if (targetErr || !target) throw new Error('Profile not found')
    if (target.role !== 'financier') throw new Error('Can only set PIN for financiers')

    const pin_hash = await hashPin(pin)

    const { data: profile, error } = await adminClient
      .from('profiles')
      .update({
        pin_hash,
        must_change_password: false,
        failed_login_count: 0,
        account_status: 'active',
        locked_until: null,
      })
      .eq('id', profile_id)
      .select()
      .single()
    if (error) throw new Error(error.message)

    await adminClient.from('audit_logs').insert({
      actor_id: user.id,
      entity_type: 'profiles',
      entity_id: profile_id,
      action: 'admin_set_pin',
      after_data: { financier: target.full_name },
    })

    return json({ profile, pin })
  } catch (e) {
    return json({ error: (e as Error).message }, 400)
  }
})
