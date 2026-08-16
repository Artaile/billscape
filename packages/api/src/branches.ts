import type { TypedSupabaseClient } from './client'
import type { Branch, BranchType, BranchInventory, BranchTransfer, BranchTransferItem, BranchTransferStatus } from '@billscape/core'

export interface CreateBranchInput {
  organization_id: string
  name: string
  code: string
  branch_type?: BranchType
  is_default?: boolean
  is_active?: boolean
  manager_name?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  city?: string | null
  state_code?: string | null
  pincode?: string | null
  gstin?: string | null
  bank_name?: string | null
  bank_account?: string | null
  bank_ifsc?: string | null
  upi_id?: string | null
  invoice_prefix?: string | null
}

export interface UpdateBranchInput {
  name?: string
  code?: string
  branch_type?: BranchType
  is_default?: boolean
  is_active?: boolean
  manager_name?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  city?: string | null
  state_code?: string | null
  pincode?: string | null
  gstin?: string | null
  bank_name?: string | null
  bank_account?: string | null
  bank_ifsc?: string | null
  upi_id?: string | null
  invoice_prefix?: string | null
}

export async function getBranches(
  client: TypedSupabaseClient,
  orgId: string,
  includeInactive = false
): Promise<Branch[]> {
  let query = (client as any)
    .from('branches')
    .select('*')
    .eq('organization_id', orgId)
    .order('is_default', { ascending: false })
    .order('name', { ascending: true })

  if (!includeInactive) {
    query = query.eq('is_active', true)
  }

  const { data, error } = await query
  if (error) throw error
  return data as Branch[]
}

export async function getBranchById(
  client: TypedSupabaseClient,
  branchId: string
): Promise<Branch | null> {
  const { data, error } = await (client as any)
    .from('branches')
    .select('*')
    .eq('id', branchId)
    .maybeSingle()

  if (error) throw error
  return data as Branch | null
}

export async function createBranch(
  client: TypedSupabaseClient,
  input: CreateBranchInput
): Promise<Branch> {
  const trimmedCode = input.code.trim().toUpperCase()

  // If this is set to default, unset other defaults
  if (input.is_default) {
    await (client as any)
      .from('branches')
      .update({ is_default: false })
      .eq('organization_id', input.organization_id)
  }

  const { data: branch, error } = await (client as any)
    .from('branches')
    .insert({
      organization_id: input.organization_id,
      name: input.name.trim(),
      code: trimmedCode,
      branch_type: input.branch_type || 'retail',
      is_default: input.is_default || false,
      is_active: input.is_active !== undefined ? input.is_active : true,
      manager_name: input.manager_name?.trim() || null,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      address: input.address?.trim() || null,
      city: input.city?.trim() || null,
      state_code: input.state_code?.trim() || null,
      pincode: input.pincode?.trim() || null,
      gstin: input.gstin?.trim() || null,
      bank_name: input.bank_name?.trim() || null,
      bank_account: input.bank_account?.trim() || null,
      bank_ifsc: input.bank_ifsc?.trim() || null,
      upi_id: input.upi_id?.trim() || null,
      invoice_prefix: input.invoice_prefix?.trim() || null,
    })
    .select()
    .single()

  if (error) throw error

  // Auto-seed branch_inventory with 0 stock for all existing products of this org
  const { data: products } = await (client as any)
    .from('products')
    .select('id')
    .eq('organization_id', input.organization_id)

  if (products && products.length > 0) {
    const invRows = products.map((p: any) => ({
      organization_id: input.organization_id,
      branch_id: branch.id,
      product_id: p.id,
      stock_qty: 0,
      reorder_level: 5,
    }))
    await (client as any)
      .from('branch_inventory')
      .insert(invRows)
      .select()
  }

  return branch as Branch
}

