import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Filter, SlidersHorizontal, Plus, Minus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
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

type StockFilter = 'all' | 'low' | 'out'

const ADJUSTMENT_REASONS: { value: StockMovementReason; label: string }[] = [
  { value: 'purchase', label: 'Purchase / Received' },
  { value: 'adjustment', label: 'Manual Adjustment' },
  { value: 'return', label: 'Customer Return' },
  { value: 'damage', label: 'Damage / Loss' },
  { value: 'opening', label: 'Opening Stock' },
]

interface InventoryRow {
  product_id: string
  stock_qty: number
  reorder_level: number
  products: {
    id: string
    name: string
    categories: { name: string } | null
  } | null
}

export function InventoryPage() {
  const { org, user } = useAuth()
  const orgId = org?.id
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<StockFilter>('all')
  const [adjustTarget, setAdjustTarget] = useState<InventoryRow | null>(null)
  const [adjustQty, setAdjustQty] = useState(0)
  const [adjustType, setAdjustType] = useState<'+' | '-'>('+')
  const [adjustReason, setAdjustReason] = useState<StockMovementReason>('purchase')
  const [adjustNote, setAdjustNote] = useState('')

  const { data: inventory, isLoading } = useQuery({
    queryKey: ['inventory', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('inventory')
        .select('product_id, stock_qty, reorder_level, products(id, name, categories(name))')
        .eq('organization_id', orgId!)
        .order('stock_qty', { ascending: true })
      return (data ?? []) as unknown as InventoryRow[]
    },
  })

  const adjustMutation = useMutation({
    mutationFn: async () => {
      if (!adjustTarget || !orgId || !user) throw new Error('Missing data')
      const delta = adjustType === '+' ? adjustQty : -adjustQty
      const newQty = Math.max(0, (adjustTarget.stock_qty ?? 0) + delta)

      const { error: updateError } = await supabase
        .from('inventory')
        .update({ stock_qty: newQty, updated_at: new Date().toISOString() })
        .eq('product_id', adjustTarget.product_id)
        .eq('organization_id', orgId)

      if (updateError) throw updateError

      await supabase.from('stock_movements').insert({
        organization_id: orgId,
        product_id: adjustTarget.product_id,
        qty_change: delta,
        reason: adjustReason,
        note: adjustNote || null,
        created_by: user.id,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', orgId] })
      toast.success('Stock adjusted')
      setAdjustTarget(null)
      setAdjustQty(0)
      setAdjustNote('')
    },
    onError: (err: Error) => {
      toast.error('Adjustment failed', err.message)
    },
  })

  const filteredInventory = inventory?.filter((item) => {
    const productName = item.products?.name ?? ''
    const matchesSearch = productName.toLowerCase().includes(search.toLowerCase())

    let matchesFilter = true
    if (filter === 'low') matchesFilter = item.stock_qty > 0 && item.stock_qty <= item.reorder_level
    if (filter === 'out') matchesFilter = item.stock_qty === 0

    return matchesSearch && matchesFilter
  })

  const getStatusBadge = (item: InventoryRow) => {
    if (item.stock_qty === 0) return <Badge variant="destructive">Out of Stock</Badge>
    if (item.stock_qty <= item.reorder_level) return <Badge variant="warning">Low Stock</Badge>
    return <Badge variant="success">In Stock</Badge>
  }

  const openAdjust = (item: InventoryRow) => {
    setAdjustTarget(item)
    setAdjustQty(0)
    setAdjustType('+')
    setAdjustReason('purchase')
    setAdjustNote('')
  }

  return (
    <div className="p-4 lg:p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Inventory</h1>
          <p className="text-sm text-zinc-400 mt-0.5">
            {filteredInventory?.length ?? 0} products
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex rounded-lg bg-zinc-800 p-1 gap-1">
          {([
            { value: 'all', label: 'All' },
            { value: 'low', label: 'Low Stock' },
            { value: 'out', label: 'Out of Stock' },
          ] as const).map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-medium transition-all',
                filter === f.value
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-zinc-400 hover:text-zinc-200',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Current Stock</TableHead>
              <TableHead className="text-right">Reorder Level</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 bg-zinc-800 rounded animate-pulse" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : filteredInventory && filteredInventory.length > 0 ? (
              filteredInventory.map((item) => (
                <TableRow key={item.product_id}>
                  <TableCell>
                    <span className="font-medium text-zinc-100">
                      {item.products?.name ?? 'Unknown'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-zinc-400 text-sm">
                      {item.products?.categories?.name ?? '—'}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span
                      className={cn(
                        'font-semibold tabular-nums',
                        item.stock_qty === 0
                          ? 'text-red-400'
                          : item.stock_qty <= item.reorder_level
                          ? 'text-yellow-400'
                          : 'text-zinc-200',
                      )}
                    >
                      {item.stock_qty}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-zinc-400">
                    {item.reorder_level}
                  </TableCell>
                  <TableCell>{getStatusBadge(item)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => openAdjust(item)}
                    >
                      <SlidersHorizontal className="h-3 w-3" />
                      Adjust
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-zinc-500 py-12">
                  No inventory records found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Adjust stock dialog */}
      <Dialog open={!!adjustTarget} onOpenChange={() => setAdjustTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Adjust Stock</DialogTitle>
          </DialogHeader>
          {adjustTarget && (
            <div className="space-y-4">
              <div className="rounded-lg bg-zinc-800 px-4 py-3">
                <p className="text-sm font-semibold text-zinc-200">
                  {adjustTarget.products?.name}
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Current stock: <strong className="text-zinc-300">{adjustTarget.stock_qty}</strong>
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Adjustment Type</Label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setAdjustType('+')}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-2 rounded-lg border py-2 text-sm font-medium transition-all',
                      adjustType === '+'
                        ? 'border-emerald-500 bg-emerald-600/10 text-emerald-300'
                        : 'border-zinc-700 text-zinc-400 hover:border-zinc-600',
                    )}
                  >
                    <Plus className="h-4 w-4" />
                    Add Stock
                  </button>
                  <button
                    onClick={() => setAdjustType('-')}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-2 rounded-lg border py-2 text-sm font-medium transition-all',
                      adjustType === '-'
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
                <Label htmlFor="adj-qty">Quantity</Label>
                <Input
                  id="adj-qty"
                  type="number"
                  min="0"
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(Math.max(0, parseInt(e.target.value) || 0))}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="adj-reason">Reason</Label>
                <select
                  id="adj-reason"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value as StockMovementReason)}
                  className="flex h-9 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {ADJUSTMENT_REASONS.map((r) => (
                    <option key={r.value} value={r.value} className="bg-zinc-900">
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="adj-note">Note (optional)</Label>
                <Input
                  id="adj-note"
                  placeholder="e.g. Received from supplier"
                  value={adjustNote}
                  onChange={(e) => setAdjustNote(e.target.value)}
                />
              </div>

              <div className="rounded-lg bg-zinc-800/50 border border-zinc-700 px-3 py-2 text-sm">
                New stock:{' '}
                <strong className="text-indigo-300">
                  {Math.max(
                    0,
                    (adjustTarget.stock_qty ?? 0) + (adjustType === '+' ? adjustQty : -adjustQty),
                  )}
                </strong>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => adjustMutation.mutate()}
              disabled={adjustQty === 0 || adjustMutation.isPending}
            >
              {adjustMutation.isPending ? 'Saving...' : 'Apply Adjustment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
