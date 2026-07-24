import { useQuery } from '@tanstack/react-query'
import { Loader2, Building2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

function UsageMeter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = limit <= 0 ? 0 : Math.min(100, Math.round((used / limit) * 100))
  const isUnlimited = limit === -1
  const isWarning = !isUnlimited && pct >= 80
  const isFull = !isUnlimited && pct >= 100

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className={cn('font-medium', isFull ? 'text-red-400' : isWarning ? 'text-amber-400' : 'text-slate-300')}>
          {isUnlimited ? `${used} / ∞` : `${used} / ${limit}`}
        </span>
      </div>
      {!isUnlimited && (
        <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', isFull ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-indigo-500')}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  )
}

export function PlatformUsagePage() {
  const { data, isLoading } = useQuery({
    queryKey: ['platform-usage'],
    queryFn: async () => {
      const [orgsRes, orgPlansRes, productsRes, salesRes, employeesRes, customersRes] = await Promise.all([
        supabase.from('organizations').select('id, name, status').order('name'),
        supabase.from('org_plans').select('organization_id, plans(limits, name)'),
        supabase.from('products').select('id, organization_id').eq('is_active', true),
        supabase.from('sales').select('id, organization_id, created_at'),
        supabase.from('employees').select('id, organization_id').eq('is_active', true),
        supabase.from('customers').select('id, organization_id'),
      ])

      const orgs = orgsRes.data ?? []
      const orgPlans = (orgPlansRes.data ?? []) as any[]
      const products = productsRes.data ?? []
      const sales = salesRes.data ?? []
      const employees = employeesRes.data ?? []
      const customers = customersRes.data ?? []

      return orgs.map((org) => {
        const plan = orgPlans.find((op) => op.organization_id === org.id)
        const limits = plan?.plans?.limits ?? { products: 100, employees: 5, branches: 1, monthly_invoices: 500 }

        // Count per org
        const now = new Date()
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
        const orgSalesThisMonth = sales.filter((s) => s.organization_id === org.id && new Date(s.created_at) >= monthStart)

        return {
          ...org,
          planName: plan?.plans?.name ?? 'No plan',
          usage: {
            products: { used: products.filter((p) => p.organization_id === org.id).length, limit: limits.products },
            employees: { used: employees.filter((e) => e.organization_id === org.id).length, limit: limits.employees },
            customers: { used: customers.filter((c) => c.organization_id === org.id).length, limit: -1 },
            monthly_invoices: { used: orgSalesThisMonth.length, limit: limits.monthly_invoices },
          },
        }
      })
    },
  })

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Usage Tracking</h1>
        <p className="text-sm text-slate-400 mt-0.5">Per-tenant resource usage vs plan limits</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : (data ?? []).length === 0 ? (
        <div className="text-center py-16 text-slate-500">No tenants found</div>
      ) : (
        <div className="space-y-4">
          {(data ?? []).map((t) => (
            <div key={t.id} className="rounded-xl border border-slate-700/50 bg-slate-900 p-5">
              <div className="flex items-center justify-between mb-4">
                <Link to={`/platform/tenants/${t.id}`}
                  className="flex items-center gap-2.5 hover:text-indigo-400 transition-colors group">
                  <div className="h-7 w-7 rounded-lg bg-indigo-600/20 flex items-center justify-center text-xs font-bold text-indigo-400 shrink-0">
                    {t.name[0]?.toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white group-hover:text-indigo-400">{t.name}</p>
                    <p className="text-[11px] text-slate-500">{t.planName}</p>
                  </div>
                </Link>
                <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold',
                  t.status === 'active' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                )}>
                  {t.status.toUpperCase()}
                </span>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <UsageMeter label="Products" used={t.usage.products.used} limit={t.usage.products.limit} />
                <UsageMeter label="Employees" used={t.usage.employees.used} limit={t.usage.employees.limit} />
                <UsageMeter label="Customers" used={t.usage.customers.used} limit={t.usage.customers.limit} />
                <UsageMeter label="Invoices (This Month)" used={t.usage.monthly_invoices.used} limit={t.usage.monthly_invoices.limit} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