export async function updateBranch(
  client: TypedSupabaseClient,
  branchId: string,
  input: UpdateBranchInput
): Promise<Branch> {
  const payload: Record<string, any> = {
    updated_at: new Date().toISOString(),
  }

  if (input.name !== undefined) payload.name = input.name.trim()
  if (input.code !== undefined) payload.code = input.code.trim().toUpperCase()
  if (input.branch_type !== undefined) payload.branch_type = input.branch_type
  if (input.is_active !== undefined) payload.is_active = input.is_active
  if (input.manager_name !== undefined) payload.manager_name = input.manager_name?.trim() || null
  if (input.phone !== undefined) payload.phone = input.phone?.trim() || null
  if (input.email !== undefined) payload.email = input.email?.trim() || null
  if (input.address !== undefined) payload.address = input.address?.trim() || null
  if (input.city !== undefined) payload.city = input.city?.trim() || null
  if (input.state_code !== undefined) payload.state_code = input.state_code?.trim() || null
  if (input.pincode !== undefined) payload.pincode = input.pincode?.trim() || null
  if (input.gstin !== undefined) payload.gstin = input.gstin?.trim() || null
  if (input.bank_name !== undefined) payload.bank_name = input.bank_name?.trim() || null
  if (input.bank_account !== undefined) payload.bank_account = input.bank_account?.trim() || null
  if (input.bank_ifsc !== undefined) payload.bank_ifsc = input.bank_ifsc?.trim() || null
  if (input.upi_id !== undefined) payload.upi_id = input.upi_id?.trim() || null
  if (input.invoice_prefix !== undefined) payload.invoice_prefix = input.invoice_prefix?.trim() || null

  if (input.is_default) {
    const { data: current } = await (client as any).from('branches').select('organization_id').eq('id', branchId).single()
    if (current?.organization_id) {
      await (client as any).from('branches').update({ is_default: false }).eq('organization_id', current.organization_id)
    }
    payload.is_default = true
  }

  const { data, error } = await (client as any)
    .from('branches')
    .update(payload)
    .eq('id', branchId)
    .select()
    .single()

  if (error) throw error
  return data as Branch
}

export async function deleteBranch(
  client: TypedSupabaseClient,
  branchId: string
): Promise<void> {
  // Check if it's default
  const { data: branch } = await (client as any).from('branches').select('is_default, name').eq('id', branchId).single()
  if (branch?.is_default) {
    throw new Error('Default branch cannot be deleted.')
  }

  // Check if sales exist
  const { count: salesCount } = await (client as any)
    .from('sales')
    .select('id', { count: 'exact', head: true })
    .eq('branch_id', branchId)

  if (salesCount && salesCount > 0) {
    throw new Error(`Cannot delete branch "${branch?.name}". It has ${salesCount} recorded sales. You can deactivate it instead.`)
  }

  const { error } = await (client as any).from('branches').delete().eq('id', branchId)
  if (error) throw error
}

// ─── Branch Inventory ─────────────────────────────────────────────────────────

export async function getBranchInventory(
  client: TypedSupabaseClient,
  orgId: string,
  branchId?: string
): Promise<BranchInventory[]> {
  let query = (client as any)
    .from('branch_inventory')
    .select(`
      *,
      branch:branch_id(id, name, code, branch_type),
      product:product_id(id, name, sku, price, cost_price, tax_rate, track_stock, unit:unit_id(name, symbol))
    `)
    .eq('organization_id', orgId)

  if (branchId) {
    query = query.eq('branch_id', branchId)
  }

  const { data, error } = await query
  if (error) throw error
  return data as BranchInventory[]
}

// ─── Inter-Branch Stock Transfers (IBT) ───────────────────────────────────────

export interface CreateTransferInput {
  organization_id: string
  from_branch_id: string
  to_branch_id: string
  transfer_date?: string
  vehicle_no?: string
  driver_contact?: string
  notes?: string
  created_by: string
  items: {
    product_id: string
    qty: number
    unit_cost?: number
  }[]
  auto_dispatch?: boolean
}

export async function createTransfer(
  client: TypedSupabaseClient,
  input: CreateTransferInput
): Promise<BranchTransfer> {
  if (input.from_branch_id === input.to_branch_id) {
    throw new Error('Source and destination branches cannot be the same.')
  }
  if (!input.items || input.items.length === 0) {
    throw new Error('Transfer must include at least one item.')
  }

  // Generate transfer number
  const { count } = await (client as any)
    .from('branch_transfers')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', input.organization_id)

  const seq = ((count ?? 0) + 1).toString().padStart(4, '0')
  const dateStr = (input.transfer_date || new Date().toISOString().slice(0, 10)).replace(/-/g, '')
  const transferNo = `TRF-${dateStr}-${seq}`

  const status: BranchTransferStatus = input.auto_dispatch ? 'in_transit' : 'draft'

  const { data: transfer, error: trfErr } = await (client as any)
    .from('branch_transfers')
    .insert({
      organization_id: input.organization_id,
      transfer_no: transferNo,
      from_branch_id: input.from_branch_id,
      to_branch_id: input.to_branch_id,
      status,
      transfer_date: input.transfer_date || new Date().toISOString().slice(0, 10),
      vehicle_no: input.vehicle_no?.trim() || null,
      driver_contact: input.driver_contact?.trim() || null,
      notes: input.notes?.trim() || null,
      created_by: input.created_by,
      dispatched_at: input.auto_dispatch ? new Date().toISOString() : null,
    })
    .select()
    .single()

  if (trfErr) throw trfErr

  const itemRows = input.items.map((i) => ({
    transfer_id: transfer.id,
    product_id: i.product_id,
    qty: i.qty,
    unit_cost: i.unit_cost ?? 0,
  }))

  const { error: itemsErr } = await (client as any)
    .from('branch_transfer_items')
    .insert(itemRows)

  if (itemsErr) throw itemsErr

  // If auto_dispatch, deduct stock from source branch immediately
  if (input.auto_dispatch) {
    for (const item of input.items) {
      await deductBranchStock(client, input.organization_id, input.from_branch_id, item.product_id, item.qty)
    }
  }

  return transfer as BranchTransfer
}

