import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { toast } from '@/hooks/use-toast'
import type { ExpenseCategory } from './types'

export function ExpenseCategoriesTab() {
  const { org, role } = useAuth()
  const orgId = org?.id
  const queryClient = useQueryClient()
  const canManage = role === 'owner' || role === 'manager'

  const [showDialog, setShowDialog] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState<'direct' | 'indirect'>('indirect')

  const { data: categories = [], isLoading } = useQuery({
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

  const { data: expenseCounts = {} } = useQuery({
    queryKey: ['expense_category_counts', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from('expenses').select('category').eq('organization_id', orgId!)
      if (error) throw error
      const counts: Record<string, number> = {}
      for (const row of data ?? []) {
        counts[row.category] = (counts[row.category] ?? 0) + 1
      }
      return counts
    },
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('Category name required')
      const { error } = await supabase.from('expense_categories').insert({
        organization_id: orgId!,
        name: name.trim(),
        type,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense_categories', orgId] })
      toast.success('Category created')
      setName('')
      setType('indirect')
      setShowDialog(false)
    },
    onError: (err: Error) => toast.error('Failed to create category', err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (category: ExpenseCategory) => {
      if ((expenseCounts[category.name] ?? 0) > 0) {
        throw new Error(`Can't delete — ${expenseCounts[category.name]} expense(s) still use this category`)
      }
      const { error } = await supabase.from('expense_categories').delete().eq('id', category.id).eq('organization_id', orgId!)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense_categories', orgId] })
      toast.success('Category deleted')
    },
    onError: (err: Error) => toast.error('Delete failed', err.message),
  })

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <Button onClick={() => setShowDialog(true)}>
            <Plus className="h-4 w-4" />
            Add Category
          </Button>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : categories.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <p className="text-sm text-muted-foreground">No categories yet</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Expenses</TableHead>
                {canManage && <TableHead className="text-right">Action</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((cat) => (
                <TableRow key={cat.id}>
                  <TableCell className="text-sm font-medium text-foreground">{cat.name}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center rounded-full border border-zinc-700 bg-zinc-800/50 px-2 py-0.5 text-xs font-medium capitalize text-zinc-300">
                      {cat.type}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-zinc-800 text-xs text-zinc-300">
                      {expenseCounts[cat.name] ?? 0}
                    </span>
                  </TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      <button
                        onClick={() => deleteMutation.mutate(cat)}
                        className="p-1.5 rounded text-zinc-500 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Expense Category</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Category Name *</Label>
              <Input
                placeholder="e.g., Rent, Electricity, Freight"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Category Type *</Label>
              <Select value={type} onValueChange={(v) => setType(v as 'direct' | 'indirect')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="indirect">Indirect Expense — Operating costs (Rent, Salary, etc.)</SelectItem>
                  <SelectItem value="direct">Direct Expense — Costs tied directly to goods sold</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              {createMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" />Creating...</> : 'Create Category'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
