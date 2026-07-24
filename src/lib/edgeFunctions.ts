import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

/** Invoke an Edge Function and surface the JSON `error` body when status is non-2xx. */
export async function invokeEdgeFunction<T extends Record<string, unknown>>(
  name: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body: body ?? {} })

  const payload = (data ?? null) as (T & { error?: string }) | null
  if (payload?.error) {
    throw new Error(String(payload.error))
  }

  if (error) {
    if (error instanceof FunctionsHttpError) {
      try {
        const parsed = (await error.context.json()) as { error?: string }
        if (parsed?.error) throw new Error(String(parsed.error))
      } catch (inner) {
        if (inner instanceof Error && inner.message && inner.message !== error.message) {
          throw inner
        }
      }
    }
    throw new Error(error.message)
  }

  if (!payload) throw new Error('Empty response from server')
  return payload
}
