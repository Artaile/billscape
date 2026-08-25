import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, Loader2, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Input } from '@/components/ui/input'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

interface ActivityLog {
  id: string
  actor_id?: string | null
  actor_name: string
  action: string
  entity: string
  entity_id: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}
function formatActivityDetails(log: ActivityLog): string {
  const m = log.metadata
  if (!m) return '—'

  if (m.employee_name) {
    const roleStr = m.role ? ` as ${String(m.role).charAt(0).toUpperCase() + String(m.role).slice(1)}` : ''
    return `${m.employee_name}${roleStr}`
  }

  if (m.invoice_no) {
    const amountStr = m.grand_total || m.net_payable ? ` (₹${Number(m.grand_total || m.net_payable).toLocaleString('en-IN')})` : ''
    const modeStr = m.payment_mode ? ` via ${String(m.payment_mode).toUpperCase()}` : ''
    return `Invoice ${m.invoice_no}${amountStr}${modeStr}`
  }

  if (m.product_name || m.name) {
    return `${m.product_name || m.name}`
  }

  const parts: string[] = []
  for (const [key, val] of Object.entries(m)) {
    if (val !== undefined && val !== null && typeof val !== 'object') {
      const cleanKey = key.replace(/_/g, ' ')
      parts.push(`${cleanKey}: ${val}`)
    }
  }
  return parts.length > 0 ? parts.join(' • ') : JSON.stringify(m)
}

function getActionBadgeStyle(action: string): string {
  const a = (action || '').toLowerCase()
  if (a.includes('void') || a.includes('delet') || a.includes('cancel')) {
    return 'bg-red-500/10 text-red-400 border-red-500/20'
  }
  if (a.includes('updat') || a.includes('edit') || a.includes('mod')) {
    return 'bg-blue-500/10 text-blue-400 border-blue-500/20'
  }
  if (a.includes('creat') || a.includes('add') || a.includes('restor')) {
    return 'bg-green-500/10 text-green-400 border-green-500/20'
  }
  if (a.includes('sale') || a.includes('bill')) {
    return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
  }
  if (a.includes('return')) {
    return 'bg-orange-500/10 text-orange-400 border-orange-500/20'
  }
  if (a.includes('login') || a.includes('auth')) {
    return 'bg-purple-500/10 text-purple-400 border-purple-500/20'
  }
  return 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
}

type ActionBucket = 'all' | 'created' | 'updated' | 'deleted' | 'sales'

function bucketOf(action: string): Exclude<ActionBucket, 'all'> | null {
  const a = (action || '').toLowerCase()
  if (a.includes('creat') || a.includes('add') || a.includes('insert')) return 'created'
  if (a.includes('updat') || a.includes('edit') || a.includes('restor') || a.includes('mod')) return 'updated'
  if (a.includes('delet') || a.includes('void') || a.includes('cancel') || a.includes('remove')) return 'deleted'
  return null
}

