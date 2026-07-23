import { useQuery } from '@tanstack/react-query'
import { Building2, TrendingUp, CreditCard, AlertTriangle, Users2, Receipt } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

function KPICard({ label, value, icon: Icon, color, sub }: {
  label: string; value: string | number; icon: React.ElementType; color: string; sub?: string
}) {
  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900 p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-400 mb-1">{label}</p>
          <p className="text-2xl font-bold text-white">{value}</p>
          {sub && <p className="text-[11px] text-slate-500 mt-1">{sub}</p>}
        </div>
        <div className={cn('rounded-lg p-2.5', color)}>
          <Icon className="h-5 w-5 text-white" />
        </div>
      </div>
    </div>
  )
}

export function PlatformDashboardPage() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['platform-dashboard'],
    queryFn: async () => {
      const [orgs, plans, orgPlans, sales] = await Promise.all([
        supabase.from('organizations').select('id, name, status, created_at'),
        supabase.from('plans').select('id, name, is_active'),
        supabase.from('org_plans').select('id, organization_id, plan_id, status, expiry_date, plans(name, monthly_price)'),
        supabase.from('sales').select('grand_total, created_at'),
      ])

      const allOrgs = orgs.data ?? []
      const allOrgPlans = (orgPlans.data ?? []) as any[]
      const allSales = sales.data ?? []

      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

      return {
        totalTenants: allOrgs.length,
        activeTenants: allOrgs.filter((o) => o.status === 'active').length,
        suspendedTenants: allOrgs.filter((o) => o.status === 'suspended').length,
        trialTenants: allOrgPlans.filter((op) => op.status === 'trial').length,
        activePlans: (plans.data ?? []).filter((p) => p.is_active).length,
        activeSubscriptions: allOrgPlans.filter((op) => op.status === 'active').length,
        mrr: allOrgPlans
          .filter((op) => op.status === 'active')
          .reduce((sum: number, op: any) => sum + (op.plans?.monthly_price ?? 0), 0),
        totalSalesThisMonth: allSales
          .filter((s) => new Date(s.created_at) >= monthStart)
          .reduce((sum, s) => sum + (s.grand_total ?? 0), 0),
        recentTenants: allOrgs
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 5)
          .map((o) => ({
            ...o,
            plan: allOrgPlans.find((op) => op.organization_id === o.id),
          })),
        recentSubscriptions: allOrgPlans
          .sort((a: any, b: any) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
          .slice(0, 5),
      }
    },
  })

  const fmt = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Platform Dashboard</h1>
        <p className="text-sm text-slate-400 mt-0.5">Overview of all tenants and revenue</p>
      </div>

      {/* KPI Row 1 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-slate-700/50 bg-slate-900 p-5 animate-pulse h-24" />
          ))
        ) : (
          <>
            <KPICard label="Total Tenants" value={stats?.totalTenants ?? 0} icon={Building2} color="bg-indigo-600" />
            <KPICard label="Active Tenants" value={stats?.activeTenants ?? 0} icon={TrendingUp} color="bg-emerald-600" />
            <KPICard label="Trial Tenants" value={stats?.trialTenants ?? 0} icon={Users2} color="bg-amber-600" />
            <KPICard label="Suspended" value={stats?.suspendedTenants ?? 0} icon={AlertTriangle} color="bg-red-600" />
          </>
        )}
      </div>

      {/* KPI Row 2 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-slate-700/50 bg-slate-900 p-5 animate-pulse h-24" />
          ))
        ) : (
          <>
            <KPICard label="MRR" value={fmt(stats?.mrr ?? 0)} icon={CreditCard} color="bg-violet-600" sub="Monthly recurring revenue" />
            <KPICard label="Active Subscriptions" value={stats?.activeSubscriptions ?? 0} icon={CreditCard} color="bg-blue-600" />
            <KPICard label="Active Plans" value={stats?.activePlans ?? 0} icon={CreditCard} color="bg-cyan-600" />
            <KPICard label="Platform Sales (This Month)" value={fmt(stats?.totalSalesThisMonth ?? 0)} icon={Receipt} color="bg-pink-600" sub="Across all tenants" />
          </>
        )}
      </div>

      {/* Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Tenants */}
        <div className="rounded-xl border border-slate-700/50 bg-slate-900 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50">
            <h2 className="text-sm font-semibold text-white">Recent Tenants</h2>
            <Link to="/platform/tenants" className="text-xs text-indigo-400 hover:text-indigo-300">View all →</Link>
          </div>
          <div className="divide-y divide-slate-700/30">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="px-5 py-3 animate-pulse flex gap-3">
                  <div className="h-4 bg-slate-800 rounded flex-1" />
                  <div className="h-4 bg-slate-800 rounded w-20" />
                </div>
              ))
            ) : stats?.recentTenants.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-8">No tenants yet</p>
            ) : (
              stats?.recentTenants.map((t) => (
                <Link
                  key={t.id}
                  to={`/platform/tenants/${t.id}`}
                  className="flex items-center justify-between px-5 py-3 hover:bg-slate-800/50 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-white">{t.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {t.plan?.plans?.name ?? 'No plan'} · {new Date(t.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold',
                    t.status === 'active' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                  )}>
                    {t.status.toUpperCase()}
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Recent Subscriptions */}
        <div className="rounded-xl border border-slate-700/50 bg-slate-900 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50">
            <h2 className="text-sm font-semibold text-white">Recent Subscriptions</h2>
            <Link to="/platform/subscriptions" className="text-xs text-indigo-400 hover:text-indigo-300">View all →</Link>
          </div>
          <div className="divide-y divide-slate-700/30">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="px-5 py-3 animate-pulse flex gap-3">
                  <div className="h-4 bg-slate-800 rounded flex-1" />
                  <div className="h-4 bg-slate-800 rounded w-20" />
                </div>
              ))
            ) : stats?.recentSubscriptions.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-8">No subscriptions yet</p>
            ) : (
              (stats?.recentSubscriptions as any[]).map((sub) => (
                <div key={sub.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-medium text-white">{sub.plans?.name ?? '—'}</p>
                    <p className="text-[11px] text-slate-500">
                      {sub.billing_cycle} · Expires {sub.expiry_date
                        ? new Date(sub.expiry_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                        : 'Never'}
                    </p>
                  </div>
                  <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold',
                    sub.status === 'active' ? 'bg-emerald-500/15 text-emerald-400' :
                    sub.status === 'trial' ? 'bg-amber-500/15 text-amber-400' :
                    'bg-slate-500/15 text-slate-400'
                  )}>
                    {sub.status.toUpperCase()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
