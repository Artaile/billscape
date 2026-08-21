import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Loader2, Receipt, Eye, Pencil, Search, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { formatINR } from '@billscape/core'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { toast } from '@/hooks/use-toast'
import { logActivity } from '@/lib/activityLog'
import { ExpenseFormDialog } from '@/components/expenses/ExpenseFormDialog'
import { ExpenseCategoriesTab } from '@/components/expenses/ExpenseCategoriesTab'
import type { Expense, ExpenseCategory } from '@/components/expenses/types'

export function ExpensesPage() {
  const { org, role } = useAuth()
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

  const filtered = expenses.filter((e) => {
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
        {canManage && (
          <Button onClick={() => { setEditTarget(null); setShowDialog(true) }}>
            <Plus className="h-4 w-4" />
            Add Expense
          </Button>
        )}
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

          {/* Filters */}
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
    </div>
  )
}