export function ActivityPage() {
  const { org, user, role } = useAuth()
  const orgId = org?.id
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [actionFilter, setActionFilter] = useState<ActionBucket>('all')
  const [actorFilter, setActorFilter] = useState('all')

  const currentUserName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'
  const currentRoleLabel = role ? (role.charAt(0).toUpperCase() + role.slice(1)) : 'Owner'
  const currentUserDisplay = `${currentUserName} (${currentRoleLabel})`

  const { data: employees = [] } = useQuery({
    queryKey: ['employees', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('employees')
        .select('auth_user_id, full_name, role')
        .eq('organization_id', orgId!)
      return data ?? []
    },
  })

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['activity_log', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_log')
        .select('*')
        .eq('organization_id', orgId!)
        .order('created_at', { ascending: false })
        .limit(500)
      if (error) throw error
      return (data ?? []) as ActivityLog[]
    },
  })

  const getActorDisplayName = (log: ActivityLog): string => {
    let name = log.actor_name?.trim() || ''
    if (log.metadata && !name) {
      if (typeof log.metadata.actor_name === 'string') name = log.metadata.actor_name.trim()
    }

    if (!name || name === 'User' || !name.includes('(')) {
      if (log.actor_id && user && log.actor_id === user.id) {
        return currentUserDisplay
      }
      if (log.actor_id) {
        const emp = employees.find((e) => e.auth_user_id === log.actor_id)
        if (emp?.full_name) {
          const empRole = emp.role ? (emp.role.charAt(0).toUpperCase() + emp.role.slice(1)) : 'Staff'
          return `${emp.full_name} (${empRole})`
        }
      }
      if (name && name !== 'User') {
        return `${name} (${currentRoleLabel})`
      }
      return currentUserDisplay
    }
    return name
  }

  // Smart action bucketing for KPI cards
  const createdCount = logs.filter((l) => {
    const a = (l.action || '').toLowerCase()
    return a.includes('creat') || a.includes('add') || a.includes('insert')
  }).length

  const updatedCount = logs.filter((l) => {
    const a = (l.action || '').toLowerCase()
    return a.includes('updat') || a.includes('edit') || a.includes('restor') || a.includes('mod')
  }).length

  const deletedCount = logs.filter((l) => {
    const a = (l.action || '').toLowerCase()
    return a.includes('delet') || a.includes('void') || a.includes('cancel') || a.includes('remove')
  }).length

  const salesCount = logs.filter((l) => {
    const a = (l.action || '').toLowerCase()
    const e = (l.entity || '').toLowerCase()
    return a.includes('sale') || a.includes('invoice') || a.includes('bill') || e === 'sale' || e === 'sales' || e === 'invoice'
  }).length

  const actors = Array.from(new Set(logs.map((l) => getActorDisplayName(l)))).sort()

  const filtered = logs.filter((l) => {
    if (search.trim()) {
      const q = search.toLowerCase()
      const actor = getActorDisplayName(l).toLowerCase()
      const action = (l.action || '').toLowerCase()
      const entity = (l.entity || '').toLowerCase()
      const meta = l.metadata ? JSON.stringify(l.metadata).toLowerCase() : ''
      if (!(actor.includes(q) || action.includes(q) || entity.includes(q) || meta.includes(q))) return false
    }
    if (dateFrom && l.created_at < dateFrom) return false
    if (dateTo && l.created_at.slice(0, 10) > dateTo) return false
    if (actionFilter !== 'all') {
      const bucket = bucketOf(l.action)
      if (actionFilter === 'sales') {
        const a = (l.action || '').toLowerCase()
        const e = (l.entity || '').toLowerCase()
        const isSales = a.includes('sale') || a.includes('invoice') || a.includes('bill') || e === 'sale' || e === 'sales' || e === 'invoice'
        if (!isSales) return false
      } else if (bucket !== actionFilter) {
        return false
      }
    }
    if (actorFilter !== 'all' && getActorDisplayName(l) !== actorFilter) return false
    return true
  })

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Activity Log</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Full audit trail of all actions and user activity</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Created</p>
          <p className="text-2xl font-bold text-foreground">{createdCount}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Updated / Edited</p>
          <p className="text-2xl font-bold text-foreground">{updatedCount}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Deleted / Voided</p>
          <p className="text-2xl font-bold text-foreground">{deletedCount}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Sales & Billing</p>
          <p className="text-2xl font-bold text-foreground">{salesCount}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search actor, action, entity, details..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 w-auto" />
        <span className="text-xs text-muted-foreground">to</span>
        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 w-auto" />
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value as ActionBucket)}
          className="flex h-9 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="all">All Actions</option>
          <option value="created">Created</option>
          <option value="updated">Updated / Edited</option>
          <option value="deleted">Deleted / Voided</option>
          <option value="sales">Sales & Billing</option>
        </select>
        <select
          value={actorFilter}
          onChange={(e) => setActorFilter(e.target.value)}
          className="flex h-9 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="all">All Actors</option>
          {actors.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32">
            <Activity className="h-8 w-8 text-zinc-600 mb-2" />
            <p className="text-sm text-muted-foreground">No activity recorded yet</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString('en-IN', {
                      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </TableCell>
                  <TableCell className="text-sm font-medium text-foreground">
                    {getActorDisplayName(log)}
                  </TableCell>
                  <TableCell>
                    <span className={cn(
                      'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize',
                      getActionBadgeStyle(log.action)
                    )}>
                      {log.action.replace(/_/g, ' ')}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground capitalize">{log.entity.replace(/_/g, ' ')}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[280px] truncate" title={formatActivityDetails(log)}>
                    {formatActivityDetails(log)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
