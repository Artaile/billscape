import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Loader2, Receipt, Eye, Pencil, Search, X, Download, Upload, FileSpreadsheet, ArrowUpDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { formatINR } from '@billscape/core'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import { logActivity } from '@/lib/activityLog'
import { exportToCSV, parseCSV } from '@/lib/csvUtils'
import { ExpenseFormDialog } from '@/components/expenses/ExpenseFormDialog'
import { ExpenseCategoriesTab } from '@/components/expenses/ExpenseCategoriesTab'
import type { Expense, ExpenseCategory } from '@/components/expenses/types'

export function ExpensesPage() {
  const { org, user, role } = useAuth()
  const orgId = org?.id
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const canManage = role === 'owner' || role === 'manager'

  const [showDialog, setShowDialog] = useState(false)
  const [editTarget, setEditTarget] = useState<Expense | null>(null)
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'direct' | 'indirect'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'unpaid'>('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [sortBy, setSortBy] = useState<'date-newest' | 'date-oldest' | 'amount-desc' | 'amount-asc' | 'category-asc'>('date-newest')
  const [isImporting, setIsImporting] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['expenses', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expenses')
        .select('*, suppliers(name)')
        .eq('organization_id', orgId!)
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as (Expense & { suppliers: { name: string } | null })[]
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (expense: Expense) => {
      const { error } = await supabase.from('expenses').delete().eq('id', expense.id).eq('organization_id', orgId!)
      if (error) throw error

      await logActivity({
        organizationId: orgId!,
        action: 'deleted',
        entity: 'expense',
        entityId: expense.id,
        metadata: {
          description: expense.description,
          amount: expense.amount,
          category: expense.category,
        },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses', orgId] })
      queryClient.invalidateQueries({ queryKey: ['activity_log', orgId] })
      queryClient.invalidateQueries({ queryKey: ['expense_category_counts', orgId] })
      toast.success('Expense deleted')
    },
    onError: (err: Error) => toast.error('Delete failed', err.message),
  })

  const toggleStatusMutation = useMutation({
    mutationFn: async (expense: Expense) => {
      const nextStatus = expense.status === 'paid' ? 'unpaid' : 'paid'
      const { error } = await supabase.from('expenses').update({ status: nextStatus }).eq('id', expense.id).eq('organization_id', orgId!)
      if (error) throw error
      return nextStatus
    },
    onSuccess: (nextStatus) => {
      queryClient.invalidateQueries({ queryKey: ['expenses', orgId] })
      queryClient.invalidateQueries({ queryKey: ['expense-detail', orgId] })
      toast.success(nextStatus === 'paid' ? 'Marked as paid' : 'Marked as unpaid')
    },
    onError: (err: Error) => toast.error('Failed to update status', err.message),
  })

  const { data: allCategories = [] } = useQuery({
    queryKey: ['expense_categories', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expense_categories')
        .select('*')
        .eq('organization_id', orgId!)
        .order('name')
      if (error) throw error
      return (data ?? []) as ExpenseCategory[]
    },
  })

  const filtered = expenses
    .filter((e) => {
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        const matches = e.description?.toLowerCase().includes(q) || e.expense_no?.toLowerCase().includes(q) || e.category?.toLowerCase().includes(q)
        if (!matches) return false
      }
      if (dateFrom && e.expense_date < dateFrom) return false
      if (dateTo && e.expense_date > dateTo) return false
      if (categoryFilter !== 'all' && e.category !== categoryFilter) return false
      if (typeFilter !== 'all' && e.expense_type !== typeFilter) return false
      if (statusFilter !== 'all' && e.status !== statusFilter) return false
      return true
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'date-newest':
          return new Date(b.expense_date || 0).getTime() - new Date(a.expense_date || 0).getTime()
        case 'date-oldest':
          return new Date(a.expense_date || 0).getTime() - new Date(b.expense_date || 0).getTime()
        case 'amount-desc':
          return b.amount - a.amount
        case 'amount-asc':
          return a.amount - b.amount
        case 'category-asc':
          return (a.category || '').localeCompare(b.category || '')
        default:
          return 0
      }
    })

  const handleDownloadTemplate = () => {
    const headers = ['Category', 'Amount (Rs)', 'Description', 'Type', 'Status', 'Expense Date']
    const sampleRows = [
      ['Rent', '15000', 'Shop rent for this month', 'direct', 'paid', new Date().toISOString().split('T')[0]],
      ['Electricity', '3400', 'TNEB power bill', 'indirect', 'paid', new Date().toISOString().split('T')[0]],
    ]
    exportToCSV('expenses_import_template', headers, sampleRows)
  }

  const handleExportCSV = () => {
    const listToExport = filtered.length > 0 ? filtered : expenses
    if (listToExport.length === 0) {
      toast.error('No expenses to export')
      return
    }

    const headers = ['Expense No', 'Category', 'Amount (Rs)', 'Type', 'Status', 'Expense Date', 'Description', 'Supplier']
    const rows = listToExport.map((e) => [
      e.expense_no ?? '',
      e.category ?? 'Uncategorized',
      e.amount,
      (e.expense_type ?? 'direct').toUpperCase(),
      (e.status ?? 'paid').toUpperCase(),
      e.expense_date ? formatDate(e.expense_date) : '',
      e.description ?? '',
      e.suppliers?.name ?? '',
    ])

    exportToCSV(`expenses_export_${new Date().toISOString().split('T')[0]}.csv`, headers, rows)
    toast.success(`Exported ${listToExport.length} expenses`)
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
        const category = row['category'] || row['expense category'] || 'General'
        const rawAmount = row['amount (rs)'] || row['amount'] || '0'
        const amount = parseFloat(rawAmount) || 0
        if (amount <= 0) continue

        const description = row['description'] || row['notes'] || ''
        const rawType = (row['type'] || row['expense type'] || 'direct').toLowerCase()
        const expenseType = rawType === 'indirect' ? 'indirect' : 'direct'
        const rawStatus = (row['status'] || 'paid').toLowerCase()
        const status = rawStatus === 'unpaid' ? 'unpaid' : 'paid'
        const expenseDate = row['expense date'] || row['date'] || new Date().toISOString().split('T')[0]

        await supabase.from('expenses').insert({
          organization_id: orgId,
          created_by: user?.id,
          category,
          amount,
          description,
          expense_type: expenseType,
          status,
          expense_date: expenseDate,
        })
        importedCount++
      }

      await queryClient.invalidateQueries({ queryKey: ['expenses', orgId] })
      await queryClient.invalidateQueries({ queryKey: ['expense_category_counts', orgId] })
      await logActivity({
        organizationId: orgId,
        action: 'imported',
        entity: 'expense',
        metadata: { count: importedCount, filename: file.name },
      })
      toast.success(`Import Complete`, `Successfully imported ${importedCount} expenses!`)
    } catch (err: any) {
      toast.error('Import Failed', err.message || 'Failed to parse CSV file')
    } finally {
      setIsImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const totalAll = expenses.reduce((sum, e) => sum + e.amount, 0)
  const totalPaid = expenses.filter((e) => e.status === 'paid').reduce((sum, e) => sum + e.amount, 0)
  const totalUnpaid = expenses.filter((e) => e.status === 'unpaid').reduce((sum, e) => sum + e.amount, 0)

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Expenses</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track and manage your business expenses</p>
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            <>
              <Button variant="outline" size="sm" onClick={() => setShowImport(true)} disabled={isImporting}>
                {isImporting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Upload className="h-3.5 w-3.5 mr-1 text-indigo-400" />}
                Import CSV
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportCSV}>
                <Download className="h-3.5 w-3.5 mr-1 text-blue-400" /> Export CSV
              </Button>
              <Button onClick={() => { setEditTarget(null); setShowDialog(true) }}>
                <Plus className="h-4 w-4 mr-1" />
                Add Expense
              </Button>
            </>
          )}
        </div>
      </div>

      <Tabs defaultValue="expenses">
        <TabsList>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
        </TabsList>

        <TabsContent value="expenses" className="mt-4 space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
              <span className="text-xs text-red-400">Total Expenses</span>
              <p className="text-2xl font-bold text-red-400 mt-1">{formatINR(totalAll)}</p>
            </div>
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
              <span className="text-xs text-emerald-400">Paid</span>
              <p className="text-2xl font-bold text-emerald-400 mt-1">{formatINR(totalPaid)}</p>
            </div>
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
              <span className="text-xs text-amber-400">Unpaid</span>
              <p className="text-2xl font-bold text-amber-400 mt-1">{formatINR(totalUnpaid)}</p>
            </div>
          </div>

          {/* Filters & Sort */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search expenses..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <ArrowUpDown className="h-3.5 w-3.5 text-indigo-400" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="flex h-9 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 text-foreground"
              >
                <option value="date-newest">Sort: Date (Newest)</option>
                <option value="date-oldest">Sort: Date (Oldest)</option>
                <option value="amount-desc">Sort: Amount (High to Low)</option>
                <option value="amount-asc">Sort: Amount (Low to High)</option>
                <option value="category-asc">Sort: Category (A to Z)</option>
              </select>
            </div>

            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 w-auto" />
            <span className="text-xs text-muted-foreground">to</span>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 w-auto" />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="flex h-9 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Categories</option>
              {allCategories.map((cat) => (
                <option key={cat.id} value={cat.name}>{cat.name}</option>
              ))}
            </select>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
              className="flex h-9 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Types</option>
              <option value="direct">Direct</option>
              <option value="indirect">Indirect</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="flex h-9 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Status</option>
              <option value="paid">Paid</option>
              <option value="unpaid">Unpaid</option>
            </select>
          </div>

          {/* Table */}
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-center">
                <Receipt className="h-8 w-8 text-zinc-600 mb-2" />
                <p className="text-sm text-muted-foreground">No expenses recorded</p>
                <p className="text-xs text-zinc-600 mt-1">Click "Add Expense" to get started</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Expense No</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((exp) => (
                      <TableRow key={exp.id} className="cursor-pointer" onClick={() => navigate(`/expenses/${exp.id}`)}>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{formatDate(exp.expense_date)}</TableCell>
                        <TableCell className="font-mono text-xs text-indigo-300">{exp.expense_no ?? '—'}</TableCell>
                        <TableCell>
                          <p className="text-sm font-medium text-foreground">{exp.description}</p>
                          {exp.suppliers?.name && <p className="text-xs text-muted-foreground mt-0.5">{exp.suppliers.name}</p>}
                          {exp.notes && <p className="text-xs text-muted-foreground mt-0.5 italic">{exp.notes}</p>}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{exp.category}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center rounded-full border border-zinc-700 bg-zinc-800/50 px-2 py-0.5 text-xs font-medium capitalize text-zinc-300">
                            {exp.expense_type}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{exp.payment_mode}</TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {canManage ? (
                            <button
                              type="button"
                              title={exp.status === 'paid' ? 'Click to mark as unpaid' : 'Click to mark as paid'}
                              onClick={() => toggleStatusMutation.mutate(exp)}
                              disabled={toggleStatusMutation.isPending}
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize transition-colors cursor-pointer disabled:opacity-50 ${exp.status === 'paid' ? 'bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25' : 'bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'}`}
                            >
                              {exp.status}
                            </button>
                          ) : (
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${exp.status === 'paid' ? 'bg-indigo-500/15 text-indigo-300' : 'bg-amber-500/15 text-amber-300'}`}>
                              {exp.status}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-foreground">{formatINR(exp.amount)}</TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => navigate(`/expenses/${exp.id}`)}
                              className="p-1.5 rounded text-zinc-500 hover:text-foreground hover:bg-zinc-800 transition-colors"
                              title="View"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            {canManage && (
                              <>
                                <button
                                  onClick={() => { setEditTarget(exp); setShowDialog(true) }}
                                  className="p-1.5 rounded text-zinc-500 hover:text-indigo-400 hover:bg-indigo-400/10 transition-colors"
                                  title="Edit"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => deleteMutation.mutate(exp)}
                                  className="p-1.5 rounded text-zinc-500 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
          {filtered.length > 0 && (
            <p className="text-xs text-muted-foreground">Showing 1 to {filtered.length} of {filtered.length} records</p>
          )}
        </TabsContent>

        <TabsContent value="categories" className="mt-4">
          <ExpenseCategoriesTab />
        </TabsContent>
      </Tabs>

      <ExpenseFormDialog
        open={showDialog}
        onOpenChange={(o) => { setShowDialog(o); if (!o) setEditTarget(null) }}
        editTarget={editTarget}
      />

      {/* Import Expenses Modal */}
      <Dialog open={showImport} onOpenChange={setShowImport}>
        <DialogContent className="max-w-md bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-zinc-100">
              <FileSpreadsheet className="h-5 w-5 text-indigo-400" />
              Import Expenses from CSV
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
                    <p className="text-[11px] text-zinc-400">Sample CSV format with column headers and example expense rows</p>
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
                    <p className="text-[11px] text-zinc-400">Select your completed expense CSV file to batch import records</p>
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
