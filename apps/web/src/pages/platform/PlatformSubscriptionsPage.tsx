import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

export function PlatformSubscriptionsPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [assignOrgId, setAssignOrgId] = useState('')
  const [assignPlanId, setAssignPlanId] = useState('')
  const [assignCycle, setAssignCycle] = useState<'monthly' | 'yearly' | 'lifetime'>('monthly')
  const [assigning, setAssigning] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['platform-subscriptions'],
    queryFn: async () => {
      const [subsRes, orgsRes, plansRes] = await Promise.all([
        supabase.from('org_plans').select('*, organizations(id, name, status), plans(id, name, monthly_price)').order('created_at', { ascending: false }),
        supabase.from('organizations').select('id, name').order('name'),
        supabase.from('plans').select('id, name, monthly_price').eq('is_active', true).order('monthly_price'),
      ])
      return {
        subs: (subsRes.data ?? []) as any[],
        orgs: (orgsRes.data ?? []) as any[],
        plans: (plansRes.data ?? []) as any[],
      }
    },
  })

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('org_plans').update({ status: 'cancelled' }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['platform-subscriptions'] }),
  })

  async function handleAssign() {
    if (!assignOrgId || !assignPlanId) return
    setAssigning(true)
    try {
      const expiry = new Date()
      if (assignCycle === 'monthly') expiry.setMonth(expiry.getMonth() + 1)
      else if (assignCycle === 'yearly') expiry.setFullYear(expiry.getFullYear() + 1)

      const { error } = await supabase.from('org_plans').upsert({
        organization_id: assignOrgId,
        plan_id: assignPlanId,
        status: 'active',
        billing_cycle: assignCycle,
        start_date: new Date().toISOString().split('T')[0],
        expiry_date: assignCycle === 'lifetime' ? null : expiry.toISOString().split('T')[0],
        auto_renew: assignCycle !== 'lifetime',
      }, { onConflict: 'organization_id' })
      if (error) throw error
      queryClient.invalidateQueries({ queryKey: ['platform-subscriptions'] })
      setAssignOrgId(''); setAssignPlanId('')
    } catch (err: any) {
      alert(err.message)
    } finally {
      setAssigning(false)
    }
  }

  const filtered = (data?.subs ?? []).filter((s: any) =>
    search.trim() ? s.organizations?.name?.toLowerCase().includes(search.toLowerCase()) : true
  )

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Subscriptions</h1>
        <p className="text-sm text-slate-400 mt-0.5">Manage tenant plan assignments</p>
      </div>

      {/* Assign plan panel */}
      <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-indigo-300">Assign / Change Plan</h2>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <select value={assignOrgId} onChange={(e) => setAssignOrgId(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">Select Tenant...</option>
            {data?.orgs.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <select value={assignPlanId} onChange={(e) => setAssignPlanId(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">Select Plan...</option>
            {data?.plans.map((p: any) => (
              <option key={p.id} value={p.id}>{p.name} — {p.monthly_price === 0 ? 'Free' : `₹${p.monthly_price}/mo`}</option>
            ))}
          </select>
          <select value={assignCycle} onChange={(e) => setAssignCycle(e.target.value as any)}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
            <option value="lifetime">Lifetime</option>
          </select>
          <button onClick={handleAssign} disabled={!assignOrgId || !assignPlanId || assigning}
            className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 flex items-center justify-center gap-2 transition-colors">
            {assigning && <Loader2 className="h-4 w-4 animate-spin" />}
            Assign Plan
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search subscriptions..."
          className="w-full rounded-lg border border-slate-700 bg-slate-900 pl-9 pr-4 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-700/50 bg-slate-900 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/50 text-xs text-slate-400 uppercase tracking-wide">
              <th className="text-left px-5 py-3 font-medium">Tenant</th>
              <th className="text-left px-4 py-3 font-medium">Plan</th>
              <th className="text-left px-4 py-3 font-medium">Billing Cycle</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-left px-4 py-3 font-medium">Expires</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/30">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="px-5 py-4"><div className="h-4 bg-slate-800 rounded animate-pulse" /></td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-slate-500">No subscriptions found</td>
              </tr>
            ) : (
              filtered.map((sub: any) => (
                <tr key={sub.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-5 py-4">
                    <Link to={`/platform/tenants/${sub.organization_id}`}
                      className="font-medium text-white hover:text-indigo-400 transition-colors">
                      {sub.organizations?.name ?? '—'}
                    </Link>
                  </td>
                  <td className="px-4 py-4 text-slate-300">{sub.plans?.name ?? '—'}</td>
                  <td className="px-4 py-4 text-slate-400 capitalize">{sub.billing_cycle}</td>
                  <td className="px-4 py-4">
                    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold',
                      sub.status === 'active' ? 'bg-emerald-500/15 text-emerald-400' :
                      sub.status === 'trial' ? 'bg-amber-500/15 text-amber-400' :
                      sub.status === 'expired' ? 'bg-red-500/15 text-red-400' :
                      'bg-slate-700 text-slate-400'
                    )}>
                      {sub.status?.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-slate-400 text-xs">
                    {sub.expiry_date
                      ? new Date(sub.expiry_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                      : 'Never'}
                  </td>
                  <td className="px-4 py-4 text-right">
                    {sub.status !== 'cancelled' && (
                      <button
                        onClick={() => { if (confirm('Cancel this subscription?')) cancelMutation.mutate(sub.id) }}
                        className="text-xs text-red-400 hover:text-red-300 hover:underline transition-colors">
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
