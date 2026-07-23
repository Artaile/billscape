import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Loader2, Tag, Percent, ToggleLeft, ToggleRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

interface Promotion {
  id: string
  name: string
  code: string | null
  type: 'percentage' | 'flat'
  value: number
  scope: 'order' | 'product' | 'category' | 'store'
  min_order_amount: number | null
  max_discount_amount: number | null
  max_uses: number | null
  valid_from: string | null
  valid_until: string | null
  is_active: boolean
  usage_count: number
  created_at: string
}

export function PromotionsPage() {
  const { org } = useAuth()
  const orgId = org?.id
  const queryClient = useQueryClient()

  const [showDialog, setShowDialog] = useState(false)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [type, setType] = useState<'percentage' | 'flat'>('percentage')
  const [scope, setScope] = useState<'order' | 'product' | 'category' | 'store'>('order')
  const [value, setValue] = useState('')
  const [minOrder, setMinOrder] = useState('')
  const [maxDiscount, setMaxDiscount] = useState('')
  const [maxUses, setMaxUses] = useState('')
  const [validFrom, setValidFrom] = useState('')
  const [validUntil, setValidUntil] = useState('')

  const { data: promotions = [], isLoading } = useQuery({
    queryKey: ['promotions', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('promotions')
        .select('*')
        .eq('organization_id', orgId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Promotion[]
    },
  })

  const addMutation = useMutation({
    mutationFn: async () => {
      const val = parseFloat(value)
      if (!name.trim()) throw new Error('Promotion name required')
      if (isNaN(val) || val <= 0) throw new Error('Enter a valid discount value')
      if (type === 'percentage' && val > 100) throw new Error('Percentage cannot exceed 100%')

      const { error } = await supabase.from('promotions').insert({
        organization_id: orgId!,
        name: name.trim(),
        code: code.trim().toUpperCase() || null,
        type,
        scope,
        value: val,
        min_order_amount: minOrder ? parseFloat(minOrder) : null,
        max_discount_amount: maxDiscount ? parseFloat(maxDiscount) : null,
        max_uses: maxUses ? parseInt(maxUses) : null,
        valid_from: validFrom || null,
        valid_until: validUntil || null,
        is_active: true,
        usage_count: 0,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promotions', orgId] })
      toast.success('Promotion created')
      resetForm()
      setShowDialog(false)
    },
    onError: (err: Error) => toast.error('Failed to create promotion', err.message),
  })

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('promotions')
        .update({ is_active })
        .eq('id', id)
        .eq('organization_id', orgId!)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['promotions', orgId] }),
    onError: (err: Error) => toast.error('Update failed', err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('promotions').delete().eq('id', id).eq('organization_id', orgId!)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promotions', orgId] })
      toast.success('Promotion deleted')
    },
    onError: (err: Error) => toast.error('Delete failed', err.message),
  })

  const resetForm = () => {
    setName(''); setCode(''); setType('percentage'); setScope('order'); setValue('')
    setMinOrder(''); setMaxDiscount(''); setMaxUses(''); setValidFrom(''); setValidUntil('')
  }

  const active = promotions.filter((p) => p.is_active).length
  const today = new Date().toISOString().split('T')[0]

  const getStatus = (p: Promotion) => {
    if (!p.is_active) return { label: 'Inactive', cls: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' }
    if (p.valid_until && p.valid_until < today) return { label: 'Expired', cls: 'bg-red-500/10 text-red-400 border-red-500/20' }
    if (p.valid_from && p.valid_from > today) return { label: 'Scheduled', cls: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' }
    return { label: 'Active', cls: 'bg-green-500/10 text-green-400 border-green-500/20' }
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Promotions & Discounts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Create coupon codes and discount offers</p>
        </div>
        <Button onClick={() => setShowDialog(true)}>
          <Plus className="h-4 w-4" />
          New Promotion
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Tag className="h-4 w-4 text-primary" />
            <span className="text-xs text-muted-foreground">Total Promotions</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{promotions.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Percent className="h-4 w-4 text-green-400" />
            <span className="text-xs text-muted-foreground">Active Now</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{active}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Tag className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Total Uses</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{promotions.reduce((s, p) => s + p.usage_count, 0)}</p>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : promotions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <Tag className="h-8 w-8 text-zinc-600 mb-2" />
            <p className="text-sm text-muted-foreground">No promotions yet</p>
            <p className="text-xs text-zinc-600 mt-1">Create your first discount or coupon code</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name / Code</TableHead>
                <TableHead>Discount</TableHead>
                <TableHead>Conditions</TableHead>
                <TableHead>Valid Until</TableHead>
                <TableHead>Uses</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {promotions.map((promo) => {
                const status = getStatus(promo)
                return (
                  <TableRow key={promo.id}>
                    <TableCell>
                      <p className="text-sm font-medium text-foreground">{promo.name}</p>
                      {promo.code && (
                        <span className="mt-0.5 inline-block rounded border border-dashed border-zinc-600 bg-zinc-800 px-1.5 py-0.5 text-[11px] font-mono text-zinc-300">
                          {promo.code}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="font-semibold text-foreground">
                      {promo.type === 'percentage' ? `${promo.value}% OFF` : `₹${promo.value} OFF`}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {promo.min_order_amount ? `Min ₹${promo.min_order_amount}` : '—'}
                      {promo.max_discount_amount ? ` · Max ₹${promo.max_discount_amount}` : ''}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {promo.valid_until
                        ? new Date(promo.valid_until).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                        : 'No expiry'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {promo.usage_count}{promo.max_uses ? ` / ${promo.max_uses}` : ''}
                      {promo.max_uses && promo.usage_count >= promo.max_uses && (
                        <span className="ml-1 text-[10px] text-red-400">Limit reached</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium', status.cls)}>
                        {status.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => toggleMutation.mutate({ id: promo.id, is_active: !promo.is_active })}
                          className="p-1.5 rounded text-zinc-500 hover:text-primary hover:bg-primary/10 transition-colors"
                          title={promo.is_active ? 'Deactivate' : 'Activate'}
                        >
                          {promo.is_active ? <ToggleRight className="h-4 w-4 text-green-400" /> : <ToggleLeft className="h-4 w-4" />}
                        </button>
                        <button
                          onClick={() => deleteMutation.mutate(promo.id)}
                          className="p-1.5 rounded text-zinc-500 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Add Promotion Dialog */}
      <Dialog open={showDialog} onOpenChange={(o) => { setShowDialog(o); if (!o) resetForm() }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Promotion</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Promotion Name *</Label>
              <Input placeholder="e.g. Summer Sale 20%" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Coupon Code <span className="text-xs text-muted-foreground">(optional)</span></Label>
              <Input
                placeholder="e.g. SUMMER20"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="font-mono uppercase"
              />
              <p className="text-xs text-muted-foreground">Leave blank for automatic discount (no code needed)</p>
            </div>

            {/* Scope */}
            <div className="space-y-1.5">
              <Label>Applies To</Label>
              <div className="grid grid-cols-4 gap-1.5">
                {([
                  { value: 'order', label: 'Entire Order' },
                  { value: 'store', label: 'All Products' },
                  { value: 'category', label: 'Category' },
                  { value: 'product', label: 'Product' },
                ] as const).map((s) => (
                  <button key={s.value} type="button" onClick={() => setScope(s.value)}
                    className={cn('rounded-lg border py-2 text-xs font-medium transition-all',
                      scope === s.value ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-border/60')}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Discount Type *</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setType('percentage')}
                  className={cn('rounded-lg border p-3 text-sm font-medium transition-all', type === 'percentage' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-border/60')}
                >
                  <Percent className="h-4 w-4 mx-auto mb-1" />
                  Percentage (%)
                </button>
                <button
                  type="button"
                  onClick={() => setType('flat')}
                  className={cn('rounded-lg border p-3 text-sm font-medium transition-all', type === 'flat' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-border/60')}
                >
                  <span className="block text-base mb-1">₹</span>
                  Flat Amount
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Value * {type === 'percentage' ? '(%)' : '(₹)'}</Label>
                <Input type="number" min="0" step="0.01" placeholder="0" value={value} onChange={(e) => setValue(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Min Order (₹)</Label>
                <Input type="number" min="0" placeholder="No minimum" value={minOrder} onChange={(e) => setMinOrder(e.target.value)} />
              </div>
            </div>
            {type === 'percentage' && (
              <div className="space-y-1.5">
                <Label>Max Discount (₹) <span className="text-xs text-muted-foreground">(optional cap)</span></Label>
                <Input type="number" min="0" placeholder="No cap" value={maxDiscount} onChange={(e) => setMaxDiscount(e.target.value)} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Max Uses <span className="text-xs text-muted-foreground">(leave blank for unlimited)</span></Label>
              <Input type="number" min="1" placeholder="Unlimited" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Valid From</Label>
                <Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Valid Until</Label>
                <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowDialog(false); resetForm() }}>Cancel</Button>
            <Button onClick={() => addMutation.mutate()} disabled={addMutation.isPending}>
              {addMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" />Creating...</> : 'Create Promotion'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
