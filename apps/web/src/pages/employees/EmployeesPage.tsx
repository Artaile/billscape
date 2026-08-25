import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Loader2, UserCog, Search, Pencil, Trash2, Phone, Mail, Download, Upload, FileSpreadsheet, ArrowUpDown } from 'lucide-react'
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
import { logActivity } from '@/lib/activityLog'
import { exportToCSV, parseCSV } from '@/lib/csvUtils'

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

  const [sortBy, setSortBy] = useState<'name-asc' | 'name-desc' | 'role' | 'status-active' | 'status-inactive' | 'date-newest' | 'date-oldest'>('name-asc')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [isImporting, setIsImporting] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  // Filter & Sort Logic
  const filtered = employees
    .filter((e) => {
      if (search.trim()) {
        const q = search.toLowerCase()
        const matchSearch =
          e.full_name.toLowerCase().includes(q) ||
          e.email?.toLowerCase().includes(q) ||
          e.phone?.includes(q)
        if (!matchSearch) return false
      }
      if (roleFilter !== 'all' && e.role !== roleFilter) return false
      if (statusFilter === 'active' && !e.is_active) return false
      if (statusFilter === 'inactive' && e.is_active) return false
      return true
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'name-asc':
          return a.full_name.localeCompare(b.full_name)
        case 'name-desc':
          return b.full_name.localeCompare(a.full_name)
        case 'role':
          return a.role.localeCompare(b.role)
        case 'status-active':
          return (b.is_active ? 1 : 0) - (a.is_active ? 1 : 0)
        case 'status-inactive':
          return (a.is_active ? 1 : 0) - (b.is_active ? 1 : 0)
        case 'date-newest':
          return (b.joined_date || b.created_at || '').localeCompare(a.joined_date || a.created_at || '')
        case 'date-oldest':
          return (a.joined_date || a.created_at || '').localeCompare(b.joined_date || b.created_at || '')
        default:
          return 0
      }
    })

  const handleExportCSV = () => {
    if (!filtered.length) {
      toast.error('No employees to export')
      return
    }
    const headers = ['Full Name', 'Phone', 'Email', 'Role', 'Status', 'Joined Date', 'Notes']
    const rows = filtered.map((e) => [
      e.full_name,
      e.phone ?? '',
      e.email ?? '',
      e.role.charAt(0).toUpperCase() + e.role.slice(1),
      e.is_active ? 'Active' : 'Inactive',
      e.joined_date ?? '',
      e.notes ?? '',
    ])
    const dateStr = new Date().toISOString().slice(0, 10)
    exportToCSV(`employees-${dateStr}`, headers, rows)
    toast.success('Employees exported to CSV')
  }

  const handleDownloadTemplate = () => {
    const headers = ['Full Name', 'Phone', 'Email', 'Role', 'Status', 'Joined Date', 'Notes']
    const sampleRows = [
      ['Ravi Kumar', '9876543210', 'ravi@example.com', 'Cashier', 'Active', '2026-01-15', 'Shift cashier'],
      ['Priya Sharma', '9123456789', 'priya@example.com', 'Manager', 'Active', '2025-11-01', 'Store manager'],
    ]
    exportToCSV('employees_import_template', headers, sampleRows)
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
        const fullName = row['full name'] || row['fullname'] || row['name'] || row['employee name'] || ''
        if (!fullName.trim()) continue

        const rawPhone = row['phone'] || row['mobile'] || row['phone number'] || ''
        const phoneDigits = rawPhone.replace(/\D/g, '').slice(0, 10)
        const email = row['email'] || row['email address'] || ''

        let roleVal: 'owner' | 'manager' | 'cashier' = 'cashier'
        const rawRole = (row['role'] || '').toLowerCase()
        if (rawRole.includes('owner')) roleVal = 'owner'
        else if (rawRole.includes('manager')) roleVal = 'manager'

        const rawStatus = (row['status'] || row['is active'] || '').toLowerCase()
        const isActive = !(rawStatus.includes('inactive') || rawStatus === 'false' || rawStatus === '0')
        const joinedDate = row['joined date'] || row['joined_date'] || row['date'] || null
        const notes = row['notes'] || row['note'] || null

        await supabase.from('employees').insert({
          organization_id: orgId,
          full_name: fullName.trim(),
          phone: phoneDigits || null,
          email: email.trim() || null,
          role: roleVal,
          is_active: isActive,
          joined_date: joinedDate,
          notes: notes,
        })
        importedCount++
      }

      await queryClient.invalidateQueries({ queryKey: ['employees', orgId] })
      await logActivity({
        organizationId: orgId,
        action: 'imported',
        entity: 'employee',
        metadata: { count: importedCount, filename: file.name },
      })
      toast.success(`Import Complete`, `Successfully imported ${importedCount} employees!`)
    } catch (err: any) {
      toast.error('Import Failed', err.message || 'Failed to parse CSV file')
    } finally {
      setIsImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

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
      const phoneDigits = form.phone?.replace(/\D/g, '') || ''
      if (phoneDigits && phoneDigits.length !== 10) {
        throw new Error('Enter a valid 10-digit Indian mobile number')
      }
      const payload = {
        organization_id: orgId!,
        full_name: form.full_name.trim(),
        phone: phoneDigits || null,
        email: form.email?.trim() || null,
        role: form.role,
        is_active: form.is_active,
        joined_date: form.joined_date || null,
        notes: form.notes?.trim() || null,
      }
      if (editing) {
        const { error } = await supabase.from('employees').update(payload).eq('id', editing.id)
        if (error) throw error
        await logActivity({
          organizationId: orgId!,
          action: 'updated',
          entity: 'employee',
          entityId: editing.id,
          metadata: { employee_name: form.full_name.trim(), role: form.role },
        })
      } else {
        const { data: inserted, error } = await supabase.from('employees').insert(payload).select('id').single()
        if (error) throw error
        await logActivity({
          organizationId: orgId!,
          action: 'created',
          entity: 'employee',
          entityId: inserted?.id,
          metadata: { employee_name: form.full_name.trim(), role: form.role },
        })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees', orgId] })
      queryClient.invalidateQueries({ queryKey: ['activity_log', orgId] })
      toast.success(editing ? 'Employee updated' : 'Employee added')
      setShowDialog(false)
    },
    onError: (err: Error) => toast.error('Failed to save', err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const targetEmp = employees.find((e) => e.id === id)
      const { error } = await supabase.from('employees').delete().eq('id', id)
      if (error) throw error
      await logActivity({
        organizationId: orgId!,
        action: 'deleted',
        entity: 'employee',
        entityId: id,
        metadata: { employee_name: targetEmp?.full_name || 'Employee' },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees', orgId] })
      queryClient.invalidateQueries({ queryKey: ['activity_log', orgId] })
      toast.success('Employee removed')
    },
    onError: (err: Error) => toast.error('Failed to delete', err.message),
  })

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const targetEmp = employees.find((e) => e.id === id)
      const { error } = await supabase.from('employees').update({ is_active }).eq('id', id)
      if (error) throw error
      await logActivity({
        organizationId: orgId!,
        action: is_active ? 'activated' : 'deactivated',
        entity: 'employee',
        entityId: id,
        metadata: { employee_name: targetEmp?.full_name || 'Employee', is_active },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees', orgId] })
      queryClient.invalidateQueries({ queryKey: ['activity_log', orgId] })
    },
  })

  const active = employees.filter((e) => e.is_active).length
  const inactive = employees.filter((e) => !e.is_active).length

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Employees</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage your staff and their roles</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowImport(true)} disabled={isImporting}>
            {isImporting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Upload className="h-3.5 w-3.5 mr-1 text-indigo-400" />}
            Import CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="h-3.5 w-3.5 mr-1 text-blue-400" /> Export CSV
          </Button>
          <Button onClick={openNew}>
            <Plus className="h-4 w-4 mr-1" /> Add Employee
          </Button>
        </div>
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

      {/* Filters & Sort Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ArrowUpDown className="h-3.5 w-3.5 text-indigo-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="flex h-9 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 text-foreground"
            >
              <option value="name-asc">Sort: Name (A to Z)</option>
              <option value="name-desc">Sort: Name (Z to A)</option>
              <option value="role">Sort: By Role</option>
              <option value="status-active">Sort: Active First</option>
              <option value="status-inactive">Sort: Inactive First</option>
              <option value="date-newest">Sort: Joined (Newest)</option>
              <option value="date-oldest">Sort: Joined (Oldest)</option>
            </select>
          </div>

          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="flex h-9 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 text-foreground"
          >
            <option value="all">All Roles</option>
            <option value="owner">Owner</option>
            <option value="manager">Manager</option>
            <option value="cashier">Cashier</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="flex h-9 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 text-foreground"
          >
            <option value="all">All Status</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
        </div>
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
                <Label>Phone (10-digit mobile)</Label>
                <Input
                  placeholder="9876543210"
                  maxLength={10}
                  value={form.phone ?? ''}
                  onChange={(e) => {
                    const sanitized = e.target.value.replace(/\D/g, '').slice(0, 10)
                    setForm((f) => ({ ...f, phone: sanitized }))
                  }}
                />
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

      {/* Import Employees Modal */}
      <Dialog open={showImport} onOpenChange={setShowImport}>
        <DialogContent className="max-w-md bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-zinc-100">
              <FileSpreadsheet className="h-5 w-5 text-indigo-400" />
              Import Employees from CSV
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
                    <p className="text-[11px] text-zinc-400">Sample CSV format with column headers and example staff rows</p>
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
                    <p className="text-[11px] text-zinc-400">Select your completed employee CSV file to batch import records</p>
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
