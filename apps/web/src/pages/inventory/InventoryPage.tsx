import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, SlidersHorizontal, Plus, Minus, AlertTriangle, History, PackageOpen, Tag, ChevronRight, ChevronDown, Printer } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { getVariantStockMap } from '@billscape/api'
import { VariantAdjustStockDialog } from '@/components/products/VariantAdjustStockDialog'
import { BarcodeLabelDialog } from '@/components/ui/BarcodeLabelDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { formatINR } from '@billscape/core'
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
    category_id: string | null
    has_variants: boolean
    categories: { name: string; color: string | null } | null
    unit: { id: string; symbol: string } | null
  } | null
}

const INVENTORY_TAB_VALUES = ['stock-list', 'movements', 'adjustments', 'opening'] as const

export function InventoryPage() {
  const { org, user } = useAuth()
  const orgId = org?.id
  const queryClient = useQueryClient()

  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const activeInventoryTab = INVENTORY_TAB_VALUES.includes(tabParam as any) ? tabParam! : 'stock-list'
  const handleInventoryTabChange = (value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('tab', value)
      return next
    }, { replace: true })
  }

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<StockFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [adjustTarget, setAdjustTarget] = useState<InventoryRow | null>(null)
  const [adjustQty, setAdjustQty] = useState(0)
  const [adjustType, setAdjustType] = useState<'+' | '-'>('+')
  const [adjustReason, setAdjustReason] = useState<StockMovementReason>('purchase')
  const [adjustNote, setAdjustNote] = useState('')
  const [expandedProductIds, setExpandedProductIds] = useState<Set<string>>(new Set())
  const [variantAdjustTarget, setVariantAdjustTarget] = useState<{ id: string; name: string; stock: number; unitSymbol?: string | null } | null>(null)
  const [variantPrintTarget, setVariantPrintTarget] = useState<{ id: string; variant_name: string; barcode_value: string | null; sale_price: number | null; productName: string; sku?: string | null; mrp?: number | null } | null>(null)

  // Expiring within 30 days
  const { data: expiringBatches } = useQuery({
    queryKey: ['expiring_batches', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const in30 = new Date()
      in30.setDate(in30.getDate() + 30)
      const { data } = await supabase
        .from('inventory_batches')
        .select('batch_no, expiry_date, qty, product_id, products(name)')
        .eq('organization_id', orgId!)
        .not('expiry_date', 'is', null)
        .lte('expiry_date', in30.toISOString().split('T')[0])
        .gt('qty', 0)
        .order('expiry_date')
      return data ?? []
    },
  })

  const { data: inventory, isLoading } = useQuery({
    queryKey: ['inventory', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('inventory')
        .select('product_id, stock_qty, reorder_level, products(id, name, category_id, has_variants, categories(name, color), unit:unit_id(id, symbol))')
        .eq('organization_id', orgId!)
        .order('stock_qty', { ascending: true })
      return (data ?? []) as unknown as InventoryRow[]
    },
  })

  // Stock List is one row per PRODUCT (from the `inventory` table), never per-variant, so
  // searching e.g. "QC Clothing Test Shirt — XS" or just "XS" against products.name alone found
  // nothing even though that variant genuinely exists — the row search had no visibility into
  // product_variants at all. Fetched once per org (not re-queried per keystroke — the match
  // itself happens client-side in filteredInventory below, same as the existing name search) and
  // mapped product_id -> its variant names, so a search matching ANY variant surfaces that
  // product's row, same convention as billing POS's own variant-name search.
  const { data: variantNamesByProduct } = useQuery({
    queryKey: ['inventory-variant-names', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('product_variants')
        .select('product_id, variant_name')
        .eq('organization_id', orgId!)
      const map = new Map<string, string[]>()
      for (const row of data ?? []) {
        const list = map.get(row.product_id) ?? []
        list.push(row.variant_name)
        map.set(row.product_id, list)
      }
      return map
    },
  })

  // Full per-variant detail (id + stock) needed to render expanded sub-rows and to drive the
  // per-variant Adjust dialog — variantNamesByProduct above only carries names, for search matching.
  const { data: variantStockByProduct } = useQuery({
    queryKey: ['inventory-variant-stock', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data: variants } = await supabase
        .from('product_variants')
        .select('id, product_id, variant_name, barcode_value, sale_price, sku, mrp')
        .eq('organization_id', orgId!)
      if (!variants || variants.length === 0) return new Map<string, { id: string; variant_name: string; stock: number; barcode_value: string | null; sale_price: number | null; sku: string | null; mrp: number | null }[]>()

      const stockMap = await getVariantStockMap(supabase, orgId!, variants.map((v) => v.id))

      const map = new Map<string, { id: string; variant_name: string; stock: number; barcode_value: string | null; sale_price: number | null; sku: string | null; mrp: number | null }[]>()
      for (const v of variants) {
        const list = map.get(v.product_id) ?? []
        list.push({ id: v.id, variant_name: v.variant_name, stock: stockMap.data.get(v.id) ?? 0, barcode_value: v.barcode_value ?? null, sale_price: v.sale_price ?? null, sku: (v as any).sku ?? null, mrp: (v as any).mrp ?? null })
        map.set(v.product_id, list)
      }
      return map
    },
  })

  const { data: categories } = useQuery({
    queryKey: ['categories', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('categories')
        .select('id, name, color')
        .eq('organization_id', orgId!)
        .order('name')
      return data ?? []
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
    const q = search.toLowerCase()
    // Matches the bare product name, OR any of its variant names, OR the combined
    // "Product Name — Variant Name" label the merchant sees (and can copy) elsewhere in the
    // app, e.g. in the Purchase Items table — see variantNamesByProduct above for why this
    // product-row-only search needed variant awareness at all.
    const variantNames = (item.products?.id && variantNamesByProduct?.get(item.products.id)) || []
    const matchesSearch =
      productName.toLowerCase().includes(q) ||
      variantNames.some((v) => v.toLowerCase().includes(q) || `${productName} — ${v}`.toLowerCase().includes(q))
    const threshold = (org as any)?.feature_flags?.low_stock_threshold ?? 10

    let matchesFilter = true
    if (filter === 'low') matchesFilter = item.stock_qty > 0 && item.stock_qty <= threshold
    if (filter === 'out') matchesFilter = item.stock_qty === 0

    const matchesCategory = !categoryFilter || item.products?.category_id === categoryFilter

    return matchesSearch && matchesFilter && matchesCategory
  })

  // If the search matched via a variant name (not the bare product name), auto-expand that
  // product's row so the matching variant is immediately visible rather than hidden in a
  // collapsed "N variants" badge.
  useEffect(() => {
    if (!search.trim() || !filteredInventory) return
    const q = search.toLowerCase()
    const toExpand = new Set<string>()
    for (const item of filteredInventory) {
      const pid = item.products?.id
      if (!pid) continue
      const productNameMatches = (item.products?.name ?? '').toLowerCase().includes(q)
      if (!productNameMatches) toExpand.add(pid)
    }
    if (toExpand.size > 0) setExpandedProductIds((prev) => new Set([...prev, ...toExpand]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const getStatusBadge = (item: InventoryRow) => {
    const threshold = (org as any)?.feature_flags?.low_stock_threshold ?? 10
    if (item.stock_qty === 0) return <Badge variant="destructive">Out of Stock ({item.stock_qty})</Badge>
    if (item.stock_qty <= threshold) return <Badge variant="warning">Low Stock ({item.stock_qty})</Badge>
    return <Badge variant="success">In Stock ({item.stock_qty})</Badge>
  }

  // Aggregate status for a has_variants parent row, computed across all its variants' stock
  // rather than a single stock_qty (which the parent `inventory` row does not meaningfully carry
  // for a variant product).
  const getVariantAggregateStatusBadge = (variants: { stock: number }[]) => {
    const threshold = (org as any)?.feature_flags?.low_stock_threshold ?? 10
    if (variants.length === 0 || variants.every((v) => v.stock === 0)) return <Badge variant="destructive">Out of Stock</Badge>
    if (variants.some((v) => v.stock > 0 && v.stock <= threshold)) return <Badge variant="warning">Low Stock</Badge>
    return <Badge variant="success">In Stock</Badge>
  }

  const getVariantRowStatusBadge = (stock: number) => {
    const threshold = (org as any)?.feature_flags?.low_stock_threshold ?? 10
    if (stock === 0) return <Badge variant="destructive">Out of Stock ({stock})</Badge>
    if (stock <= threshold) return <Badge variant="warning">Low Stock ({stock})</Badge>
    return <Badge variant="success">In Stock ({stock})</Badge>
  }

  // Stock movements (ledger & history)
  const { data: movements, isLoading: movementsLoading } = useQuery({
    queryKey: ['stock_movements', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('stock_movements')
        .select('*, products(name)')
        .eq('organization_id', orgId!)
        .order('created_at', { ascending: false })
        .limit(200)
      return data ?? []
    },
  })

  // Opening stock form state
  const [openingSearch, setOpeningSearch] = useState('')
  const [openingProductId, setOpeningProductId] = useState('')
  const [showOpeningDropdown, setShowOpeningDropdown] = useState(false)
  const [openingQty, setOpeningQty] = useState(0)
  const [openingNote, setOpeningNote] = useState('')

  const selectedOpeningProduct = inventory?.find((i) => i.product_id === openingProductId)?.products

  const openingProductOptions = React.useMemo(() => {
    if (!inventory || !openingSearch.trim()) return []
    const q = openingSearch.trim().toLowerCase()
    return inventory
      .filter((i) => i.products?.name.toLowerCase().includes(q))
      .slice(0, 8)
  }, [inventory, openingSearch])

  const openingMutation = useMutation({
    mutationFn: async () => {
      if (!orgId || !user) throw new Error('Not logged in')
      if (!openingProductId) throw new Error('Select a product first')
      if (openingQty <= 0) throw new Error('Quantity must be greater than 0')

      const { error: invErr } = await supabase
        .from('inventory')
        .upsert({ organization_id: orgId, product_id: openingProductId, stock_qty: openingQty }, { onConflict: 'product_id' })
      if (invErr) throw invErr

      await supabase.from('stock_movements').insert({
        organization_id: orgId,
        product_id: openingProductId,
        qty_change: openingQty,
        reason: 'opening',
        note: openingNote.trim() || 'Opening stock entry',
        created_by: user.id,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', orgId] })
      queryClient.invalidateQueries({ queryKey: ['stock_movements', orgId] })
      toast.success('Opening stock set')
      setOpeningSearch(''); setOpeningProductId(''); setOpeningQty(0); setOpeningNote('')
    },
    onError: (err: Error) => toast.error('Failed', err.message),
  })

  const openAdjust = (item: InventoryRow) => {
    setAdjustTarget(item)
    setAdjustQty(0)
    setAdjustType('+')
    setAdjustReason('adjustment')
    setAdjustNote('')
  }

  const totalValue = inventory?.reduce((sum, i) => sum + i.stock_qty * 0, 0) ?? 0
  void totalValue

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Inventory Management</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Stock levels, movements, and adjustments</p>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Total SKUs</p>
          <p className="text-2xl font-bold text-foreground">{inventory?.length ?? 0}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Low Stock Items</p>
          <p className="text-2xl font-bold text-yellow-400">
            {inventory?.filter((i) => i.stock_qty > 0 && i.stock_qty <= i.reorder_level).length ?? 0}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Out of Stock</p>
          <p className="text-2xl font-bold text-red-400">
            {inventory?.filter((i) => i.stock_qty === 0).length ?? 0}
          </p>
        </div>
      </div>

      {/* Expiring soon alert */}
      {expiringBatches && expiringBatches.length > 0 && (
        <div className="rounded-lg border border-yellow-700 bg-yellow-900/20 p-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-yellow-400" />
            <span className="text-sm font-semibold text-yellow-300">{expiringBatches.length} batch(es) expiring within 30 days</span>
          </div>
          <div className="space-y-1">
            {expiringBatches.slice(0, 5).map((b: any, i: number) => (
              <div key={i} className="text-xs text-yellow-200/70 flex gap-2">
                <span className="font-medium">{b.products?.name ?? 'Unknown'}</span>
                <span>•</span><span>Batch {b.batch_no}</span>
                <span>•</span><span>Exp: {b.expiry_date}</span>
                <span>•</span><span>Qty: {b.qty}</span>
              </div>
            ))}
            {expiringBatches.length > 5 && (
              <p className="text-xs text-yellow-400">+{expiringBatches.length - 5} more batches</p>
            )}
          </div>
        </div>
      )}

      <Tabs value={activeInventoryTab} onValueChange={handleInventoryTabChange}>
        <TabsList>
          <TabsTrigger value="stock-list">Stock List</TabsTrigger>
          <TabsTrigger value="movements">Ledger & History</TabsTrigger>
          <TabsTrigger value="adjustments">Adjustments</TabsTrigger>
          <TabsTrigger value="opening">Opening Stock</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Stock List ── */}
        <TabsContent value="stock-list" className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search products..." value={search}
                onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <div className="flex rounded-lg bg-secondary p-1 gap-1">
              {([{ value: 'all', label: 'All' }, { value: 'low', label: 'Low Stock' }, { value: 'out', label: 'Out of Stock' }] as const).map((f) => (
                <button key={f.value} onClick={() => setFilter(f.value)}
                  className={cn('rounded-md px-3 py-1 text-xs font-medium transition-all',
                    filter === f.value ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground')}>
                  {f.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-muted-foreground" />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="h-9 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">All Categories</option>
                {categories?.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
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
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>{Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}><div className="h-4 bg-zinc-800 rounded animate-pulse" /></TableCell>
                    ))}</TableRow>
                  ))
                ) : filteredInventory && filteredInventory.length > 0 ? (
                  filteredInventory.flatMap((item) => {
                    const isVariantProduct = !!item.products?.has_variants
                    const productId = item.products?.id
                    const variantRows = (productId && variantStockByProduct?.get(productId)) || []
                    const isExpanded = !!productId && expandedProductIds.has(productId)

                    if (!isVariantProduct) {
                      return [(
                        <TableRow key={item.product_id}>
                          <TableCell className="font-medium text-foreground">{item.products?.name ?? 'Unknown'}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {item.products?.categories ? (
                              <span className="flex items-center gap-1.5">
                                <span
                                  className="h-1.5 w-1.5 rounded-full shrink-0"
                                  style={{ backgroundColor: item.products.categories.color ?? '#6366f1' }}
                                />
                                {item.products.categories.name}
                              </span>
                            ) : '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={cn('font-semibold tabular-nums',
                              item.stock_qty === 0 ? 'text-red-400' : item.stock_qty <= item.reorder_level ? 'text-yellow-400' : 'text-foreground')}>
                              {item.stock_qty}{item.products?.unit?.symbol ? ` ${item.products.unit.symbol}` : ''}
                            </span>
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">{item.reorder_level}</TableCell>
                          <TableCell>{getStatusBadge(item)}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => openAdjust(item)}>
                              <SlidersHorizontal className="h-3 w-3" /> Adjust
                            </Button>
                          </TableCell>
                        </TableRow>
                      )]
                    }

                    const rows = [
                      <TableRow key={item.product_id}>
                        <TableCell className="font-medium text-foreground">
                          <button
                            type="button"
                            onClick={() => {
                              if (!productId) return
                              setExpandedProductIds((prev) => {
                                const next = new Set(prev)
                                if (next.has(productId)) next.delete(productId)
                                else next.add(productId)
                                return next
                              })
                            }}
                            className="flex items-center gap-1.5 hover:text-indigo-400 transition-colors"
                          >
                            {isExpanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                            {item.products?.name ?? 'Unknown'}
                          </button>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {item.products?.categories ? (
                            <span className="flex items-center gap-1.5">
                              <span
                                className="h-1.5 w-1.5 rounded-full shrink-0"
                                style={{ backgroundColor: item.products.categories.color ?? '#6366f1' }}
                              />
                              {item.products.categories.name}
                            </span>
                          ) : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-zinc-500 text-xs">
                            {variantRows.length} variant{variantRows.length !== 1 ? 's' : ''}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">—</TableCell>
                        <TableCell>{getVariantAggregateStatusBadge(variantRows)}</TableCell>
                        <TableCell className="text-right" />
                      </TableRow>,
                    ]

                    if (isExpanded) {
                      for (const variant of variantRows) {
                        rows.push(
                          <TableRow key={variant.id}>
                            <TableCell className="pl-8 text-zinc-400 text-sm">— {variant.variant_name}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">—</TableCell>
                            <TableCell className="text-right">
                              <span className="font-semibold tabular-nums text-foreground">
                                {variant.stock}{item.products?.unit?.symbol ? ` ${item.products.unit.symbol}` : ''}
                              </span>
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">—</TableCell>
                            <TableCell>{getVariantRowStatusBadge(variant.stock)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  title="Print label"
                                  onClick={() => setVariantPrintTarget({ id: variant.id, variant_name: variant.variant_name, barcode_value: variant.barcode_value ?? null, sale_price: variant.sale_price ?? null, productName: item.products!.name, sku: variant.sku, mrp: variant.mrp })}
                                  className="p-1 rounded text-zinc-500 hover:text-indigo-400 hover:bg-indigo-900/20 transition-colors"
                                >
                                  <Printer className="h-3.5 w-3.5" />
                                </button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => setVariantAdjustTarget({
                                    id: variant.id,
                                    name: `${item.products?.name ?? ''} — ${variant.variant_name}`,
                                    stock: variant.stock,
                                    unitSymbol: item.products?.unit?.symbol,
                                  })}
                                >
                                  <SlidersHorizontal className="h-3 w-3" /> Adjust
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      }
                    }

                    return rows
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-12">No inventory records found</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Tab 2: Ledger & History ── */}
        <TabsContent value="movements" className="mt-4">
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead className="text-right">Qty Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movementsLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>{Array.from({ length: 5 }).map((_, j) => (
                      <TableCell key={j}><div className="h-4 bg-zinc-800 rounded animate-pulse" /></TableCell>
                    ))}</TableRow>
                  ))
                ) : movements && movements.length > 0 ? (
                  movements.map((m: any) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(m.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </TableCell>
                      <TableCell className="text-sm font-medium text-foreground">{m.products?.name ?? '—'}</TableCell>
                      <TableCell>
                        <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize',
                          m.reason === 'sale' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                          m.reason === 'purchase' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                          m.reason === 'return' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
                          m.reason === 'damage' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                          m.reason === 'opening' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                          'bg-zinc-500/10 text-zinc-400 border-zinc-500/20')}>
                          {m.reason}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{m.note ?? '—'}</TableCell>
                      <TableCell className="text-right">
                        <span className={cn('font-semibold tabular-nums text-sm',
                          m.qty_change > 0 ? 'text-emerald-400' : 'text-red-400')}>
                          {m.qty_change > 0 ? '+' : ''}{m.qty_change}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-12">
                      No stock movements yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Tab 3: Adjustments ── */}
        <TabsContent value="adjustments" className="mt-4">
          <div className="max-w-md space-y-4 rounded-lg border border-border bg-card p-6">
            <div className="flex items-center gap-2 mb-2">
              <SlidersHorizontal className="h-5 w-5 text-primary" />
              <h2 className="text-base font-semibold text-foreground">Manual Stock Adjustment</h2>
            </div>
            <p className="text-xs text-muted-foreground">Select a product from the Stock List and click Adjust, or use this form to adjust any product.</p>
            <p className="text-xs text-zinc-500 mt-2">
              Click <strong className="text-foreground">Adjust</strong> on any row in the Stock List tab to open the adjustment dialog for that product.
            </p>
            <div className="rounded-lg bg-secondary p-3 text-xs text-muted-foreground space-y-1">
              <p>• <strong>Add Stock</strong> — received goods, corrections</p>
              <p>• <strong>Remove Stock</strong> — damage, loss, theft</p>
              <p>• All adjustments are recorded in Ledger & History</p>
            </div>
          </div>
        </TabsContent>

        {/* ── Tab 4: Opening Stock ── */}
        <TabsContent value="opening" className="mt-4">
          <div className="max-w-md rounded-lg border border-border bg-card p-6 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <PackageOpen className="h-5 w-5 text-primary" />
              <h2 className="text-base font-semibold text-foreground">Set Opening Stock</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Enter the initial stock quantity for a product. This sets the stock level and records a movement with reason "opening".
            </p>
            <div className="space-y-1.5 relative">
              <Label>Product *</Label>
              {selectedOpeningProduct ? (
                <div className="flex items-center justify-between rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2">
                  <div>
                    <p className="text-sm text-zinc-100">{selectedOpeningProduct.name}</p>
                    <p className="flex items-center gap-1.5 text-[11px] text-zinc-500 mt-0.5">
                      {selectedOpeningProduct.categories ? (
                        <>
                          <span
                            className="h-1.5 w-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: selectedOpeningProduct.categories.color ?? '#6366f1' }}
                          />
                          {selectedOpeningProduct.categories.name}
                        </>
                      ) : (
                        <span className="italic">No category set</span>
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setOpeningProductId(''); setOpeningSearch('') }}
                    className="text-xs text-indigo-400 hover:text-indigo-300"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <>
                  <Input
                    placeholder="Search product by name..."
                    value={openingSearch}
                    onChange={(e) => { setOpeningSearch(e.target.value); setShowOpeningDropdown(true) }}
                    onFocus={() => setShowOpeningDropdown(true)}
                    onBlur={() => setTimeout(() => setShowOpeningDropdown(false), 150)}
                  />
                  {showOpeningDropdown && openingSearch.trim() && (
                    <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-md border border-border bg-popover shadow-lg max-h-56 overflow-y-auto">
                      {openingProductOptions.length > 0 ? (
                        openingProductOptions.map((item) => (
                          <button
                            key={item.product_id}
                            type="button"
                            onMouseDown={() => {
                              setOpeningProductId(item.product_id)
                              setShowOpeningDropdown(false)
                            }}
                            className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-secondary transition-colors"
                          >
                            <span className="text-sm text-foreground">{item.products?.name}</span>
                            {item.products?.categories && (
                              <span className="text-[11px] text-muted-foreground">{item.products.categories.name}</span>
                            )}
                          </button>
                        ))
                      ) : (
                        <p className="px-3 py-2 text-xs text-muted-foreground">No matching products</p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Opening Quantity *</Label>
              <Input type="number" step="0.001" min={0} value={openingQty}
                onChange={(e) => setOpeningQty(Math.max(0, parseFloat(e.target.value) || 0))} />
            </div>
            <div className="space-y-1.5">
              <Label>Note (optional)</Label>
              <Input placeholder="e.g. Stock count on 23 Jul 2026" value={openingNote}
                onChange={(e) => setOpeningNote(e.target.value)} />
            </div>
            <Button className="w-full" onClick={() => openingMutation.mutate()}
              disabled={openingMutation.isPending || !openingProductId || openingQty <= 0}>
              {openingMutation.isPending
                ? <><History className="h-4 w-4 animate-spin mr-1" />Setting...</>
                : 'Set Opening Stock'}
            </Button>
            <p className="text-[11px] text-zinc-600">
              Category is set on the product itself — edit it from the Products page if it's wrong.
            </p>
          </div>
        </TabsContent>
      </Tabs>

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
                  step="0.001"
                  min="0"
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(Math.max(0, parseFloat(e.target.value) || 0))}
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

      {/* Per-variant adjust stock dialog */}
      {variantAdjustTarget && (
        <VariantAdjustStockDialog
          open={!!variantAdjustTarget}
          onOpenChange={(v) => { if (!v) setVariantAdjustTarget(null) }}
          variantId={variantAdjustTarget.id}
          variantName={variantAdjustTarget.name}
          currentStock={variantAdjustTarget.stock}
          unitSymbol={variantAdjustTarget.unitSymbol}
        />
      )}

      {/* Per-variant barcode print dialog */}
      {variantPrintTarget && (
        <BarcodeLabelDialog
          open={!!variantPrintTarget}
          onOpenChange={(v) => { if (!v) setVariantPrintTarget(null) }}
          items={[{
            key: variantPrintTarget.id,
            name: variantPrintTarget.productName,
            variantLabel: variantPrintTarget.variant_name,
            barcode_value: variantPrintTarget.barcode_value,
            price: variantPrintTarget.sale_price ?? 0,
            sku: variantPrintTarget.sku,
            mrp: variantPrintTarget.mrp,
          }]}
          orgName={org?.name}
        />
      )}
    </div>
  )
}
