import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Loader2, Pencil, Check, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

interface Plan {
  id: string
  name: string
  description: string | null
  monthly_price: number
  yearly_price: number | null
  trial_days: number
  is_active: boolean
  is_default: boolean
  limits: Record<string, number>
  features: Record<string, boolean>
  created_at: string
}

const FEATURE_LABELS: Record<string, string> = {
  pos_billing: 'POS Billing',
  inventory: 'Inventory',
  reports: 'Reports',
  loyalty: 'Loyalty Program',
  offers: 'Offers & Coupons',
  gst_invoicing: 'GST Invoicing',
  multi_branch: 'Multi-Branch',
  api_access: 'API Access',
}

const LIMIT_LABELS: Record<string, string> = {
  products: 'Products',
  employees: 'Employees',
  branches: 'Branches',
  monthly_invoices: 'Monthly Invoices',
}

const DEFAULT_LIMITS = { products: 100, employees: 5, branches: 1, monthly_invoices: 500 }
const DEFAULT_FEATURES = {
  pos_billing: true, inventory: true, reports: true,
  loyalty: true, offers: true, gst_invoicing: true,
  multi_branch: false, api_access: false,
}

function PlanFormModal({
  plan,
  onClose,
  onSaved,
}: {
  plan?: Plan | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(plan?.name ?? '')
  const [description, setDescription] = useState(plan?.description ?? '')
  const [monthlyPrice, setMonthlyPrice] = useState(String(plan?.monthly_price ?? 0))
  const [yearlyPrice, setYearlyPrice] = useState(String(plan?.yearly_price ?? ''))
  const [trialDays, setTrialDays] = useState(String(plan?.trial_days ?? 14))
  const [limits, setLimits] = useState<Record<string, number>>(plan?.limits ?? DEFAULT_LIMITS)
  const [features, setFeatures] = useState<Record<string, boolean>>(plan?.features ?? DEFAULT_FEATURES)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!name.trim()) { setError('Plan name is required'); return }
    setSaving(true)
    setError('')
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        monthly_price: parseFloat(monthlyPrice) || 0,
        yearly_price: yearlyPrice ? parseFloat(yearlyPrice) : null,
        trial_days: parseInt(trialDays) || 0,
        limits,
        features,
        is_active: true,
      }
      if (plan) {
        const { error } = await supabase.from('plans').update(payload).eq('id', plan.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('plans').insert(payload)
        if (error) throw error
      }
      onSaved()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-base font-semibold text-white">{plan ? 'Edit Plan' : 'Create New Plan'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-5 max-h-[75vh] overflow-y-auto">
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Plan Name *</label>
              <input value={name} onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Pro, Enterprise"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Description</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description for tenants"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Monthly Price (₹)</label>
              <input type="number" min={0} value={monthlyPrice} onChange={(e) => setMonthlyPrice(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Yearly Price (₹)</label>
              <input type="number" min={0} value={yearlyPrice} onChange={(e) => setYearlyPrice(e.target.value)}
                placeholder="Optional"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Trial Days</label>
              <input type="number" min={0} value={trialDays} onChange={(e) => setTrialDays(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>

          {/* Limits */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-slate-300 uppercase tracking-wide">Resource Limits (-1 = Unlimited)</p>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(LIMIT_LABELS).map(([key, label]) => (
                <div key={key} className="space-y-1.5">
                  <label className="text-[11px] text-slate-400">{label}</label>
                  <input
                    type="number"
                    min={-1}
                    value={limits[key] ?? -1}
                    onChange={(e) => setLimits((l) => ({ ...l, [key]: parseInt(e.target.value) || -1 }))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Features */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-slate-300 uppercase tracking-wide">Features</p>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(FEATURE_LABELS).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2.5 cursor-pointer select-none rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5">
                  <div
                    onClick={() => setFeatures((f) => ({ ...f, [key]: !f[key] }))}
                    className={cn('h-4 w-4 rounded border flex items-center justify-center transition-colors cursor-pointer shrink-0',
                      features[key] ? 'bg-indigo-600 border-indigo-600' : 'border-slate-600 bg-slate-900'
                    )}
                  >
                    {features[key] && <Check className="h-2.5 w-2.5 text-white" />}
                  </div>
                  <span className="text-xs text-slate-300">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2.5 text-sm text-red-400">{error}</div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-slate-700 flex gap-3 justify-end">
          <button onClick={onClose} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50 flex items-center gap-2 transition-colors">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {plan ? 'Save Changes' : 'Create Plan'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function PlatformPlansPage() {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [editPlan, setEditPlan] = useState<Plan | null>(null)

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ['platform-plans'],
    queryFn: async () => {
      const { data, error } = await supabase.from('plans').select('*').order('monthly_price')
      if (error) throw error
      return (data ?? []) as Plan[]
    },
  })

  const { data: subscriberCounts } = useQuery({
    queryKey: ['platform-plan-subscribers'],
    queryFn: async () => {
      const { data } = await supabase.from('org_plans').select('plan_id')
      const counts: Record<string, number> = {}
      for (const row of data ?? []) {
        counts[row.plan_id] = (counts[row.plan_id] ?? 0) + 1
      }
      return counts
    },
  })

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('plans').update({ is_active }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['platform-plans'] }),
  })

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Plans</h1>
          <p className="text-sm text-slate-400 mt-0.5">Manage subscription plans for your tenants</p>
        </div>
        <button onClick={() => { setEditPlan(null); setShowModal(true) }}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition-colors">
          <Plus className="h-4 w-4" /> Create Plan
        </button>
      </div>

      {/* Plans grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-slate-700/50 bg-slate-900 p-5 animate-pulse h-64" />
          ))}
        </div>
      ) : plans.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <p className="text-base">No plans yet</p>
          <p className="text-sm mt-1">Create your first plan to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {plans.map((plan) => (
            <div key={plan.id}
              className={cn('rounded-xl border bg-slate-900 p-5 space-y-4 transition-all',
                plan.is_active ? 'border-slate-700/50' : 'border-slate-800 opacity-60'
              )}>
              {/* Plan header */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-white">{plan.name}</h3>
                    {plan.is_default && (
                      <span className="rounded-full bg-indigo-500/15 text-indigo-400 px-2 py-0.5 text-[10px] font-semibold">Default</span>
                    )}
                  </div>
                  {plan.description && <p className="text-xs text-slate-400">{plan.description}</p>}
                </div>
                <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold',
                  plan.is_active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-700 text-slate-400'
                )}>
                  {plan.is_active ? 'ACTIVE' : 'DISABLED'}
                </span>
              </div>

              {/* Price */}
              <div>
                <p className="text-2xl font-bold text-white">
                  {plan.monthly_price === 0 ? 'Free' : `₹${plan.monthly_price.toLocaleString('en-IN')}`}
                  {plan.monthly_price > 0 && <span className="text-sm font-normal text-slate-400">/mo</span>}
                </p>
                {plan.yearly_price && (
                  <p className="text-xs text-slate-400 mt-0.5">₹{plan.yearly_price.toLocaleString('en-IN')}/year</p>
                )}
                {plan.trial_days > 0 && (
                  <p className="text-xs text-amber-400 mt-0.5">{plan.trial_days}-day free trial</p>
                )}
              </div>

              {/* Limits */}
              <div className="space-y-1">
                <p className="text-[10px] text-slate-500 uppercase tracking-wide font-medium">Limits</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {Object.entries(plan.limits ?? {}).map(([k, v]) => (
                    <p key={k} className="text-xs text-slate-400">
                      {LIMIT_LABELS[k] ?? k}: <span className="text-white font-medium">{v === -1 ? '∞' : v}</span>
                    </p>
                  ))}
                </div>
              </div>

              {/* Features */}
              <div className="space-y-1">
                <p className="text-[10px] text-slate-500 uppercase tracking-wide font-medium">Features</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(plan.features ?? {})
                    .filter(([, v]) => v)
                    .map(([k]) => (
                      <span key={k} className="rounded-md bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">
                        {FEATURE_LABELS[k] ?? k}
                      </span>
                    ))}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-700/50 flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  {subscriberCounts?.[plan.id] ?? 0} subscriber{(subscriberCounts?.[plan.id] ?? 0) !== 1 ? 's' : ''}
                </span>
                <div className="flex gap-2">
                  <button onClick={() => { setEditPlan(plan); setShowModal(true) }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => toggleActiveMutation.mutate({ id: plan.id, is_active: !plan.is_active })}
                    className={cn('text-xs px-2.5 py-1 rounded-lg font-medium transition-colors',
                      plan.is_active
                        ? 'text-amber-400 hover:bg-amber-500/10'
                        : 'text-emerald-400 hover:bg-emerald-500/10'
                    )}>
                    {plan.is_active ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <PlanFormModal
          plan={editPlan}
          onClose={() => { setShowModal(false); setEditPlan(null) }}
          onSaved={() => {
            setShowModal(false)
            setEditPlan(null)
            queryClient.invalidateQueries({ queryKey: ['platform-plans'] })
          }}
        />
      )}
    </div>
  )
}
