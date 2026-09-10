import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Minus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { recordVariantAdjustment } from '@billscape/api'
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

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  variantId: string
  variantName: string
  currentStock: number
  unitSymbol?: string | null
}

export function VariantAdjustStockDialog({
  open,
  onOpenChange,
  variantId,
  variantName,
  currentStock,
  unitSymbol,
}: Props) {
  const { org, user } = useAuth()
  const orgId = org?.id
  const queryClient = useQueryClient()

  const [type, setType] = useState<'+' | '-'>('+')
  const [qty, setQty] = useState(0)
  const [note, setNote] = useState('')

  useEffect(() => {
    if (open) {
      setType('+')
      setQty(0)
      setNote('')
    }
  }, [open])

  const mutation = useMutation({
    mutationFn: async () => {
      if (!orgId || !user) throw new Error('Not logged in')
      if (qty <= 0) throw new Error('Quantity must be greater than 0')

      const delta = type === '+' ? qty : -qty
      const { error } = await recordVariantAdjustment(supabase, {
        organizationId: orgId,
        variantId,
        delta,
        note: note.trim() || undefined,
        createdBy: user.id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', orgId] })
      queryClient.invalidateQueries({ queryKey: ['inventory-variant-names', orgId] })
      queryClient.invalidateQueries({ queryKey: ['inventory-variant-stock', orgId] })
      queryClient.invalidateQueries({ queryKey: ['product-detail', orgId] })
      queryClient.invalidateQueries({ queryKey: ['product-variants-detail', orgId] })
      queryClient.invalidateQueries({ queryKey: ['products', orgId] })
      toast.success('Stock adjusted')
      onOpenChange(false)
    },
    onError: (err: Error) => toast.error('Adjustment failed', err.message),
  })

  const newStock = Math.max(0, currentStock + (type === '+' ? qty : -qty))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Adjust Stock — {variantName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg bg-zinc-800 px-4 py-3">
            <p className="text-xs text-zinc-500">
              Current Stock:{' '}
              <strong className="text-indigo-300">
                {currentStock}
                {unitSymbol ? ` ${unitSymbol}` : ''}
              </strong>
            </p>
          </div>

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
                    : 'border-zinc-700 text-zinc-400 hover:border-zinc-600'
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
                    : 'border-zinc-700 text-zinc-400 hover:border-zinc-600'
                )}
              >
                <Minus className="h-4 w-4" />
                Remove Stock
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="variant-adj-qty">Quantity</Label>
            <div className="flex items-center gap-2">
              <Input
                id="variant-adj-qty"
                type="number"
                step="0.001"
                min="0"
                value={qty || ''}
                onChange={(e) => setQty(Math.max(0, parseFloat(e.target.value) || 0))}
                className="flex-1"
              />
              {unitSymbol && (
                <span className="text-sm font-medium text-indigo-400 shrink-0">{unitSymbol}</span>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="variant-adj-note">Note (optional)</Label>
            <Input
              id="variant-adj-note"
              placeholder="Enter reason for adjustment"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="rounded-lg bg-zinc-800/50 border border-zinc-700 px-3 py-2 text-sm">
            New stock:{' '}
            <strong className="text-indigo-300">
              {newStock}
              {unitSymbol ? ` ${unitSymbol}` : ''}
            </strong>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={qty <= 0 || mutation.isPending}>
            {mutation.isPending ? 'Saving...' : 'Adjust Stock'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
