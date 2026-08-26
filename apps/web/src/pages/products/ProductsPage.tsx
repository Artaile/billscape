import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  Search,
  X,
  Pencil,
  Trash2,
  Package,
  Printer,
  Upload,
  Download,
  Eye,
  SlidersHorizontal,
  Layers,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { formatINR } from '@billscape/core'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import type { Product } from '@billscape/core'
import { BarcodeLabelDialog } from '@/components/ui/BarcodeLabelDialog'
import { AdjustStockDialog } from '@/components/products/AdjustStockDialog'
import { ProductFiltersPopover, emptyProductFilters, isFiltersActive, type ProductFilters } from '@/components/products/ProductFiltersPopover'
import { getVariantStockMap } from '@billscape/api'

import { logActivity } from '@/lib/activityLog'
import { usePlanLimits } from '@/hooks/usePlanLimits'
import { PlanLimitModal } from '@/components/common/PlanLimitModal'

const SELECT_CLASS =
  'h-9 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500'

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = React.useState(value)
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

function ProductCardSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-4 animate-pulse">
      <div className="flex gap-3">
        <div className="h-16 w-16 rounded-lg bg-zinc-800 shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-zinc-800 rounded w-3/4" />
          <div className="h-3 bg-zinc-800 rounded w-1/2" />
          <div className="h-3 bg-zinc-800 rounded w-1/3" />
        </div>
      </div>
    </div>
  )
}

function EmptyState({ hasSearch }: { hasSearch: boolean }) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-20 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-800 mb-4">
        <Package className="h-8 w-8 text-zinc-600" />
      </div>
      <h3 className="text-base font-semibold text-zinc-300 mb-1">
        {hasSearch ? 'No products found' : 'No products yet'}
      </h3>
      <p className="text-sm text-zinc-500 max-w-xs">
        {hasSearch
          ? 'Try adjusting your search or filters.'
          : 'Add your first product to start billing.'}
      </p>
    </div>
  )
}

interface InventoryData {
  stock_qty: number
  reorder_level: number
}

interface ProductWithInventory extends Product {
  inventory: InventoryData | null
  categories: { name: string; color: string | null } | null
}

interface VariantMatch {
  id: string
  variant_name: string
  barcode_value: string | null
  sale_price: number | null
  tax_rate: number | null
  qty: number | null
  product_id: string
  product_name: string
  product_image_url: string | null
}

