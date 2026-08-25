import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Eye, ShoppingBag, Trash2, Loader2, Pencil,
  Upload, Download, FileSpreadsheet, AlertCircle, FileClock, Play, X,
  CreditCard, CheckCircle2, TrendingUp, Clock, Search,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { formatINR } from '@billscape/core'
import { recordPurchasePayment, getPurchasePayments, type PurchasePayment } from '@billscape/api'
import { formatDate } from '@/lib/utils'
import { getPurchaseDrafts, savePurchaseDrafts, type PurchaseDraft } from '@/lib/purchaseDrafts'
import { logActivity } from '@/lib/activityLog'
import { exportToCSV } from '@/lib/csvUtils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { DateRangeFilter } from '@/components/ui/date-range-filter'
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
  supplier_id: string | null
  suppliers: { name: string } | null
  purchase_items: { id: string }[]
}

interface Supplier { id: string; name: string; phone: string | null; gstin: string | null }

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

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // Payment Recording State
  const [paymentTarget, setPaymentTarget] = useState<Purchase | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payMode, setPayMode] = useState('bank_transfer')
  const [payRef, setPayRef] = useState('')
  const [payNotes, setPayNotes] = useState('')

  // Import state
  const [showImport, setShowImport] = useState(false)
  const [importErrors, setImportErrors] = useState<string[]>([])
  const importFileRef = useRef<HTMLInputElement>(null)

  // Draft purchases (client-side, sessionStorage — see purchaseDrafts.ts)
  const [drafts, setDrafts] = useState<PurchaseDraft[]>(() => getPurchaseDrafts())
  const [showDrafts, setShowDrafts] = useState(false)

  // Search + filters
  const [search, setSearch] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  function deleteDraft(id: string) {
    const next = drafts.filter((d) => d.id !== id)
    savePurchaseDrafts(next)
    setDrafts(next)
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: purchases, isLoading } = useQuery({
    queryKey: ['purchases', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchases')
        .select('id, purchase_no, invoice_no, total_amount, notes, created_at, supplier_id, suppliers(name), purchase_items(id)')
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

  const { data: paymentSummaries } = useQuery({
    queryKey: ['purchase_payment_summaries', orgId, purchases?.map((p) => p.id).join(',')],
    enabled: !!orgId && !!purchases && purchases.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_payments')
        .select('purchase_id, amount')
        .eq('organization_id', orgId!)
        .in('purchase_id', purchases!.map((p) => p.id))
      if (error) throw error
      const paidByPurchase = new Map<string, number>()
      for (const row of data ?? []) {
        paidByPurchase.set(row.purchase_id, (paidByPurchase.get(row.purchase_id) ?? 0) + row.amount)
      }
      return paidByPurchase
    },
  })

  function paymentInfoFor(p: Purchase): { paidAmount: number; balanceDue: number; status: 'paid' | 'partial' | 'pending' } {
    const paidAmount = paymentSummaries?.get(p.id) ?? 0
    const total = p.total_amount || 0
    const balanceDue = Math.max(0, total - paidAmount)
    const status: 'paid' | 'partial' | 'pending' = balanceDue <= 0 ? 'paid' : paidAmount > 0 ? 'partial' : 'pending'
    return { paidAmount, balanceDue, status }
  }

  const { data: targetPaymentHistory } = useQuery({
    queryKey: ['purchase_payments', paymentTarget?.id],
    enabled: !!paymentTarget && !!orgId,
    queryFn: async () => {
      const { data, error } = await getPurchasePayments(supabase, orgId!, paymentTarget!.id)
      if (error) throw error
      return data
    },
  })

  const filteredPurchases = (purchases ?? []).filter((p) => {
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      const matchesSearch =
        (p.purchase_no ?? '').toLowerCase().includes(q) ||
        (p.invoice_no ?? '').toLowerCase().includes(q) ||
        (p.suppliers?.name ?? '').toLowerCase().includes(q)
      if (!matchesSearch) return false
    }
    if (supplierFilter && p.supplier_id !== supplierFilter) return false
    if (dateFrom && new Date(p.created_at) < new Date(dateFrom)) return false
    if (dateTo && new Date(p.created_at) >= new Date(new Date(dateTo).getTime() + 86400000)) return false
    return true
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
    },
    onError: (err: Error) => toast.error('Delete failed', err.message),
  })

  const recordPaymentMutation = useMutation({
    mutationFn: async ({
      purchase,
      amount,
      mode,
      reference,
      notes,
    }: {
      purchase: Purchase
      amount: number
      mode: string
      reference?: string
      notes?: string
    }) => {
      const { error } = await recordPurchasePayment(supabase, {
        organization_id: orgId!,
        purchase_id: purchase.id,
        amount,
        mode,
        reference,
        notes,
        created_by: user!.id,
      })
      if (error) throw error

      await logActivity({
        organizationId: orgId!,
        action: 'payment_out',
        entity: 'purchase',
        entityId: purchase.id,
        metadata: {
          purchase_no: purchase.purchase_no,
          supplier: purchase.suppliers?.name,
          amount_paid: amount,
          mode,
          reference,
        },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase_payment_summaries', orgId] })
      queryClient.invalidateQueries({ queryKey: ['purchase_payments', paymentTarget?.id] })
      queryClient.invalidateQueries({ queryKey: ['activity_log', orgId] })
      toast.success('Payment recorded successfully')
      setPaymentTarget(null)
      setPayAmount('')
      setPayRef('')
      setPayNotes('')
    },
    onError: (err: Error) => toast.error('Failed to record payment', err.message),
  })

  const deletePaymentMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      const { error } = await supabase
        .from('purchase_payments')
        .delete()
        .eq('id', paymentId)
        .eq('organization_id', orgId!)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase_payment_summaries', orgId] })
      queryClient.invalidateQueries({ queryKey: ['purchase_payments', paymentTarget?.id] })
      toast.success('Payment entry removed')
    },
    onError: (err: Error) => toast.error('Failed to remove payment', err.message),
  })

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

  const handleExportCSV = () => {
    const listToExport = filteredPurchases.length > 0 ? filteredPurchases : (purchases ?? [])
    if (listToExport.length === 0) {
      toast.error('No purchase records to export')
      return
    }

    const headers = [
      'Purchase No',
      'Invoice No',
      'Supplier',
      'Date',
      'Total Amount (Rs)',
      'Paid Amount (Rs)',
      'Balance Due (Rs)',
      'Payment Status',
      'Items Count',
      'Notes',
    ]

    const rows = listToExport.map((p) => {
      const pay = parsePurchasePayment(p)
      const cleanNotes = (p.notes || '').replace(/\[PAYMENT:\s*\{.*?\}\s*\]/g, '').trim()
      return [
        p.purchase_no ?? '',
        p.invoice_no ?? '',
        p.suppliers?.name ?? 'Walk-in',
        formatDate(p.created_at),
        p.total_amount || 0,
        pay.paidAmount,
        pay.balanceDue,
        pay.status.toUpperCase(),
        p.purchase_items?.length ?? 0,
        cleanNotes,
      ]
    })

    exportToCSV(`purchases_export_${new Date().toISOString().split('T')[0]}.csv`, headers, rows)
    toast.success(`Exported ${listToExport.length} purchase records`)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  // ── Totals Calculation ──
  const summary = (purchases ?? []).reduce(
    (acc, p) => {
      const pay = paymentInfoFor(p)
      acc.totalAmount += p.total_amount || 0
      acc.totalPaid += pay.paidAmount
      acc.totalDue += pay.balanceDue
      if (pay.status === 'paid') acc.paidCount++
      else if (pay.status === 'partial') acc.partialCount++
      else acc.pendingCount++
      return acc
    },
    { totalAmount: 0, totalPaid: 0, totalDue: 0, paidCount: 0, partialCount: 0, pendingCount: 0 },
  )

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Purchases</h1>
          <p className="text-sm text-zinc-400 mt-0.5">{purchases?.length ?? 0} bills recorded</p>
        </div>
        <div className="flex gap-2">
          {drafts.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => { setDrafts(getPurchaseDrafts()); setShowDrafts(true) }}
              className="text-amber-400 relative">
              <FileClock className="h-4 w-4" />
              Drafts
              <span className="ml-1 rounded-full bg-amber-500 text-white text-[9px] px-1.5 py-0.5 font-bold">
                {drafts.length}
              </span>
            </Button>
          )}
          <Button variant="outline" onClick={handleExportCSV}>
            <Download className="h-4 w-4 mr-1" />Export CSV
          </Button>
          <Button variant="outline" onClick={() => { setImportErrors([]); setShowImport(true) }}>
            <Upload className="h-4 w-4 mr-1" />Import CSV
          </Button>
          <Button onClick={() => navigate('/purchases/new')}>
            <Plus className="h-4 w-4" />New Purchase
          </Button>
        </div>
      </div>

      {/* ── KPI Summary Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <ShoppingBag className="h-4 w-4 text-indigo-400" />
            <span className="text-xs text-muted-foreground">Total Purchases</span>
          </div>
          <p className="text-2xl font-bold text-white">{formatINR(summary.totalAmount)}</p>
          <p className="text-xs text-muted-foreground mt-1">{purchases?.length ?? 0} total bills</p>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <span className="text-xs text-muted-foreground">Total Paid (Settled)</span>
          </div>
          <p className="text-2xl font-bold text-emerald-400">{formatINR(summary.totalPaid)}</p>
          <p className="text-xs text-muted-foreground mt-1">{summary.paidCount} bills fully settled</p>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-4 w-4 text-amber-400" />
            <span className="text-xs text-muted-foreground">Balance Due (Payable)</span>
          </div>
          <p className="text-2xl font-bold text-amber-400">{formatINR(summary.totalDue)}</p>
          <p className="text-xs text-muted-foreground mt-1">{summary.pendingCount + summary.partialCount} pending/partial bills</p>
        </div>
      </div>

      {/* ── Search + Filters ── */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search purchase no, invoice no, supplier..."
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
          value={supplierFilter}
          onChange={(e) => setSupplierFilter(e.target.value)}
          className="h-9 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All Suppliers</option>
          {suppliers?.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <DateRangeFilter
          from={dateFrom}
          to={dateTo}
          onChange={(f, t) => { setDateFrom(f); setDateTo(t) }}
        />
        {(search || supplierFilter || dateFrom || dateTo) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setSearch(''); setSupplierFilter(''); setDateFrom(''); setDateTo('') }}
          >
            <X className="h-3.5 w-3.5 mr-1" />Clear
          </Button>
        )}
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
                <TableHead className="text-right">Total Amount</TableHead>
                <TableHead>Payment Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPurchases.length > 0 ? filteredPurchases.map((p) => {
                const pay = paymentInfoFor(p)
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs text-indigo-300 whitespace-nowrap">
                      {p.purchase_no ?? <span className="text-zinc-600">—</span>}
                    </TableCell>
                    <TableCell className="text-zinc-400 text-sm whitespace-nowrap">{formatDate(p.created_at)}</TableCell>
                    <TableCell className="font-medium text-zinc-100">
                      {p.suppliers?.name ?? <span className="text-zinc-500 italic">No supplier</span>}
                    </TableCell>
                    <TableCell className="font-mono text-sm text-zinc-300">{p.invoice_no ?? <span className="text-zinc-600">—</span>}</TableCell>
                    <TableCell className="text-right font-semibold text-white">{formatINR(p.total_amount)}</TableCell>
                    <TableCell>
                      {pay.status === 'paid' ? (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-xs">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Paid
                        </Badge>
                      ) : pay.status === 'partial' ? (
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-xs">
                          Due: {formatINR(pay.balanceDue)}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/20 text-xs">
                          Due: {formatINR(pay.balanceDue)}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {pay.balanceDue > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-amber-400 hover:text-amber-300 hover:bg-amber-400/10"
                            onClick={() => {
                              setPaymentTarget(p)
                              setPayAmount(String(pay.balanceDue))
                            }}
                          >
                            <CreditCard className="h-3.5 w-3.5 mr-1" />Pay
                          </Button>
                        )}
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-zinc-400 hover:text-white" onClick={() => navigate(`/purchases/${p.id}`)}>
                            <Eye className="h-3.5 w-3.5 mr-1" />View
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-zinc-400 hover:text-white" onClick={() => navigate(`/purchases/${p.id}/edit`)}>
                            <Pencil className="h-3.5 w-3.5 mr-1" />Edit
                          </Button>
                          <button onClick={() => setDeleteConfirmId(p.id)} className="p-1.5 rounded text-zinc-500 hover:text-red-400 hover:bg-red-400/10 transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              }) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-16">
                    <div className="flex flex-col items-center gap-3 text-zinc-500">
                      <ShoppingBag className="h-10 w-10 text-zinc-700" />
                      <p className="text-sm">
                        {purchases && purchases.length > 0
                          ? 'No purchases match your search or filters.'
                          : 'No purchases yet. Click New Purchase to record stock received.'}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>

      {/* ── Drafts List Dialog ── */}
      <Dialog open={showDrafts} onOpenChange={setShowDrafts}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileClock className="h-4 w-4 text-amber-400" /> Draft Purchases ({drafts.length})
            </DialogTitle>
          </DialogHeader>
          {drafts.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-6">No draft purchases</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {drafts.map((draft) => (
                <div key={draft.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-3 gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{draft.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {draft.rows.length} item{draft.rows.length === 1 ? '' : 's'}
                      {' · '}
                      {new Date(draft.savedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      {' '}
                      {new Date(draft.savedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <Button size="sm" className="h-7 text-xs"
                      onClick={() => { setShowDrafts(false); navigate('/purchases/new', { state: { draftId: draft.id } }) }}>
                      <Play className="h-3 w-3" /> Resume
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-400"
                      onClick={() => deleteDraft(draft.id)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

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

      {/* ── Record Payment Dialog ── */}
      <Dialog open={!!paymentTarget} onOpenChange={(o) => { if (!o) setPaymentTarget(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-amber-400" />
              Record Outward Payment
            </DialogTitle>
          </DialogHeader>
          {paymentTarget && (() => {
            const pay = paymentInfoFor(paymentTarget)
            return (
              <div className="space-y-4 py-2">
                {/* Bill Summary */}
                <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Purchase Bill:</span>
                    <span className="font-semibold text-foreground">{paymentTarget.purchase_no || paymentTarget.invoice_no || 'Bill'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Supplier:</span>
                    <span className="font-medium text-foreground">{paymentTarget.suppliers?.name || '—'}</span>
                  </div>
                  <Separator className="my-1" />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Bill Amount:</span>
                    <span className="font-medium text-foreground">{formatINR(paymentTarget.total_amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Already Paid:</span>
                    <span className="font-medium text-emerald-400">{formatINR(pay.paidAmount)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold">
                    <span className="text-amber-400">Balance Due:</span>
                    <span className="text-amber-400">{formatINR(pay.balanceDue)}</span>
                  </div>
                </div>

                {/* Payment Form */}
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="pay-amt">Payment Amount (₹) *</Label>
                    <Input
                      id="pay-amt"
                      type="number"
                      step="any"
                      placeholder="0.00"
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      autoFocus
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="pay-mode">Payment Mode</Label>
                      <select
                        id="pay-mode"
                        value={payMode}
                        onChange={(e) => setPayMode(e.target.value)}
                        className="flex h-9 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="bank_transfer">Bank Transfer / NEFT</option>
                        <option value="upi">UPI / QR</option>
                        <option value="cash">Cash</option>
                        <option value="card">Debit / Credit Card</option>
                        <option value="cheque">Cheque</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="pay-ref">Reference No</Label>
                      <Input
                        id="pay-ref"
                        placeholder="UTR / Txn ID"
                        value={payRef}
                        onChange={(e) => setPayRef(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="pay-notes">Notes</Label>
                    <Input
                      id="pay-notes"
                      placeholder="Optional remarks"
                      value={payNotes}
                      onChange={(e) => setPayNotes(e.target.value)}
                    />
                  </div>
                </div>

                {/* Previous Payments List */}
                {targetPaymentHistory && targetPaymentHistory.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-border">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Payment History ({targetPaymentHistory.length})</p>
                    <div className="space-y-1 max-h-24 overflow-y-auto">
                      {targetPaymentHistory.map((p: PurchasePayment) => (
                        <div key={p.id} className="flex items-center justify-between text-xs text-zinc-400 py-0.5">
                          <span>{new Date(p.paid_at).toLocaleDateString('en-IN')} • {p.mode.toUpperCase()} {p.reference ? `(${p.reference})` : ''}</span>
                          <span className="flex items-center gap-2">
                            <span className="font-semibold text-emerald-400">{formatINR(p.amount)}</span>
                            <button
                              type="button"
                              title="Remove this payment entry"
                              onClick={() => deletePaymentMutation.mutate(p.id)}
                              disabled={deletePaymentMutation.isPending}
                              className="text-zinc-600 hover:text-red-400 transition-colors disabled:opacity-50"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentTarget(null)}>Cancel</Button>
            <Button
              onClick={() => {
                const amt = parseFloat(payAmount)
                if (isNaN(amt) || amt <= 0) {
                  toast.error('Invalid amount', 'Please enter a valid positive payment amount')
                  return
                }
                if (paymentTarget) {
                  const balanceDue = paymentInfoFor(paymentTarget).balanceDue
                  if (amt > balanceDue) {
                    toast.error(
                      'Amount exceeds balance due',
                      `Balance due is ${formatINR(balanceDue)} — remove the extra payment entry from history if you enter this in error.`,
                    )
                    return
                  }
                  recordPaymentMutation.mutate({
                    purchase: paymentTarget,
                    amount: amt,
                    mode: payMode,
                    reference: payRef.trim(),
                    notes: payNotes.trim(),
                  })
                }
              }}
              disabled={recordPaymentMutation.isPending}
            >
              {recordPaymentMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Recording...</> : 'Record Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
