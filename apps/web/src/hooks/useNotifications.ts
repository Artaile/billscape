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

      // Fetch low stock items
      const { data: orgSettings } = await supabase.from('org_settings').select('branding, feature_flags').eq('organization_id', orgId).single()
      const notifyLowStock = orgSettings?.branding?.notify_low_stock ?? true
      const globalThreshold = (orgSettings as any)?.feature_flags?.low_stock_threshold ?? 10
      
      let lowStockItems: any[] = []
      if (notifyLowStock) {
        const { data: invData, error: invErr } = await supabase
          .from('inventory')
          .select('product_id, stock_qty, products(name)')
          .eq('organization_id', orgId)
        
        if (!invErr && invData) {
          lowStockItems = invData.filter((i: any) => i.stock_qty <= globalThreshold)
        }
      }

      // Fetch unpaid credit purchases (payables)
      const { data: purchases, error: purErr } = await supabase
        .from('purchases')
        .select('id, invoice_no, purchase_no, total_amount, purchase_date, created_at, suppliers(name)')
        .eq('organization_id', orgId)
        .eq('purchase_type', 'credit')

      if (purErr) console.warn('Error fetching credit purchases:', purErr)

      const items: NotificationItem[] = []

      purchases?.forEach((p: any) => {
        items.push({
          id: `pur-${p.id}`,
          type: 'payable',
          title: `Credit Payment to ${p.suppliers?.name || 'Supplier'}`,
          description: `Purchase Bill ${p.purchase_no || p.invoice_no || 'N/A'} is marked as credit purchase.`,
          amount: p.total_amount,
          date: p.purchase_date || p.created_at || today,
          referenceId: p.id,
        })
      })

      lowStockItems.forEach((i: any) => {
        items.push({
          id: `stock-${i.product_id}`,
          type: 'low_stock',
          title: `Low Stock Alert: ${i.products?.name || 'Product'}`,
          description: `Current stock (${i.stock_qty}) is at or below the threshold (${globalThreshold}).`,
          amount: i.stock_qty,
          date: today,
          referenceId: i.product_id,
        })
      })

      // Sort by date descending
      return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    },
  })

  // Mark as paid mutation
  const markAsPaid = useMutation({
    mutationFn: async ({ id, type, amount, title }: NotificationItem) => {
      if (!orgId || !user) throw new Error('Not authenticated')

      const refId = id.replace('sale-', '').replace('pur-', '')

      if (type === 'payable') {
        // Update credit purchase to cash (settled)
        const { error } = await supabase
          .from('purchases')
          .update({ purchase_type: 'cash' })
          .eq('id', refId)
          .eq('organization_id', orgId)
        if (error) throw error

        // Add to expenses
        const { error: expErr } = await supabase.from('expenses').insert({
          organization_id: orgId,
          category: 'Miscellaneous',
          amount: amount,
          description: title,
          expense_date: new Date().toISOString().split('T')[0],
          notes: `Settled from notifications: ${title}`,
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
