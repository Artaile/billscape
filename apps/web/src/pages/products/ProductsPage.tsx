import React, { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Package,
  Barcode,
  Filter,
  Printer,
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
  categories: { name: string } | null
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

  const debouncedSearch = useDebounce(search, 300)

  const { data: categories } = useQuery({
    queryKey: ['categories', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('categories')
        .select('id, name')
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
        .select('*, inventory(stock_qty, reorder_level), categories(name)')
        .eq('organization_id', orgId!)
        .eq('is_active', true)
        .order('name')

      if (debouncedSearch) {
        query = query.ilike('name', `%${debouncedSearch}%`)
      }
      if (categoryFilter) {
        query = query.eq('category_id', categoryFilter)
      }

      const { data } = await query
      return (data ?? []) as ProductWithInventory[]
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (productId: string) => {
      const { error } = await supabase
        .from('products')
        .update({ is_active: false })
        .eq('id', productId)
        .eq('organization_id', orgId!)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', orgId] })
      toast.success('Product deleted')
      setDeleteTarget(null)
    },
    onError: () => {
      toast.error('Delete failed', 'Could not delete the product.')
    },
  })

  const getStockBadge = useCallback((item: ProductWithInventory) => {
    if (!item.track_stock || !item.inventory) return null
    const { stock_qty, reorder_level } = item.inventory
    if (stock_qty === 0) return <Badge variant="destructive">Out of stock</Badge>
    if (stock_qty <= reorder_level) return <Badge variant="warning">Low stock</Badge>
    return <Badge variant="success">In stock</Badge>
  }, [])

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
        <Button onClick={() => navigate('/products/new')}>
          <Plus className="h-4 w-4" />
          Add Product
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-zinc-500" />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="h-9 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="" className="bg-zinc-900">All Categories</option>
            {categories?.map((c) => (
              <option key={c.id} value={c.id} className="bg-zinc-900">
                {c.name}
              </option>
            ))}
          </select>
        </div>
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
                    <p className="text-[11px] text-zinc-500 mt-0.5">{product.categories.name}</p>
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
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
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
