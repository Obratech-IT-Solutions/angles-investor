import { supabase } from '@/lib/supabase'
import { budgetBasedProfitShare, toNumber, moneyInputFromValue } from '@/lib/money'
import { BUDGET_POOL_COLOR_COUNT } from '@/lib/financierColors'
import type { BudgetLenderInput } from '@/lib/budget'
import type {
  FinancierBudgetPool,
  FinancierProjectBudget,
  FinancierProjectLender,
  LenderPromiseType,
} from '@/types'

export type LenderDraft = BudgetLenderInput & {
  clientKey: string
}

export async function loadBudgetForProject(
  financierId: string,
  projectId: string,
): Promise<FinancierProjectBudget | null> {
  const { data, error } = await supabase
    .from('financier_project_budgets')
    .select('*, financier_project_lenders(*)')
    .eq('financier_id', financierId)
    .eq('project_id', projectId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null

  const budget = data as FinancierProjectBudget
  const lenders = [...(budget.financier_project_lenders ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at),
  )
  return { ...budget, financier_project_lenders: lenders }
}

export async function upsertBudgetWithLenders(params: {
  financierId: string
  projectId: string
  ownCapital: number
  manualProfit?: number | null
  notes: string | null
  existingBudgetId: string | null
  lenders: LenderDraft[]
  poolId?: string | null
}): Promise<FinancierProjectBudget> {
  const { financierId, projectId, ownCapital, notes, existingBudgetId, lenders } = params
  const manualProfit = params.manualProfit === undefined ? undefined : params.manualProfit
  const poolId = params.poolId

  let budgetId = existingBudgetId

  if (budgetId) {
    const updatePayload: Record<string, unknown> = { own_capital: ownCapital, notes }
    if (manualProfit !== undefined) updatePayload.manual_profit = manualProfit
    if (poolId !== undefined) updatePayload.pool_id = poolId
    const { error } = await supabase
      .from('financier_project_budgets')
      .update(updatePayload)
      .eq('id', budgetId)
      .eq('financier_id', financierId)
    if (error) throw new Error(error.message)
  } else {
    const { data, error } = await supabase
      .from('financier_project_budgets')
      .insert({
        financier_id: financierId,
        project_id: projectId,
        own_capital: ownCapital,
        notes,
        ...(manualProfit !== undefined ? { manual_profit: manualProfit } : {}),
        ...(poolId !== undefined ? { pool_id: poolId } : {}),
      })
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    budgetId = (data as FinancierProjectBudget).id
  }

  const { data: existingLenders, error: listErr } = await supabase
    .from('financier_project_lenders')
    .select('id')
    .eq('budget_id', budgetId)
  if (listErr) throw new Error(listErr.message)

  const keepIds = new Set(lenders.map((l) => l.id).filter(Boolean) as string[])
  const toDelete = ((existingLenders as { id: string }[]) ?? [])
    .map((r) => r.id)
    .filter((id) => !keepIds.has(id))

  if (toDelete.length > 0) {
    const { error } = await supabase.from('financier_project_lenders').delete().in('id', toDelete)
    if (error) throw new Error(error.message)
  }

  for (let i = 0; i < lenders.length; i++) {
    const l = lenders[i]
    const payload = {
      budget_id: budgetId,
      lender_name: l.lender_name.trim(),
      borrowed_amount: Number(l.borrowed_amount) || 0,
      promise_type: l.promise_type as LenderPromiseType,
      promise_value: Number(l.promise_value) || 0,
      notes: l.notes?.trim() || null,
      sort_order: i,
    }

    if (l.id) {
      const { error } = await supabase.from('financier_project_lenders').update(payload).eq('id', l.id)
      if (error) throw new Error(error.message)
    } else {
      const { error } = await supabase.from('financier_project_lenders').insert(payload)
      if (error) throw new Error(error.message)
    }
  }

  const saved = await loadBudgetForProject(financierId, projectId)
  if (!saved) throw new Error('Budget saved but could not be reloaded')
  return saved
}

export function lendersToDrafts(lenders: FinancierProjectLender[]): LenderDraft[] {
  return lenders.map((l, i) => ({
    clientKey: l.id,
    id: l.id,
    lender_name: l.lender_name,
    borrowed_amount: toNumber(l.borrowed_amount) === 0 ? '' : moneyInputFromValue(l.borrowed_amount),
    promise_type: l.promise_type,
    promise_value: toNumber(l.promise_value) === 0 ? '' : moneyInputFromValue(l.promise_value),
    notes: l.notes,
    sort_order: l.sort_order ?? i,
  }))
}

export function emptyLenderDraft(index = 0): LenderDraft {
  return {
    clientKey: `new-${Date.now()}-${index}`,
    lender_name: '',
    borrowed_amount: '',
    promise_type: 'fixed_profit',
    promise_value: '',
    notes: '',
    sort_order: index,
  }
}

/**
 * Remove finances from any pool and restore default ownership:
 * you own 100% of confirmed budget and expected profit; chip-ins cleared.
 */
export async function resetBudgetsToSoloDefault(params: {
  financierId: string
  projectIds: string[]
}): Promise<void> {
  const { financierId, projectIds } = params
  const uniqueIds = [...new Set(projectIds.filter(Boolean))]
  if (uniqueIds.length === 0) return

  for (const projectId of uniqueIds) {
    const existing = await loadBudgetForProject(financierId, projectId)

    const { data: pf, error: pfErr } = await supabase
      .from('project_financiers')
      .select(
        'confirmed_amount, projects:project_id(capital_required, expected_profit)',
      )
      .eq('financier_id', financierId)
      .eq('project_id', projectId)
      .maybeSingle()
    if (pfErr) throw new Error(pfErr.message)

    const row = pf as {
      confirmed_amount: number | string | null
      projects: { capital_required: number | string | null; expected_profit: number | string | null } | null
    } | null

    const confirmed = toNumber(row?.confirmed_amount)
    const profit = budgetBasedProfitShare(
      confirmed,
      toNumber(row?.projects?.capital_required),
      toNumber(row?.projects?.expected_profit),
    )

    await upsertBudgetWithLenders({
      financierId,
      projectId,
      ownCapital: confirmed,
      manualProfit: profit,
      notes: existing?.notes ?? null,
      existingBudgetId: existing?.id ?? null,
      lenders: [],
      poolId: null,
    })

    // Belt-and-suspenders: force-clear pool_id even if upsert path missed it.
    if (existing?.id) {
      const { error: clearErr } = await supabase
        .from('financier_project_budgets')
        .update({ pool_id: null })
        .eq('id', existing.id)
        .eq('financier_id', financierId)
      if (clearErr) throw new Error(clearErr.message)
    }
  }
}

/** Dissolve an entire pool: every member becomes solo/default. */
export async function dissolveBudgetPool(params: {
  financierId: string
  poolId: string
}): Promise<void> {
  const { financierId, poolId } = params
  const { data, error } = await supabase
    .from('financier_project_budgets')
    .select('project_id')
    .eq('financier_id', financierId)
    .eq('pool_id', poolId)
  if (error) throw new Error(error.message)
  const projectIds = ((data as { project_id: string }[] | null) ?? []).map((r) => r.project_id)
  await resetBudgetsToSoloDefault({ financierId, projectIds })
}

export async function createBudgetPool(financierId: string): Promise<{
  poolId: string
  colorIndex: number
}> {
  const { data: existing, error: listErr } = await supabase
    .from('financier_budget_pools')
    .select('color_index')
    .eq('financier_id', financierId)
    .order('created_at', { ascending: false })
    .limit(1)

  if (listErr) throw new Error(listErr.message)

  const lastIndex = (existing as { color_index: number }[] | null)?.[0]?.color_index
  const colorIndex =
    lastIndex === undefined || lastIndex === null
      ? 0
      : (Math.trunc(lastIndex) + 1) % BUDGET_POOL_COLOR_COUNT

  const { data, error } = await supabase
    .from('financier_budget_pools')
    .insert({
      financier_id: financierId,
      color_index: colorIndex,
    })
    .select('id, color_index')
    .single()

  if (error) throw new Error(error.message)
  const pool = data as Pick<FinancierBudgetPool, 'id' | 'color_index'>
  return { poolId: pool.id, colorIndex: pool.color_index }
}

export async function distributeBudgetsAcrossProjects(params: {
  financierId: string
  shares: Array<{
    projectId: string
    ownCapital: number
    profit: number
    /** Per-finance chip-in people (already proportionally split). */
    lenders: LenderDraft[]
  }>
  poolId?: string | null
}): Promise<{ poolId: string | null; colorIndex: number }> {
  const { financierId, shares } = params
  const projectIds = shares.map((s) => s.projectId)

  const { data: beforeRows, error: beforeErr } = await supabase
    .from('financier_project_budgets')
    .select('project_id, pool_id')
    .eq('financier_id', financierId)
    .in('project_id', projectIds)
  if (beforeErr) throw new Error(beforeErr.message)

  const previousPoolIds = [
    ...new Set(
      ((beforeRows as { project_id: string; pool_id: string | null }[] | null) ?? [])
        .map((r) => r.pool_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ]

  // Single finance is never a pool — save solo and ungroup any former mates.
  if (shares.length < 2) {
    for (const share of shares) {
      const existing = await loadBudgetForProject(financierId, share.projectId)
      const lenders: LenderDraft[] = share.lenders
        .filter((l) => toNumber(l.borrowed_amount) > 0 || l.lender_name.trim())
        .map((l, i) => ({
          ...l,
          clientKey: l.clientKey || `solo-${share.projectId}-${i}`,
          promise_type: 'fixed_profit' as const,
          sort_order: i,
        }))
      await upsertBudgetWithLenders({
        financierId,
        projectId: share.projectId,
        ownCapital: share.ownCapital,
        manualProfit: share.profit,
        notes: existing?.notes ?? null,
        existingBudgetId: existing?.id ?? null,
        lenders,
        poolId: null,
      })
    }
    await ungroupOrphanPoolMates({
      financierId,
      poolIds: previousPoolIds,
      keepProjectIds: projectIds,
    })
    return { poolId: null, colorIndex: 0 }
  }

  let poolId = params.poolId ?? null
  let colorIndex = 0

  if (!poolId) {
    const created = await createBudgetPool(financierId)
    poolId = created.poolId
    colorIndex = created.colorIndex
  } else {
    const { data: poolRow, error: poolErr } = await supabase
      .from('financier_budget_pools')
      .select('id, color_index')
      .eq('id', poolId)
      .eq('financier_id', financierId)
      .maybeSingle()
    if (poolErr) throw new Error(poolErr.message)
    colorIndex = (poolRow as Pick<FinancierBudgetPool, 'color_index'> | null)?.color_index ?? 0
  }

  // Clear pool_id on budgets for these projects that belong to a different pool,
  // then re-link them to the new/current pool below.
  if (projectIds.length > 0) {
    const { error: clearErr } = await supabase
      .from('financier_project_budgets')
      .update({ pool_id: null })
      .eq('financier_id', financierId)
      .in('project_id', projectIds)
      .neq('pool_id', poolId)
    if (clearErr) throw new Error(clearErr.message)
  }

  for (const share of shares) {
    const existing = await loadBudgetForProject(financierId, share.projectId)
    const lenders: LenderDraft[] = share.lenders
      .filter((l) => toNumber(l.borrowed_amount) > 0 || l.lender_name.trim())
      .map((l, i) => ({
        ...l,
        clientKey: l.clientKey || `pooled-${share.projectId}-${i}`,
        promise_type: 'fixed_profit' as const,
        sort_order: i,
        notes:
          l.notes?.trim() ||
          `Auto-pooled chip-in. Finance profit share for this person: ₱${toNumber(l.promise_value).toFixed(2)}`,
      }))

    await upsertBudgetWithLenders({
      financierId,
      projectId: share.projectId,
      ownCapital: share.ownCapital,
      manualProfit: share.profit,
      notes: existing?.notes ?? 'Auto-distributed from multi-finance pool.',
      existingBudgetId: existing?.id ?? null,
      lenders,
      poolId,
    })
  }

  // Finances left out of this pool selection are ungrouped back to default ownership.
  await ungroupOrphanPoolMates({
    financierId,
    poolIds: [...new Set([...previousPoolIds, poolId])],
    keepProjectIds: projectIds,
  })

  // If somehow fewer than 2 remain on this pool, dissolve it.
  const { data: remaining, error: remErr } = await supabase
    .from('financier_project_budgets')
    .select('project_id')
    .eq('financier_id', financierId)
    .eq('pool_id', poolId)
  if (remErr) throw new Error(remErr.message)
  const remainingIds = ((remaining as { project_id: string }[] | null) ?? []).map((r) => r.project_id)
  if (remainingIds.length < 2) {
    await resetBudgetsToSoloDefault({ financierId, projectIds: remainingIds })
    return { poolId: null, colorIndex: 0 }
  }

  return { poolId, colorIndex }
}

async function ungroupOrphanPoolMates(params: {
  financierId: string
  poolIds: string[]
  keepProjectIds: string[]
}): Promise<void> {
  const { financierId, poolIds, keepProjectIds } = params
  const keep = new Set(keepProjectIds)
  const orphanIds: string[] = []

  for (const poolId of [...new Set(poolIds.filter(Boolean))]) {
    const { data: members, error } = await supabase
      .from('financier_project_budgets')
      .select('project_id')
      .eq('financier_id', financierId)
      .eq('pool_id', poolId)
    if (error) throw new Error(error.message)
    for (const m of (members as { project_id: string }[] | null) ?? []) {
      if (!keep.has(m.project_id)) orphanIds.push(m.project_id)
    }
  }

  if (orphanIds.length > 0) {
    await resetBudgetsToSoloDefault({ financierId, projectIds: orphanIds })
  }
}
