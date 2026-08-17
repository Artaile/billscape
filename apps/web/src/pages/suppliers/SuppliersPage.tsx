import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Truck, Phone, Mail, Search, X } from 'lucide-react'
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
import { logActivity } from '@/lib/activityLog'
import { SupplierFormDialog, type SupplierOption } from '@/components/suppliers/SupplierFormDialog'

interface Supplier extends SupplierOption {
  organization_id: string
  created_at: string
}

export function SuppliersPage() {
  const { org } = useAuth()
  const orgId = org?.id
  const queryClient = useQueryClient()

  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<Supplier | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null)
  const [search, setSearch] = useState('')

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

  const filteredSuppliers = (suppliers ?? []).filter((s) => {
    if (!search.trim()) return true
    const q = search.trim().toLowerCase()
    return (
      s.name.toLowerCase().includes(q) ||
      (s.phone ?? '').toLowerCase().includes(q) ||
      (s.gstin ?? '').toLowerCase().includes(q)
    )
  })

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
        <Button onClick={openAdd}>
          <Plus className="h-4 w-4" />
          Add Supplier
        </Button>
      </div>

      <div className="relative max-w-sm mb-4">
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
    </div>
  )
}
