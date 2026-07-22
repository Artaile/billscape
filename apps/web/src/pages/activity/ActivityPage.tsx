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
  actor_name: string
  action: string
  entity: string
  entity_id: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

const ACTION_COLORS: Record<string, string> = {
  created: 'bg-green-500/10 text-green-400 border-green-500/20',
  updated: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  deleted: 'bg-red-500/10 text-red-400 border-red-500/20',
  login: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  sale: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  return: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
}

export function ActivityPage() {
  const { org } = useAuth()
  const orgId = org?.id
  const [search, setSearch] = useState('')

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

  const filtered = logs.filter((l) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      l.actor_name.toLowerCase().includes(q) ||
      l.action.toLowerCase().includes(q) ||
      l.entity.toLowerCase().includes(q)
    )
  })

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Activity Log</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Full audit trail of all actions</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {['created', 'updated', 'deleted', 'sale'].map((action) => (
          <div key={action} className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground capitalize mb-1">{action}s</p>
            <p className="text-2xl font-bold text-foreground">
              {logs.filter((l) => l.action === action).length}
            </p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search actor, action, entity..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
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
                  <TableCell className="text-sm font-medium text-foreground">{log.actor_name}</TableCell>
                  <TableCell>
                    <span className={cn(
                      'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize',
                      ACTION_COLORS[log.action] ?? 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                    )}>
                      {log.action}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground capitalize">{log.entity}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                    {log.metadata ? JSON.stringify(log.metadata) : '—'}
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
