import type { TypedSupabaseClient } from './client'
import type { StockTransfer, StockTransferItem } from '@billscape/core'

export interface CreateStockTransferInput {
  organization_id: string
  sender_branch_id: string
  receiver_branch_id: string
  sender_user_id: string
  vehicle_number?: string
  driver_name?: string
  driver_phone?: string
  notes?: string
  items: {
    product_id: string
    variant_id?: string
    sent_qty: number
    unit_cost?: number
  }[]
}

export async function createStockTransfer(
  client: TypedSupabaseClient,
  input: CreateStockTransferInput
): Promise<StockTransfer> {
  const transferNo = `TRF-${Date.now().toString().slice(-6)}`

  // 1. Create main transfer ticket
  const { data: transfer, error: transferErr } = await client
    .from('stock_transfers')
    .insert({
      organization_id: input.organization_id,
      transfer_no: transferNo,
      sender_branch_id: input.sender_branch_id,
      receiver_branch_id: input.receiver_branch_id,
      sender_user_id: input.sender_user_id,
      vehicle_number: input.vehicle_number,
      driver_name: input.driver_name,
      driver_phone: input.driver_phone,
      notes: input.notes,
      status: 'open_in_transit',
    })
    .select()
    .single()

  if (transferErr) throw transferErr

  // 2. Create transfer items
  const itemRows = input.items.map((it) => ({
    transfer_id: transfer.id,
    product_id: it.product_id,
    variant_id: it.variant_id ?? null,
    sent_qty: it.sent_qty,
    received_qty: null,
    unit_cost: it.unit_cost ?? 0,
  }))

  const { error: itemsErr } = await client.from('stock_transfer_items').insert(itemRows)
  if (itemsErr) throw itemsErr

  // 3. Deduct stock from Sender Branch
  for (const item of input.items) {
    const { data: existing } = await client
      .from('branch_inventory')
      .select('id, stock_qty')
      .eq('branch_id', input.sender_branch_id)
      .eq('product_id', item.product_id)
      .maybeSingle()

    const currentQty = existing?.stock_qty ?? 0
    const newQty = Math.max(currentQty - item.sent_qty, 0)

    if (existing?.id) {
      const { error: updErr } = await client
        .from('branch_inventory')
        .update({ stock_qty: newQty, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
      if (updErr) console.error('Error updating sender branch_inventory:', updErr)
    } else {
      const insPayload: Record<string, any> = {
        organization_id: input.organization_id,
        branch_id: input.sender_branch_id,
        product_id: item.product_id,
        stock_qty: newQty,
        updated_at: new Date().toISOString(),
      }
      if (item.variant_id) insPayload.variant_id = item.variant_id

      const { error: insErr } = await client
        .from('branch_inventory')
        .insert(insPayload)
      if (insErr) console.error('Error inserting sender branch_inventory:', insErr)
    }

    // Log stock movement
    await client.from('stock_movements').insert({
      organization_id: input.organization_id,
      branch_id: input.sender_branch_id,
      product_id: item.product_id,
      qty_change: -item.sent_qty,
      reason: 'adjustment',
      note: `Stock Transfer Dispatch: ${transferNo}`,
      created_by: input.sender_user_id,
    })

    // Deduct stock from main inventory table if sender branch is Head Office / Main HQ
    const { data: mainInv } = await client
      .from('inventory')
      .select('stock_qty')
      .eq('product_id', item.product_id)
      .maybeSingle()

    if (mainInv) {
      const newMainQty = Math.max((mainInv.stock_qty ?? 0) - item.sent_qty, 0)
      await client
        .from('inventory')
        .update({ stock_qty: newMainQty })
        .eq('product_id', item.product_id)
    }
  }

  return transfer as StockTransfer
}

export async function getStockTransfers(
  client: TypedSupabaseClient,
  orgId: string,
  branchId?: string
): Promise<StockTransfer[]> {
  let query = client
    .from('stock_transfers')
    .select('*, sender_branch:branches!stock_transfers_sender_branch_id_fkey(*), receiver_branch:branches!stock_transfers_receiver_branch_id_fkey(*), items:stock_transfer_items(*)')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })

  if (branchId) {
    query = query.or(`sender_branch_id.eq.${branchId},receiver_branch_id.eq.${branchId}`)
  }

  const { data, error } = await query
  if (error) throw error
  return (data as StockTransfer[]) || []
}

