import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Store,
  Check,
  ChevronRight,
  ChevronLeft,
  Upload,
  Loader2,
  Palette,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { BusinessType } from '@billscape/core'

const BUSINESS_TYPES: { value: BusinessType; label: string; emoji: string }[] = [
  { value: 'grocery', label: 'Grocery', emoji: '🛒' },
  { value: 'textile', label: 'Textile', emoji: '👕' },
  { value: 'pharmacy', label: 'Pharmacy', emoji: '💊' },
  { value: 'electronics', label: 'Electronics', emoji: '📱' },
  { value: 'service', label: 'Service', emoji: '🔧' },
  { value: 'general', label: 'General', emoji: '🏪' },
]

const INDIAN_STATES = [
  { code: 'TN', name: 'Tamil Nadu' },
  { code: 'KA', name: 'Karnataka' },
  { code: 'MH', name: 'Maharashtra' },
  { code: 'DL', name: 'Delhi' },
  { code: 'GJ', name: 'Gujarat' },
  { code: 'UP', name: 'Uttar Pradesh' },
  { code: 'WB', name: 'West Bengal' },
  { code: 'RJ', name: 'Rajasthan' },
  { code: 'AP', name: 'Andhra Pradesh' },
  { code: 'TS', name: 'Telangana' },
  { code: 'KL', name: 'Kerala' },
  { code: 'MP', name: 'Madhya Pradesh' },
  { code: 'PB', name: 'Punjab' },
  { code: 'HR', name: 'Haryana' },
  { code: 'BR', name: 'Bihar' },
  { code: 'OR', name: 'Odisha' },
  { code: 'AS', name: 'Assam' },
  { code: 'JH', name: 'Jharkhand' },
  { code: 'CG', name: 'Chhattisgarh' },
  { code: 'UT', name: 'Uttarakhand' },
]

const COLOR_PRESETS = [
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Violet', value: '#8b5cf6' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Emerald', value: '#10b981' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Rose', value: '#f43f5e' },
]

const FEATURE_FLAGS: Record<BusinessType, Record<string, boolean>> = {
  grocery: { batch_tracking: true, variants: false, expiry_dates: true, service_jobs: false, loyalty_points: false },
  textile: { batch_tracking: false, variants: true, expiry_dates: false, service_jobs: false, loyalty_points: false },
  pharmacy: { batch_tracking: true, variants: false, expiry_dates: true, service_jobs: false, loyalty_points: false },
  electronics: { batch_tracking: false, variants: true, expiry_dates: false, service_jobs: true, loyalty_points: false },
  service: { batch_tracking: false, variants: false, expiry_dates: false, service_jobs: true, loyalty_points: false },
  general: { batch_tracking: false, variants: false, expiry_dates: false, service_jobs: false, loyalty_points: false },
}

const step1Schema = z.object({
  shop_name: z.string().min(1, 'Shop name is required').max(100),
  business_type: z.enum(['grocery', 'textile', 'pharmacy', 'electronics', 'service', 'general']),
})

const step2Schema = z.object({
  gstin: z
    .string()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid GSTIN format')
    .optional()
    .or(z.literal('')),
  state_code: z.string().length(2, 'Select a state'),
})

type Step1Values = z.infer<typeof step1Schema>
type Step2Values = z.infer<typeof step2Schema>

interface OnboardingData {
  shop_name: string
  business_type: BusinessType
  gstin: string
  state_code: string
  primary_color: string
  selected_plan_id: string
  logo_url?: string
}

