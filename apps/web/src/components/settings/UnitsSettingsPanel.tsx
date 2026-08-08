import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Loader2, Pencil, Plus, Ruler, Trash2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { getUnits, createUnit, updateUnit, deleteUnit } from '@billscape/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

interface UnitRow {
  id: string
  name: string
  symbol: string
  allow_decimal: boolean
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <div
      onClick={onChange}
      className={cn(
        'relative h-5 w-9 rounded-full transition-colors cursor-pointer shrink-0',
        checked ? 'bg-indigo-600' : 'bg-zinc-700',
      )}
    >
      <div className={cn('absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform', checked ? 'translate-x-4' : 'translate-x-0')} />
    </div>
  )
}

export function UnitsSettingsPanel() {
  const { org } = useAuth()
  const orgId = org?.id
  const queryClient = useQueryClient()

  const [newName, setNewName] = useState('')
  const [newSymbol, setNewSymbol] = useState('')
  const [newAllowDecimal, setNewAllowDecimal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editSymbol, setEditSymbol] = useState('')
  const [editAllowDecimal, setEditAllowDecimal] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<UnitRow | null>(null)

  const { data: units, isLoading } = useQuery({
    queryKey: ['units-manage', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await getUnits(supabase as Parameters<typeof getUnits>[0], orgId!)
      if (error) throw error
      return (data ?? []) as UnitRow[]
    },
  })

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['units-manage', orgId] })
    queryClient.invalidateQueries({ queryKey: ['units', orgId] })
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await createUnit(supabase as Parameters<typeof createUnit>[0], {
        organization_id: orgId!,
        name: newName.trim(),
        symbol: newSymbol.trim(),
        allow_decimal: newAllowDecimal,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Unit created')
      setNewName('')
      setNewSymbol('')
      setNewAllowDecimal(false)
      invalidateAll()
    },
    onError: (err: Error) => toast.error('Failed to create unit', err.message),
  })

  const updateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await updateUnit(supabase as Parameters<typeof updateUnit>[0], orgId!, id, {
        name: editName.trim(),
        symbol: editSymbol.trim(),
        allow_decimal: editAllowDecimal,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Unit updated')
      setEditingId(null)
      invalidateAll()
    },
    onError: (err: Error) => toast.error('Failed to update unit', err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await deleteUnit(supabase as Parameters<typeof deleteUnit>[0], orgId!, id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Unit deleted')
      setDeleteTarget(null)
      invalidateAll()
    },
    onError: (err: Error) =>
      toast.error(
        'Failed to delete unit',
        err.message.includes('foreign key') || err.message.includes('violates')
          ? 'This unit is used by one or more products — change those products to a different unit first.'
          : err.message,
      ),
  })

  const startEdit = (u: UnitRow) => {
    setEditingId(u.id)
    setEditName(u.name)
    setEditSymbol(u.symbol)
    setEditAllowDecimal(u.allow_decimal)
  }

  return (
    <>
      <div className="rounded-lg border border-border bg-card p-6 space-y-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Ruler className="h-4 w-4 text-indigo-400" /> Units
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage units of measure (Piece, Kg, Box, etc.) used across Products and Purchases.
          </p>
        </div>

        {/* Create new unit */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 space-y-2.5">
          <p className="text-xs font-medium text-zinc-400">New unit</p>
          <div className="flex gap-2">
            <Input
              placeholder="e.g. Quintal"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="h-9 flex-1"
            />
            <Input
              placeholder="Symbol e.g. qtl"
              value={newSymbol}
              onChange={(e) => setNewSymbol(e.target.value)}
              className="h-9 w-32"
            />
            <Button
              size="sm"
              className="h-9"
              disabled={!newName.trim() || !newSymbol.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Add
            </Button>
          </div>
          <label className="flex items-center gap-2 cursor-pointer w-fit">
            <Toggle checked={newAllowDecimal} onChange={() => setNewAllowDecimal((v) => !v)} />
            <span className="text-xs text-zinc-400">Allow fractional quantities (e.g. 0.5 for weight/volume units)</span>
          </label>
        </div>

        {/* Existing units list */}
        <div className="space-y-1.5">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading...
            </div>
          ) : units && units.length > 0 ? (
            units.map((u) => (
              <div key={u.id} className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-background p-2.5">
                {editingId === u.id ? (
                  <>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && editName.trim() && editSymbol.trim()) updateMutation.mutate(u.id)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      className="h-8 flex-1"
                      autoFocus
                    />
                    <Input
                      value={editSymbol}
                      onChange={(e) => setEditSymbol(e.target.value)}
                      className="h-8 w-28"
                    />
                    <label className="flex items-center gap-1.5 shrink-0">
                      <Toggle checked={editAllowDecimal} onChange={() => setEditAllowDecimal((v) => !v)} />
                      <span className="text-[11px] text-zinc-500">Decimal</span>
                    </label>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-emerald-400 hover:text-emerald-300 shrink-0"
                      disabled={!editName.trim() || !editSymbol.trim() || updateMutation.isPending}
                      onClick={() => updateMutation.mutate(u.id)}
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
                    <span className="flex-1 text-sm text-zinc-200 truncate">{u.name}</span>
                    <span className="text-xs font-mono text-zinc-500 shrink-0">{u.symbol}</span>
                    {u.allow_decimal && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-600/20 text-indigo-300 border border-indigo-700 shrink-0">
                        decimal
                      </span>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0" onClick={() => startEdit(u)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-red-400 hover:text-red-400 shrink-0"
                      onClick={() => setDeleteTarget(u)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            ))
          ) : (
            <p className="text-center text-sm text-zinc-500 py-6">No units yet — add one above.</p>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <Trash2 className="h-4 w-4" /> Delete Unit
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Delete <span className="font-semibold text-zinc-200">{deleteTarget?.name}</span>? Products
            currently using this unit will block deletion — reassign them to a different unit first.
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
