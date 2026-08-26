import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Minus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import type { StockMovementReason } from '@billscape/core'

const ADJUSTMENT_REASONS: { value: StockMovementReason; label: string }[] = [
  { value: 'purchase', label: 'Purchase / Received' },
  { value: 'adjustment', label: 'Manual Adjustment' },
  { value: 'return', label: 'Customer Return' },
  { value: 'damage', label: 'Damage / Loss' },
  { value: 'opening', label: 'Opening Stock' },
]

const SELECT_CLASS =
  'h-9 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500'

interface ProductOption {
  id: string
  name: string
  stock_qty: number
  unit_symbol: string | null
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** Pre-selected product id (e.g. opened from a product card) — still changeable via the dropdown. */
  initialProductId?: string
}

export function AdjustStockDialog({ open, onOpenChange, initialProductId }: Props) {
  const { org, user } = useAuth()
  const orgId = org?.id
  const queryClient = useQueryClient()

  const [productId, setProductId] = useState('')
  const [type, setType] = useState<'+' | '-'>('+')
  const [qty, setQty] = useState(0)
  const [reason, setReason] = useState<StockMovementReason>('adjustment')
  const [note, setNote] = useState('')

  useEffect(() => {
    if (open) {
      setProductId(initialProductId ?? '')
      setType('+')
      setQty(0)
      setReason('adjustment')
      setNote('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialProductId])

  const { data: options } = useQuery({
    queryKey: ['adjust-stock-products', orgId],
    enabled: !!orgId && open,
    queryFn: async (): Promise<ProductOption[]> => {
      const { data } = await supabase
        .from('products')
        .select('id, name, is_active, has_variants, inventory(stock_qty), unit:unit_id(symbol)')
        .eq('organization_id', orgId!)
        .eq('is_active', true)
        .eq('track_stock', true)
        .eq('has_variants', false)
        .order('name')
      return (data ?? []).map((p: any) => ({
        id: p.id,
        name: p.name,
        stock_qty: p.inventory?.stock_qty ?? 0,
        unit_symbol: p.unit?.symbol ?? null,
      }))
    },
  })

  const selected = options?.find((p) => p.id === productId) ?? null

  const mutation = useMutation({
    mutationFn: async () => {
      if (!orgId || !user) throw new Error('Not logged in')
      if (!selected) throw new Error('Select a product first')
      if (qty <= 0) throw new Error('Quantity must be greater than 0')

      const delta = type === '+' ? qty : -qty
      const newQty = Math.max(0, selected.stock_qty + delta)

      const { error: updateError } = await supabase
        .from('inventory')
        .update({ stock_qty: newQty, updated_at: new Date().toISOString() })
        .eq('product_id', selected.id)
        .eq('organization_id', orgId)
      if (updateError) throw updateError

      await supabase.from('stock_movements').insert({
        organization_id: orgId,
        product_id: selected.id,
        qty_change: delta,
        reason,
        note: note.trim() || null,
        created_by: user.id,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', orgId] })
      queryClient.invalidateQueries({ queryKey: ['inventory', orgId] })
      queryClient.invalidateQueries({ queryKey: ['stock_movements', orgId] })
      queryClient.invalidateQueries({ queryKey: ['adjust-stock-products', orgId] })
      queryClient.invalidateQueries({ queryKey: ['product-detail', orgId] })
      toast.success('Stock adjusted')
      onOpenChange(false)
    },
    onError: (err: Error) => toast.error('Adjustment failed', err.message),
  })

  const newStock = selected
    ? Math.max(0, selected.stock_qty + (type === '+' ? qty : -qty))
    : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Adjust Stock</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Select Product</Label>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="">Choose a product...</option>
              {options?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (Stock: {p.stock_qty}{p.unit_symbol ? ` ${p.unit_symbol}` : ''})
                </option>
              ))}
            </select>
          </div>

          {selected && (
            <div className="rounded-lg bg-zinc-800 px-4 py-3">
              <p className="text-xs text-zinc-500">
                Current Stock:{' '}
                <strong className="text-indigo-300">
                  {selected.stock_qty}{selected.unit_symbol ? ` ${selected.unit_symbol}` : ''}
                </strong>
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Adjustment Type</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setType('+')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 rounded-lg border py-2 text-sm font-medium transition-all',
                  type === '+'
                    ? 'border-emerald-500 bg-emerald-600/10 text-emerald-300'
                    : 'border-zinc-700 text-zinc-400 hover:border-zinc-600',
                )}
              >
                <Plus className="h-4 w-4" />
                Add Stock
              </button>
              <button
                type="button"
                onClick={() => setType('-')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 rounded-lg border py-2 text-sm font-medium transition-all',
                  type === '-'
                    ? 'border-red-500 bg-red-600/10 text-red-300'
                    : 'border-zinc-700 text-zinc-400 hover:border-zinc-600',
                )}
              >
                <Minus className="h-4 w-4" />
                Remove Stock
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adj-qty-dialog">Quantity</Label>
            <div className="flex items-center gap-2">
              <Input
                id="adj-qty-dialog"
                type="number"
                step="0.001"
                min="0"
                value={qty || ''}
                onChange={(e) => setQty(Math.max(0, parseFloat(e.target.value) || 0))}
                className="flex-1"
              />
              {selected?.unit_symbol && (
                <span className="text-sm font-medium text-indigo-400 shrink-0">{selected.unit_symbol}</span>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adj-reason-dialog">Reason</Label>
            <select
              id="adj-reason-dialog"
              value={reason}
              onChange={(e) => setReason(e.target.value as StockMovementReason)}
              className={SELECT_CLASS}
            >
              {ADJUSTMENT_REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adj-note-dialog">Note (optional)</Label>
            <Input
              id="adj-note-dialog"
              placeholder="Enter reason for adjustment"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {selected && (
            <div className="rounded-lg bg-zinc-800/50 border border-zinc-700 px-3 py-2 text-sm">
              New stock:{' '}
              <strong className="text-indigo-300">
                {newStock}{selected.unit_symbol ? ` ${selected.unit_symbol}` : ''}
              </strong>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!selected || qty <= 0 || mutation.isPending}
          >
            {mutation.isPending ? 'Saving...' : 'Adjust Stock'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
