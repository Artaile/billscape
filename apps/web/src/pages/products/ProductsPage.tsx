import React, { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  Search,
  X,
  Pencil,
  Trash2,
  Package,
  Barcode,
  Tags,
  Printer,
  Upload,
  Download,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { formatINR } from '@billscape/core'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
import { ManageCategoriesDialog } from '@/components/products/ManageCategoriesDialog'

import { logActivity } from '@/lib/activityLog'

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

export function ProductsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { org } = useAuth()
  const orgId = org?.id

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<ProductWithInventory | null>(null)
  const [printTarget, setPrintTarget] = useState<ProductWithInventory | null>(null)
  const [importing, setImporting] = useState(false)
  const [showManageCategories, setShowManageCategories] = useState(false)

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

  const getStockBadge = useCallback((item: ProductWithInventory) => {
    if (!item.track_stock || !item.inventory) return null
    const { stock_qty } = item.inventory
    const threshold = org?.feature_flags?.low_stock_threshold ?? 10
    
    if (stock_qty === 0) return <Badge variant="destructive">Out of stock ({stock_qty})</Badge>
    if (stock_qty <= threshold) return <Badge variant="warning">Low stock ({stock_qty})</Badge>
    return <Badge variant="success">In stock ({stock_qty})</Badge>
  }, [org?.feature_flags?.low_stock_threshold])

  return (
    <div className="p-4 lg:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Products</h1>
          <p className="text-sm text-zinc-400 mt-0.5">
            {products?.length ?? 0} products
          </p>
        </div>
        <div className="flex items-center gap-2">
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
          <Button onClick={() => navigate('/products/new')}>
            <Plus className="h-4 w-4" /> Add Product
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <div className="relative max-w-sm">
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
      </div>

      {/* Category filter pills */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <button
          onClick={() => setCategoryFilter('')}
          className={cn(
            'rounded-full px-3 py-1.5 text-xs font-medium border transition-colors',
            categoryFilter === ''
              ? 'bg-indigo-600 border-indigo-600 text-white'
              : 'border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600',
          )}
        >
          All Categories
        </button>
        {categories?.map((c) => (
          <button
            key={c.id}
            onClick={() => setCategoryFilter(c.id)}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors',
              categoryFilter === c.id
                ? 'text-white border-transparent'
                : 'border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600',
            )}
            style={categoryFilter === c.id ? { backgroundColor: c.color ?? '#6366f1' } : undefined}
          >
            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: c.color ?? '#6366f1' }}
            />
            {c.name}
          </button>
        ))}
        <button
          onClick={() => setShowManageCategories(true)}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border border-dashed border-zinc-700 text-zinc-500 hover:text-zinc-200 hover:border-zinc-500 transition-colors ml-auto"
        >
          <Tags className="h-3.5 w-3.5" />
          Manage Categories
        </button>
      </div>

      {/* Products grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <ProductCardSkeleton key={i} />)
        ) : products && products.length > 0 ? (
          products.map((product) => (
            <div
              key={product.id}
              className="group rounded-lg border border-border bg-card p-4 transition-all hover:border-zinc-600"
            >
              <div className="flex gap-3">
                {/* Image / placeholder */}
                <div className="h-16 w-16 shrink-0 rounded-lg overflow-hidden bg-zinc-800 border border-zinc-700">
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Package className="h-7 w-7 text-zinc-600" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-zinc-100 text-sm truncate">{product.name}</h3>
                  {product.categories && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <span
                        className="h-1.5 w-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: product.categories.color ?? '#6366f1' }}
                      />
                      <p className="text-[11px] text-zinc-500">{product.categories.name}</p>
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-base font-bold text-white">{formatINR(product.price)}</span>
                    {product.tax_rate > 0 && (
                      <span className="text-[10px] text-zinc-500">GST {product.tax_rate}%</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    {getStockBadge(product)}
                    {product.hsn_code && (
                      <span className="text-[10px] text-zinc-600">HSN: {product.hsn_code}</span>
                    )}
                  </div>
                  {product.barcode_value && (
                    <div className="flex items-center gap-1 mt-1">
                      <Barcode className="h-3 w-3 text-zinc-600" />
                      <span className="text-[10px] font-mono text-zinc-600">{product.barcode_value}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 mt-3 pt-3 border-t border-zinc-800">
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1 text-xs h-7"
                  onClick={() => navigate(`/products/${product.id}/edit`)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Button>
                {product.barcode_value && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1 text-xs h-7"
                    onClick={() => setPrintTarget(product)}
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Label
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1 text-xs h-7 text-red-400 hover:text-red-300 hover:bg-red-900/20"
                  onClick={() => setDeleteTarget(product)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              </div>
            </div>
          ))
        ) : (
          <EmptyState hasSearch={!!debouncedSearch || !!categoryFilter} />
        )}
      </div>

      {/* Manage categories dialog */}
      <ManageCategoriesDialog open={showManageCategories} onOpenChange={setShowManageCategories} />

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
    </div>
  )
}
