import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/hooks/use-toast'

export type NotificationItem = {
  id: string
  type: 'receivable' | 'payable' | 'low_stock'| 'payable'
  title: string
  description: string
  amount: number
  date: string
  referenceId: string // sale id or purchase id
}

export function useNotifications() {
  const { org, user } = useAuth()
  const orgId = org?.id
  const queryClient = useQueryClient()

  // Fetch unpaid sales and purchases
  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      if (!orgId) return []

      const today = new Date().toISOString()

      // Fetch unpaid sales (receivables) where due_date is past or today
      const { data: sales, error: salesErr } = await supabase
        .from('sales')
        .select('id, invoice_no, grand_total, due_date, customers(name)')
        .eq('organization_id', orgId)
        .eq('payment_status', 'unpaid')
        .lte('due_date', today)

      if (salesErr) throw salesErr

      
      // Fetch low stock items
      const { data: orgSettings } = await supabase.from('org_settings').select('branding').eq('organization_id', orgId).single()
      const notifyLowStock = orgSettings?.branding?.notify_low_stock ?? true
      
      let lowStockItems: any[] = []
      if (notifyLowStock) {
        const { data: invData, error: invErr } = await supabase
          .from('inventory')
          .select('product_id, stock_qty, reorder_level, products(name)')
          .eq('organization_id', orgId)
        
        if (!invErr && invData) {
          lowStockItems = invData.filter((i: any) => i.stock_qty <= i.reorder_level)
        }
      }

      // Fetch unpaid purchases (payables) where due_date is past or today
      const { data: purchases, error: purErr } = await supabase
        .from('purchases')
        .select('id, invoice_ref, total_amount, due_date, suppliers(name)')
        .eq('organization_id', orgId)
        .eq('payment_status', 'unpaid')
        .lte('due_date', today)

      if (purErr) throw purErr

      const items: NotificationItem[] = []

      sales?.forEach((s: any) => {
        items.push({
          id: `sale-${s.id}`,
          type: 'receivable',
          title: `Payment Due from ${s.customers?.name || 'Customer'}`,
          description: `Invoice ${s.invoice_no} is overdue for payment.`,
          amount: s.grand_total,
          date: s.due_date,
          referenceId: s.id,
        })
      })

      purchases?.forEach((p: any) => {
        items.push({
          id: `pur-${p.id}`,
          type: 'payable',
          title: `Payment Due to ${p.suppliers?.name || 'Supplier'}`,
          description: `Purchase Bill ${p.invoice_ref || 'N/A'} is overdue for payment.`,
          amount: p.total_amount,
          date: p.due_date,
          referenceId: p.id,
        })
      })

      
      lowStockItems.forEach((i: any) => {
        items.push({
          id: `stock-${i.product_id}`,
          type: 'low_stock',
          title: `Low Stock Alert: ${i.products?.name || 'Product'}`,
          description: `Current stock (${i.stock_qty}) is at or below reorder level (${i.reorder_level}).`,
          amount: i.stock_qty, // Reusing amount field for stock count visually
          date: today,
          referenceId: i.product_id,
        })
      })

      // Sort by date descending
      return items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    },
  })

  // Mark as paid mutation
  const markAsPaid = useMutation({
    mutationFn: async ({ id, type, amount, title }: NotificationItem) => {
      if (!orgId || !user) throw new Error('Not authenticated')

      const refId = id.replace('sale-', '').replace('pur-', '')

      if (type === 'receivable') {
        // Update sale to paid
        const { error } = await supabase
          .from('sales')
          .update({ payment_status: 'paid', payment_mode: 'cash' })
          .eq('id', refId)
          .eq('organization_id', orgId)
        if (error) throw error

        // Log activity
        await supabase.from('activity_log').insert({
          organization_id: orgId,
          actor_id: user.id,
          actor_name: user.user_metadata?.full_name || user.email || 'User',
          action: 'payment_received',
          entity: 'sale',
          entity_id: refId,
          metadata: { amount, note: 'Settled from notifications' }
        })

      } else {
        // Update purchase to paid
        const { error } = await supabase
          .from('purchases')
          .update({ payment_status: 'paid', purchase_type: 'cash' })
          .eq('id', refId)
          .eq('organization_id', orgId)
        if (error) throw error

        // Add to expenses
        const { error: expErr } = await supabase.from('expenses').insert({
          organization_id: orgId,
          category: 'Purchase Payment',
          amount: amount,
          description: title,
          created_by: user.id,
          date: new Date().toISOString().split('T')[0]
        })
        if (expErr) throw expErr

        // Log activity
        await supabase.from('activity_log').insert({
          organization_id: orgId,
          actor_id: user.id,
          actor_name: user.user_metadata?.full_name || user.email || 'User',
          action: 'payment_made',
          entity: 'purchase',
          entity_id: refId,
          metadata: { amount, note: 'Settled from notifications' }
        })
      }
    },
    onSuccess: (_, variables) => {
      toast.success(variables.type === 'receivable' ? 'Payment received successfully' : 'Payment recorded successfully')
      queryClient.invalidateQueries({ queryKey: ['notifications', orgId] })
      queryClient.invalidateQueries({ queryKey: ['sales-history', orgId] })
      queryClient.invalidateQueries({ queryKey: ['purchases', orgId] })
      queryClient.invalidateQueries({ queryKey: ['expenses', orgId] })
      queryClient.invalidateQueries({ queryKey: ['activity', orgId] })
    },
    onError: (err) => {
      toast.error('Failed to process payment', err.message)
    }
  })

  return {
    notifications,
    isLoading,
    markAsPaid
  }
}
