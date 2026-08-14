import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Loader2, Shield, Pencil, Copy, Trash2, Check, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

interface Role {
  id: string
  name: string
  description: string | null
  is_system: boolean
  permissions: Record<string, boolean>
  created_at: string
}

const ALL_PERMISSIONS: { key: string; label: string; group: string }[] = [
  { key: 'dashboard', label: 'Dashboard', group: 'General' },
  { key: 'billing', label: 'POS Billing', group: 'General' },
  { key: 'products', label: 'Products', group: 'Catalog' },
  { key: 'inventory', label: 'Inventory', group: 'Catalog' },
  { key: 'customers', label: 'Customers', group: 'People' },
  { key: 'employees', label: 'Employees', group: 'People' },
  { key: 'suppliers', label: 'Suppliers', group: 'People' },
  { key: 'purchases', label: 'Purchases', group: 'Finance' },
  { key: 'expenses', label: 'Expenses', group: 'Finance' },
  { key: 'returns', label: 'Returns', group: 'Finance' },
  { key: 'quotations', label: 'Quotations', group: 'Finance' },
  { key: 'promotions', label: 'Promotions', group: 'Marketing' },
  { key: 'loyalty', label: 'Loyalty', group: 'Marketing' },
  { key: 'reports', label: 'Reports', group: 'Analytics' },
  { key: 'activity', label: 'Activity Log', group: 'Admin' },
  { key: 'shifts', label: 'Shifts & Registers', group: 'General' },
  { key: 'ledger', label: 'Ledger', group: 'Finance' },
  { key: 'roles', label: 'Roles & Permissions', group: 'Admin' },
  { key: 'settings', label: 'Settings', group: 'Admin' },
]

const GROUPS = Array.from(new Set(ALL_PERMISSIONS.map((p) => p.group)))

const DEFAULT_PERMS: Record<string, boolean> = Object.fromEntries(
  ALL_PERMISSIONS.map((p) => [p.key, false])
)

const SYSTEM_ROLE_NAMES = ['owner', 'admin', 'manager', 'cashier']
const isSystemRole = (role: { name: string; is_system?: boolean }) =>
  role.is_system || SYSTEM_ROLE_NAMES.includes(role.name.toLowerCase().trim())

const SYSTEM_ROLE_DEFAULTS: Record<string, Record<string, boolean>> = {
  owner: Object.fromEntries(ALL_PERMISSIONS.map((p) => [p.key, true])),
  admin: Object.fromEntries(ALL_PERMISSIONS.map((p) => [p.key, true])),
  manager: Object.fromEntries(
    ALL_PERMISSIONS.map((p) => [
      p.key,
      !['roles', 'settings', 'activity'].includes(p.key),
    ])
  ),
  cashier: Object.fromEntries(
    ALL_PERMISSIONS.map((p) => [
      p.key,
      ['billing', 'customers', 'returns', 'quotations', 'shifts'].includes(p.key),
    ])
  ),
}

const getRolePermissions = (role: { name: string; permissions?: Record<string, boolean> | null }): Record<string, boolean> => {
  if (role.permissions && typeof role.permissions === 'object' && Object.keys(role.permissions).length > 0) {
    return { ...DEFAULT_PERMS, ...role.permissions }
  }
  const normName = role.name.toLowerCase().trim()
  if (SYSTEM_ROLE_DEFAULTS[normName]) {
    return SYSTEM_ROLE_DEFAULTS[normName]
  }
  return DEFAULT_PERMS
}

const ROLE_SORT_ORDER: Record<string, number> = {
  owner: 1,
  admin: 2,
  manager: 3,
  cashier: 4,
}

