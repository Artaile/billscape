import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Eye, ShoppingBag, Trash2, Loader2, Pencil, Printer,
  Upload, Download, FileSpreadsheet, AlertCircle,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { formatINR } from '@billscape/core'
import { getPurchaseWithItems } from '@billscape/api'
import { formatDate } from '@/lib/utils'
import { printBarcodeLabel } from '@/lib/printBarcodeLabel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────────────────

interface PurchaseItemForm {
  product_id: string | null
  product_name: string
  qty: string
  unit_cost: string
}

interface Purchase {
  id: string
  purchase_no: string | null
  invoice_no: string | null
  total_amount: number
  notes: string | null
  created_at: string
  suppliers: { name: string } | null
  purchase_items: { id: string }[]
}

interface Supplier { id: string; name: string; phone: string | null; gstin: string | null }

type ViewPurchase = NonNullable<Awaited<ReturnType<typeof getPurchaseWithItems>>['data']>

// ─── Pure helpers ───────────────────────────────────────────────────────────

function downloadTemplate() {
  const csv = 'Product Name,Qty,Unit Cost (Rs)\nExample Product,10,250.00\n'
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'purchase_import_template.csv'
  a.click()
  URL.revokeObjectURL(url)
}

function parseCSV(text: string): { items: PurchaseItemForm[]; errors: string[] } {
  const lines = text.trim().split('\n').filter(Boolean)
  if (lines.length < 2) return { items: [], errors: ['CSV is empty or has no data rows'] }
  const errors: string[] = []
  const items: PurchaseItemForm[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
    const name = cols[0] ?? ''
    if (!name) { errors.push(`Row ${i + 1}: Product name is empty`); continue }
    const qtyNum = parseFloat(cols[1] ?? '')
    if (isNaN(qtyNum) || qtyNum <= 0) { errors.push(`Row ${i + 1}: Invalid qty "${cols[1]}"`); continue }
    const costNum = parseFloat(cols[2] ?? '')
    if (isNaN(costNum) || costNum < 0) { errors.push(`Row ${i + 1}: Invalid cost "${cols[2]}"`); continue }
    items.push({ product_id: null, product_name: name, qty: String(qtyNum), unit_cost: String(costNum) })
  }
  return { items, errors }
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function PurchasesPage() {
  const { org, user } = useAuth()
  const orgId = org?.id
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const [viewPurchase, setViewPurchase] = useState<ViewPurchase | null>(null)
  const [viewLoading, setViewLoading] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // Import state
  const [showImport, setShowImport] = useState(false)
  const [importErrors, setImportErrors] = useState<string[]>([])
  const importFileRef = useRef<HTMLInputElement>(null)

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: purchases, isLoading } = useQuery({
    queryKey: ['purchases', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchases')
        .select('id, purchase_no, invoice_no, total_amount, notes, created_at, suppliers(name), purchase_items(id)')
        .eq('organization_id', orgId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as Purchase[]
    },
  })

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase.from('suppliers').select('id, name, phone, gstin').eq('organization_id', orgId!).order('name')
      return (data ?? []) as Supplier[]
    },
  })

  // ── Mutations ─────────────────────────────────────────────────────────────

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error: e1 } = await supabase.from('purchase_items').delete().eq('purchase_id', id).eq('organization_id', orgId!)
      if (e1) throw e1
      const { error: e2 } = await supabase.from('purchases').delete().eq('id', id).eq('organization_id', orgId!)
      if (e2) throw e2
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases', orgId] })
      toast.success('Purchase deleted')
      setDeleteConfirmId(null)
      if (viewPurchase?.purchase.id === deleteConfirmId) setViewPurchase(null)
    },
    onError: (err: Error) => toast.error('Delete failed', err.message),
  })

  // ── View loader ───────────────────────────────────────────────────────────

  async function handleViewPurchase(purchase: Purchase) {
    if (!orgId) return
    setViewLoading(true)
    const { data, error } = await getPurchaseWithItems(supabase, orgId, purchase.id)
    setViewLoading(false)
    if (error || !data) { toast.error('Failed to load purchase details', error?.message); return }
    setViewPurchase(data)
  }

  const handleImportFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const { items, errors } = parseCSV(ev.target?.result as string)
      if (items.length === 0) {
        setImportErrors(errors.length ? errors : ['No valid rows found in this CSV'])
        return
      }
      // Hand off to the full New Purchase form to review/edit GST, MRP, pricing and save —
      // no separate quick-save path, so every purchase (typed or imported) goes through one flow.
      navigate('/purchases/new', {
        state: { importedRows: items.map((it) => ({ product_name: it.product_name, qty: it.qty, unit_cost: it.unit_cost })) },
      })
      setShowImport(false)
    }
    reader.readAsText(file)
    e.target.value = ''
  }, [navigate])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 lg:p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Purchases</h1>
          <p className="text-sm text-zinc-400 mt-0.5">{purchases?.length ?? 0} records</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setImportErrors([]); setShowImport(true) }}>
            <Upload className="h-4 w-4 mr-1" />Import CSV
          </Button>
          <Button onClick={() => navigate('/purchases/new')}>
            <Plus className="h-4 w-4" />New Purchase
          </Button>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-32"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Purchase No</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Invoice No</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Total Amount</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchases && purchases.length > 0 ? purchases.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs text-indigo-300 whitespace-nowrap">
                    {p.purchase_no ?? <span className="text-zinc-600">—</span>}
                  </TableCell>
                  <TableCell className="text-zinc-400 text-sm whitespace-nowrap">{formatDate(p.created_at)}</TableCell>
                  <TableCell className="font-medium text-zinc-100">
                    {p.suppliers?.name ?? <span className="text-zinc-500 italic">No supplier</span>}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-zinc-300">{p.invoice_no ?? <span className="text-zinc-600">—</span>}</TableCell>
                  <TableCell className="text-right text-zinc-400">{p.purchase_items.length}</TableCell>
                  <TableCell className="text-right font-semibold text-white">{formatINR(p.total_amount)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-zinc-400 hover:text-white" onClick={() => handleViewPurchase(p)}>
                        <Eye className="h-3.5 w-3.5 mr-1" />View
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-zinc-400 hover:text-white" onClick={() => navigate(`/purchases/${p.id}/edit`)}>
                        <Pencil className="h-3.5 w-3.5 mr-1" />Edit
                      </Button>
                      <button onClick={() => setDeleteConfirmId(p.id)} className="p-1.5 rounded text-zinc-500 hover:text-red-400 hover:bg-red-400/10 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-16">
                    <div className="flex flex-col items-center gap-3 text-zinc-500">
                      <ShoppingBag className="h-10 w-10 text-zinc-700" />
                      <p className="text-sm">No purchases yet. Click New Purchase to record stock received.</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>

      {/* ── Import CSV Dialog ── */}
      <Dialog open={showImport} onOpenChange={(open) => { if (!open) { setShowImport(false); setImportErrors([]) } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-indigo-400" />Import Purchase from CSV
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600/20 border border-indigo-600/40 text-xs font-bold text-indigo-300">1</div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-zinc-200">Download the template</p>
                  <p className="text-xs text-zinc-500 mt-0.5">Fill in Product Name, Qty, and Unit Cost for each item</p>
                  <Button variant="outline" size="sm" className="mt-2 h-7 text-xs" onClick={downloadTemplate}>
                    <Download className="h-3.5 w-3.5 mr-1" />Download Template (CSV)
                  </Button>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600/20 border border-indigo-600/40 text-xs font-bold text-indigo-300">2</div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-zinc-200">Upload your filled CSV file</p>
                  <p className="text-xs text-zinc-500 mt-0.5">Takes you to New Purchase with items already filled in — review GST, MRP, pricing and supplier there, then save</p>
                  <input ref={importFileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleImportFile} />
                  <button
                    type="button"
                    onClick={() => importFileRef.current?.click()}
                    className="mt-2 flex items-center gap-2 rounded-md border border-dashed border-zinc-600 bg-zinc-900 px-4 py-3 text-sm text-zinc-300 hover:border-indigo-500 hover:text-white transition-colors"
                  >
                    <Upload className="h-4 w-4" />Choose CSV file
                  </button>
                </div>
              </div>
            </div>
            {importErrors.length > 0 && (
              <div className="rounded-lg border border-amber-800/50 bg-amber-950/30 p-3 space-y-1">
                <div className="flex items-center gap-2 text-amber-400 text-xs font-medium">
                  <AlertCircle className="h-3.5 w-3.5" />{importErrors.length} row(s) skipped:
                </div>
                {importErrors.map((e, i) => <p key={i} className="text-xs text-amber-500 pl-5">{e}</p>)}
              </div>
            )}
            <p className="text-xs text-zinc-600 text-center">For supplier PDF / image — open the file, manually enter items using New Purchase.</p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowImport(false); setImportErrors([]) }}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── View Purchase Dialog ── */}
      <Dialog open={!!viewPurchase} onOpenChange={(o) => { if (!o) setViewPurchase(null) }}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          {viewLoading
            ? <div className="flex items-center justify-center h-32"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            : viewPurchase && (() => {
              const { purchase, items } = viewPurchase
              const taxableTotal = items.reduce((s, it) => s + (it.taxable_amount ?? 0), 0)
              const cgstTotal = items.reduce((s, it) => s + (it.cgst_amount ?? 0), 0)
              const sgstTotal = items.reduce((s, it) => s + (it.sgst_amount ?? 0), 0)
              const igstTotal = items.reduce((s, it) => s + (it.igst_amount ?? 0), 0)
              const taxTotal = cgstTotal + sgstTotal + igstTotal
              const interstate = igstTotal > 0
              return (
                <>
                  <DialogHeader>
                    <DialogTitle>
                      Purchase Details
                      {purchase.purchase_no && <span className="ml-2 font-mono text-sm text-indigo-300">{purchase.purchase_no}</span>}
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 text-sm">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      <div><span className="text-zinc-500">Date</span><p className="text-zinc-200">{formatDate(purchase.purchase_date ?? purchase.created_at)}</p></div>
                      <div><span className="text-zinc-500">Supplier</span><p className="text-zinc-200">{purchase.suppliers?.name ?? '—'}</p></div>
                      <div><span className="text-zinc-500">Invoice No</span><p className="font-mono text-zinc-200">{purchase.invoice_no ?? '—'}</p></div>
                      <div><span className="text-zinc-500">Purchase Type</span><p className="text-zinc-200 capitalize">{purchase.purchase_type ?? '—'}</p></div>
                      <div className="col-span-2"><span className="text-zinc-500">Notes</span><p className="text-zinc-200">{purchase.notes ?? '—'}</p></div>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-zinc-300">Items</h3>
                      {items.some((it) => it.products?.barcode_value) && (
                        <Button
                          type="button" variant="outline" size="sm" className="h-7 text-xs"
                          onClick={() => {
                            for (const it of items) {
                              if (it.products?.barcode_value) {
                                printBarcodeLabel(it.product_name, it.products.barcode_value, it.products.price ?? it.unit_cost)
                              }
                            }
                          }}
                        >
                          <Printer className="h-3.5 w-3.5 mr-1" />Print All Labels
                        </Button>
                      )}
                    </div>
                    <div className="rounded-lg border border-zinc-800 overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Product Code</TableHead>
                            <TableHead>Product</TableHead>
                            <TableHead className="text-right">GST%</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-right">Unit Cost</TableHead>
                            <TableHead>Barcode</TableHead>
                            <TableHead className="text-right">MRP</TableHead>
                            <TableHead className="text-right">Retail</TableHead>
                            <TableHead className="text-right">SP</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                            <TableHead className="w-[5%]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {items.length === 0
                            ? <TableRow><TableCell colSpan={11} className="text-center text-zinc-500 py-4">No items</TableCell></TableRow>
                            : items.map((it) => (
                              <TableRow key={it.id}>
                                <TableCell className="font-mono text-xs text-zinc-400">{it.products?.sku ?? '—'}</TableCell>
                                <TableCell className="text-zinc-200">{it.product_name}</TableCell>
                                <TableCell className="text-right text-zinc-400">{it.tax_rate}%</TableCell>
                                <TableCell className="text-right text-zinc-400">{it.qty}</TableCell>
                                <TableCell className="text-right text-zinc-400">{formatINR(it.unit_cost)}</TableCell>
                                <TableCell className="font-mono text-xs text-zinc-400">{it.products?.barcode_value ?? '—'}</TableCell>
                                <TableCell className="text-right text-zinc-400">{it.products?.mrp != null ? formatINR(it.products.mrp) : '—'}</TableCell>
                                <TableCell className="text-right text-zinc-400">{it.products?.price != null ? formatINR(it.products.price) : '—'}</TableCell>
                                <TableCell className="text-right text-zinc-400">{it.products?.special_price != null ? formatINR(it.products.special_price) : '—'}</TableCell>
                                <TableCell className="text-right font-medium text-white">{formatINR(it.line_total)}</TableCell>
                                <TableCell>
                                  {it.products?.barcode_value && (
                                    <button
                                      type="button"
                                      title="Print label"
                                      onClick={() => printBarcodeLabel(it.product_name, it.products!.barcode_value!, it.products?.price ?? it.unit_cost)}
                                      className="p-1 rounded text-zinc-500 hover:text-indigo-400 hover:bg-indigo-900/20 transition-colors"
                                    >
                                      <Printer className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </div>

                    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div><span className="text-zinc-500">Taxable Amount</span><p className="text-zinc-200 font-medium">{formatINR(taxableTotal)}</p></div>
                        {interstate ? (
                          <div><span className="text-zinc-500">IGST</span><p className="text-zinc-200 font-medium">{formatINR(igstTotal)}</p></div>
                        ) : (
                          <>
                            <div><span className="text-zinc-500">CGST</span><p className="text-zinc-200 font-medium">{formatINR(cgstTotal)}</p></div>
                            <div><span className="text-zinc-500">SGST</span><p className="text-zinc-200 font-medium">{formatINR(sgstTotal)}</p></div>
                          </>
                        )}
                        <div><span className="text-zinc-500">Tax Total</span><p className="text-zinc-200 font-medium">{formatINR(taxTotal)}</p></div>
                      </div>
                      {(purchase.bill_discount_value ?? 0) > 0 && (
                        <div className="flex justify-between text-zinc-400">
                          <span>Bill Discount</span>
                          <span>{purchase.bill_discount_type === 'percent' ? `${purchase.bill_discount_value}%` : formatINR(purchase.bill_discount_value ?? 0)}</span>
                        </div>
                      )}
                      {(purchase.round_off ?? 0) !== 0 && (
                        <div className="flex justify-between text-zinc-400">
                          <span>Round Off</span>
                          <span>{formatINR(purchase.round_off ?? 0)}</span>
                        </div>
                      )}
                      <Separator />
                      <div className="flex justify-between items-center pt-1">
                        <button onClick={() => setDeleteConfirmId(purchase.id)} className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-red-400 transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />Delete Purchase
                        </button>
                        <div className="flex items-center gap-3">
                          <span className="text-zinc-400">Total Bill Amount</span>
                          <span className="text-lg font-bold text-white">{formatINR(purchase.total_amount)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )
            })()}
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ── */}
      <Dialog open={!!deleteConfirmId} onOpenChange={(o) => { if (!o) setDeleteConfirmId(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Purchase?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This will permanently delete the purchase record and all its items. This cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)}>
              {deleteMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Deleting...</> : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
