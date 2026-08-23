import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Truck, Phone, Mail, Search, X, Download, Upload, FileSpreadsheet, ArrowUpDown, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  DialogDescription,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/hooks/use-toast'
import { formatDate } from '@/lib/utils'
import { logActivity } from '@/lib/activityLog'
import { exportToCSV, parseCSV } from '@/lib/csvUtils'
import { SupplierFormDialog, type SupplierOption } from '@/components/suppliers/SupplierFormDialog'

interface Supplier extends SupplierOption {
  organization_id: string
  created_at: string
  state_code?: string | null
}

export function SuppliersPage() {
  const { org } = useAuth()
  const orgId = org?.id
  const queryClient = useQueryClient()

  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<Supplier | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null)
  const [search, setSearch] = useState('')

  const [sortBy, setSortBy] = useState<'name-asc' | 'name-desc' | 'date-newest' | 'date-oldest'>('name-asc')
  const [gstFilter, setGstFilter] = useState('all')
  const [isImporting, setIsImporting] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: suppliers, isLoading } = useQuery({
    queryKey: ['suppliers', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .eq('organization_id', orgId!)
        .order('name')
      if (error) throw error
      return (data ?? []) as Supplier[]
    },
  })

  const filteredSuppliers = (suppliers ?? [])
    .filter((s) => {
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        const matchSearch =
          s.name.toLowerCase().includes(q) ||
          (s.phone ?? '').toLowerCase().includes(q) ||
          (s.gstin ?? '').toLowerCase().includes(q)
        if (!matchSearch) return false
      }
      if (gstFilter === 'with-gst' && !s.gstin) return false
      if (gstFilter === 'without-gst' && s.gstin) return false
      return true
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'name-asc':
          return a.name.localeCompare(b.name)
        case 'name-desc':
          return b.name.localeCompare(a.name)
        case 'date-newest':
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        case 'date-oldest':
          return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
        default:
          return 0
      }
    })

  const handleDownloadTemplate = () => {
    const headers = ['Name', 'Phone', 'Email', 'GSTIN', 'State Code', 'Address']
    const sampleRows = [
      ['Apex Distributors', '9876543210', 'apex@example.com', '33ABCDE1234F1Z5', 'TN', '12 Industrial Estate, Chennai'],
      ['Balaji Wholesalers', '9123456789', 'balaji@example.com', '', 'TN', '45 Main Market, Madurai'],
    ]
    exportToCSV('suppliers_import_template', headers, sampleRows)
  }

  const handleExportCSV = () => {
    const listToExport = filteredSuppliers.length > 0 ? filteredSuppliers : (suppliers ?? [])
    if (listToExport.length === 0) {
      toast.error('No suppliers to export')
      return
    }

    const headers = ['Name', 'Phone', 'Email', 'GSTIN', 'State Code', 'Address', 'Created Date']
    const rows = listToExport.map((s) => [
      s.name,
      s.phone ?? '',
      s.email ?? '',
      s.gstin ?? '',
      s.state_code ?? '',
      s.address ?? '',
      formatDate(s.created_at),
    ])

    exportToCSV(`suppliers_export_${new Date().toISOString().split('T')[0]}.csv`, headers, rows)
    toast.success(`Exported ${listToExport.length} suppliers`)
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !orgId) return
    setIsImporting(true)
    try {
      const records = await parseCSV(file)
      if (!records.length) {
        toast.error('Import Failed', 'CSV file is empty or invalid format')
        return
      }

      let importedCount = 0
      for (const row of records) {
        const name = row['name'] || row['supplier name'] || row['party name'] || ''
        if (!name.trim()) continue

        const rawPhone = row['phone'] || row['mobile'] || row['phone number'] || ''
        const phoneDigits = rawPhone.replace(/\D/g, '').slice(0, 10)
        const email = row['email'] || row['email address'] || ''
        const gstin = row['gstin'] || row['gst'] || ''
        const stateCode = row['state code'] || row['state'] || ''
        const address = row['address'] || ''

        await supabase.from('suppliers').insert({
          organization_id: orgId,
          name: name.trim(),
          phone: phoneDigits || null,
          email: email.trim() || null,
          gstin: gstin.trim().toUpperCase() || null,
          state_code: stateCode.trim().toUpperCase() || null,
          address: address.trim() || null,
        })
        importedCount++
      }

      await queryClient.invalidateQueries({ queryKey: ['suppliers', orgId] })
      await logActivity({
        organizationId: orgId,
        action: 'imported',
        entity: 'supplier',
        metadata: { count: importedCount, filename: file.name },
      })
      toast.success(`Import Complete`, `Successfully imported ${importedCount} suppliers!`)
    } catch (err: any) {
      toast.error('Import Failed', err.message || 'Failed to parse CSV file')
    } finally {
      setIsImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function openAdd() {
    setEditTarget(null)
    setShowForm(true)
  }

  function openEdit(supplier: Supplier) {
    setEditTarget(supplier)
    setShowForm(true)
  }

  const deleteMutation = useMutation({
    mutationFn: async (supplier: Supplier) => {
      const { count } = await supabase
        .from('purchases')
        .select('id', { count: 'exact', head: true })
        .eq('supplier_id', supplier.id)
        .eq('organization_id', orgId!)

      if ((count ?? 0) > 0) {
        throw new Error(`This supplier has ${count} purchase(s) recorded. Remove those purchases first or keep the supplier.`)
      }

      const { error } = await supabase
        .from('suppliers')
        .delete()
        .eq('id', supplier.id)
        .eq('organization_id', orgId!)
      if (error) throw error

      await logActivity({
        organizationId: orgId!,
        action: 'deleted',
        entity: 'supplier',
        entityId: supplier.id,
        metadata: {
          name: supplier.name,
          phone: supplier.phone,
          gstin: supplier.gstin,
        },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers', orgId] })
      queryClient.invalidateQueries({ queryKey: ['activity_log', orgId] })
      toast.success('Supplier deleted')
      setDeleteTarget(null)
    },
    onError: (err: Error) => {
      toast.error('Cannot delete supplier', err.message)
      setDeleteTarget(null)
    },
  })

  return (
    <div className="p-4 lg:p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Suppliers</h1>
          <p className="text-sm text-zinc-400 mt-0.5">{suppliers?.length ?? 0} suppliers</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowImport(true)} disabled={isImporting}>
            {isImporting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Upload className="h-3.5 w-3.5 mr-1 text-indigo-400" />}
            Import CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="h-3.5 w-3.5 mr-1 text-blue-400" /> Export CSV
          </Button>
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4 mr-1" /> Add Supplier
          </Button>
        </div>
      </div>

      {/* Filters & Sort Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, phone or GSTIN..."
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

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ArrowUpDown className="h-3.5 w-3.5 text-indigo-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="flex h-9 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 text-foreground"
            >
              <option value="name-asc">Sort: Name (A to Z)</option>
              <option value="name-desc">Sort: Name (Z to A)</option>
              <option value="date-newest">Sort: Created (Newest)</option>
              <option value="date-oldest">Sort: Created (Oldest)</option>
            </select>
          </div>

          <select
            value={gstFilter}
            onChange={(e) => setGstFilter(e.target.value)}
            className="flex h-9 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 text-foreground"
          >
            <option value="all">All GST Status</option>
            <option value="with-gst">With GSTIN</option>
            <option value="without-gst">Without GSTIN</option>
          </select>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>GSTIN</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 bg-zinc-800 rounded animate-pulse" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : filteredSuppliers.length > 0 ? (
              filteredSuppliers.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-700 text-xs font-bold text-white">
                        {s.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-zinc-100">{s.name}</p>
                        {s.address && (
                          <p className="text-[11px] text-zinc-500 truncate max-w-[200px]">{s.address}</p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {s.phone ? (
                      <span className="flex items-center gap-1.5 text-sm text-zinc-400">
                        <Phone className="h-3 w-3" />
                        {s.phone}
                      </span>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {s.email ? (
                      <span className="flex items-center gap-1.5 text-sm text-zinc-400">
                        <Mail className="h-3 w-3" />
                        {s.email}
                      </span>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {s.gstin ? (
                      <Badge variant="secondary" className="font-mono text-[11px]">
                        {s.gstin}
                      </Badge>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-zinc-400 hover:text-white"
                        onClick={() => openEdit(s)}
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/20"
                        onClick={() => setDeleteTarget(s)}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-16">
                  <div className="flex flex-col items-center gap-3 text-zinc-500">
                    <Truck className="h-10 w-10 text-zinc-700" />
                    <p className="text-sm">
                      {suppliers && suppliers.length > 0
                        ? 'No suppliers match your search.'
                        : 'No suppliers yet. Add one to start recording purchases.'}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add / Edit Dialog */}
      <SupplierFormDialog
        open={showForm}
        onOpenChange={setShowForm}
        orgId={orgId ?? ''}
        editTarget={editTarget}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ['suppliers', orgId] })}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Supplier</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{' '}
              <span className="font-semibold text-zinc-200">{deleteTarget?.name}</span>?
              {' '}If this supplier has purchases recorded, deletion will be blocked.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Suppliers Modal */}
      <Dialog open={showImport} onOpenChange={setShowImport}>
        <DialogContent className="max-w-md bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-zinc-100">
              <FileSpreadsheet className="h-5 w-5 text-indigo-400" />
              Import Suppliers from CSV
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Step 1 */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3.5">
              <div className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-semibold text-indigo-400">
                  1
                </span>
                <div className="space-y-2 flex-1">
                  <div>
                    <p className="text-xs font-semibold text-zinc-200">Download the template</p>
                    <p className="text-[11px] text-zinc-400">Sample CSV format with column headers and example supplier rows</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadTemplate}
                    className="w-full text-xs gap-1.5 border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
                  >
                    <Download className="h-3.5 w-3.5 text-emerald-400" />
                    Download Template (CSV)
                  </Button>
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3.5">
              <div className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-semibold text-indigo-400">
                  2
                </span>
                <div className="space-y-2 flex-1">
                  <div>
                    <p className="text-xs font-semibold text-zinc-200">Upload your filled CSV file</p>
                    <p className="text-[11px] text-zinc-400">Select your completed supplier CSV file to batch import records</p>
                  </div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => {
                      handleFileChange(e)
                      setShowImport(false)
                    }}
                    accept=".csv"
                    className="hidden"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isImporting}
                    className="w-full text-xs gap-1.5 border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
                  >
                    {isImporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 text-indigo-400" />}
                    Choose CSV file
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setShowImport(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
