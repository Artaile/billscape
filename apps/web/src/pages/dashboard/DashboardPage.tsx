import React from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  TrendingUp,
  ShoppingBag,
  Receipt,
  AlertTriangle,
  Clock,
  Percent,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { formatINR } from '@billscape/core'
import { formatDateTime } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

function SkeletonCard() {
  return (
    <div className="rounded-lg border border-border bg-card p-6 animate-pulse">
      <div className="h-4 bg-zinc-800 rounded w-1/2 mb-3" />
      <div className="h-8 bg-zinc-800 rounded w-3/4" />
    </div>
  )
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 py-2 animate-pulse">
      <div className="h-4 bg-zinc-800 rounded flex-1" />
      <div className="h-4 bg-zinc-800 rounded w-24" />
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs shadow-xl">
        <p className="text-zinc-400 mb-1">{label}</p>
        <p className="font-semibold text-indigo-300">{formatINR(payload[0].value)}</p>
      </div>
    )
  }
  return null
}

export function DashboardPage() {
  const { org } = useAuth()
  const orgId = org?.id

  // Today's summary
  const { data: todayData, isLoading: todayLoading } = useQuery({
    queryKey: ['today-summary', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const { data } = await supabase
        .from('sales')
        .select('grand_total, created_at')
        .eq('organization_id', orgId!)
        .gte('created_at', today.toISOString())
      return data ?? []
    },
  })

  // Last 7 days chart
  const { data: weeklyData, isLoading: weeklyLoading } = useQuery({
    queryKey: ['weekly-sales', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const days: { date: string; total: number; label: string }[] = []
      for (let i = 6; i >= 0; i--) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        d.setHours(0, 0, 0, 0)
        const end = new Date(d)
        end.setHours(23, 59, 59, 999)

        const { data } = await supabase
          .from('sales')
          .select('grand_total')
          .eq('organization_id', orgId!)
          .gte('created_at', d.toISOString())
          .lte('created_at', end.toISOString())

        const total = (data ?? []).reduce((sum, s) => sum + (s.grand_total ?? 0), 0)
        days.push({
          date: d.toISOString(),
          total,
          label: d.toLocaleDateString('en-IN', { weekday: 'short' }),
        })
      }
      return days
    },
  })

  // Top products
  const { data: topProducts, isLoading: topLoading } = useQuery({
    queryKey: ['top-products', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('sale_items')
        .select('product_name, qty, line_total')
        .eq('organization_id', orgId!)
        .order('qty', { ascending: false })
        .limit(50)

      if (!data) return []

      const productMap = new Map<string, { qty: number; revenue: number }>()
      for (const item of data) {
        const existing = productMap.get(item.product_name)
        if (existing) {
          existing.qty += item.qty
          existing.revenue += item.line_total
        } else {
          productMap.set(item.product_name, { qty: item.qty, revenue: item.line_total })
        }
      }

      return Array.from(productMap.entries())
        .map(([name, stats]) => ({ name, ...stats }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5)
    },
  })

  // Low stock
  const { data: lowStock, isLoading: stockLoading } = useQuery({
    queryKey: ['low-stock', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory')
        .select('stock_qty, reorder_level, products(name)')
        .eq('organization_id', orgId!)
      
      if (error) throw error

      return (data ?? [])
        .filter((item: any) => item.stock_qty <= item.reorder_level)
        .slice(0, 5)
    },
  })

  // GST overview (current month)
  const { data: gstData, isLoading: gstLoading } = useQuery({
    queryKey: ['gst-overview', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const { data } = await supabase
        .from('sale_items')
        .select('cgst_amount, sgst_amount, igst_amount, sales!inner(organization_id, created_at)')
        .eq('sales.organization_id', orgId!)
        .gte('sales.created_at', monthStart)
      if (!data) return { collected: 0, paid: 0 }
      const collected = data.reduce(
        (sum, i) => sum + (i.cgst_amount ?? 0) + (i.sgst_amount ?? 0) + (i.igst_amount ?? 0),
        0
      )
      return { collected, paid: 0 }
    },
  })

  // Recent activity
  const { data: activity, isLoading: activityLoading } = useQuery({
    queryKey: ['activity', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('activity_log')
        .select('*')
        .eq('organization_id', orgId!)
        .order('created_at', { ascending: false })
        .limit(10)
      return data ?? []
    },
  })

  const todayTotal = todayData?.reduce((sum, s) => sum + (s.grand_total ?? 0), 0) ?? 0
  const billCount = todayData?.length ?? 0
  const avgBill = billCount > 0 ? todayTotal / billCount : 0
  const lowStockCount = lowStock?.length ?? 0

  const stats = [
    {
      label: "Today's Sales",
      value: todayLoading ? null : formatINR(todayTotal),
      icon: TrendingUp,
      color: 'text-indigo-400',
      bg: 'bg-indigo-600/10',
    },
    {
      label: 'Bills Today',
      value: todayLoading ? null : String(billCount),
      icon: Receipt,
      color: 'text-emerald-400',
      bg: 'bg-emerald-600/10',
    },
    {
      label: 'Avg Bill Value',
      value: todayLoading ? null : formatINR(avgBill),
      icon: ShoppingBag,
      color: 'text-blue-400',
      bg: 'bg-blue-600/10',
    },
    {
      label: 'Low Stock Items',
      value: stockLoading ? null : String(lowStockCount),
      icon: AlertTriangle,
      color: 'text-yellow-400',
      bg: 'bg-yellow-600/10',
    },
  ]

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Dashboard</h1>
        <p className="text-sm text-zinc-400 mt-0.5">
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-5">
              {todayLoading || stockLoading ? (
                <div className="animate-pulse space-y-2">
                  <div className="h-4 bg-zinc-800 rounded w-3/4" />
                  <div className="h-7 bg-zinc-800 rounded w-1/2" />
                </div>
              ) : (
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-zinc-400 mb-1">{stat.label}</p>
                    <p className="text-xl font-bold text-white">{stat.value}</p>
                  </div>
                  <div className={cn('rounded-lg p-2', stat.bg)}>
                    <stat.icon className={cn('h-5 w-5', stat.color)} />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* GST / TAX Overview */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="rounded-lg p-1.5 bg-orange-600/10">
            <Percent className="h-4 w-4 text-orange-400" />
          </div>
          <h2 className="text-sm font-semibold text-foreground">GST Overview — This Month</h2>
        </div>
        {gstLoading ? (
          <div className="grid grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="animate-pulse space-y-1.5">
                <div className="h-3 bg-zinc-800 rounded w-2/3" />
                <div className="h-6 bg-zinc-800 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-zinc-400 mb-1">GST Collected</p>
              <p className="text-lg font-bold text-emerald-400">{formatINR(gstData?.collected ?? 0)}</p>
              <p className="text-[10px] text-zinc-600 mt-0.5">From sales (CGST+SGST+IGST)</p>
            </div>
            <div>
              <p className="text-xs text-zinc-400 mb-1">GST Paid (Input)</p>
              <p className="text-lg font-bold text-red-400">{formatINR(gstData?.paid ?? 0)}</p>
              <p className="text-[10px] text-zinc-600 mt-0.5">On purchases</p>
            </div>
            <div>
              <p className="text-xs text-zinc-400 mb-1">Net Tax Payable</p>
              <p className="text-lg font-bold text-orange-400">
                {formatINR(Math.max(0, (gstData?.collected ?? 0) - (gstData?.paid ?? 0)))}
              </p>
              <p className="text-[10px] text-zinc-600 mt-0.5">Collected − Paid</p>
            </div>
          </div>
        )}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Bar chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Sales — Last 7 Days</CardTitle>
          </CardHeader>
          <CardContent>
            {weeklyLoading ? (
              <div className="h-48 animate-pulse bg-zinc-800/50 rounded-lg" />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={weeklyData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: '#71717a', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#71717a', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => v >= 1000 ? `₹${(v / 1000).toFixed(0)}k` : `₹${v}`}
                    width={40}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(99,102,241,0.08)' }} />
                  <Bar dataKey="total" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Low stock alerts */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-400" />
              Low Stock Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {stockLoading ? (
              Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)
            ) : lowStock && lowStock.length > 0 ? (
              lowStock.map((item, i) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const product = (item.products as unknown as { name: string }[] | null)?.[0] ?? null
                return (
                  <div
                    key={i}
                    className="flex items-center justify-between py-1.5 text-sm"
                  >
                    <span className="text-zinc-300 truncate flex-1">{product?.name ?? 'Unknown'}</span>
                    <Badge variant={item.stock_qty === 0 ? 'destructive' : 'warning'} className="ml-2 shrink-0">
                      {item.stock_qty} left
                    </Badge>
                  </div>
                )
              })
            ) : (
              <p className="text-sm text-zinc-500 py-4 text-center">All products well stocked</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top products */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Top 5 Products</CardTitle>
          </CardHeader>
          <CardContent>
            {topLoading ? (
              Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
            ) : topProducts && topProducts.length > 0 ? (
              <div className="space-y-2">
                {topProducts.map((p, i) => (
                  <div key={p.name} className="flex items-center gap-3">
                    <span className="text-xs text-zinc-600 w-4 text-right">{i + 1}</span>
                    <span className="flex-1 text-sm text-zinc-300 truncate">{p.name}</span>
                    <span className="text-xs text-zinc-500">{p.qty} sold</span>
                    <span className="text-sm font-medium text-indigo-300 tabular-nums">
                      {formatINR(p.revenue)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-500 py-4 text-center">No sales yet today</p>
            )}
          </CardContent>
        </Card>

        {/* Recent activity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4 text-zinc-400" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activityLoading ? (
              Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
            ) : activity && activity.length > 0 ? (
              <div className="space-y-2">
                {activity.map((log) => (
                  <div key={log.id} className="flex items-start gap-2 text-sm">
                    <div className="mt-0.5 h-1.5 w-1.5 rounded-full bg-indigo-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-zinc-300 text-xs leading-relaxed">
                        <span className="font-medium">{log.actor_name}</span>{' '}
                        {log.action} {log.entity}
                      </p>
                      <p className="text-[10px] text-zinc-600 mt-0.5">
                        {formatDateTime(log.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-500 py-4 text-center">No recent activity</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
