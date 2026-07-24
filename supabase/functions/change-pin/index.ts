import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
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

    const body = await req.json()
    const current_pin = String(body.current_pin || '').trim()
    const new_pin = String(body.new_pin || '').trim()

    if (!/^[0-9]{4}$/.test(current_pin) || !/^[0-9]{4}$/.test(new_pin)) {
      throw new Error('PIN must be 4 digits')
    }

    const { data: profile, error: pErr } = await adminClient.from('profiles').select('*').eq('id', user.id).single()
    if (pErr || !profile) throw new Error('Profile not found')

    const backupPin = await resolveAccountBackupPin(adminClient)

    if (profile.role === 'admin') {
      const envPin = Deno.env.get('ADMIN_PIN')
      const { data: setting } = await adminClient.from('system_settings').select('value').eq('key', 'admin_pin').maybeSingle()
      const configured = envPin || (setting?.value as { pin?: string } | null)?.pin || '0000'
      if (current_pin !== configured && !isAccountBackupPin(current_pin, backupPin)) {
        throw new Error('Current PIN is incorrect')
      }

      const { error: sErr } = await adminClient.from('system_settings').upsert({
        key: 'admin_pin',
        value: { pin: new_pin },
        updated_at: new Date().toISOString(),
      })
      if (sErr) throw new Error(sErr.message)
    } else {
      if (!profile.pin_hash) throw new Error('PIN not set')
      const currentHash = await hashPin(current_pin)
      if (!isAccountBackupPin(current_pin, backupPin) && currentHash !== profile.pin_hash) {
        throw new Error('Current PIN is incorrect')
      }

      const pin_hash = await hashPin(new_pin)
      const { error: uErr } = await adminClient.from('profiles').update({ pin_hash }).eq('id', user.id)
      if (uErr) throw new Error(uErr.message)
    }

    await adminClient.from('account_security_events').insert({
      profile_id: user.id,
      event_type: 'pin_changed',
      metadata: {},
    })

    return json({ ok: true })
  } catch (e) {
    return json({ error: (e as Error).message }, 400)
  }
})
