import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Truck, Phone, Mail, Building2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

interface Supplier {
  id: string
  organization_id: string
  name: string
  phone: string | null
  email: string | null
  gstin: string | null
  address: string | null
  created_at: string
}

interface SupplierFormState {
  name: string
  phone: string
  email: string
  gstin: string
  address: string
}

const emptyForm = (): SupplierFormState => ({
  name: '',
  phone: '',
  email: '',
  gstin: '',
  address: '',
})

export function SuppliersPage() {
  const { org } = useAuth()
  const orgId = org?.id
  const queryClient = useQueryClient()

  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<Supplier | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null)
  const [formState, setFormState] = useState<SupplierFormState>(emptyForm())
  const [nameError, setNameError] = useState('')

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

  function openAdd() {
    setEditTarget(null)
    setFormState(emptyForm())
    setNameError('')
    setShowForm(true)
  }

  function openEdit(supplier: Supplier) {
    setEditTarget(supplier)
    setFormState({
      name: supplier.name,
      phone: supplier.phone ?? '',
      email: supplier.email ?? '',
      gstin: supplier.gstin ?? '',
      address: supplier.address ?? '',
    })
    setNameError('')
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditTarget(null)
    setFormState(emptyForm())
    setNameError('')
  }

  function setField(field: keyof SupplierFormState, value: string) {
    setFormState((prev) => ({ ...prev, [field]: value }))
    if (field === 'name' && value.trim()) setNameError('')
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!formState.name.trim()) throw new Error('Name is required')

      const payload = {
        organization_id: orgId!,
        name: formState.name.trim(),
        phone: formState.phone.trim() || null,
        email: formState.email.trim() || null,
        gstin: formState.gstin.trim() || null,
        address: formState.address.trim() || null,
      }

      if (editTarget) {
        const { error } = await supabase
          .from('suppliers')
          .update(payload)
          .eq('id', editTarget.id)
          .eq('organization_id', orgId!)
        if (error) throw error
      } else {
        const { error } = await supabase.from('suppliers').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers', orgId] })
      toast.success(editTarget ? 'Supplier updated' : 'Supplier added')
      closeForm()
    },
    onError: (err: Error) => {
      toast.error('Failed to save supplier', err.message)
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!formState.name.trim()) {
      setNameError('Name is required')
      return
    }
    saveMutation.mutate()
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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers', orgId] })
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
            ) : suppliers && suppliers.length > 0 ? (
              suppliers.map((s) => (
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
                    <p className="text-sm">No suppliers yet. Add one to start recording purchases.</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={showForm} onOpenChange={(open) => { if (!open) closeForm() }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              <span className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-indigo-400" />
                {editTarget ? 'Edit Supplier' : 'Add Supplier'}
              </span>
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="sup-name">Name *</Label>
              <Input
                id="sup-name"
                placeholder="Supplier name"
                value={formState.name}
                onChange={(e) => setField('name', e.target.value)}
              />
              {nameError && <p className="text-xs text-red-400">{nameError}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sup-phone">Phone</Label>
              <Input
                id="sup-phone"
                type="tel"
                placeholder="9876543210"
                value={formState.phone}
                onChange={(e) => setField('phone', e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sup-email">Email</Label>
              <Input
                id="sup-email"
                type="email"
                placeholder="supplier@example.com"
                value={formState.email}
                onChange={(e) => setField('email', e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sup-gstin">GSTIN</Label>
              <Input
                id="sup-gstin"
                placeholder="33AABCU9603R1ZX"
                value={formState.gstin}
                onChange={(e) => setField('gstin', e.target.value.toUpperCase())}
                className="uppercase"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sup-address">Address</Label>
              <textarea
                id="sup-address"
                rows={3}
                placeholder="Street, City, Pincode"
                value={formState.address}
                onChange={(e) => setField('address', e.target.value)}
                className="flex w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeForm}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending
                  ? editTarget
                    ? 'Saving...'
                    : 'Adding...'
                  : editTarget
                  ? 'Save Changes'
                  : 'Add Supplier'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