export function RolesPage() {
  const { org } = useAuth()
  const orgId = org?.id
  const queryClient = useQueryClient()

  const [showDialog, setShowDialog] = useState(false)
  const [editing, setEditing] = useState<Role | null>(null)
  const [formName, setFormName] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formPerms, setFormPerms] = useState<Record<string, boolean>>(DEFAULT_PERMS)

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ['roles', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('roles')
        .select('*')
        .eq('organization_id', orgId!)

      if (error) throw error

      const rawRoles = (data ?? []) as Role[]

      // Ensure system roles have is_system flag and valid permissions
      const normalizedRoles = rawRoles.map((r) => ({
        ...r,
        permissions: getRolePermissions(r),
        is_system: isSystemRole(r),
      }))

      // Auto-sync in background if database had is_system = false for any base system role
      const needDbUpdate = rawRoles.filter(
        (r) => SYSTEM_ROLE_NAMES.includes(r.name.toLowerCase().trim()) && !r.is_system
      )
      if (needDbUpdate.length > 0) {
        supabase
          .from('roles')
          .update({ is_system: true })
          .in('id', needDbUpdate.map((r) => r.id))
          .then(() => {})
      }

      // Sort: system roles first (owner, admin, manager, cashier), then custom roles alphabetically
      return normalizedRoles.sort((a, b) => {
        const aSys = isSystemRole(a)
        const bSys = isSystemRole(b)
        if (aSys && bSys) {
          const orderA = ROLE_SORT_ORDER[a.name.toLowerCase().trim()] ?? 99
          const orderB = ROLE_SORT_ORDER[b.name.toLowerCase().trim()] ?? 99
          return orderA - orderB
        }
        if (aSys) return -1
        if (bSys) return 1
        return a.name.localeCompare(b.name)
      })
    },
  })

  function openNew() {
    setEditing(null)
    setFormName('')
    setFormDesc('')
    setFormPerms(DEFAULT_PERMS)
    setShowDialog(true)
  }

  function openEdit(role: Role) {
    if (isSystemRole(role)) {
      toast.error('System Role Locked', `${role.name.charAt(0).toUpperCase() + role.name.slice(1)} is a default system role and cannot be edited.`)
      return
    }
    setEditing(role)
    setFormName(role.name)
    setFormDesc(role.description ?? '')
    setFormPerms(getRolePermissions(role))
    setShowDialog(true)
  }

  function cloneRole(role: Role) {
    setEditing(null)
    setFormName(`${role.name} (Copy)`)
    setFormDesc(`Cloned from ${role.name}`)
    setFormPerms(getRolePermissions(role))
    setShowDialog(true)
  }

  function togglePerm(key: string) {
    setFormPerms((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function setGroupAll(group: string, value: boolean) {
    const keys = ALL_PERMISSIONS.filter((p) => p.group === group).map((p) => p.key)
    setFormPerms((prev) => {
      const next = { ...prev }
      keys.forEach((k) => { next[k] = value })
      return next
    })
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const trimmedName = formName.trim()
      if (!trimmedName) throw new Error('Role name is required')

      if (!editing && SYSTEM_ROLE_NAMES.includes(trimmedName.toLowerCase())) {
        throw new Error(`"${trimmedName}" is a reserved default role name. Please choose another name.`)
      }

      if (editing) {
        if (isSystemRole(editing)) {
          throw new Error('Default system roles cannot be edited.')
        }
        if (
          editing.name.toLowerCase() !== trimmedName.toLowerCase() &&
          SYSTEM_ROLE_NAMES.includes(trimmedName.toLowerCase())
        ) {
          throw new Error(`"${trimmedName}" is a reserved system role name.`)
        }
        const payload = {
          name: trimmedName,
          description: formDesc.trim() || null,
          is_system: false,
          permissions: formPerms,
        }
        const { error } = await supabase.from('roles').update(payload).eq('id', editing.id).eq('organization_id', orgId!)
        if (error) throw error
      } else {
        const payload = {
          organization_id: orgId!,
          name: trimmedName,
          description: formDesc.trim() || null,
          is_system: false,
          permissions: formPerms,
        }
        const { error } = await supabase.from('roles').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles', orgId] })
      toast.success(editing ? 'Role updated' : 'Role created')
      setShowDialog(false)
    },
    onError: (err: Error) => toast.error('Failed to save role', err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const role = roles.find((r) => r.id === id)
      if (role && isSystemRole(role)) {
        throw new Error(`Cannot delete the default system role "${role.name}".`)
      }
      
      const { error } = await supabase.from('roles').delete().eq('id', id).eq('organization_id', orgId!)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles', orgId] })
      toast.success('Role deleted')
    },
    onError: (err: Error) => toast.error('Cannot delete role', err.message),
  })

  const permCount = (role: Role) =>
    Object.values(getRolePermissions(role)).filter(Boolean).length

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Roles & Permissions</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Control what each role can access in your shop
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" /> Create Role
        </Button>
      </div>

      <Tabs defaultValue="roles">
        <TabsList>
          <TabsTrigger value="roles">Roles List</TabsTrigger>
          <TabsTrigger value="matrix">Permission Matrix</TabsTrigger>
        </TabsList>

        {/* Roles List */}
        <TabsContent value="roles" className="mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-3">
              {roles.map((role) => {
                const isSys = isSystemRole(role)
                return (
                  <div key={role.id}
                    className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center shrink-0',
                        isSys ? 'bg-indigo-600/15' : 'bg-zinc-700/40')}>
                        <Shield className={cn('h-4 w-4', isSys ? 'text-indigo-400' : 'text-zinc-400')} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-foreground capitalize">{role.name}</p>
                          {isSys && (
                            <Badge variant="secondary" className="text-[10px]">System</Badge>
                          )}
                        </div>
                        {role.description && (
                          <p className="text-xs text-muted-foreground truncate">{role.description}</p>
                        )}
                        <p className="text-[10px] text-zinc-600 mt-0.5">
                          {permCount(role)} / {ALL_PERMISSIONS.length} permissions enabled
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => cloneRole(role)}>
                        <Copy className="h-3 w-3" /> Clone
                      </Button>
                      {!isSys && (
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(role)} title="Edit role">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {!isSys && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-red-400 hover:text-red-400"
                          title="Delete role"
                          onClick={() => {
                            if (window.confirm(`Delete ${role.name} role?`)) deleteMutation.mutate(role.id)
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* Permission Matrix */}
        <TabsContent value="matrix" className="mt-4">
          <div className="rounded-lg border border-border bg-card overflow-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="sticky left-0 bg-card text-left p-3 font-medium text-muted-foreground min-w-[140px]">
                    Permission
                  </th>
                  {roles.map((r) => (
                    <th key={r.id} className="p-3 font-medium text-foreground text-center min-w-[100px]">
                      {r.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {GROUPS.map((group) => (
                  <React.Fragment key={group}>
                    <tr className="bg-zinc-900/50">
                      <td colSpan={roles.length + 1}
                        className="px-3 py-1.5 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                        {group}
                      </td>
                    </tr>
                    {ALL_PERMISSIONS.filter((p) => p.group === group).map((perm) => (
                      <tr key={perm.key} className="border-b border-border/50 hover:bg-secondary/30">
                        <td className="sticky left-0 bg-card p-3 text-muted-foreground font-medium">
                          {perm.label}
                        </td>
                        {roles.map((role) => {
                          const perms = getRolePermissions(role)
                          return (
                            <td key={role.id} className="p-3 text-center">
                              {perms[perm.key] ? (
                                <Check className="h-3.5 w-3.5 text-emerald-400 mx-auto" />
                              ) : (
                                <X className="h-3.5 w-3.5 text-zinc-700 mx-auto" />
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Create / Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit Role: ${editing.name}` : 'Create New Role'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Role Name *</Label>
              <Input placeholder="e.g. Supervisor" value={formName}
                onChange={(e) => setFormName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input placeholder="What can this role do?" value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)} />
            </div>

            <div className="space-y-3">
              <Label>Permissions</Label>
              {GROUPS.map((group) => {
                const groupPerms = ALL_PERMISSIONS.filter((p) => p.group === group)
                const allOn = groupPerms.every((p) => formPerms[p.key])
                return (
                  <div key={group} className="rounded-lg border border-border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        {group}
                      </p>
                      <button
                        type="button"
                        onClick={() => setGroupAll(group, !allOn)}
                        className="text-[10px] text-primary hover:underline">
                        {allOn ? 'Disable all' : 'Enable all'}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {groupPerms.map((perm) => (
                        <label key={perm.key}
                          className="flex items-center gap-2 cursor-pointer select-none">
                          <div
                            onClick={() => togglePerm(perm.key)}
                            className={cn(
                              'h-4 w-4 rounded border flex items-center justify-center cursor-pointer transition-colors',
                              formPerms[perm.key]
                                ? 'bg-primary border-primary'
                                : 'border-input bg-background'
                            )}>
                            {formPerms[perm.key] && <Check className="h-2.5 w-2.5 text-white" />}
                          </div>
                          <span className="text-xs text-foreground">{perm.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Saving...</>
                : editing ? 'Update Role' : 'Create Role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
