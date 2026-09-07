import type { TypedSupabaseClient } from './client'
import type { Branch, BranchInventory } from '@billscape/core'

export async function getBranches(client: TypedSupabaseClient, orgId: string): Promise<Branch[]> {
  const { data, error } = await client
    .from('branches')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data as Branch[]) || []
}

export async function getBranchById(client: TypedSupabaseClient, branchId: string): Promise<Branch | null> {
  const { data, error } = await client
    .from('branches')
    .select('*')
    .eq('id', branchId)
    .maybeSingle()

  if (error) throw error
  return data as Branch | null
}

export interface CreateBranchInput {
  organization_id: string
  name: string
  code: string
  type: 'head_office' | 'retail_branch' | 'warehouse'
  address?: string
  city?: string
  pincode?: string
  state_code?: string
  phone?: string
  email?: string
  gstin?: string
  invoice_prefix?: string
  enabled_features?: Record<string, boolean>
}

export async function createBranch(client: TypedSupabaseClient, input: CreateBranchInput): Promise<Branch> {
  const { data, error } = await client
    .from('branches')
    .insert({
      organization_id: input.organization_id,
      name: input.name,
      code: input.code,
      type: input.type,
      address: input.address,
      city: input.city,
      pincode: input.pincode,
      state_code: input.state_code,
      phone: input.phone,
      email: input.email,
      gstin: input.gstin,
      invoice_prefix: input.invoice_prefix,
      enabled_features: input.enabled_features ?? {
        billing: true,
        products: true,
        inventory: true,
        purchases: true,
        expenses: true,
        reports: true,
        employees: true,
      },
    })
    .select()
    .single()

  if (error) throw error
  return data as Branch
}

export async function updateBranch(
  client: TypedSupabaseClient,
  branchId: string,
  updates: Partial<Omit<Branch, 'id' | 'organization_id' | 'created_at'>>
): Promise<Branch> {
  const { data, error } = await client
    .from('branches')
    .update(updates)
    .eq('id', branchId)
    .select()
    .single()

  if (error) throw error
  return data as Branch
}

export async function deleteBranch(client: TypedSupabaseClient, branchId: string): Promise<void> {
  // Unassign users linked to this branch before delete
  await client.from('memberships').update({ assigned_branch_id: null }).eq('assigned_branch_id', branchId)
  await client.from('employees').update({ assigned_branch_id: null }).eq('assigned_branch_id', branchId)

  const { error } = await client.from('branches').delete().eq('id', branchId)
  if (error) throw error
}

export async function getBranchInventory(
  client: TypedSupabaseClient,
  orgId: string,
  branchId: string
): Promise<BranchInventory[]> {
  const { data, error } = await client
    .from('branch_inventory')
    .select('*')
    .eq('organization_id', orgId)
    .eq('branch_id', branchId)

  if (error) throw error
  return (data as BranchInventory[]) || []
}
