import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'

export const DEFAULT_ACCOUNT_BACKUP_PIN = '1111'

export async function resolveAccountBackupPin(adminClient: SupabaseClient): Promise<string> {
  const fromEnv =
    Deno.env.get('ACCOUNT_BACKUP_PIN') ||
    Deno.env.get('ADMIN_BACKUP_PIN') ||
    Deno.env.get('FINANCIER_BACKUP_PIN')
  if (fromEnv?.trim()) return fromEnv.trim()

  for (const key of ['account_backup_pin', 'admin_backup_pin'] as const) {
    const { data } = await adminClient.from('system_settings').select('value').eq('key', key).maybeSingle()
    const pin = (data?.value as { pin?: string } | null)?.pin
    if (pin) return pin
  }

  return DEFAULT_ACCOUNT_BACKUP_PIN
}

export function isAccountBackupPin(pin: string, backupPin: string): boolean {
  return pin === backupPin
}