export async function dispatchTransfer(
  client: TypedSupabaseClient,
  transferId: string,
  userId: string
): Promise<void> {
  const { data: transfer, error: trfErr } = await (client as any)
    .from('branch_transfers')
    .select('*, items:branch_transfer_items(*)')
    .eq('id', transferId)
    .single()

  if (trfErr || !transfer) throw new Error('Transfer not found.')
  if (transfer.status !== 'draft') {
    throw new Error(`Cannot dispatch transfer with status "${transfer.status}".`)
  }

  // Deduct stock from source branch for each item
  for (const item of transfer.items || []) {
    await deductBranchStock(client, transfer.organization_id, transfer.from_branch_id, item.product_id, item.qty)
  }

  const { error } = await (client as any)
    .from('branch_transfers')
    .update({
      status: 'in_transit',
      dispatched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', transferId)

  if (error) throw error
}

export async function receiveTransfer(
  client: TypedSupabaseClient,
  transferId: string,
  userId: string
): Promise<void> {
  const { data: transfer, error: trfErr } = await (client as any)
    .from('branch_transfers')
    .select('*, items:branch_transfer_items(*)')
    .eq('id', transferId)
    .single()

  if (trfErr || !transfer) throw new Error('Transfer not found.')
  if (transfer.status !== 'in_transit') {
    throw new Error(`Cannot receive transfer with status "${transfer.status}". It must be in transit.`)
  }

  // Add stock to destination branch for each item
  for (const item of transfer.items || []) {
    await addBranchStock(client, transfer.organization_id, transfer.to_branch_id, item.product_id, item.qty)
  }

  const { error } = await (client as any)
    .from('branch_transfers')
    .update({
      status: 'received',
      received_by: userId,
      received_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', transferId)

  if (error) throw error
}

export async function cancelTransfer(
  client: TypedSupabaseClient,
  transferId: string,
  userId: string
): Promise<void> {
  const { data: transfer, error: trfErr } = await (client as any)
    .from('branch_transfers')
    .select('*, items:branch_transfer_items(*)')
    .eq('id', transferId)
    .single()

  if (trfErr || !transfer) throw new Error('Transfer not found.')
  if (transfer.status === 'received') {
    throw new Error('Cannot cancel an already received transfer.')
  }

  // If it was in_transit, restore stock back to source branch
  if (transfer.status === 'in_transit') {
    for (const item of transfer.items || []) {
      await addBranchStock(client, transfer.organization_id, transfer.from_branch_id, item.product_id, item.qty)
    }
  }

  const { error } = await (client as any)
    .from('branch_transfers')
    .update({
      status: 'cancelled',
      updated_at: new Date().toISOString(),
    })
    .eq('id', transferId)

  if (error) throw error
}

// ─── Internal Stock Helpers ───────────────────────────────────────────────────

async function deductBranchStock(
  client: TypedSupabaseClient,
  orgId: string,
  branchId: string,
  productId: string,
  qty: number
) {
  const { data: inv } = await (client as any)
    .from('branch_inventory')
    .select('id, stock_qty')
    .eq('branch_id', branchId)
    .eq('product_id', productId)
    .maybeSingle()

  if (inv) {
    await (client as any)
      .from('branch_inventory')
      .update({
        stock_qty: (inv.stock_qty || 0) - qty,
        updated_at: new Date().toISOString(),
      })
      .eq('id', inv.id)
  } else {
    await (client as any)
      .from('branch_inventory')
      .insert({
        organization_id: orgId,
        branch_id: branchId,
        product_id: productId,
        stock_qty: -qty,
        reorder_level: 5,
      })
  }
}

async function addBranchStock(
  client: TypedSupabaseClient,
  orgId: string,
  branchId: string,
  productId: string,
  qty: number
) {
  const { data: inv } = await (client as any)
    .from('branch_inventory')
    .select('id, stock_qty')
    .eq('branch_id', branchId)
    .eq('product_id', productId)
    .maybeSingle()

  if (inv) {
    await (client as any)
      .from('branch_inventory')
      .update({
        stock_qty: (inv.stock_qty || 0) + qty,
        updated_at: new Date().toISOString(),
      })
      .eq('id', inv.id)
  } else {
    await (client as any)
      .from('branch_inventory')
      .insert({
        organization_id: orgId,
        branch_id: branchId,
        product_id: productId,
        stock_qty: qty,
        reorder_level: 5,
      })
  }
}
