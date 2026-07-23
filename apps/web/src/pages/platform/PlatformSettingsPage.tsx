import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Loader2, Save, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export function PlatformSettingsPage() {
  const [platformName, setPlatformName] = useState('')
  const [supportEmail, setSupportEmail] = useState('')
  const [supportPhone, setSupportPhone] = useState('')
  const [currency, setCurrency] = useState('INR')
  const [timezone, setTimezone] = useState('Asia/Kolkata')
  const [defaultTrialDays, setDefaultTrialDays] = useState(14)
  const [allowRegistrations, setAllowRegistrations] = useState(true)
  const [maintenanceMode, setMaintenanceMode] = useState(false)
  const [privacyUrl, setPrivacyUrl] = useState('')
  const [termsUrl, setTermsUrl] = useState('')
  const [loaded, setLoaded] = useState(false)

  const { isLoading } = useQuery({
    queryKey: ['platform-settings'],
    queryFn: async () => {
      const { data } = await supabase.from('platform_settings').select('*').eq('id', 1).single()
      if (data && !loaded) {
        setPlatformName(data.platform_name ?? '')
        setSupportEmail(data.support_email ?? '')
        setSupportPhone(data.support_phone ?? '')
        setCurrency(data.currency ?? 'INR')
        setTimezone(data.timezone ?? 'Asia/Kolkata')
        setDefaultTrialDays(data.default_trial_days ?? 14)
        setAllowRegistrations(data.allow_registrations ?? true)
        setMaintenanceMode(data.maintenance_mode ?? false)
        setPrivacyUrl(data.privacy_policy_url ?? '')
        setTermsUrl(data.terms_url ?? '')
        setLoaded(true)
      }
      return data
    },
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('platform_settings').upsert({
        id: 1,
        platform_name: platformName.trim(),
        support_email: supportEmail.trim() || null,
        support_phone: supportPhone.trim() || null,
        currency,
        timezone,
        default_trial_days: defaultTrialDays,
        allow_registrations: allowRegistrations,
        maintenance_mode: maintenanceMode,
        privacy_policy_url: privacyUrl.trim() || null,
        terms_url: termsUrl.trim() || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })
      if (error) throw error
    },
  })

  const inputCls = "w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
    </div>
  )

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-white">Platform Settings</h1>
        <p className="text-sm text-slate-400 mt-0.5">Configure your SaaS platform settings</p>
      </div>

      {/* General */}
      <div className="rounded-xl border border-slate-700/50 bg-slate-900 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-white border-b border-slate-700/50 pb-3">General</h2>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-300">Platform Name</label>
          <input value={platformName} onChange={(e) => setPlatformName(e.target.value)} placeholder="BillScape" className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">Support Email</label>
            <input type="email" value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} placeholder="support@yourdomain.com" className={inputCls} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">Support Phone</label>
            <input value={supportPhone} onChange={(e) => setSupportPhone(e.target.value)} placeholder="+91 99999 99999" className={inputCls} />
          </div>
        </div>
      </div>

      {/* Regional & Registration */}
      <div className="rounded-xl border border-slate-700/50 bg-slate-900 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-white border-b border-slate-700/50 pb-3">Regional & Registration</h2>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">Currency</label>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputCls}>
              <option value="INR">INR — ₹</option>
              <option value="USD">USD — $</option>
              <option value="EUR">EUR — €</option>
              <option value="AED">AED</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">Timezone</label>
            <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className={inputCls}>
              <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
              <option value="Asia/Dubai">Asia/Dubai (GST)</option>
              <option value="UTC">UTC</option>
              <option value="America/New_York">America/New_York</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">Default Trial Days</label>
            <input type="number" min={0} max={365} value={defaultTrialDays}
              onChange={(e) => setDefaultTrialDays(parseInt(e.target.value) || 0)} className={inputCls} />
          </div>
        </div>

        <div className="space-y-3 pt-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => setAllowRegistrations((p) => !p)}
              className={`relative h-5 w-9 rounded-full transition-colors cursor-pointer ${allowRegistrations ? 'bg-indigo-600' : 'bg-slate-700'}`}>
              <div className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${allowRegistrations ? 'translate-x-4' : ''}`} />
            </div>
            <div>
              <p className="text-sm font-medium text-white">Allow New Tenant Registrations</p>
              <p className="text-xs text-slate-400">When off, new signups are blocked</p>
            </div>
          </label>
        </div>
      </div>

      {/* Maintenance Mode */}
      <div className={`rounded-xl border p-5 space-y-4 ${maintenanceMode ? 'border-amber-500/30 bg-amber-500/5' : 'border-slate-700/50 bg-slate-900'}`}>
        <h2 className="text-sm font-semibold text-white border-b border-slate-700/50 pb-3 flex items-center gap-2">
          {maintenanceMode && <AlertTriangle className="h-4 w-4 text-amber-400" />}
          Maintenance Mode
        </h2>
        <label className="flex items-center gap-3 cursor-pointer">
          <div
            onClick={() => setMaintenanceMode((p) => !p)}
            className={`relative h-5 w-9 rounded-full transition-colors cursor-pointer ${maintenanceMode ? 'bg-amber-500' : 'bg-slate-700'}`}>
            <div className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${maintenanceMode ? 'translate-x-4' : ''}`} />
          </div>
          <div>
            <p className="text-sm font-medium text-white">Enable Maintenance Mode</p>
            <p className="text-xs text-slate-400">Tenants will see a maintenance page. Use with caution.</p>
          </div>
        </label>
      </div>

      {/* Legal URLs */}
      <div className="rounded-xl border border-slate-700/50 bg-slate-900 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-white border-b border-slate-700/50 pb-3">Legal URLs</h2>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-300">Privacy Policy URL</label>
          <input value={privacyUrl} onChange={(e) => setPrivacyUrl(e.target.value)} placeholder="https://yourdomain.com/privacy" className={inputCls} />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-300">Terms & Conditions URL</label>
          <input value={termsUrl} onChange={(e) => setTermsUrl(e.target.value)} placeholder="https://yourdomain.com/terms" className={inputCls} />
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-50 transition-colors"
        >
          {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Settings
        </button>
        {saveMutation.isSuccess && (
          <span className="text-sm text-emerald-400">Settings saved!</span>
        )}
        {saveMutation.isError && (
          <span className="text-sm text-red-400">Save failed. Try again.</span>
        )}
      </div>
    </div>
  )
}
