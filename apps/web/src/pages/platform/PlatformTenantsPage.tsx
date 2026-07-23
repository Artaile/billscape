import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  Search, Plus, Loader2, Building2, ArrowLeft,
  Users, Package, Receipt, ShieldAlert, ShieldCheck,
  Trash2, Edit2, ChevronRight,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

// ─── Tenant List ────────────────────────────────────────────────────────────

export function PlatformTenantsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [creating, setCreating] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended' | 'trial'>('all')

  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ['platform-tenants'],
    queryFn: async () => {
      const { data } = await supabase
        .from('organizations')
        .select('id, name, status, created_at, business_type')
        .order('created_at', { ascending: false })
      const { data: orgPlans } = await supabase
        .from('org_plans')
        .select('organization_id, status, plans(name)')
      return (data ?? []).map((org) => ({
        ...org,
        orgPlan: (orgPlans as any[])?.find((op) => op.organization_id === org.id),
      }))
    },
  })

  const suspendMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'active' | 'suspended' }) => {
      const { error } = await supabase.from('organizations').update({ status }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['platform-tenants'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('organizations').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['platform-tenants'] }),
  })

  async function handleCreate() {
    if (!createName.trim()) return
    setCreating(true)
    try {
      const { error } = await supabase.from('organizations').insert({
        name: createName.trim(),
        state_code: 'TN',
        country: 'IN',
        business_type: 'general',
        plan: 'free',
        status: 'active',
      })
      if (error) throw error
      queryClient.invalidateQueries({ queryKey: ['platform-tenants'] })
      setShowCreate(false)
      setCreateName('')
    } catch (err: any) {
      alert(err.message)
    } finally {
      setCreating(false)
    }
  }

  const filtered = tenants.filter((t) => {
    const matchSearch = search.trim()
      ? t.name.toLowerCase().includes(search.toLowerCase())
      : true
    const matchStatus = statusFilter === 'all' ? true
      : statusFilter === 'trial' ? t.orgPlan?.status === 'trial'
      : t.status === statusFilter
    return matchSearch && matchStatus
  })

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Tenants</h1>
          <p className="text-sm text-slate-400 mt-0.5">{tenants.length} registered shops</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition-colors"
        >
          <Plus className="h-4 w-4" /> Create Tenant
        </button>
      </div>

      {/* Create Tenant inline form */}
      {showCreate && (
        <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-4 flex items-center gap-3">
          <input
            autoFocus
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="Shop / Company name"
            className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button onClick={handleCreate} disabled={creating}
            className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 flex items-center gap-2">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Create
          </button>
          <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-white p-2">✕</button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tenants..."
            className="rounded-lg border border-slate-700 bg-slate-900 pl-9 pr-4 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-64"
          />
        </div>
        <div className="flex rounded-lg bg-slate-800 p-1 gap-1">
          {(['all', 'active', 'trial', 'suspended'] as const).map((f) => (
            <button key={f} onClick={() => setStatusFilter(f)}
              className={cn('rounded-md px-3 py-1 text-xs font-medium transition-all capitalize',
                statusFilter === f ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white')}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-700/50 bg-slate-900 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/50 text-xs text-slate-400 uppercase tracking-wide">
              <th className="text-left px-5 py-3 font-medium">Tenant</th>
              <th className="text-left px-4 py-3 font-medium">Plan</th>
              <th className="text-left px-4 py-3 font-medium">Type</th>
              <th className="text-left px-4 py-3 font-medium">Created</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/30">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="px-5 py-4">
                      <div className="h-4 bg-slate-800 rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-slate-500">
                  <Building2 className="h-8 w-8 mx-auto mb-2 text-slate-700" />
                  No tenants found
                </td>
              </tr>
            ) : (
              filtered.map((t) => (
                <tr key={t.id} className="hover:bg-slate-800/50 transition-colors group">
                  <td className="px-5 py-4">
                    <Link to={`/platform/tenants/${t.id}`}
                      className="flex items-center gap-2.5 group-hover:text-indigo-400 transition-colors">
                      <div className="h-7 w-7 rounded-lg bg-indigo-600/20 flex items-center justify-center text-xs font-bold text-indigo-400 shrink-0">
                        {t.name[0]?.toUpperCase()}
                      </div>
                      <span className="font-medium text-white">{t.name}</span>
                      <ChevronRight className="h-3.5 w-3.5 text-slate-600 group-hover:text-indigo-400" />
                    </Link>
                  </td>
                  <td className="px-4 py-4 text-slate-300 text-xs">
                    {t.orgPlan?.plans?.name ?? 'No plan'}
                    {t.orgPlan?.status === 'trial' && (
                      <span className="ml-1.5 rounded-full bg-amber-500/10 text-amber-400 px-1.5 py-0.5 text-[10px]">Trial</span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-slate-400 text-xs capitalize">{t.business_type}</td>
                  <td className="px-4 py-4 text-slate-400 text-xs whitespace-nowrap">
                    {new Date(t.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-4">
                    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold',
                      t.status === 'active' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                    )}>
                      {t.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => navigate(`/platform/tenants/${t.id}`)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-700 transition-colors"
                        title="View details"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      {t.status === 'active' ? (
                        <button
                          onClick={() => { if (confirm(`Suspend ${t.name}?`)) suspendMutation.mutate({ id: t.id, status: 'suspended' }) }}
                          className="p-1.5 rounded-lg text-amber-500 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                          title="Suspend"
                        >
                          <ShieldAlert className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <button
                          onClick={() => suspendMutation.mutate({ id: t.id, status: 'active' })}
                          className="p-1.5 rounded-lg text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                          title="Reactivate"
                        >
                          <ShieldCheck className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => { if (confirm(`Permanently delete ${t.name}? This cannot be undone.`)) deleteMutation.mutate(t.id) }}
                        className="p-1.5 rounded-lg text-red-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
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

// ─── Per-Tenant Detail ───────────────────────────────────────────────────────

export function PlatformTenantDetailPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['platform-tenant', id],
    enabled: !!id,
    queryFn: async () => {
      const [orgRes, membersRes, orgPlanRes, productsRes, salesRes, plansRes] = await Promise.all([
        supabase.from('organizations').select('*').eq('id', id!).single(),
        supabase.from('memberships').select('id, role, user_id, profiles(full_name, email)').eq('organization_id', id!),
        supabase.from('org_plans').select('*, plans(name, monthly_price, limits)').eq('organization_id', id!).maybeSingle(),
        supabase.from('products').select('id').eq('organization_id', id!).eq('is_active', true),
        supabase.from('sales').select('grand_total').eq('organization_id', id!),
        supabase.from('plans').select('id, name, monthly_price').eq('is_active', true),
      ])
      return {
        org: orgRes.data,
        members: (membersRes.data ?? []) as any[],
        orgPlan: orgPlanRes.data as any,
        productCount: productsRes.data?.length ?? 0,
        salesTotal: (salesRes.data ?? []).reduce((s, r) => s + (r.grand_total ?? 0), 0),
        invoiceCount: salesRes.data?.length ?? 0,
        plans: (plansRes.data ?? []) as any[],
      }
    },
  })

  const suspendMutation = useMutation({
    mutationFn: async (status: 'active' | 'suspended') => {
      const { error } = await supabase.from('organizations').update({ status }).eq('id', id!)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['platform-tenant', id] }),
  })

  const assignPlanMutation = useMutation({
    mutationFn: async (planId: string) => {
      const expiryDate = new Date()
      expiryDate.setMonth(expiryDate.getMonth() + 1)
      const { error } = await supabase.from('org_plans').upsert({
        organization_id: id!,
        plan_id: planId,
        status: 'active',
        billing_cycle: 'monthly',
        start_date: new Date().toISOString().split('T')[0],
        expiry_date: expiryDate.toISOString().split('T')[0],
        auto_renew: true,
      }, { onConflict: 'organization_id' })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['platform-tenant', id] }),
  })

  const fmt = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
    </div>
  )

  if (!data?.org) return (
    <div className="p-6 text-center text-slate-400">Tenant not found</div>
  )

  const { org, members, orgPlan, productCount, salesTotal, invoiceCount, plans } = data

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link to="/platform/tenants" className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors mt-0.5">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-indigo-600/20 flex items-center justify-center text-lg font-bold text-indigo-400">
              {org.name[0]?.toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">{org.name}</h1>
              <p className="text-sm text-slate-400 capitalize">{org.business_type} · {org.country}</p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {org.status === 'active' ? (
            <button onClick={() => { if (confirm(`Suspend ${org.name}?`)) suspendMutation.mutate('suspended') }}
              className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-400 hover:bg-amber-500/20 transition-colors">
              <ShieldAlert className="h-4 w-4" /> Suspend
            </button>
          ) : (
            <button onClick={() => suspendMutation.mutate('active')}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400 hover:bg-emerald-500/20 transition-colors">
              <ShieldCheck className="h-4 w-4" /> Reactivate
            </button>
          )}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-700/50 bg-slate-900 p-4">
          <p className="text-xs text-slate-400 mb-1">Status</p>
          <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-semibold',
            org.status === 'active' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
          )}>
            {org.status.toUpperCase()}
          </span>
        </div>
        <div className="rounded-xl border border-slate-700/50 bg-slate-900 p-4">
          <div className="flex items-center gap-1.5 mb-1"><Package className="h-3.5 w-3.5 text-slate-500" /><p className="text-xs text-slate-400">Products</p></div>
          <p className="text-xl font-bold text-white">{productCount}</p>
        </div>
        <div className="rounded-xl border border-slate-700/50 bg-slate-900 p-4">
          <div className="flex items-center gap-1.5 mb-1"><Receipt className="h-3.5 w-3.5 text-slate-500" /><p className="text-xs text-slate-400">Total Invoices</p></div>
          <p className="text-xl font-bold text-white">{invoiceCount}</p>
        </div>
        <div className="rounded-xl border border-slate-700/50 bg-slate-900 p-4">
          <p className="text-xs text-slate-400 mb-1">Total Revenue</p>
          <p className="text-xl font-bold text-emerald-400">{fmt(salesTotal)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Plan assignment */}
        <div className="rounded-xl border border-slate-700/50 bg-slate-900 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white">Current Plan</h2>
          {orgPlan ? (
            <div className="rounded-lg bg-slate-800 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-white">{orgPlan.plans?.name}</p>
                <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold',
                  orgPlan.status === 'active' ? 'bg-emerald-500/15 text-emerald-400' :
                  orgPlan.status === 'trial' ? 'bg-amber-500/15 text-amber-400' :
                  'bg-slate-500/15 text-slate-400'
                )}>
                  {orgPlan.status?.toUpperCase()}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {orgPlan.billing_cycle} · Expires {orgPlan.expiry_date
                  ? new Date(orgPlan.expiry_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                  : 'Never'}
              </p>
              {orgPlan.plans?.limits && (
                <div className="pt-2 grid grid-cols-2 gap-1.5 text-[11px] text-slate-400">
                  {Object.entries(orgPlan.plans.limits).map(([k, v]) => (
                    <p key={k}>{k}: <span className="text-white">{v === -1 ? '∞' : String(v)}</span></p>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No plan assigned</p>
          )}

          <div className="space-y-2">
            <p className="text-xs text-slate-400 font-medium">Change Plan</p>
            <div className="grid gap-2">
              {plans.map((plan) => (
                <button
                  key={plan.id}
                  onClick={() => { if (confirm(`Assign "${plan.name}" to ${org.name}?`)) assignPlanMutation.mutate(plan.id) }}
                  disabled={assignPlanMutation.isPending || orgPlan?.plan_id === plan.id}
                  className={cn(
                    'flex items-center justify-between rounded-lg border px-4 py-3 text-sm transition-colors text-left',
                    orgPlan?.plan_id === plan.id
                      ? 'border-indigo-500/50 bg-indigo-600/10 text-indigo-300 cursor-default'
                      : 'border-slate-700 bg-slate-800 text-white hover:border-indigo-500/50 hover:bg-indigo-600/10'
                  )}
                >
                  <span className="font-medium">{plan.name}</span>
                  <span className="text-slate-400 text-xs">
                    {plan.monthly_price === 0 ? 'Free' : `₹${plan.monthly_price}/mo`}
                    {orgPlan?.plan_id === plan.id && <span className="ml-2 text-indigo-400">Current</span>}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Members */}
        <div className="rounded-xl border border-slate-700/50 bg-slate-900 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-white">Team Members ({members.length})</h2>
          </div>
          <div className="space-y-2">
            {members.length === 0 ? (
              <p className="text-sm text-slate-500">No members</p>
            ) : (
              members.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-lg bg-slate-800 px-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-white">{m.profiles?.full_name || m.profiles?.email || 'Unknown'}</p>
                    <p className="text-[11px] text-slate-500">{m.profiles?.email}</p>
                  </div>
                  <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize',
                    m.role === 'owner' ? 'bg-orange-500/15 text-orange-400' :
                    m.role === 'manager' ? 'bg-purple-500/15 text-purple-400' :
                    'bg-blue-500/15 text-blue-400'
                  )}>
                    {m.role}
                  </span>
                </div>
              ))
            )}
          </div>

          {/* Org info */}
          <div className="pt-2 border-t border-slate-700/50 space-y-2">
            <p className="text-xs font-medium text-slate-400">Shop Info</p>
            {org.gstin && <p className="text-xs text-slate-300">GSTIN: <span className="font-mono">{org.gstin}</span></p>}
            {org.address && <p className="text-xs text-slate-300">Address: {org.address}</p>}
            <p className="text-xs text-slate-500">
              Created {new Date(org.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
