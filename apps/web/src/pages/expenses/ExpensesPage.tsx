import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Loader2, Receipt, TrendingDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { formatINR } from '@billscape/core'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { toast } from '@/hooks/use-toast'
import { formatDateTime } from '@/lib/utils'

const CATEGORIES = [
  'Rent',
  'Salary',
  'Electricity',
  'Water',
  'Internet',
  'Transport',
  'Packaging',
  'Maintenance',
  'Marketing',
  'Miscellaneous',
]

const CATEGORY_COLORS: Record<string, string> = {
  Rent: 'bg-red-500/10 text-red-400 border-red-500/20',
  Salary: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  Electricity: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  Water: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  Internet: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  Transport: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  Packaging: 'bg-green-500/10 text-green-400 border-green-500/20',
  Maintenance: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
  Marketing: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  Miscellaneous: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
}



interface Expense {
  id: string
  description: string
  amount: number
  category: string
  expense_date: string
  notes: string | null
  created_at: string
}

export function ExpensesPage() {
  const { org } = useAuth()
  const orgId = org?.id
  const queryClient = useQueryClient()

  const [showDialog, setShowDialog] = useState(false)
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('Miscellaneous')
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [filterCategory, setFilterCategory] = useState('All')

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['expenses', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('organization_id', orgId!)
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Expense[]
    },
  })

  const addMutation = useMutation({
    mutationFn: async () => {
      const amt = parseFloat(amount)
      if (!description.trim()) throw new Error('Description required')
      if (isNaN(amt) || amt <= 0) throw new Error('Enter a valid amount')

      const { error } = await supabase.from('expenses').insert({
        organization_id: orgId!,
        description: description.trim(),
        amount: amt,
        category,
        expense_date: expenseDate,
        notes: notes.trim() || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses', orgId] })
      toast.success('Expense added')
      resetForm()
      setShowDialog(false)
    },
    onError: (err: Error) => toast.error('Failed to add expense', err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('expenses').delete().eq('id', id).eq('organization_id', orgId!)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses', orgId] })
      toast.success('Expense deleted')
    },
    onError: (err: Error) => toast.error('Delete failed', err.message),
  })

  const resetForm = () => {
    setDescription('')
    setAmount('')
    setCategory('Miscellaneous')
    setExpenseDate(new Date().toISOString().split('T')[0])
    setNotes('')
  }

  const filtered = filterCategory === 'All' ? expenses : expenses.filter((e) => e.category?.toLowerCase() === filterCategory.toLowerCase())
  const totalThisMonth = expenses.filter((e) => {
    const d = new Date(e.expense_date)
    const now = new Date()
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).reduce((sum, e) => sum + e.amount, 0)

  const totalAll = expenses.reduce((sum, e) => sum + e.amount, 0)

  const categoryTotals = CATEGORIES.map((cat) => ({
    cat,
    total: expenses.filter((e) => e.category?.toLowerCase() === cat.toLowerCase()).reduce((s, e) => s + e.amount, 0),
  })).filter((c) => c.total > 0).sort((a, b) => b.total - a.total)

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Expenses</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track your daily business expenses</p>
        </div>
        <Button onClick={() => setShowDialog(true)}>
          <Plus className="h-4 w-4" />
          Add Expense
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="h-4 w-4 text-red-400" />
            <span className="text-xs text-muted-foreground">This Month</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{formatINR(totalThisMonth)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Receipt className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Total Expenses</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{formatINR(totalAll)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Receipt className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Total Records</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{expenses.length}</p>
        </div>
      </div>

      {/* Category breakdown */}
      {categoryTotals.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm font-medium text-foreground mb-3">By Category</p>
          <div className="flex flex-wrap gap-2">
            {categoryTotals.map(({ cat, total }) => (
              <div
                key={cat}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs cursor-pointer transition-all ${CATEGORY_COLORS[cat] ?? 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'} ${filterCategory === cat ? 'ring-2 ring-primary' : ''}`}
                onClick={() => setFilterCategory(filterCategory === cat ? 'All' : cat)}
              >
                <span className="font-medium">{cat}</span>
                <span className="opacity-70">{formatINR(total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setFilterCategory('All')}
          className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${filterCategory === 'All' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}
        >
          All
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setFilterCategory(filterCategory === cat ? 'All' : cat)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${filterCategory === cat ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}
          >
            {cat}
          </button>
        ))}
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((exp) => (
                <TableRow key={exp.id}>
                  <TableCell>
                    <p className="text-sm font-medium text-foreground">{exp.description}</p>
                    {exp.notes && <p className="text-xs text-muted-foreground mt-0.5">{exp.notes}</p>}
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${getCategoryColor(exp.category)}`}>
                      {exp.category}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(exp.expense_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </TableCell>
                  <TableCell className="text-right font-semibold text-foreground">
                    {formatINR(exp.amount)}
                  </TableCell>
                  <TableCell className="text-right">
                    <button
                      onClick={() => deleteMutation.mutate(exp.id)}
                      className="p-1.5 rounded text-zinc-500 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Add Expense Dialog */}
      <Dialog open={showDialog} onOpenChange={(o) => { setShowDialog(o); if (!o) resetForm() }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Expense</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Description *</Label>
              <Input
                placeholder="e.g. Monthly shop rent"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Amount (₹) *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Input
                placeholder="Any additional details..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowDialog(false); resetForm() }}>Cancel</Button>
            <Button onClick={() => addMutation.mutate()} disabled={addMutation.isPending}>
              {addMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" />Adding...</> : 'Add Expense'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