export async function acceptStockTransfer(
  client: TypedSupabaseClient,
  transferId: string,
  receiverUserId: string
): Promise<void> {
  // Fetch transfer and items
  const { data: transfer, error: fetchErr } = await client
    .from('stock_transfers')
    .select('*, items:stock_transfer_items(*)')
    .eq('id', transferId)
    .single()

  if (fetchErr) throw fetchErr

  const items = (transfer.items as StockTransferItem[]) || []

  // Add stock to Receiver Branch
  for (const item of items) {
    const qtyToAdd = item.sent_qty

    const { data: existing } = await client
      .from('branch_inventory')
      .select('id, stock_qty')
      .eq('branch_id', transfer.receiver_branch_id)
      .eq('product_id', item.product_id)
      .maybeSingle()

    const currentQty = existing?.stock_qty ?? 0
    const newQty = currentQty + qtyToAdd

    if (existing?.id) {
      const { error: updErr } = await client
        .from('branch_inventory')
        .update({ stock_qty: newQty, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
      if (updErr) console.error('Error updating receiver branch_inventory:', updErr)
    } else {
      const insPayload: Record<string, any> = {
        organization_id: transfer.organization_id,
        branch_id: transfer.receiver_branch_id,
        product_id: item.product_id,
        stock_qty: newQty,
        updated_at: new Date().toISOString(),
      }
      if (item.variant_id) insPayload.variant_id = item.variant_id

      const { error: insErr } = await client
        .from('branch_inventory')
        .insert(insPayload)
      if (insErr) console.error('Error inserting receiver branch_inventory:', insErr)
    }

    // Update main inventory if receiver branch is Head Office
    const { data: recBranch } = await client
      .from('branches')
      .select('is_main, type')
      .eq('id', transfer.receiver_branch_id)
      .maybeSingle()

    if (recBranch && (recBranch.is_main || recBranch.type === 'head_office')) {
      const { data: mainInv } = await client
        .from('inventory')
        .select('stock_qty')
        .eq('product_id', item.product_id)
        .maybeSingle()

      if (mainInv) {
        await client
          .from('inventory')
          .update({ stock_qty: (mainInv.stock_qty ?? 0) + qtyToAdd })
          .eq('product_id', item.product_id)
      }
    }

    // Update item received_qty
    await client
      .from('stock_transfer_items')
      .update({ received_qty: qtyToAdd })
      .eq('id', item.id!)

    // Log stock movement
    await client.from('stock_movements').insert({
      organization_id: transfer.organization_id,
      branch_id: transfer.receiver_branch_id,
      product_id: item.product_id,
      qty_change: qtyToAdd,
      reason: 'adjustment',
      note: `Stock Transfer Received: ${transfer.transfer_no}`,
      created_by: receiverUserId,
    })
  }

  // Update status to closed_accepted
  await client
    .from('stock_transfers')
    .update({
      status: 'closed_accepted',
      receiver_user_id: receiverUserId,
      completed_at: new Date().toISOString(),
    })
    .eq('id', transferId)
}

export async function markTransferDiscrepancy(
  client: TypedSupabaseClient,
  transferId: string,
  receiverUserId: string,
  discrepancyNotes: string,
  receivedItems: { itemId: string; receivedQty: number }[]
): Promise<void> {
  const { data: transfer, error: fetchErr } = await client
    .from('stock_transfers')
    .select('*, items:stock_transfer_items(*)')
    .eq('id', transferId)
    .single()

  if (fetchErr) throw fetchErr

  // Add partial received stock to Receiver Branch
  for (const rec of receivedItems) {
    const item = (transfer.items as StockTransferItem[]).find((i) => i.id === rec.itemId)
    if (!item) continue

    const { data: existing } = await client
      .from('branch_inventory')
      .select('id, stock_qty')
      .eq('branch_id', transfer.receiver_branch_id)
      .eq('product_id', item.product_id)
      .maybeSingle()

    const currentQty = existing?.stock_qty ?? 0
    const newQty = currentQty + rec.receivedQty

    if (existing?.id) {
      const { error: updErr } = await client
        .from('branch_inventory')
        .update({ stock_qty: newQty, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
      if (updErr) console.error('Error updating receiver branch_inventory in discrepancy:', updErr)
    } else {
      const insPayload: Record<string, any> = {
        organization_id: transfer.organization_id,
        branch_id: transfer.receiver_branch_id,
        product_id: item.product_id,
        stock_qty: newQty,
        updated_at: new Date().toISOString(),
      }
      if (item.variant_id) insPayload.variant_id = item.variant_id

      const { error: insErr } = await client
        .from('branch_inventory')
        .insert(insPayload)
      if (insErr) console.error('Error inserting receiver branch_inventory in discrepancy:', insErr)
    }

    await client
      .from('stock_transfer_items')
      .update({ received_qty: rec.receivedQty })
      .eq('id', rec.itemId)

    // Log stock movement
    await client.from('stock_movements').insert({
      organization_id: transfer.organization_id,
      branch_id: transfer.receiver_branch_id,
      product_id: item.product_id,
      qty_change: rec.receivedQty,
      reason: 'adjustment',
      note: `Stock Transfer Discrepancy Received (${rec.receivedQty}/${item.sent_qty}): ${transfer.transfer_no}`,
      created_by: receiverUserId,
    })
  }

  // Update status to pending_discrepancy
  await client
    .from('stock_transfers')
    .update({
      status: 'pending_discrepancy',
      receiver_user_id: receiverUserId,
      discrepancy_notes: discrepancyNotes,
    })
    .eq('id', transferId)
}
