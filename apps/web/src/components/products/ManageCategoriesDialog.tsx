import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Loader2, Pencil, Plus, Tag, Trash2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import {
  getCategoriesWithProductCount,
  createCategory,
  updateCategory,
  deleteCategory,
} from '@billscape/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

const SWATCHES = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6', '#14b8a6']

interface CategoryRow {
  id: string
  name: string
  color: string | null
  product_count: number
}

export function ManageCategoriesDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { org } = useAuth()
  const orgId = org?.id
  const queryClient = useQueryClient()

  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(SWATCHES[0])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<CategoryRow | null>(null)

  const { data: categories, isLoading } = useQuery({
    queryKey: ['categories-manage', orgId],
    enabled: !!orgId && open,
    queryFn: async () => {
      const { data, error } = await getCategoriesWithProductCount(
        supabase,
        orgId!,
      )
      if (error) throw error
      return (data ?? []) as CategoryRow[]
    },
  })

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['categories-manage', orgId] })
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
      setEditingId(null)
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

  const startEdit = (c: CategoryRow) => {
    setEditingId(c.id)
    setEditName(c.name)
    setEditColor(c.color ?? SWATCHES[0])
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="h-4 w-4" /> Manage Categories
            </DialogTitle>
          </DialogHeader>

          {/* Create new category */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 space-y-2.5">
            <p className="text-xs font-medium text-zinc-400">New category</p>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. Beverages"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newName.trim()) createMutation.mutate()
                }}
                className="h-9 flex-1"
              />
              <Button
                size="sm"
                className="h-9"
                disabled={!newName.trim() || createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Add
              </Button>
            </div>
            <div className="flex items-center gap-1.5">
              {SWATCHES.map((sw) => (
                <button
                  key={sw}
                  type="button"
                  onClick={() => setNewColor(sw)}
                  className={cn(
                    'h-5 w-5 rounded-full ring-2 ring-offset-2 ring-offset-zinc-900 transition-all',
                    newColor === sw ? 'ring-white scale-110' : 'ring-transparent',
                  )}
                  style={{ backgroundColor: sw }}
                  aria-label={`Choose color ${sw}`}
                />
              ))}
            </div>
          </div>

          {/* Existing categories list */}
          <div className="space-y-1.5">
            {isLoading ? (
              <div className="flex items-center justify-center py-8 text-zinc-500">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading...
              </div>
            ) : categories && categories.length > 0 ? (
              categories.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-card p-2.5"
                >
                  {editingId === c.id ? (
                    <>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {SWATCHES.map((sw) => (
                          <button
                            key={sw}
                            type="button"
                            onClick={() => setEditColor(sw)}
                            className={cn(
                              'h-4 w-4 rounded-full ring-2 ring-offset-2 ring-offset-card transition-all',
                              editColor === sw ? 'ring-white scale-110' : 'ring-transparent',
                            )}
                            style={{ backgroundColor: sw }}
                            aria-label={`Choose color ${sw}`}
                          />
                        ))}
                      </div>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && editName.trim()) updateMutation.mutate(c.id)
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                        className="h-8 flex-1"
                        autoFocus
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-emerald-400 hover:text-emerald-300 shrink-0"
                        disabled={!editName.trim() || updateMutation.isPending}
                        onClick={() => updateMutation.mutate(c.id)}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 shrink-0"
                        onClick={() => setEditingId(null)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span
                        className="h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: c.color ?? '#6366f1' }}
                      />
                      <span className="flex-1 text-sm text-zinc-200 truncate">{c.name}</span>
                      <span className="text-[11px] text-zinc-500 shrink-0">
                        {c.product_count} {c.product_count === 1 ? 'product' : 'products'}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 shrink-0"
                        onClick={() => startEdit(c)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-red-400 hover:text-red-400 shrink-0"
                        onClick={() => setDeleteTarget(c)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              ))
            ) : (
              <p className="text-center text-sm text-zinc-500 py-6">No categories yet — add one above.</p>
            )}
          </div>
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
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