function ProductCard({
  product,
  org,
  onView,
  onEdit,
  onAdjustStock,
  onPrint,
  onDelete,
}: {
  product: ProductWithInventory
  org: { feature_flags?: { low_stock_threshold?: number } } | null | undefined
  onView: () => void
  onEdit: () => void
  onAdjustStock: () => void
  onPrint: () => void
  onDelete: () => void
}) {
  const hasVariants = !!(product as any).has_variants
  const stock = product.inventory?.stock_qty ?? 0
  const reorderLevel = product.inventory?.reorder_level ?? org?.feature_flags?.low_stock_threshold ?? 10
  const outOfStock = product.track_stock && stock <= 0
  const lowStock = product.track_stock && !outOfStock && stock <= reorderLevel

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onView}
      onKeyDown={(e) => { if (e.key === 'Enter') onView() }}
      className="group rounded-xl border border-border bg-card p-3.5 transition-all hover:border-indigo-700/60 hover:shadow-lg hover:shadow-indigo-950/20 cursor-pointer"
    >
      {/* Top: image left, details right */}
      <div className="flex gap-3">
        <div className="h-20 w-20 shrink-0 rounded-lg overflow-hidden bg-zinc-800/60 border border-zinc-800 relative">
          {product.image_url ? (
            <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Package className="h-7 w-7 text-zinc-700" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-zinc-100 text-sm truncate">{product.name}</h3>
            {(outOfStock || lowStock) && (
              <span
                className={cn(
                  'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                  outOfStock ? 'bg-red-950/90 text-red-300 border border-red-800' : 'bg-yellow-950/90 text-yellow-300 border border-yellow-800',
                )}
              >
                {outOfStock ? 'Out of stock' : `Low stock (${stock})`}
              </span>
            )}
          </div>
          {product.categories && (
            <div className="flex items-center gap-1.5 mt-1">
              <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: product.categories.color ?? '#6366f1' }} />
              <p className="text-[11px] text-zinc-500 truncate">{product.categories.name}</p>
            </div>
          )}
          <div className="flex items-center gap-2 mt-2">
            <span className="text-base font-bold text-white">
              {hasVariants ? 'Multiple prices' : formatINR(product.price)}
            </span>
            {product.tax_rate > 0 && (
              <span className="text-[10px] text-zinc-500 shrink-0">GST {product.tax_rate}%</span>
            )}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-zinc-800 mt-3 pt-3">
        {/* Action buttons — uniform icon-button treatment, no mixed text/icon-only styling */}
        <div
          className="grid grid-cols-4 gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            title="View"
            onClick={onView}
            className="flex flex-col items-center gap-1 rounded-lg py-1.5 text-zinc-400 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors"
          >
            <Eye className="h-4 w-4" />
            <span className="text-[10px] font-medium">View</span>
          </button>
          <button
            type="button"
            title="Edit"
            onClick={onEdit}
            className="flex flex-col items-center gap-1 rounded-lg py-1.5 text-zinc-400 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors"
          >
            <Pencil className="h-4 w-4" />
            <span className="text-[10px] font-medium">Edit</span>
          </button>
          <button
            type="button"
            title={hasVariants ? 'Edit variant stock' : 'Adjust stock'}
            onClick={hasVariants ? onEdit : onAdjustStock}
            className="flex flex-col items-center gap-1 rounded-lg py-1.5 text-zinc-400 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors"
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span className="text-[10px] font-medium">Stock</span>
          </button>
          {product.barcode_value ? (
            <button
              type="button"
              title="Print label"
              onClick={onPrint}
              className="flex flex-col items-center gap-1 rounded-lg py-1.5 text-zinc-400 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors"
            >
              <Printer className="h-4 w-4" />
              <span className="text-[10px] font-medium">Print</span>
            </button>
          ) : (
            <button
              type="button"
              title="Delete"
              onClick={onDelete}
              className="flex flex-col items-center gap-1 rounded-lg py-1.5 text-red-400/80 hover:text-red-300 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
              <span className="text-[10px] font-medium">Delete</span>
            </button>
          )}
        </div>
        {product.barcode_value && (
          <button
            type="button"
            title="Delete"
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg py-1 text-[10px] font-medium text-red-400/80 hover:text-red-300 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="h-3 w-3" /> Delete
          </button>
        )}
      </div>
    </div>
  )
}

