import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Loader2, UserCog, Search, Pencil, Trash2, Phone, Mail } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

interface Employee {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  role: 'owner' | 'manager' | 'cashier'
  is_active: boolean
  joined_date: string | null
  notes: string | null
  created_at: string
}

const ROLES = [
  { value: 'cashier', label: 'Cashier', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  { value: 'manager', label: 'Manager', color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  { value: 'owner', label: 'Owner', color: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
]

const EMPTY: Omit<Employee, 'id' | 'created_at'> = {
  full_name: '', phone: '', email: '', role: 'cashier',
  is_active: true, joined_date: '', notes: '',
}

export function EmployeesPage() {
  const { org } = useAuth()
  const orgId = org?.id
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [showDialog, setShowDialog] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [form, setForm] = useState(EMPTY)

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['employees', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .eq('organization_id', orgId!)
        .order('full_name')
      if (error) throw error
      return (data ?? []) as Employee[]
    },
  })

  const filtered = search.trim()
    ? employees.filter((e) =>
        e.full_name.toLowerCase().includes(search.toLowerCase()) ||
        e.email?.toLowerCase().includes(search.toLowerCase()) ||
        e.phone?.includes(search)
      )
    : employees

  function openNew() {
    setEditing(null)
    setForm(EMPTY)
    setShowDialog(true)
  }

  function openEdit(emp: Employee) {
    setEditing(emp)
    setForm({
      full_name: emp.full_name,
      phone: emp.phone ?? '',
      email: emp.email ?? '',
      role: emp.role,
      is_active: emp.is_active,
      joined_date: emp.joined_date ?? '',
      notes: emp.notes ?? '',
    })
    setShowDialog(true)
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.full_name.trim()) throw new Error('Employee name is required')
      const payload = {
        organization_id: orgId!,
        full_name: form.full_name.trim(),
        phone: form.phone?.trim() || null,
        email: form.email?.trim() || null,
        role: form.role,
        is_active: form.is_active,
        joined_date: form.joined_date || null,
        notes: form.notes?.trim() || null,
      }
      if (editing) {
        const { error } = await supabase.from('employees').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('employees').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees', orgId] })
      toast.success(editing ? 'Employee updated' : 'Employee added')
      setShowDialog(false)
    },
    onError: (err: Error) => toast.error('Failed to save', err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('employees').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees', orgId] })
      toast.success('Employee removed')
    },
    onError: (err: Error) => toast.error('Failed to delete', err.message),
  })

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('employees').update({ is_active }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employees', orgId] }),
  })

  const active = employees.filter((e) => e.is_active).length
  const inactive = employees.filter((e) => !e.is_active).length

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Employees</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage your staff and their roles</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" /> Add Employee
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Staff</p>
          <p className="text-2xl font-bold text-foreground">{employees.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Active</p>
          <p className="text-2xl font-bold text-emerald-400">{active}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Inactive</p>
          <p className="text-2xl font-bold text-zinc-500">{inactive}</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search by name, email or phone..." value={search}
          onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {/* Employee cards */}
      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 rounded-lg border border-dashed border-border">
          <UserCog className="h-10 w-10 text-zinc-600 mb-3" />
          <p className="text-sm text-muted-foreground">No employees found</p>
          <Button variant="outline" size="sm" className="mt-3 text-xs" onClick={openNew}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add first employee
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((emp) => {
            const roleInfo = ROLES.find((r) => r.value === emp.role)
            return (
              <div key={emp.id}
                className={cn('rounded-lg border bg-card p-4 space-y-3 transition-opacity',
                  !emp.is_active && 'opacity-60', 'border-border'
                )}>
                {/* Top row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-primary">
                        {emp.full_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{emp.full_name}</p>
                      <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium mt-0.5', roleInfo?.color)}>
                        {roleInfo?.label}
                      </span>
                    </div>
                  </div>
                  <Badge variant={emp.is_active ? 'default' : 'secondary'} className="text-[10px] shrink-0">
                    {emp.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>

                {/* Contact info */}
                <div className="space-y-1">
                  {emp.phone && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3" /> {emp.phone}
                    </div>
                  )}
                  {emp.email && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Mail className="h-3 w-3" /> {emp.email}
                    </div>
                  )}
                  {emp.joined_date && (
                    <p className="text-[10px] text-zinc-600">
                      Joined: {new Date(emp.joined_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1 border-t border-border">
                  <Button variant="ghost" size="sm" className="h-7 text-xs flex-1"
                    onClick={() => toggleActive.mutate({ id: emp.id, is_active: !emp.is_active })}>
                    {emp.is_active ? 'Deactivate' : 'Activate'}
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(emp)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-400"
                    onClick={() => {
                      if (confirm(`Remove ${emp.full_name}?`)) deleteMutation.mutate(emp.id)
                    }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={(o) => { setShowDialog(o) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Employee' : 'Add Employee'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Full Name *</Label>
              <Input placeholder="e.g. Ravi Kumar" value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input placeholder="9876543210" value={form.phone ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" placeholder="ravi@shop.com" value={form.email ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Role</Label>
                <select value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Employee['role'] }))}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Join Date</Label>
                <Input type="date" value={form.joined_date ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, joined_date: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Input placeholder="Any additional notes..." value={form.notes ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_active}
                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                className="rounded border-input" />
              <span className="text-sm text-foreground">Active employee</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Saving...</> : editing ? 'Update' : 'Add Employee'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
