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

function slugifyName(name: string): string {
  const base =
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/^\.|\.$/g, '')
      .slice(0, 24) || 'financier'
  return `${base}.${crypto.randomUUID().slice(0, 6)}`
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
      error: userErr,
    } = await userClient.auth.getUser()
    if (userErr || !user) throw new Error('Unauthorized')

    const { data: caller } = await adminClient.from('profiles').select('*').eq('id', user.id).single()
    if (!caller || caller.role !== 'admin' || caller.account_status !== 'active') {
      throw new Error('Admin only')
    }

    const body = await req.json()
    const full_name = String(body.full_name || '').trim()
    if (!full_name || full_name.length < 2) throw new Error('Financier name is required')

    const username = slugifyName(full_name)
    const pin = DEFAULT_FINANCIER_PIN
    const pin_hash = await hashPin(pin)
    const syntheticEmail = `${username}@users.fundtrack.local`
    const internalPassword = crypto.randomUUID() + 'Aa1!'

    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email: syntheticEmail,
      password: internalPassword,
      email_confirm: true,
      user_metadata: { username, full_name },
    })
    if (createErr || !created.user) throw new Error(createErr?.message || 'Failed to create user')

    const { data: profile, error: profileErr } = await adminClient
      .from('profiles')
      .insert({
        id: created.user.id,
        username,
        full_name,
        display_name: full_name,
        role: 'financier',
        account_status: 'active',
        must_change_password: false,
        pin_hash,
      })
      .select()
      .single()

    if (profileErr) {
      await adminClient.auth.admin.deleteUser(created.user.id)
      throw new Error(profileErr.message)
    }

    await adminClient.from('audit_logs').insert({
      actor_id: user.id,
      entity_type: 'profiles',
      entity_id: profile.id,
      action: 'create_financier',
      after_data: { full_name, username, default_pin: true },
    })

    return json({ profile, pin })
  } catch (e) {
    return json({ error: (e as Error).message }, 400)
  }
})
