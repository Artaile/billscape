import { useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Loader2, Pencil, Printer, Package, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { formatINR } from '@billscape/core'
import { formatDate, cn } from '@/lib/utils'
import { getVariantStockMap } from '@billscape/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { BarcodeLabelDialog } from '@/components/ui/BarcodeLabelDialog'
import { toast } from '@/hooks/use-toast'
import { logActivity } from '@/lib/activityLog'

export function ProductViewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const backTo = (location.state as { from?: string } | null)?.from ?? '/products'
  const { org } = useAuth()
  const orgId = org?.id
  const queryClient = useQueryClient()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [printOpen, setPrintOpen] = useState(false)
  const [singleVariantPrint, setSingleVariantPrint] = useState<{ id: string; variant_name: string; barcode_value: string | null; sale_price: number | null } | null>(null)

  const { data: product, isLoading } = useQuery({
    queryKey: ['product-detail', orgId, id],
    enabled: !!orgId && !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*, inventory(stock_qty, reorder_level), categories(name, color), unit:unit_id(name, symbol)')
        .eq('id', id!)
        .eq('organization_id', orgId!)
        .single()
      if (error) throw error
      return data
    },
  })

  const hasVariants = !!(product as any)?.has_variants

  const { data: variants } = useQuery({
    queryKey: ['product-variants-detail', orgId, id],
    enabled: !!orgId && !!id && hasVariants,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from('product_variants')
        .select('id, variant_name, barcode_value, tax_rate, mrp, sale_price, purchase_price')
        .eq('product_id', id!)
        .eq('organization_id', orgId!)
        .order('variant_name')
      if (!rows || rows.length === 0) return []

      const stockMap = await getVariantStockMap(supabase, orgId!, rows.map((r) => r.id))

      return rows.map((r) => ({ ...r, stock: stockMap.data.get(r.id) ?? 0 }))
    },
  })

  const { data: batches } = useQuery({
    queryKey: ['inventory_batches', orgId, id],
    enabled: !!orgId && !!id,
    queryFn: async () => {
      const { data } = await supabase
        .from('inventory_batches')
        .select('*')
        .eq('product_id', id!)
        .eq('organization_id', orgId!)
        .order('expiry_date')
      return data ?? []
    },
  })

  const { data: movements } = useQuery({
    queryKey: ['stock_movements', orgId, id],
    enabled: !!orgId && !!id,
    queryFn: async () => {
      const { data } = await supabase
        .from('stock_movements')
        .select('*')
        .eq('organization_id', orgId!)
        .eq('product_id', id!)
        .order('created_at', { ascending: false })
        .limit(100)
      return data ?? []
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!product || !orgId) throw new Error('Missing product')
      const { error } = await supabase
        .from('products')
        .update({ is_active: false })
        .eq('id', product.id)
        .eq('organization_id', orgId)
      if (error) throw error

      await logActivity({
        organizationId: orgId,
        action: 'deleted',
        entity: 'product',
        entityId: product.id,
        metadata: { name: product.name, sku: product.sku, price: product.price, barcode: product.barcode_value },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', orgId] })
      queryClient.invalidateQueries({ queryKey: ['activity_log', orgId] })
      toast.success('Product deleted')
      navigate(backTo)
    },
    onError: () => toast.error('Delete failed', 'Could not delete the product.'),
  })

  const stock = product?.inventory?.stock_qty ?? 0
  const reorderLevel = product?.inventory?.reorder_level ?? 5
  const totalBatchQty = (batches ?? []).reduce((s, b) => s + (b.qty ?? 0), 0)

  const variantPrices = (variants ?? []).map((v) => v.sale_price ?? 0)
  const variantPurchasePrices = (variants ?? []).map((v) => v.purchase_price ?? 0)
  const variantTaxRates = new Set((variants ?? []).map((v) => v.tax_rate))
  const totalVariantStock = (variants ?? []).reduce((sum, v) => sum + v.stock, 0)
  const totalVariantStockValue = (variants ?? []).reduce((sum, v) => sum + v.stock * (v.purchase_price ?? 0), 0)

  function priceRangeLabel(values: number[]): string {
    if (values.length === 0) return '—'
    const min = Math.min(...values)
    const max = Math.max(...values)
    return min === max ? formatINR(min) : `${formatINR(min)} – ${formatINR(max)}`
  }

  function stockBadge() {
    if (!product?.track_stock) return null
    if (stock <= 0) return <Badge variant="destructive">Out of stock</Badge>
    if (stock <= reorderLevel) return <Badge variant="warning">Low Stock</Badge>
    return <Badge variant="success">In Stock</Badge>
  }

  return (
    <div className="p-4 lg:p-6">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(backTo)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-foreground">{product?.name ?? 'Product Details'}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Product Details</p>
          </div>
        </div>
        {product && (
          <div className="flex items-center gap-2">
            {(product.barcode_value || hasVariants) && (
              <Button variant="outline" size="sm" onClick={() => setPrintOpen(true)}>
                <Printer className="h-4 w-4" /> Print Label
              </Button>
            )}
            <Button size="sm" onClick={() => navigate(`/products/${id}/edit`)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
            <Button
              variant="outline" size="sm"
              className="text-red-400 border-red-900/50 hover:text-red-300 hover:bg-red-900/20"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : !product ? (
        <p className="text-sm text-muted-foreground">Product not found.</p>
      ) : (
        <div className="space-y-5">
          {/* Info card */}
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex gap-4">
              <div className="h-24 w-24 shrink-0 rounded-lg overflow-hidden bg-zinc-800/60 border border-zinc-800">
                {product.image_url ? (
                  <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Package className="h-10 w-10 text-zinc-700" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-semibold text-zinc-100">{product.name}</h2>
                  {stockBadge()}
                </div>
                {product.categories && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: product.categories.color ?? '#6366f1' }} />
                    <p className="text-xs text-zinc-500">{product.categories.name}</p>
                  </div>
                )}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3 mt-4 pt-4 border-t border-zinc-800/70 text-sm">
                  <div>
                    <span className="text-zinc-500 text-xs">SKU / Item Code</span>
                    <p className="text-zinc-200 font-mono">{product.sku ?? '—'}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500 text-xs">Barcode</span>
                    <p className="text-zinc-200 font-mono">{product.barcode_value ?? '—'}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500 text-xs">HSN Code</span>
                    <p className="text-zinc-200">{product.hsn_code ?? '—'}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500 text-xs">Category</span>
                    <p className="text-zinc-200">{product.categories?.name ?? '—'}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500 text-xs">Unit</span>
                    <p className="text-zinc-200">{product.unit ? `${product.unit.name} (${product.unit.symbol})` : '—'}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500 text-xs">Sale Price</span>
                    <p className="text-indigo-300 font-semibold">
                      {hasVariants ? priceRangeLabel(variantPrices) : formatINR(product.price)}
                      {hasVariants && variants && variants.length > 0 && (
                        <span className="text-zinc-500 text-xs font-normal"> ({variants.length} variants)</span>
                      )}
                    </p>
                  </div>
                  <div>
                    <span className="text-zinc-500 text-xs">Purchase Price</span>
                    <p className="text-zinc-200">{hasVariants ? priceRangeLabel(variantPurchasePrices) : formatINR(product.cost_price ?? 0)}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500 text-xs">Tax Rate</span>
                    <p className="text-zinc-200" title={hasVariants ? [...variantTaxRates].map((r) => `${r}%`).join(', ') : undefined}>
                      {hasVariants ? (variantTaxRates.size > 1 ? 'Varies' : `${[...variantTaxRates][0] ?? product.tax_rate}%`) : `${product.tax_rate}%`}
                    </p>
                  </div>
                  {product.track_stock && (
                    <>
                      <div>
                        <span className="text-zinc-500 text-xs">{hasVariants ? 'Total Stock (all variants)' : 'Current Stock'}</span>
                        <p className="text-indigo-300 font-semibold">{hasVariants ? totalVariantStock : stock} {product.unit?.symbol ?? ''}</p>
                      </div>
                      <div>
                        <span className="text-zinc-500 text-xs">Stock Value</span>
                        <p className="text-zinc-200">{formatINR(hasVariants ? totalVariantStockValue : stock * (product.cost_price ?? 0))}</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Variants */}
          {hasVariants && (
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4">
                <h3 className="text-sm font-semibold text-zinc-300">Variants ({variants?.length ?? 0})</h3>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Variant Name</TableHead>
                    <TableHead>Barcode</TableHead>
                    <TableHead className="text-right">Tax %</TableHead>
                    <TableHead className="text-right">MRP</TableHead>
                    <TableHead className="text-right">Retail Price</TableHead>
                    <TableHead className="text-right">Purchase Price</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead className="w-[5%]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!variants || variants.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-zinc-500 py-4">No variants recorded</TableCell></TableRow>
                  ) : variants.map((v) => {
                    const outOfStock = v.stock <= 0
                    const lowStock = !outOfStock && v.stock <= reorderLevel
                    return (
                      <TableRow key={v.id}>
                        <TableCell className="text-zinc-200">{v.variant_name}</TableCell>
                        <TableCell className="font-mono text-xs text-zinc-400">{v.barcode_value ?? '—'}</TableCell>
                        <TableCell className="text-right text-zinc-400">{v.tax_rate}%</TableCell>
                        <TableCell className="text-right text-zinc-400">{v.mrp != null ? formatINR(v.mrp) : '—'}</TableCell>
                        <TableCell className="text-right text-zinc-300">{v.sale_price != null ? formatINR(v.sale_price) : '—'}</TableCell>
                        <TableCell className="text-right text-zinc-400">{v.purchase_price != null ? formatINR(v.purchase_price) : '—'}</TableCell>
                        <TableCell className="text-right">
                          <span className={cn('text-sm', outOfStock ? 'text-red-400' : lowStock ? 'text-yellow-400' : 'text-zinc-300')}>
                            {v.stock} {product.unit?.symbol ?? ''}
                          </span>
                        </TableCell>
                        <TableCell>
                          <button
                            type="button"
                            title="Print label"
                            onClick={() => setSingleVariantPrint(v)}
                            className="p-1 rounded text-zinc-500 hover:text-indigo-400 hover:bg-indigo-900/20 transition-colors"
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Batches */}
          {product.has_batches && (
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-300">Batches</h3>
                  <p className="text-xs text-zinc-500 mt-0.5">Total batch stock: {totalBatchQty} {product.unit?.symbol ?? ''}</p>
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Batch No.</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Purchase ₹ / Unit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!batches || batches.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-zinc-500 py-4">No batches recorded</TableCell></TableRow>
                  ) : batches.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-mono text-xs text-zinc-300">{b.batch_no || '—'}</TableCell>
                      <TableCell className="text-zinc-400">{b.expiry_date ? formatDate(b.expiry_date) : '—'}</TableCell>
                      <TableCell className="text-right text-zinc-300">{b.qty}</TableCell>
                      <TableCell className="text-right text-zinc-400">{b.cost_price != null ? formatINR(b.cost_price) : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Transaction history */}
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4">
              <h3 className="text-sm font-semibold text-zinc-300">Transaction History</h3>
            </div>
            <Separator />
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!movements || movements.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-zinc-500 py-6">No transactions found</TableCell></TableRow>
                ) : movements.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-zinc-400">{formatDate(m.created_at)}</TableCell>
                    <TableCell className="text-zinc-200 capitalize">{m.reason}</TableCell>
                    <TableCell className={`text-right font-medium ${m.qty_change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {m.qty_change >= 0 ? '+' : ''}{m.qty_change}
                    </TableCell>
                    <TableCell className="text-zinc-500 text-xs">{m.note ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

        </div>
      )}

      {/* Delete confirmation */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Product</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{' '}
              <span className="font-semibold text-zinc-200">{product?.name}</span>?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {product && (
        <BarcodeLabelDialog
          open={printOpen}
          onOpenChange={setPrintOpen}
          items={
            hasVariants
              ? (variants ?? []).map((v) => ({
                  key: v.id,
                  name: product.name,
                  variantLabel: v.variant_name,
                  barcode_value: v.barcode_value,
                  price: v.sale_price ?? 0,
                }))
              : [{ key: product.id, name: product.name, barcode_value: product.barcode_value, price: product.price }]
          }
          orgName={org?.name}
        />
      )}

      {singleVariantPrint && (
        <BarcodeLabelDialog
          open={!!singleVariantPrint}
          onOpenChange={(v) => { if (!v) setSingleVariantPrint(null) }}
          items={[{
            key: singleVariantPrint.id,
            name: product?.name ?? '',
            variantLabel: singleVariantPrint.variant_name,
            barcode_value: singleVariantPrint.barcode_value,
            price: singleVariantPrint.sale_price ?? 0,
          }]}
          orgName={org?.name}
        />
      )}
    </div>
  )
}
