import type { TypedSupabaseClient } from './client'

export interface PurchasePayment {
  id: string
  organization_id: string
  purchase_id: string
  amount: number
  mode: string
  reference: string | null
  notes: string | null
  paid_at: string
  created_by: string | null
  created_at: string
}

export interface RecordPurchasePaymentInput {
  organization_id: string
  purchase_id: string
  amount: number
  mode: string
  reference?: string
  notes?: string
  created_by: string
}

export async function recordPurchasePayment(
  client: TypedSupabaseClient,
  input: RecordPurchasePaymentInput,
) {
  const { data, error } = await client
    .from('purchase_payments')
    .insert({
      organization_id: input.organization_id,
      purchase_id: input.purchase_id,
      amount: input.amount,
      mode: input.mode,
      reference: input.reference || null,
      notes: input.notes || null,
      created_by: input.created_by,
    })
    .select()
    .single()
  return { data: data as PurchasePayment | null, error }
}

export async function getPurchasePayments(
  client: TypedSupabaseClient,
  orgId: string,
  purchaseId: string,
) {
  const { data, error } = await client
    .from('purchase_payments')
    .select('*')
    .eq('organization_id', orgId)
    .eq('purchase_id', purchaseId)
    .order('paid_at', { ascending: false })
  return { data: (data ?? []) as PurchasePayment[], error }
}

export async function getPurchasePaymentSummary(
  client: TypedSupabaseClient,
  orgId: string,
  purchaseId: string,
  totalAmount: number,
) {
  const { data, error } = await getPurchasePayments(client, orgId, purchaseId)
  if (error) return { data: null, error }
  const paidAmount = data.reduce((sum, p) => sum + p.amount, 0)
  const balanceDue = Math.max(0, totalAmount - paidAmount)
  const status: 'paid' | 'partial' | 'pending' = balanceDue <= 0 ? 'paid' : paidAmount > 0 ? 'partial' : 'pending'
  return { data: { paidAmount, balanceDue, status, payments: data }, error: null }
}