export function ProductsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { org } = useAuth()
  const orgId = org?.id

  const { limitModalOpen, setLimitModalOpen, limitInfo, checkQuota } = usePlanLimits()

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [filters, setFilters] = useState<ProductFilters>(emptyProductFilters)
  const [deleteTarget, setDeleteTarget] = useState<ProductWithInventory | null>(null)
  const [printTarget, setPrintTarget] = useState<ProductWithInventory | null>(null)
  const [importing, setImporting] = useState(false)
  const [adjustStockOpen, setAdjustStockOpen] = useState(false)
  const [adjustStockProductId, setAdjustStockProductId] = useState<string | undefined>(undefined)

  const handleAddProductClick = async () => {
    const { allowed } = await checkQuota('products')
    if (allowed) {
      navigate('/products/new')
    }
  }

  const debouncedSearch = useDebounce(search, 300)

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

  const { data: products, isLoading } = useQuery({
    queryKey: ['products', orgId, debouncedSearch, categoryFilter],
    enabled: !!orgId,
    queryFn: async () => {
      let query = supabase
        .from('products')
        .select('*, inventory(stock_qty, reorder_level), categories(name, color)')
        .eq('organization_id', orgId!)
        .eq('is_active', true)
        .order('name')

      if (debouncedSearch) {
        query = query.or(`name.ilike.%${debouncedSearch}%,barcode_value.ilike.%${debouncedSearch}%,sku.ilike.%${debouncedSearch}%`)
      }
      if (categoryFilter) {
        query = query.eq('category_id', categoryFilter)
      }

      const { data } = await query
      return (data ?? []) as ProductWithInventory[]
    },
  })

  // Variant barcode/name search — mirrors POSTab.tsx's variantMatchedProducts pattern: search
  // product_variants directly, then attach the parent product's name/image for card display.
  // Only runs when there's an active search term, so it never fires on a bare page load.
  const { data: variantMatches } = useQuery({
    queryKey: ['product-variant-search', orgId, debouncedSearch],
    enabled: !!orgId && !!debouncedSearch,
    queryFn: async (): Promise<VariantMatch[]> => {
      const { data: variants } = await supabase
        .from('product_variants')
        .select('id, variant_name, barcode_value, sale_price, tax_rate, product_id')
        .eq('organization_id', orgId!)
        .or(`barcode_value.ilike.%${debouncedSearch}%,variant_name.ilike.%${debouncedSearch}%`)
        .limit(20)
      if (!variants || variants.length === 0) return []

      const productIds = [...new Set(variants.map((v) => v.product_id))]
      const [{ data: parents }, { data: stockMap }] = await Promise.all([
        supabase
          .from('products')
          .select('id, name, image_url')
          .eq('organization_id', orgId!)
          .in('id', productIds),
        getVariantStockMap(supabase, orgId!, variants.map((v) => v.id)),
      ])

      const parentMap = new Map((parents ?? []).map((p) => [p.id, p]))
      return variants
        .filter((v) => parentMap.has(v.product_id))
        .map((v) => ({
          id: v.id,
          variant_name: v.variant_name,
          barcode_value: v.barcode_value,
          sale_price: v.sale_price,
          tax_rate: v.tax_rate,
          qty: stockMap?.get(v.id) ?? 0,
          product_id: v.product_id,
          product_name: parentMap.get(v.product_id)!.name,
          product_image_url: parentMap.get(v.product_id)!.image_url,
        }))
    },
  })

  // Stock status, price range, and expiry depend on the joined inventory row / org-level
  // low-stock threshold / a computed date comparison — simpler and cheaper to filter client-side
  // over the already-fetched page than to push into the Supabase query.
  const lowStockThreshold = org?.feature_flags?.low_stock_threshold ?? 10
  const matchesFilters = (p: ProductWithInventory) => {
    if (filters.stock.length > 0) {
      const qty = p.inventory?.stock_qty ?? 0
      const status: 'in_stock' | 'low_stock' | 'out_of_stock' =
        qty <= 0 ? 'out_of_stock' : qty <= lowStockThreshold ? 'low_stock' : 'in_stock'
      if (!filters.stock.includes(status)) return false
    }
    if (filters.minPrice && p.price < parseFloat(filters.minPrice)) return false
    if (filters.maxPrice && p.price > parseFloat(filters.maxPrice)) return false
    if (filters.expiry.length > 0) {
      const expiryDate = p.expiry_date ?? null
      const today = new Date(); today.setHours(0, 0, 0, 0)
      const in30 = new Date(today); in30.setDate(in30.getDate() + 30)
      const exp = expiryDate ? new Date(expiryDate) : null
      const matchesAny = filters.expiry.some((f) => {
        if (f === 'no_expiry') return !exp
        if (!exp) return false
        if (f === 'expired') return exp < today
        if (f === 'expiring_30') return exp >= today && exp <= in30
        return false
      })
      if (!matchesAny) return false
    }
    return true
  }

  const allFiltered = (products ?? []).filter(matchesFilters)
  const filteredProducts = allFiltered.filter((p) => !(p as any).has_variants)
  const filteredVariantProducts = allFiltered.filter((p) => (p as any).has_variants)

  const deleteMutation = useMutation({
    mutationFn: async (product: ProductWithInventory) => {
      const { error } = await supabase
        .from('products')
        .update({ is_active: false })
        .eq('id', product.id)
        .eq('organization_id', orgId!)
      if (error) throw error

      await logActivity({
        organizationId: orgId!,
        action: 'deleted',
        entity: 'product',
        entityId: product.id,
        metadata: {
          name: product.name,
          sku: product.sku,
          price: product.price,
          barcode: product.barcode_value,
        },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', orgId] })
      queryClient.invalidateQueries({ queryKey: ['activity_log', orgId] })
      toast.success('Product deleted')
      setDeleteTarget(null)
    },
    onError: () => {
      toast.error('Delete failed', 'Could not delete the product.')
    },
  })

  function exportCSV() {
    if (!products || products.length === 0) {
      toast.error('No products to export')
      return
    }
    const headers = ['Name', 'SKU', 'Category', 'Price', 'Cost Price', 'Tax Rate (%)', 'HSN Code', 'Barcode', 'Stock', 'Reorder Level']
    const rows = products.map((p) => [
      p.name,
      p.sku ?? '',
      p.categories?.name ?? '',
      p.price,
      p.cost_price ?? 0,
      p.tax_rate ?? 18,
      p.hsn_code ?? '',
      p.barcode_value ?? '',
      p.inventory?.stock_qty ?? 0,
      p.inventory?.reorder_level ?? 5,
    ])
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `products-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`Exported ${products.length} products`)
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !orgId) return
    e.target.value = ''
    setImporting(true)
    try {
      const text = await file.text()
      const lines = text.split('\n').filter((l) => l.trim())
      if (lines.length < 2) throw new Error('CSV must have a header row and at least one product row')
      const headers = lines[0].split(',').map((h) => h.replace(/"/g, '').trim().toLowerCase())
      const nameIdx = headers.findIndex((h) => h === 'name')
      const priceIdx = headers.findIndex((h) => h === 'price')
      if (nameIdx === -1 || priceIdx === -1) throw new Error('CSV must have "Name" and "Price" columns')

      const skuIdx = headers.findIndex((h) => h === 'sku')
      const hsnIdx = headers.findIndex((h) => h === 'hsn code')
      const taxIdx = headers.findIndex((h) => h.includes('tax rate'))
      const costIdx = headers.findIndex((h) => h === 'cost price')
      const barcodeIdx = headers.findIndex((h) => h === 'barcode')

      const parseCell = (row: string[], idx: number) => idx >= 0 ? row[idx]?.replace(/"/g, '').trim() : ''

      const rows = lines.slice(1).map((line) => {
        const cols = line.split(',')
        return {
          organization_id: orgId,
          name: parseCell(cols, nameIdx),
          price: parseFloat(parseCell(cols, priceIdx)) || 0,
          sku: parseCell(cols, skuIdx) || null,
          hsn_code: parseCell(cols, hsnIdx) || null,
          tax_rate: parseInt(parseCell(cols, taxIdx)) || 18,
          cost_price: parseFloat(parseCell(cols, costIdx)) || 0,
          barcode_value: parseCell(cols, barcodeIdx) || null,
          is_active: true,
        }
      }).filter((r) => r.name)

      if (rows.length === 0) throw new Error('No valid product rows found in CSV')

      const { error } = await supabase.from('products').insert(rows)
      if (error) throw error
      queryClient.invalidateQueries({ queryKey: ['products', orgId] })
      toast.success(`Imported ${rows.length} products`)
    } catch (err: unknown) {
      toast.error('Import failed', err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="p-4 lg:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Products</h1>
          <p className="text-sm text-zinc-400 mt-0.5">
            {filteredProducts.length + filteredVariantProducts.length} product{filteredProducts.length + filteredVariantProducts.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { setAdjustStockProductId(undefined); setAdjustStockOpen(true) }}>
            <SlidersHorizontal className="h-4 w-4" /> Adjust Stock
          </Button>
          <label className="cursor-pointer">
            <input type="file" accept=".csv" className="hidden" onChange={handleImport} disabled={importing} />
            <Button variant="outline" size="sm" asChild>
              <span>
                <Upload className="h-4 w-4" />
                {importing ? 'Importing...' : 'Import CSV'}
              </span>
            </Button>
          </label>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          <Button onClick={handleAddProductClick}>
            <Plus className="h-4 w-4" /> Add Product
          </Button>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative max-w-sm flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input
            placeholder="Search name, SKU or scan barcode..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-9"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className={SELECT_CLASS}
        >
          <option value="">All Categories</option>
          {categories?.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <ProductFiltersPopover value={filters} onChange={setFilters} />
        {isFiltersActive(filters) && (
          <button
            type="button"
            onClick={() => setFilters(emptyProductFilters)}
            className="text-xs font-medium text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Variant barcode/name search results */}
      {debouncedSearch && variantMatches && variantMatches.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Layers className="h-4 w-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-zinc-300">Matching Variants</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
            {variantMatches.map((v) => (
              <div
                key={v.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/products/${v.product_id}`)}
                onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/products/${v.product_id}`) }}
                className="rounded-xl border border-indigo-800/50 bg-card p-3.5 transition-all hover:border-indigo-600 hover:shadow-lg hover:shadow-indigo-950/20 cursor-pointer"
              >
                <div className="flex gap-3">
                  <div className="h-16 w-16 shrink-0 rounded-lg overflow-hidden bg-zinc-800/60 border border-zinc-800">
                    {v.product_image_url ? (
                      <img src={v.product_image_url} alt={v.product_name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Package className="h-6 w-6 text-zinc-700" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-zinc-500 truncate">{v.product_name}</p>
                    <h3 className="font-semibold text-zinc-100 text-sm truncate">{v.variant_name}</h3>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-sm font-bold text-white">{v.sale_price != null ? formatINR(v.sale_price) : '—'}</span>
                      {v.tax_rate ? <span className="text-[10px] text-zinc-500">GST {v.tax_rate}%</span> : null}
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-1">Stock: {v.qty ?? 0}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Standard products grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <ProductCardSkeleton key={i} />)
        ) : filteredProducts.length > 0 ? (
          filteredProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              org={org}
              onView={() => navigate(`/products/${product.id}`)}
              onEdit={() => navigate(`/products/${product.id}/edit`)}
              onAdjustStock={() => { setAdjustStockProductId(product.id); setAdjustStockOpen(true) }}
              onPrint={() => setPrintTarget(product)}
              onDelete={() => setDeleteTarget(product)}
            />
          ))
        ) : filteredVariantProducts.length === 0 && !(variantMatches && variantMatches.length > 0) ? (
          <EmptyState hasSearch={!!debouncedSearch || !!categoryFilter || isFiltersActive(filters)} />
        ) : null}
      </div>

      {/* Variant products — shown separately since price/stock/barcode are per-variant, not
          a single value on the parent product row */}
      {!isLoading && filteredVariantProducts.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-3">
            <Layers className="h-4 w-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-zinc-300">Variant Products</h2>
            <span className="text-xs text-zinc-500">({filteredVariantProducts.length})</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredVariantProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                org={org}
                onView={() => navigate(`/products/${product.id}`)}
                onEdit={() => navigate(`/products/${product.id}/edit`)}
                onAdjustStock={() => { setAdjustStockProductId(product.id); setAdjustStockOpen(true) }}
                onPrint={() => setPrintTarget(product)}
                onDelete={() => setDeleteTarget(product)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Adjust stock dialog */}
      <AdjustStockDialog
        open={adjustStockOpen}
        onOpenChange={setAdjustStockOpen}
        initialProductId={adjustStockProductId}
      />

      {/* Barcode label print dialog */}
      {printTarget && (
        <BarcodeLabelDialog
          open={!!printTarget}
          onOpenChange={(v) => { if (!v) setPrintTarget(null) }}
          product={printTarget}
          orgName={org?.name}
        />
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Product</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{' '}
              <span className="font-semibold text-zinc-200">{deleteTarget?.name}</span>?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PlanLimitModal open={limitModalOpen} onClose={() => setLimitModalOpen(false)} limitInfo={limitInfo} />
    </div>
  )
}