export function OnboardingPage() {
  const navigate = useNavigate()
  const { user, refreshOrg } = useAuth()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [plans, setPlans] = useState<any[]>([])

  const [data, setData] = useState<OnboardingData>({
    shop_name: '',
    business_type: 'general',
    gstin: '',
    state_code: 'TN',
    primary_color: '#6366f1',
    selected_plan_id: '',
  })

  React.useEffect(() => {
    // Fetch available active plans for onboarding
    supabase
      .from('plans')
      .select('*')
      .eq('is_active', true)
      .order('monthly_price', { ascending: true })
      .then(({ data: fetchedPlans }) => {
        if (fetchedPlans && fetchedPlans.length > 0) {
          setPlans(fetchedPlans)
          const defaultPlan = fetchedPlans.find((p) => p.is_default) || fetchedPlans[0]
          setData((prev) => ({ ...prev, selected_plan_id: defaultPlan.id }))
        }
      })
  }, [])

  const form1 = useForm<Step1Values>({
    resolver: zodResolver(step1Schema),
    defaultValues: { shop_name: data.shop_name, business_type: data.business_type },
  })

  const form2 = useForm<Step2Values>({
    resolver: zodResolver(step2Schema),
    defaultValues: { gstin: data.gstin, state_code: data.state_code },
  })

  const handleStep1 = form1.handleSubmit((values) => {
    setData((prev) => ({ ...prev, ...values }))
    setStep(2)
  })

  const handleStep2 = form2.handleSubmit((values) => {
    setData((prev) => ({ ...prev, ...values }))
    setStep(3)
  })

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  const handleLaunch = async () => {
    if (!user) return
    setLoading(true)
    try {
      // Check if user already has an org (e.g. refreshed onboarding page)
      const { data: existing } = await supabase
        .from('memberships')
        .select('organization_id')
        .eq('user_id', user.id)
        .limit(1)
        .single()

      if (existing?.organization_id) {
        await refreshOrg()
        navigate('/dashboard')
        return
      }

      const features = FEATURE_FLAGS[data.business_type]

      const { error: rpcError } = await supabase.rpc('create_organization_for_user', {
        p_name: data.shop_name,
        p_business_type: data.business_type,
        p_state_code: data.state_code,
        p_gstin: data.gstin || null,
        p_primary_color: data.primary_color,
        p_feature_flags: features,
      })

      if (rpcError) {
        // If org already created by a race condition, just redirect
        if (rpcError.message?.toLowerCase().includes('already') || rpcError.code === '23505') {
          await refreshOrg()
          navigate('/dashboard')
          return
        }
        toast.error('Setup failed', rpcError.message)
        return
      }

      // Assign the selected plan to org_plans
      const { data: mem } = await supabase
        .from('memberships')
        .select('organization_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle()

      if (mem?.organization_id && data.selected_plan_id) {
        const expiryDate = new Date()
        expiryDate.setDate(expiryDate.getDate() + 14) // 14-day trial default
        await supabase.from('org_plans').upsert({
          organization_id: mem.organization_id,
          plan_id: data.selected_plan_id,
          status: 'trial',
          billing_cycle: 'monthly',
          start_date: new Date().toISOString().split('T')[0],
          expiry_date: expiryDate.toISOString().split('T')[0],
          auto_renew: true,
        }, { onConflict: 'organization_id' })
      }

      await refreshOrg()
      navigate('/dashboard')
    } catch (err) {
      toast.error('Unexpected error', 'Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const steps = ['Shop Details', 'Tax & Location', 'Branding', 'Choose Plan', 'Review']

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600">
            <Store className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold text-white">BillScape Setup</span>
        </div>

        {/* Progress */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            {steps.map((label, i) => {
              const stepNum = i + 1
              const isCompleted = step > stepNum
              const isActive = step === stepNum
              return (
                <React.Fragment key={label}>
                  <div className="flex flex-col items-center gap-1">
                    <div
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all',
                        isCompleted
                          ? 'bg-indigo-600 text-white'
                          : isActive
                          ? 'bg-indigo-600 text-white ring-4 ring-indigo-600/20'
                          : 'bg-zinc-800 text-zinc-500',
                      )}
                    >
                      {isCompleted ? <Check className="h-4 w-4" /> : stepNum}
                    </div>
                    <span
                      className={cn(
                        'text-[10px] font-medium hidden sm:block',
                        isActive ? 'text-indigo-400' : 'text-zinc-600',
                      )}
                    >
                      {label}
                    </span>
                  </div>
                  {i < steps.length - 1 && (
                    <div
                      className={cn(
                        'flex-1 h-px mx-2 transition-all',
                        isCompleted ? 'bg-indigo-600' : 'bg-zinc-800',
                      )}
                    />
                  )}
                </React.Fragment>
              )
            })}
          </div>
          <p className="text-xs text-zinc-500 text-center">Step {step} of {steps.length}</p>
        </div>

        {/* Step Card */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl">
          {/* Step 1: Shop Details */}
          {step === 1 && (
            <form onSubmit={handleStep1} className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-white">Tell us about your shop</h2>
                <p className="text-sm text-zinc-400 mt-1">We'll customize BillScape for your business.</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="shop_name">Shop Name *</Label>
                <Input
                  id="shop_name"
                  placeholder="e.g. Sri Murugan Stores"
                  {...form1.register('shop_name')}
                />
                {form1.formState.errors.shop_name && (
                  <p className="text-xs text-red-400">{form1.formState.errors.shop_name.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Business Type *</Label>
                <div className="grid grid-cols-3 gap-2">
                  {BUSINESS_TYPES.map((bt) => {
                    const selected = form1.watch('business_type') === bt.value
                    return (
                      <button
                        key={bt.value}
                        type="button"
                        onClick={() => form1.setValue('business_type', bt.value)}
                        className={cn(
                          'flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs font-medium transition-all',
                          selected
                            ? 'border-indigo-500 bg-indigo-600/10 text-indigo-300'
                            : 'border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:bg-zinc-800',
                        )}
                      >
                        <span className="text-xl">{bt.emoji}</span>
                        {bt.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <Button type="submit" className="w-full">
                Continue
                <ChevronRight className="h-4 w-4" />
              </Button>
            </form>
          )}

          {/* Step 2: Tax & Location */}
          {step === 2 && (
            <form onSubmit={handleStep2} className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-white">Tax & Location</h2>
                <p className="text-sm text-zinc-400 mt-1">Required for correct GST calculation.</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="state_code">State *</Label>
                <select
                  id="state_code"
                  className="flex h-9 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  {...form2.register('state_code')}
                >
                  {INDIAN_STATES.map((s) => (
                    <option key={s.code} value={s.code} className="bg-zinc-900">
                      {s.code} — {s.name}
                    </option>
                  ))}
                </select>
                {form2.formState.errors.state_code && (
                  <p className="text-xs text-red-400">{form2.formState.errors.state_code.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="gstin">
                  GSTIN
                  <span className="ml-1 text-xs text-zinc-500">(optional)</span>
                </Label>
                <Input
                  id="gstin"
                  placeholder="e.g. 33AABCU9603R1ZX"
                  className="uppercase"
                  {...form2.register('gstin')}
                />
                {form2.formState.errors.gstin && (
                  <p className="text-xs text-red-400">{form2.formState.errors.gstin.message}</p>
                )}
                <p className="text-[11px] text-zinc-600">
                  15-character GST Identification Number. Leave blank if not registered.
                </p>
              </div>

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setStep(1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </Button>
                <Button type="submit" className="flex-1">
                  Continue
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </form>
          )}

          {/* Step 3: Branding */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-white">Brand your shop</h2>
                <p className="text-sm text-zinc-400 mt-1">Personalize your invoices and POS screen.</p>
              </div>

              <div className="space-y-2">
                <Label>
                  <Palette className="inline h-3.5 w-3.5 mr-1" />
                  Primary Color
                </Label>
                <div className="flex gap-2 flex-wrap">
                  {COLOR_PRESETS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setData((prev) => ({ ...prev, primary_color: c.value }))}
                      className={cn(
                        'h-9 w-9 rounded-full border-2 transition-all',
                        data.primary_color === c.value
                          ? 'border-white scale-110 shadow-lg'
                          : 'border-transparent hover:scale-105',
                      )}
                      style={{ backgroundColor: c.value }}
                      title={c.name}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <div
                    className="h-6 w-6 rounded border border-zinc-700"
                    style={{ backgroundColor: data.primary_color }}
                  />
                  <span className="text-xs text-zinc-400">{data.primary_color}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Shop Logo (optional)</Label>
                <div className="flex items-center gap-3">
                  {logoPreview ? (
                    <img
                      src={logoPreview}
                      alt="Logo preview"
                      className="h-16 w-16 rounded-lg object-contain border border-zinc-700 bg-zinc-800"
                    />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-zinc-700 bg-zinc-800">
                      <Store className="h-6 w-6 text-zinc-600" />
                    </div>
                  )}
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleLogoChange}
                    />
                    <div className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors">
                      <Upload className="h-4 w-4" />
                      {logoFile ? 'Change logo' : 'Upload logo'}
                    </div>
                  </label>
                </div>
                <p className="text-[11px] text-zinc-600">PNG or JPG, max 2MB. Will appear on invoices.</p>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setStep(2)}>
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </Button>
                <Button className="flex-1" onClick={() => setStep(4)}>
                  Continue
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 4: Choose Plan */}
          {step === 4 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-white">Choose your plan</h2>
                <p className="text-sm text-zinc-400 mt-1">Select a plan to start your 14-day free trial.</p>
              </div>

              <div className="grid gap-3">
                {plans.length === 0 ? (
                  <div className="rounded-lg border border-zinc-800 bg-zinc-800/50 p-4 text-center text-sm text-zinc-400">
                    Loading subscription plans...
                  </div>
                ) : (
                  plans.map((plan) => (
                    <div
                      key={plan.id}
                      onClick={() => setData((prev) => ({ ...prev, selected_plan_id: plan.id }))}
                      className={cn(
                        'cursor-pointer rounded-xl border p-4 transition-all flex items-center justify-between',
                        data.selected_plan_id === plan.id
                          ? 'border-indigo-500 bg-indigo-600/10 ring-2 ring-indigo-500/20'
                          : 'border-zinc-800 bg-zinc-800/50 hover:border-zinc-700 hover:bg-zinc-800'
                      )}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white text-sm">{plan.name}</span>
                          {plan.is_default && (
                            <span className="rounded-full bg-indigo-500/20 text-indigo-400 px-2 py-0.5 text-[10px] font-semibold">
                              Recommended
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-400 mt-0.5">{plan.description}</p>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <span className="text-base font-bold text-white">
                          {plan.monthly_price === 0 ? 'Free' : `₹${plan.monthly_price}`}
                        </span>
                        {plan.monthly_price > 0 && <span className="text-xs text-zinc-400">/mo</span>}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setStep(3)}>
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </Button>
                <Button className="flex-1" onClick={() => setStep(5)} disabled={!data.selected_plan_id}>
                  Continue
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 5: Review */}
          {step === 5 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-white">Review & Launch</h2>
                <p className="text-sm text-zinc-400 mt-1">Everything looks good? Let's go!</p>
              </div>

              <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 divide-y divide-zinc-700">
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-xs text-zinc-400">Shop Name</span>
                  <span className="text-sm font-medium text-zinc-200">{data.shop_name}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-xs text-zinc-400">Business Type</span>
                  <span className="text-sm font-medium text-zinc-200 capitalize">{data.business_type}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-xs text-zinc-400">Selected Plan</span>
                  <span className="text-sm font-medium text-indigo-400">
                    {plans.find((p) => p.id === data.selected_plan_id)?.name ?? 'Selected Plan'}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-xs text-zinc-400">State</span>
                  <span className="text-sm font-medium text-zinc-200">
                    {INDIAN_STATES.find((s) => s.code === data.state_code)?.name ?? data.state_code}
                  </span>
                </div>
                {data.gstin && (
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-xs text-zinc-400">GSTIN</span>
                    <span className="text-sm font-mono text-zinc-200">{data.gstin}</span>
                  </div>
                )}
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-xs text-zinc-400">Primary Color</span>
                  <div className="flex items-center gap-2">
                    <div
                      className="h-4 w-4 rounded-full border border-zinc-600"
                      style={{ backgroundColor: data.primary_color }}
                    />
                    <span className="text-sm text-zinc-200">{data.primary_color}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-3">
                <p className="text-xs font-medium text-zinc-400 mb-2">Features enabled for {data.business_type}:</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(FEATURE_FLAGS[data.business_type])
                    .filter(([, v]) => v)
                    .map(([k]) => (
                      <span key={k} className="rounded-full bg-indigo-600/20 px-2 py-0.5 text-[11px] text-indigo-300 border border-indigo-600/30">
                        {k.replace(/_/g, ' ')}
                      </span>
                    ))}
                </div>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setStep(4)}>
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </Button>
                <Button
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500"
                  onClick={handleLaunch}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Setting up...
                    </>
                  ) : (
                    <>
                      <Store className="h-4 w-4" />
                      Launch my shop
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
