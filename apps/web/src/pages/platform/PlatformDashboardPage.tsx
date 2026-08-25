import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Building2,
  TrendingUp,
  CreditCard,
  AlertTriangle,
  Users2,
  Receipt,
  Calendar,
  Filter,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'

function KPICard({
  label,
  value,
  icon: Icon,
  color,
  sub,
}: {
  label: string
  value: string | number
  icon: React.ElementType
  color: string
  sub?: string
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

const CustomSalesTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-900/95 p-3 shadow-2xl text-xs space-y-1 backdrop-blur-md">
        <p className="text-slate-400 font-medium">{label}</p>
        <p className="text-base font-bold text-indigo-400">
          {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(
            payload[0].value
          )}
        </p>
        <p className="text-[10px] text-slate-500">Platform Sales Volume</p>
      </div>
    )
  }
  return null
}

const CustomTenantsTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-900/95 p-3 shadow-2xl text-xs space-y-1 backdrop-blur-md">
        <p className="text-slate-400 font-medium">{label}</p>
        <p className="text-base font-bold text-emerald-400">
          +{payload[0].value} New Shops
        </p>
        <p className="text-[10px] text-slate-500">Tenant Registrations</p>
      </div>
    )
  }
  return null
}

export function PlatformDashboardPage() {
  // Global Top Dashboard Date Range State
  const [globalPreset, setGlobalPreset] = useState<'7d' | '30d' | 'custom'>('7d')
  const [globalFrom, setGlobalFrom] = useState('')
  const [globalTo, setGlobalTo] = useState('')

  // Chart 1 (Sales) Independent Date Range State
  const [salesPreset, setSalesPreset] = useState<'7d' | '30d' | 'custom'>('7d')
  const [salesFrom, setSalesFrom] = useState('')
  const [salesTo, setSalesTo] = useState('')

  // Chart 2 (Tenants) Independent Date Range State
  const [tenantsPreset, setTenantsPreset] = useState<'7d' | '30d' | 'custom'>('7d')
  const [tenantsFrom, setTenantsFrom] = useState('')
  const [tenantsTo, setTenantsTo] = useState('')

  // Helper to compute date boundaries
  function getRangeDates(preset: '7d' | '30d' | 'custom', customFromStr: string, customToStr: string) {
    const now = new Date()
    let end = new Date(now)
    let start = new Date(now)
    if (preset === '7d') {
      start.setDate(now.getDate() - 7)
    } else if (preset === '30d') {
      start.setDate(now.getDate() - 30)
    } else if (preset === 'custom' && customFromStr && customToStr) {
      start = new Date(customFromStr)
      end = new Date(customToStr)
      end.setHours(23, 59, 59, 999)
    }
    return { start, end }
  }

  // Fetch Dashboard Stats & Analytics Data
  const { data: stats, isLoading } = useQuery({
    queryKey: [
      'platform-dashboard',
      globalPreset,
      globalFrom,
      globalTo,
      salesPreset,
      salesFrom,
      salesTo,
      tenantsPreset,
      tenantsFrom,
      tenantsTo,
    ],
    queryFn: async () => {
      const [orgs, plans, orgPlans, sales] = await Promise.all([
        supabase.from('organizations').select('id, name, status, created_at'),
        supabase.from('plans').select('id, name, is_active'),
        supabase.from('org_plans').select('id, organization_id, plan_id, status, expiry_date, plans(name, monthly_price)'),
        supabase.from('sales').select('grand_total, created_at'),
      ])

      const allOrgs = (orgs.data ?? []).filter((o) => o.status !== 'deleted')
      const allOrgPlans = (orgPlans.data ?? []) as any[]
      const allSales = sales.data ?? []

      // Global Date Filter calculation
      const globalRange = getRangeDates(globalPreset, globalFrom, globalTo)
      const rangeSales = allSales.filter((s) => {
        const d = new Date(s.created_at)
        return d >= globalRange.start && d <= globalRange.end
      })
      const rangeOrgs = allOrgs.filter((o) => {
        const d = new Date(o.created_at)
        return d >= globalRange.start && d <= globalRange.end
      })

      // Sales Chart Date Filter calculation
      const salesRange = getRangeDates(salesPreset, salesFrom, salesTo)
      const chartSalesData = generateDailyChart(
        allSales,
        salesRange.start,
        salesRange.end,
        (s) => s.grand_total ?? 0
      )

      // Tenants Chart Date Filter calculation
      const tenantsRange = getRangeDates(tenantsPreset, tenantsFrom, tenantsTo)
      const chartTenantsData = generateDailyChart(
        allOrgs,
        tenantsRange.start,
        tenantsRange.end,
        () => 1
      )

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
        globalSalesTotal: rangeSales.reduce((sum, s) => sum + (s.grand_total ?? 0), 0),
        globalTenantsCount: rangeOrgs.length,
        salesChartPoints: chartSalesData.points,
        salesChartTotal: chartSalesData.total,
        tenantsChartPoints: chartTenantsData.points,
        tenantsChartTotal: chartTenantsData.total,
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

  // Helper to construct daily aggregated points
  function generateDailyChart<T extends { created_at: string }>(
    items: T[],
    start: Date,
    end: Date,
    valFn: (item: T) => number
  ) {
    const daysCount = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)))
    const map: Record<string, { label: string; value: number }> = {}

    for (let i = 0; i <= daysCount; i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      const key = d.toISOString().split('T')[0]
      const label = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
      map[key] = { label, value: 0 }
    }

    let total = 0
    items.forEach((item) => {
      const d = new Date(item.created_at)
      if (d >= start && d <= end) {
        const key = d.toISOString().split('T')[0]
        if (map[key]) {
          const val = valFn(item)
          map[key].value += val
          total += val
        }
      }
    })

    return { points: Object.values(map), total }
  }

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Top Header & Global Date Filter Dropdown */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Platform Dashboard</h1>
          <p className="text-sm text-slate-400 mt-0.5">Overview of all tenants, sales analytics and revenue</p>
        </div>

        {/* Global Filter Controls Bar */}
        <div className="flex flex-wrap items-center gap-3 bg-slate-900 border border-slate-700/50 p-2 rounded-xl">
          <div className="flex items-center gap-1.5 text-slate-400 text-xs px-1 font-medium">
            <Filter className="h-3.5 w-3.5 text-indigo-400" /> Global Range:
          </div>

          {/* Dropdown Selector */}
          <select
            value={globalPreset}
            onChange={(e) => setGlobalPreset(e.target.value as any)}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer font-medium"
          >
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last Month (30 Days)</option>
            <option value="custom">Custom Date Range</option>
          </select>

          {/* Custom Date Pickers */}
          {globalPreset === 'custom' && (
            <div className="flex items-center gap-2 pl-2 border-l border-slate-700">
              <input
                type="date"
                value={globalFrom}
                onChange={(e) => setGlobalFrom(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-white focus:outline-none"
              />
              <span className="text-xs text-slate-500">to</span>
              <input
                type="date"
                value={globalTo}
                onChange={(e) => setGlobalTo(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-white focus:outline-none"
              />
            </div>
          )}
        </div>
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
            <KPICard
              label={`Platform Sales (${globalPreset === '7d' ? '7 Days' : globalPreset === '30d' ? '30 Days' : 'Selected Period'})`}
              value={fmt(stats?.globalSalesTotal ?? 0)}
              icon={Receipt}
              color="bg-pink-600"
              sub={`${stats?.globalTenantsCount ?? 0} new tenants in period`}
            />
          </>
        )}
      </div>

      {/* Recharts Interactive Analytics Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Sales Revenue Area Chart */}
        <div className="rounded-xl border border-slate-700/50 bg-slate-900 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-700/50 pb-4">
            <div>
              <h2 className="text-sm font-semibold text-white">Sales & Revenue Analytics</h2>
              <p className="text-xs text-slate-400 mt-0.5">Daily sales volume across all tenant stores</p>
            </div>

            {/* Per-Chart Independent Filter Dropdown */}
            <div className="flex items-center gap-2">
              <select
                value={salesPreset}
                onChange={(e) => setSalesPreset(e.target.value as any)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last Month (30d)</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>
          </div>

          {/* Custom Date Pickers for Sales Chart */}
          {salesPreset === 'custom' && (
            <div className="flex items-center gap-2 bg-slate-800/60 p-2 rounded-lg border border-slate-700 text-xs">
              <span className="text-slate-400">From:</span>
              <input
                type="date"
                value={salesFrom}
                onChange={(e) => setSalesFrom(e.target.value)}
                className="rounded bg-slate-800 border border-slate-700 px-2 py-0.5 text-white"
              />
              <span className="text-slate-400">To:</span>
              <input
                type="date"
                value={salesTo}
                onChange={(e) => setSalesTo(e.target.value)}
                className="rounded bg-slate-800 border border-slate-700 px-2 py-0.5 text-white"
              />
            </div>
          )}

          {/* Interactive Recharts Area */}
          <div className="h-64 w-full pt-2">
            {isLoading || !stats?.salesChartPoints ? (
              <div className="flex items-center justify-center h-full text-slate-500 text-xs animate-pulse">
                Loading sales chart...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.salesChartPoints} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="label" stroke="#64748b" fontSize={11} tickLine={false} />
                  <YAxis
                    stroke="#64748b"
                    fontSize={10}
                    tickLine={false}
                    tickFormatter={(val) => `₹${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                  />
                  <Tooltip content={<CustomSalesTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#6366f1"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#salesGrad)"
                    activeDot={{ r: 6, stroke: '#818cf8', strokeWidth: 2, fill: '#1e1b4b' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 2: Tenant Growth Bar Chart */}
        <div className="rounded-xl border border-slate-700/50 bg-slate-900 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-700/50 pb-4">
            <div>
              <h2 className="text-sm font-semibold text-white">New Tenant Registrations</h2>
              <p className="text-xs text-slate-400 mt-0.5">Shops registered per day</p>
            </div>

            {/* Per-Chart Independent Filter Dropdown */}
            <div className="flex items-center gap-2">
              <select
                value={tenantsPreset}
                onChange={(e) => setTenantsPreset(e.target.value as any)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
              >
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last Month (30d)</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>
          </div>

          {/* Custom Date Pickers for Tenants Chart */}
          {tenantsPreset === 'custom' && (
            <div className="flex items-center gap-2 bg-slate-800/60 p-2 rounded-lg border border-slate-700 text-xs">
              <span className="text-slate-400">From:</span>
              <input
                type="date"
                value={tenantsFrom}
                onChange={(e) => setTenantsFrom(e.target.value)}
                className="rounded bg-slate-800 border border-slate-700 px-2 py-0.5 text-white"
              />
              <span className="text-slate-400">To:</span>
              <input
                type="date"
                value={tenantsTo}
                onChange={(e) => setTenantsTo(e.target.value)}
                className="rounded bg-slate-800 border border-slate-700 px-2 py-0.5 text-white"
              />
            </div>
          )}

          {/* Interactive Recharts Bar */}
          <div className="h-64 w-full pt-2">
            {isLoading || !stats?.tenantsChartPoints ? (
              <div className="flex items-center justify-center h-full text-slate-500 text-xs animate-pulse">
                Loading tenant growth chart...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.tenantsChartPoints} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="tenantsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.9} />
                      <stop offset="95%" stopColor="#059669" stopOpacity={0.5} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="label" stroke="#64748b" fontSize={11} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={10} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<CustomTenantsTooltip />} />
                  <Bar dataKey="value" fill="url(#tenantsGrad)" radius={[6, 6, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Tables Row */}
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
