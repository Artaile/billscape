import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Upload,
  Loader2,
  Plus,
  Store,
  Palette,
  Users,
  CreditCard,
  Moon,
  Sun,
  FileText,
  Globe,
  Download,
  Trash2,
  Lock,
  Eye,
  EyeOff,
  Ruler,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { applyBrandColor } from '@/lib/brandColor'
import { UnitsSettingsPanel } from '@/components/settings/UnitsSettingsPanel'
import type { UserRole } from '@billscape/core'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

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
]

const COLOR_PRESETS = [
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Violet', value: '#8b5cf6' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Emerald', value: '#10b981' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Rose', value: '#f43f5e' },
]

const ROLES: UserRole[] = ['owner', 'manager', 'cashier']

const shopInfoSchema = z.object({
  name: z.string().min(1, 'Shop name required'),
  gstin: z
    .string()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid GSTIN')
    .optional()
    .or(z.literal('')),
  state_code: z.string().length(2),
  address: z.string().optional(),
})

const inviteSchema = z.object({
  email: z.string().email('Enter a valid email'),
  role: z.enum(['owner', 'manager', 'cashier']),
})

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Must contain at least one lowercase letter')
      .regex(/[^A-Za-z0-9]/, 'Must contain at least one special character'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

function getPasswordStrength(pw: string) {
  const checks = {
    length: pw.length >= 8,
    upper: /[A-Z]/.test(pw),
    lower: /[a-z]/.test(pw),
    special: /[^A-Za-z0-9]/.test(pw),
  }
  const score = Object.values(checks).filter(Boolean).length
  return { checks, score }
}

type ShopInfoValues = z.infer<typeof shopInfoSchema>
type InviteValues = z.infer<typeof inviteSchema>
type ChangePasswordValues = z.infer<typeof changePasswordSchema>

export function SettingsPage() {
  const { org, user, refreshOrg } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const orgId = org?.id
  const queryClient = useQueryClient()

  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(org?.branding?.logo_url ?? null)
  const [primaryColor, setPrimaryColor] = useState(org?.branding?.primary_color ?? '#6366f1')
  const [invoiceHeader, setInvoiceHeader] = useState(org?.branding?.invoice_header ?? '')
  const [invoiceFooter, setInvoiceFooter] = useState(org?.branding?.invoice_footer ?? '')
  const [showInviteDialog, setShowInviteDialog] = useState(false)

  // Invoice tab extra fields
  const [bankName, setBankName] = useState(org?.branding?.bank_name ?? '')
  const [bankAccount, setBankAccount] = useState(org?.branding?.bank_account ?? '')
  const [bankIfsc, setBankIfsc] = useState(org?.branding?.bank_ifsc ?? '')
  const [invoiceTerms, setInvoiceTerms] = useState(org?.branding?.invoice_terms ?? 'Thank you for your business!')
  const [invoicePrefix, setInvoicePrefix] = useState(org?.branding?.invoice_prefix ?? 'INV')

  // Regional tab
  const [currency, setCurrency] = useState(org?.branding?.currency ?? '₹')
  const [dateFormat, setDateFormat] = useState(org?.branding?.date_format ?? 'DD/MM/YYYY')
  const [timezone, setTimezone] = useState(org?.branding?.timezone ?? 'Asia/Kolkata')

  const [exportLoading, setExportLoading] = useState(false)

  // Change password
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [newPasswordValue, setNewPasswordValue] = useState('')

  const changePasswordForm = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  })

  const shopForm = useForm<ShopInfoValues>({
    resolver: zodResolver(shopInfoSchema),
    defaultValues: {
      name: org?.name ?? '',
      gstin: org?.gstin ?? '',
      state_code: org?.state_code ?? 'TN',
      address: org?.address ?? '',
    },
  })

  const inviteForm = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: '', role: 'cashier' },
  })

  // Fetch members
  const { data: members } = useQuery({
    queryKey: ['members', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('memberships')
        .select('id, role, user_id, profiles(full_name, email, avatar_url)')
        .eq('organization_id', orgId!)
        .order('created_at')
      return data ?? []
    },
  })

  const saveShopMutation = useMutation({
    mutationFn: async (values: ShopInfoValues) => {
      const { error } = await supabase
        .from('organizations')
        .update({
          name: values.name,
          gstin: values.gstin || null,
          state_code: values.state_code,
          address: values.address || null,
        })
        .eq('id', orgId!)
      if (error) throw error
    },
    onSuccess: async () => {
      await refreshOrg()
      toast.success('Shop info saved')
    },
    onError: (err: Error) => toast.error('Save failed', err.message),
  })

  const saveBrandingMutation = useMutation({
    mutationFn: async () => {
      let logoUrl = org?.branding?.logo_url

      if (logoFile && orgId) {
        const ext = logoFile.name.split('.').pop()
        const path = `${orgId}/logo.${ext}`
        const { error } = await supabase.storage.from('org-assets').upload(path, logoFile, { upsert: true })
        if (!error) {
          const { data: urlData } = supabase.storage.from('org-assets').getPublicUrl(path)
          logoUrl = urlData.publicUrl
        }
      }

      const { error } = await supabase
        .from('org_settings')
        .update({
          branding: {
            primary_color: primaryColor,
            shop_name: org?.name ?? '',
            logo_url: logoUrl,
            invoice_header: invoiceHeader,
            invoice_footer: invoiceFooter,
          },
        })
        .eq('organization_id', orgId!)
      if (error) throw error
    },
    onSuccess: async () => {
      await refreshOrg()
      toast.success('Branding saved')
    },
    onError: (err: Error) => toast.error('Save failed', err.message),
  })

  const saveInvoiceSettingsMutation = useMutation({
    mutationFn: async () => {
      const existing = org?.branding ?? {}
      const { error } = await supabase.from('org_settings').upsert({
        organization_id: orgId!,
        branding: {
          ...existing,
          bank_name: bankName.trim() || null,
          bank_account: bankAccount.trim() || null,
          bank_ifsc: bankIfsc.trim() || null,
          invoice_terms: invoiceTerms.trim(),
          invoice_prefix: invoicePrefix.trim() || 'INV',
        },
      }, { onConflict: 'organization_id' })
      if (error) throw error
    },
    onSuccess: async () => { await refreshOrg(); toast.success('Invoice settings saved') },
    onError: (err: Error) => toast.error('Save failed', err.message),
  })

  const saveRegionalMutation = useMutation({
    mutationFn: async () => {
      const existing = org?.branding ?? {}
      const { error } = await supabase.from('org_settings').upsert({
        organization_id: orgId!,
        branding: { ...existing, currency, date_format: dateFormat, timezone },
      }, { onConflict: 'organization_id' })
      if (error) throw error
    },
    onSuccess: async () => { await refreshOrg(); toast.success('Regional settings saved') },
    onError: (err: Error) => toast.error('Save failed', err.message),
  })

  async function exportAllData() {
    if (!orgId) return
    setExportLoading(true)
    try {
      const [products, customers, sales, purchases, expenses] = await Promise.all([
        supabase.from('products').select('name,sku,price,cost_price,tax_rate,hsn_code,barcode_value').eq('organization_id', orgId).eq('is_active', true),
        supabase.from('customers').select('name,phone,email,gstin,address,balance').eq('organization_id', orgId),
        supabase.from('sales').select('invoice_no,grand_total,payment_mode,created_at').eq('organization_id', orgId).order('created_at', { ascending: false }),
        supabase.from('purchases').select('invoice_no,total_amount,created_at').eq('organization_id', orgId).order('created_at', { ascending: false }),
        supabase.from('expenses').select('category,amount,description,expense_date').eq('organization_id', orgId).order('expense_date', { ascending: false }),
      ])

      const toCSV = (headers: string[], rows: Record<string, unknown>[]) =>
        [headers, ...rows.map((r) => headers.map((h) => `"${String(r[h] ?? '').replace(/"/g, '""')}"`))].map((r) => r.join(',')).join('\n')

      const sections = [
        '=== PRODUCTS ===\n' + toCSV(['name','sku','price','cost_price','tax_rate','hsn_code','barcode_value'], products.data ?? []),
        '=== CUSTOMERS ===\n' + toCSV(['name','phone','email','gstin','address','balance'], customers.data ?? []),
        '=== SALES ===\n' + toCSV(['invoice_no','grand_total','payment_mode','created_at'], sales.data ?? []),
        '=== PURCHASES ===\n' + toCSV(['invoice_no','total_amount','created_at'], purchases.data ?? []),
        '=== EXPENSES ===\n' + toCSV(['category','amount','description','expense_date'], expenses.data ?? []),
      ].join('\n\n')

      const blob = new Blob([sections], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `billscape-backup-${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Data exported successfully')
    } catch (e: unknown) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setExportLoading(false)
    }
  }

  const changePasswordMutation = useMutation({
    mutationFn: async (values: ChangePasswordValues) => {
      if (!user?.email) throw new Error('No signed-in user email found')
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: values.currentPassword,
      })
      if (verifyError) throw new Error('Current password is incorrect')

      const { error } = await supabase.auth.updateUser({ password: values.newPassword })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Password changed successfully')
      changePasswordForm.reset()
      setNewPasswordValue('')
    },
    onError: (err: Error) => toast.error('Could not change password', err.message),
  })

  const updateRoleMutation = useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: UserRole }) => {
      const { error } = await supabase
        .from('memberships')
        .update({ role })
        .eq('id', memberId)
        .eq('organization_id', orgId!)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members', orgId] })
      toast.success('Role updated')
    },
  })

  const inviteMutation = useMutation({
    mutationFn: async (values: InviteValues) => {
      // In a real app, send invite via edge function
      // Here we just show a toast with instructions
      toast({ title: 'Invite sent', description: `Invitation sent to ${values.email} as ${values.role}` })
    },
    onSuccess: () => {
      inviteForm.reset()
      setShowInviteDialog(false)
    },
  })

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  const getRoleBadgeVariant = (role: UserRole) => {
    if (role === 'owner') return 'default' as const
    if (role === 'manager') return 'secondary' as const
    return 'outline' as const
  }

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage your shop configuration</p>
      </div>

      <Tabs defaultValue="shop">
        <TabsList className="mb-6 flex-wrap h-auto gap-1">
          <TabsTrigger value="shop">
            <Store className="h-3.5 w-3.5 mr-1.5" />
            Shop Info
          </TabsTrigger>
          <TabsTrigger value="branding">
            <Palette className="h-3.5 w-3.5 mr-1.5" />
            Branding
          </TabsTrigger>
          <TabsTrigger value="appearance">
            {theme === 'dark' ? <Moon className="h-3.5 w-3.5 mr-1.5" /> : <Sun className="h-3.5 w-3.5 mr-1.5" />}
            Appearance
          </TabsTrigger>
          <TabsTrigger value="team">
            <Users className="h-3.5 w-3.5 mr-1.5" />
            Team
          </TabsTrigger>
          <TabsTrigger value="billing">
            <CreditCard className="h-3.5 w-3.5 mr-1.5" />
            Billing
          </TabsTrigger>
          <TabsTrigger value="invoice">
            <FileText className="h-3.5 w-3.5 mr-1.5" />
            Invoice
          </TabsTrigger>
          <TabsTrigger value="units">
            <Ruler className="h-3.5 w-3.5 mr-1.5" />
            Units
          </TabsTrigger>
          <TabsTrigger value="regional">
            <Globe className="h-3.5 w-3.5 mr-1.5" />
            Regional
          </TabsTrigger>
          <TabsTrigger value="backup">
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Backup
          </TabsTrigger>
        </TabsList>

        {/* Shop Info */}
        <TabsContent value="shop">
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="text-base font-semibold text-foreground mb-4">Shop Information</h2>
            <form
              onSubmit={shopForm.handleSubmit((v) => saveShopMutation.mutate(v))}
              className="space-y-4"
            >
              <div className="space-y-1.5">
                <Label htmlFor="shop-name">Shop Name</Label>
                <Input id="shop-name" {...shopForm.register('name')} />
                {shopForm.formState.errors.name && (
                  <p className="text-xs text-red-400">{shopForm.formState.errors.name.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="shop-gstin">GSTIN (optional)</Label>
                <Input
                  id="shop-gstin"
                  className="uppercase"
                  placeholder="15-char GSTIN"
                  {...shopForm.register('gstin')}
                />
                {shopForm.formState.errors.gstin && (
                  <p className="text-xs text-red-400">{shopForm.formState.errors.gstin.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="shop-state">State</Label>
                <select
                  id="shop-state"
                  className="flex h-9 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  {...shopForm.register('state_code')}
                >
                  {INDIAN_STATES.map((s) => (
                    <option key={s.code} value={s.code} className="bg-zinc-900">
                      {s.code} — {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="shop-address">Address</Label>
                <Input
                  id="shop-address"
                  placeholder="Street, City, State, Pincode"
                  {...shopForm.register('address')}
                />
              </div>

              <Button type="submit" disabled={saveShopMutation.isPending}>
                {saveShopMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </form>
          </div>
        </TabsContent>

        {/* Branding */}
        <TabsContent value="branding">
          <div className="rounded-lg border border-border bg-card p-6 space-y-6">
            <h2 className="text-base font-semibold text-foreground">Branding & Invoice</h2>

            {/* Logo */}
            <div className="space-y-3">
              <Label>Shop Logo</Label>
              <div className="flex items-center gap-4">
                <div className="h-20 w-20 rounded-lg border border-zinc-700 bg-zinc-800 overflow-hidden">
                  {logoPreview ? (
                    <img src={logoPreview} alt="Logo" className="h-full w-full object-contain" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Store className="h-8 w-8 text-zinc-600" />
                    </div>
                  )}
                </div>
                <label className="cursor-pointer">
                  <input type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
                  <div className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors">
                    <Upload className="h-4 w-4" />
                    {logoFile ? 'Change logo' : 'Upload logo'}
                  </div>
                </label>
              </div>
            </div>

            <Separator />

            {/* Color */}
            <div className="space-y-3">
              <Label>Primary Color</Label>
              <div className="flex gap-2 flex-wrap">
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => {
                      setPrimaryColor(c.value)
                      applyBrandColor(c.value)
                    }}
                    className={cn(
                      'h-9 w-9 rounded-full border-2 transition-all',
                      primaryColor === c.value
                        ? 'border-white scale-110 shadow-lg'
                        : 'border-transparent hover:scale-105',
                    )}
                    style={{ backgroundColor: c.value }}
                    title={c.name}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <div className="h-5 w-5 rounded border border-zinc-700" style={{ backgroundColor: primaryColor }} />
                <span className="text-xs text-zinc-400">{primaryColor}</span>
              </div>
            </div>

            <Separator />

            {/* Invoice text */}
            <div className="space-y-3">
              <Label>Invoice Header Text</Label>
              <Input
                placeholder="e.g. Thank you for shopping with us!"
                value={invoiceHeader}
                onChange={(e) => setInvoiceHeader(e.target.value)}
              />
            </div>
            <div className="space-y-3">
              <Label>Invoice Footer Text</Label>
              <Input
                placeholder="e.g. Goods once sold will not be exchanged."
                value={invoiceFooter}
                onChange={(e) => setInvoiceFooter(e.target.value)}
              />
            </div>

            <Button onClick={() => saveBrandingMutation.mutate()} disabled={saveBrandingMutation.isPending}>
              {saveBrandingMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Branding'
              )}
            </Button>
          </div>
        </TabsContent>

        {/* Appearance */}
        <TabsContent value="appearance">
          <div className="rounded-lg border border-border bg-card p-6 space-y-6">
            <h2 className="text-base font-semibold text-foreground">Appearance</h2>

            <div className="space-y-3">
              <Label>Theme</Label>
              <p className="text-xs text-muted-foreground">Choose between dark and light mode for the interface.</p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => theme === 'light' && toggleTheme()}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all w-32',
                    theme === 'dark'
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-border/80',
                  )}
                >
                  <div className="h-16 w-24 rounded-lg bg-zinc-950 border border-zinc-800 flex flex-col overflow-hidden">
                    <div className="h-4 bg-zinc-900 border-b border-zinc-800 flex items-center px-2 gap-1">
                      <div className="h-1.5 w-1.5 rounded-full bg-zinc-700" />
                      <div className="h-1 w-8 rounded bg-zinc-800" />
                    </div>
                    <div className="flex-1 flex items-center justify-center">
                      <div className="h-2 w-12 rounded bg-zinc-800" />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Moon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">Dark</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => theme === 'dark' && toggleTheme()}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all w-32',
                    theme === 'light'
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-border/80',
                  )}
                >
                  <div className="h-16 w-24 rounded-lg bg-white border border-zinc-200 flex flex-col overflow-hidden">
                    <div className="h-4 bg-zinc-100 border-b border-zinc-200 flex items-center px-2 gap-1">
                      <div className="h-1.5 w-1.5 rounded-full bg-zinc-300" />
                      <div className="h-1 w-8 rounded bg-zinc-200" />
                    </div>
                    <div className="flex-1 flex items-center justify-center">
                      <div className="h-2 w-12 rounded bg-zinc-100" />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Sun className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">Light</span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Team */}
        <TabsContent value="team" className="space-y-6">
          <div className="rounded-lg border border-border bg-card p-6 space-y-4">
            <h2 className="text-base font-semibold text-foreground">Change Password</h2>
            <form
              onSubmit={changePasswordForm.handleSubmit((v) => changePasswordMutation.mutate(v))}
              className="space-y-4 max-w-sm"
            >
              <div className="space-y-1.5">
                <Label htmlFor="current-password">Current Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <Input
                    id="current-password"
                    type={showCurrentPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    className="pl-9 pr-10"
                    autoComplete="current-password"
                    {...changePasswordForm.register('currentPassword')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                    tabIndex={-1}
                  >
                    {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {changePasswordForm.formState.errors.currentPassword && (
                  <p className="text-xs text-red-400">{changePasswordForm.formState.errors.currentPassword.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-password">New Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <Input
                    id="new-password"
                    type={showNewPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    className="pl-9 pr-10"
                    autoComplete="new-password"
                    {...changePasswordForm.register('newPassword', {
                      onChange: (e) => setNewPasswordValue(e.target.value),
                    })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                    tabIndex={-1}
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {changePasswordForm.formState.errors.newPassword && (
                  <p className="text-xs text-red-400">{changePasswordForm.formState.errors.newPassword.message}</p>
                )}
                {newPasswordValue.length > 0 && (() => {
                  const { checks, score } = getPasswordStrength(newPasswordValue)
                  const strengthLabel = score <= 1 ? 'Weak' : score === 2 ? 'Fair' : score === 3 ? 'Good' : 'Strong'
                  const strengthColor = score <= 1 ? 'bg-red-500' : score === 2 ? 'bg-yellow-500' : score === 3 ? 'bg-blue-500' : 'bg-emerald-500'
                  const textColor = score <= 1 ? 'text-red-400' : score === 2 ? 'text-yellow-400' : score === 3 ? 'text-blue-400' : 'text-emerald-400'
                  return (
                    <div className="space-y-2 mt-1">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 flex gap-1">
                          {[1, 2, 3, 4].map((i) => (
                            <div key={i} className={cn('h-1 flex-1 rounded-full transition-all', i <= score ? strengthColor : 'bg-zinc-700')} />
                          ))}
                        </div>
                        <span className={cn('text-xs font-medium', textColor)}>{strengthLabel}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1">
                        {[
                          { key: 'length', label: '8+ characters' },
                          { key: 'upper', label: 'Uppercase letter (A-Z)' },
                          { key: 'lower', label: 'Lowercase letter (a-z)' },
                          { key: 'special', label: 'Special character (!@#...)' },
                        ].map(({ key, label }) => (
                          <div key={key} className={cn('flex items-center gap-1.5 text-[11px]', checks[key as keyof typeof checks] ? 'text-emerald-400' : 'text-zinc-500')}>
                            <div className={cn('h-1.5 w-1.5 rounded-full', checks[key as keyof typeof checks] ? 'bg-emerald-400' : 'bg-zinc-600')} />
                            {label}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">Confirm New Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <Input
                    id="confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    className="pl-9 pr-10"
                    autoComplete="new-password"
                    {...changePasswordForm.register('confirmPassword')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {changePasswordForm.formState.errors.confirmPassword && (
                  <p className="text-xs text-red-400">{changePasswordForm.formState.errors.confirmPassword.message}</p>
                )}
              </div>

              <Button type="submit" disabled={changePasswordMutation.isPending}>
                {changePasswordMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  'Update Password'
                )}
              </Button>
            </form>
          </div>

          <div className="rounded-lg border border-border bg-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">Team Members</h2>
              <Button size="sm" onClick={() => setShowInviteDialog(true)}>
                <Plus className="h-4 w-4" />
                Invite Member
              </Button>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members?.map((member) => {
                  const profile = (member.profiles as unknown as { full_name: string; email: string }) ?? null
                  return (
                    <TableRow key={member.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-700 text-xs font-bold text-white">
                            {(profile?.full_name ?? profile?.email ?? '?').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-zinc-200">{profile?.full_name ?? 'Unknown'}</p>
                            <p className="text-xs text-zinc-500">{profile?.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getRoleBadgeVariant(member.role as UserRole)} className="capitalize">
                          {member.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <select
                          defaultValue={member.role}
                          onChange={(e) =>
                            updateRoleMutation.mutate({
                              memberId: member.id,
                              role: e.target.value as UserRole,
                            })
                          }
                          className="h-7 rounded border border-zinc-700 bg-zinc-800 px-2 text-xs text-zinc-200 focus:outline-none"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r} className="bg-zinc-900 capitalize">
                              {r}
                            </option>
                          ))}
                        </select>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Billing */}
        <TabsContent value="billing">
          <div className="rounded-lg border border-border bg-card p-6 space-y-4">
            <h2 className="text-base font-semibold text-foreground">Plan & Billing</h2>

            <div className="rounded-lg border border-indigo-800 bg-indigo-950/30 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-indigo-300">Free Plan</p>
                  <p className="text-xs text-zinc-400 mt-1">Unlimited bills, 1 user, basic reports</p>
                </div>
                <Badge variant="default">Active</Badge>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div className="rounded-lg border border-zinc-700 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">Pro Plan</p>
                    <p className="text-xs text-zinc-400 mt-1">Unlimited users, advanced reports, WhatsApp invoices</p>
                    <ul className="mt-2 space-y-1">
                      {['Unlimited staff accounts', 'WhatsApp invoice sharing', 'Advanced analytics', 'Priority support', 'Custom invoice template'].map((f) => (
                        <li key={f} className="flex items-center gap-1.5 text-xs text-zinc-400">
                          <div className="h-1 w-1 rounded-full bg-indigo-400" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-white">₹499</p>
                    <p className="text-xs text-zinc-500">/month</p>
                  </div>
                </div>
                <Button className="mt-4 w-full" variant="outline">
                  Upgrade to Pro
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Invoice Settings */}
        <TabsContent value="invoice">
          <div className="rounded-lg border border-border bg-card p-6 space-y-5">
            <h2 className="text-base font-semibold text-foreground">Invoice Settings</h2>

            <div className="space-y-1.5">
              <Label>Invoice Number Prefix</Label>
              <Input placeholder="INV" value={invoicePrefix} onChange={(e) => setInvoicePrefix(e.target.value)} className="max-w-xs" />
              <p className="text-xs text-muted-foreground">e.g. INV → INV-20260723-001</p>
            </div>

            <div className="space-y-1.5">
              <Label>Terms & Conditions</Label>
              <textarea
                value={invoiceTerms}
                onChange={(e) => setInvoiceTerms(e.target.value)}
                placeholder="Thank you for your business!"
                rows={3}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>

            <div className="space-y-3">
              <Label>Bank Details (for invoice footer)</Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Bank Name</Label>
                  <Input placeholder="e.g. SBI" value={bankName} onChange={(e) => setBankName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Account Number</Label>
                  <Input placeholder="1234567890" value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">IFSC Code</Label>
                  <Input placeholder="SBIN0001234" value={bankIfsc} onChange={(e) => setBankIfsc(e.target.value.toUpperCase())} className="uppercase" />
                </div>
              </div>
            </div>

            <Button onClick={() => saveInvoiceSettingsMutation.mutate()} disabled={saveInvoiceSettingsMutation.isPending}>
              {saveInvoiceSettingsMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Saving...</> : 'Save Invoice Settings'}
            </Button>
          </div>
        </TabsContent>

        {/* Units */}
        <TabsContent value="units">
          <UnitsSettingsPanel />
        </TabsContent>

        {/* Regional Settings */}
        <TabsContent value="regional">
          <div className="rounded-lg border border-border bg-card p-6 space-y-5">
            <h2 className="text-base font-semibold text-foreground">Regional Settings</h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Currency Symbol</Label>
                <select value={currency} onChange={(e) => setCurrency(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="₹">₹ — Indian Rupee</option>
                  <option value="$">$ — US Dollar</option>
                  <option value="€">€ — Euro</option>
                  <option value="£">£ — British Pound</option>
                  <option value="AED">AED — UAE Dirham</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Date Format</Label>
                <select value={dateFormat} onChange={(e) => setDateFormat(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="DD/MM/YYYY">DD/MM/YYYY (India)</option>
                  <option value="MM/DD/YYYY">MM/DD/YYYY (US)</option>
                  <option value="YYYY-MM-DD">YYYY-MM-DD (ISO)</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Timezone</Label>
                <select value={timezone} onChange={(e) => setTimezone(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="Asia/Kolkata">Asia/Kolkata (IST +5:30)</option>
                  <option value="Asia/Dubai">Asia/Dubai (GST +4:00)</option>
                  <option value="Asia/Singapore">Asia/Singapore (SGT +8:00)</option>
                  <option value="America/New_York">America/New_York (EST)</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>
            </div>

            <Button onClick={() => saveRegionalMutation.mutate()} disabled={saveRegionalMutation.isPending}>
              {saveRegionalMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Saving...</> : 'Save Regional Settings'}
            </Button>
          </div>
        </TabsContent>

        {/* Backup & Export */}
        <TabsContent value="backup">
          <div className="rounded-lg border border-border bg-card p-6 space-y-5">
            <h2 className="text-base font-semibold text-foreground">Backup & Data Export</h2>
            <p className="text-sm text-muted-foreground">
              Download all your business data as a CSV file. This includes products, customers, sales, purchases, and expenses.
            </p>

            <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Download className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-medium text-foreground">Full Data Export</p>
                  <p className="text-xs text-muted-foreground">Products, Customers, Sales, Purchases, Expenses — single CSV file</p>
                </div>
              </div>
              <Button onClick={exportAllData} disabled={exportLoading} className="w-full sm:w-auto">
                {exportLoading ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Exporting...</> : <><Download className="h-4 w-4" /> Download Backup</>}
              </Button>
            </div>

            <div className="rounded-lg border border-red-800/40 bg-red-950/20 p-4">
              <div className="flex items-start gap-3">
                <Trash2 className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-red-400">Danger Zone</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Deleting your account or organization cannot be undone. Please export your data first.
                    Contact support to delete your account.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Invite member dialog */}
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Invite Team Member</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={inviteForm.handleSubmit((v) => inviteMutation.mutate(v))}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">Email Address</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="colleague@example.com"
                {...inviteForm.register('email')}
              />
              {inviteForm.formState.errors.email && (
                <p className="text-xs text-red-400">{inviteForm.formState.errors.email.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-role">Role</Label>
              <select
                id="invite-role"
                className="flex h-9 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                {...inviteForm.register('role')}
              >
                <option value="cashier" className="bg-zinc-900">Cashier — can bill only</option>
                <option value="manager" className="bg-zinc-900">Manager — can manage products</option>
                <option value="owner" className="bg-zinc-900">Owner — full access</option>
              </select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowInviteDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={inviteMutation.isPending}>
                Send Invite
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
