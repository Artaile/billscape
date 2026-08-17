import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, Loader2, Pencil, Plus, Search, Tag, Trash2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { formatINR } from '@billscape/core'
import {
  getCategoriesWithStock,
  createCategory,
  updateCategory,
  deleteCategory,
} from '@billscape/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

const SWATCHES = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6', '#14b8a6']

interface CategoryRow {
  id: string
  name: string
  color: string | null
  product_count: number
  total_stock: number
  stock_value: number
}

export function CategoriesPage() {
  const navigate = useNavigate()
  const { org } = useAuth()
  const orgId = org?.id
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(SWATCHES[0])
  const [editTarget, setEditTarget] = useState<CategoryRow | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<CategoryRow | null>(null)

  const { data: categories, isLoading } = useQuery({
    queryKey: ['categories-with-stock', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await getCategoriesWithStock(supabase, orgId!)
      if (error) throw error
      return (data ?? []) as CategoryRow[]
    },
  })

  const filtered = (categories ?? []).filter((c) =>
    !search.trim() || c.name.toLowerCase().includes(search.trim().toLowerCase())
  )

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['categories-with-stock', orgId] })
    queryClient.invalidateQueries({ queryKey: ['categories', orgId] })
    queryClient.invalidateQueries({ queryKey: ['products', orgId] })
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await createCategory(supabase, {
        organization_id: orgId!,
        name: newName.trim(),
        color: newColor,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Category created')
      setNewName('')
      setShowAdd(false)
      invalidateAll()
    },
    onError: (err: Error) => toast.error('Failed to create category', err.message),
  })

  const updateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await updateCategory(supabase, orgId!, id, {
        name: editName.trim(),
        color: editColor,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Category updated')
      setEditTarget(null)
      invalidateAll()
    },
    onError: (err: Error) => toast.error('Failed to update category', err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await deleteCategory(supabase, orgId!, id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Category deleted', 'Products in this category are now uncategorized.')
      setDeleteTarget(null)
      invalidateAll()
    },
    onError: (err: Error) => toast.error('Failed to delete category', err.message),
  })

  function startEdit(c: CategoryRow) {
    setEditTarget(c)
    setEditName(c.name)
    setEditColor(c.color ?? SWATCHES[0])
  }

  return (
    <div className="p-4 lg:p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/products')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-foreground">Categories</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Organize your products by category</p>
          </div>
        </div>
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" />
          Add Category
        </Button>
      </div>

      <div className="relative max-w-sm mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search categories..."
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

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category Name</TableHead>
              <TableHead className="text-right">Product Count</TableHead>
              <TableHead className="text-right">Total Stock</TableHead>
              <TableHead className="text-right">Stock Value</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j}><div className="h-4 bg-zinc-800 rounded animate-pulse" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length > 0 ? (
              filtered.map((c) => (
                <TableRow key={c.id} className="group">
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: c.color ?? '#6366f1' }} />
                      <span className="font-medium text-foreground">{c.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{c.product_count}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.total_stock}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatINR(c.stock_value)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => startEdit(c)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-400" onClick={() => setDeleteTarget(c)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-16">
                  <div className="flex flex-col items-center gap-3 text-zinc-500">
                    <Tag className="h-10 w-10 text-zinc-700" />
                    <p className="text-sm">
                      {categories && categories.length > 0
                        ? 'No categories match your search.'
                        : 'No categories yet — add one above.'}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add category dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Tag className="h-4 w-4" /> Add Category</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="e.g. Beverages"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && newName.trim()) createMutation.mutate() }}
              autoFocus
            />
            <div className="flex items-center gap-1.5">
              {SWATCHES.map((sw) => (
                <button
                  key={sw}
                  type="button"
                  onClick={() => setNewColor(sw)}
                  className={cn(
                    'h-5 w-5 rounded-full ring-2 ring-offset-2 ring-offset-card transition-all',
                    newColor === sw ? 'ring-white scale-110' : 'ring-transparent',
                  )}
                  style={{ backgroundColor: sw }}
                  aria-label={`Choose color ${sw}`}
                />
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button disabled={!newName.trim() || createMutation.isPending} onClick={() => createMutation.mutate()}>
              {createMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit category dialog */}
      <Dialog open={!!editTarget} onOpenChange={(v) => !v && setEditTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Pencil className="h-4 w-4" /> Edit Category</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && editName.trim() && editTarget) updateMutation.mutate(editTarget.id)
              }}
              autoFocus
            />
            <div className="flex items-center gap-1.5">
              {SWATCHES.map((sw) => (
                <button
                  key={sw}
                  type="button"
                  onClick={() => setEditColor(sw)}
                  className={cn(
                    'h-5 w-5 rounded-full ring-2 ring-offset-2 ring-offset-card transition-all',
                    editColor === sw ? 'ring-white scale-110' : 'ring-transparent',
                  )}
                  style={{ backgroundColor: sw }}
                  aria-label={`Choose color ${sw}`}
                />
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button
              disabled={!editName.trim() || updateMutation.isPending}
              onClick={() => editTarget && updateMutation.mutate(editTarget.id)}
            >
              {updateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <Trash2 className="h-4 w-4" /> Delete Category
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Delete <span className="font-semibold text-zinc-200">{deleteTarget?.name}</span>?
            {deleteTarget && deleteTarget.product_count > 0 && (
              <>
                {' '}
                <span className="text-amber-400">
                  {deleteTarget.product_count} {deleteTarget.product_count === 1 ? 'product' : 'products'}
                </span>{' '}
                using this category will become uncategorized — they will not be deleted.
              </>
            )}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
