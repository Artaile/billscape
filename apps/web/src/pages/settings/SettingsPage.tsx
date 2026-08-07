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
  Clock,
  Pencil,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { applyBrandColor } from '@/lib/brandColor'
import { formatINR, type UserRole } from '@billscape/core'
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

type ShopInfoValues = z.infer<typeof shopInfoSchema>

export function SettingsPage() {
  const { org, refreshOrg, user } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const orgId = org?.id
  const queryClient = useQueryClient()

  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(org?.branding?.logo_url ?? null)
  const [primaryColor, setPrimaryColor] = useState(org?.branding?.primary_color ?? '#6366f1')
  const [invoiceHeader, setInvoiceHeader] = useState(org?.branding?.invoice_header ?? '')
  const [invoiceFooter, setInvoiceFooter] = useState(org?.branding?.invoice_footer ?? '')

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

  // Routine templates state
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<any>(null)
  const [tempName, setTempName] = useState('')
  const [tempCategory, setTempCategory] = useState('rent')
  const [tempAmount, setTempAmount] = useState('')
  const [tempDueDay, setTempDueDay] = useState('5')
  const [tempIsActive, setTempIsActive] = useState(true)

  function openNewTemplate() {
    setEditingTemplate(null)
    setTempName('')
    setTempCategory('rent')
    setTempAmount('')
    setTempDueDay('5')
    setTempIsActive(true)
    setTemplateDialogOpen(true)
  }

  function openEditTemplate(t: any) {
    setEditingTemplate(t)
    setTempName(t.name)
    setTempCategory(t.category)
    setTempAmount(String(t.default_amount))
    setTempDueDay(String(t.due_day))
    setTempIsActive(t.is_active)
    setTemplateDialogOpen(true)
  }

  function saveTemplate() {
    if (!tempName.trim()) { toast.error('Name is required'); return }
    const day = parseInt(tempDueDay)
    if (isNaN(day) || day < 1 || day > 31) { toast.error('Due day must be between 1 and 31'); return }
    const amt = parseFloat(tempAmount)
    if (isNaN(amt) || amt < 0) { toast.error('Default amount must be a positive number'); return }

    saveTemplateMutation.mutate({
      name: tempName.trim(),
      category: tempCategory,
      default_amount: amt,
      due_day: day,
      is_active: tempIsActive,
    })
  }

  // Fetch routine templates
  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ['recurring-templates', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recurring_templates')
        .select('*')
        .eq('organization_id', orgId!)
        .order('due_day', { ascending: true })
      if (error) throw error
      return data ?? []
    }
  })

  const saveTemplateMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (editingTemplate) {
        const { error } = await supabase
          .from('recurring_templates')
          .update(payload)
          .eq('id', editingTemplate.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('recurring_templates')
          .insert({ ...payload, organization_id: orgId! })
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-templates', orgId] })
      toast.success(editingTemplate ? 'Template updated' : 'Template created')
      setTemplateDialogOpen(false)
    },
    onError: (err: Error) => toast.error('Failed to save template', err.message)
  })

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('recurring_templates')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-templates', orgId] })
      toast.success('Template deleted')
    },
    onError: (err: Error) => toast.error('Failed to delete template', err.message)
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

  // Dashboard Users (memberships with profile & employee details)
  const { data: dashboardUsers = [], isLoading: usersLoading, error: usersError } = useQuery({
    queryKey: ['dashboard-users', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data: memData, error: memError } = await supabase
        .from('memberships')
        .select(`
          id,
          role,
          is_active,
          user_id,
          employee_id,
          custom_role_id,
          employees(full_name, email, phone)
        `)
        .eq('organization_id', orgId!)
        .order('created_at', { ascending: true })
      
      if (memError) {
        console.error('MEMBERSHIPS QUERY ERROR:', memError)
        throw memError
      }

      const memberships = memData ?? []
      if (memberships.length === 0) return []

      const userIds = memberships.map(m => m.user_id).filter(Boolean)
      const { data: profData, error: profError } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url, updated_at')
        .in('id', userIds)

      if (profError) {
        console.error('PROFILES QUERY ERROR:', profError)
      }

      const profilesMap = new Map(profData?.map(p => [p.id, p]) ?? [])

      return memberships.map(m => ({
        ...m,
        profiles: profilesMap.get(m.user_id) || null
      }))
    }
  })

  // Fetch active employees
  const { data: activeEmployees = [] } = useQuery({
    queryKey: ['active-employees-list', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('id, full_name, email, role')
        .eq('organization_id', orgId!)
        .eq('is_active', true)
      if (error) throw error
      return data ?? []
    }
  })

  // Filter employees who do not have dashboard access yet
  const assignableEmployees = activeEmployees.filter((emp: any) => 
    !dashboardUsers.some((u: any) => u.employee_id === emp.id)
  )

  // Dialog and form states
  const [showAddUserDialog, setShowAddUserDialog] = useState(false)
  const [inviteEmployeeId, setInviteEmployeeId] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('cashier')
  const [inviteCustomRoleId, setInviteCustomRoleId] = useState('')
  const [inviteEmployeeName, setInviteEmployeeName] = useState('')

  function handleSelectEmployee(empId: string) {
    const emp = assignableEmployees.find((e: any) => e.id === empId)
    if (emp) {
      setInviteEmployeeId(emp.id)
      setInviteEmail(emp.email ?? '')
      setInviteRole(emp.role ?? 'cashier')
      setInviteEmployeeName(emp.full_name)
    } else {
      setInviteEmployeeId('')
      setInviteEmail('')
      setInviteRole('cashier')
      setInviteEmployeeName('')
    }
  }

  // Fetch custom roles
  const { data: roles = [] } = useQuery({
    queryKey: ['roles', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('roles')
        .select('*')
        .eq('organization_id', orgId!)
        .order('is_system', { ascending: false })
      if (error) throw error
      return data ?? []
    }
  })

  const inviteUserMutation = useMutation({
    mutationFn: async (payload: { employeeId: string; email: string; role: string; customRoleId?: string; employeeName?: string }) => {
      const session = await supabase.auth.getSession()
      const token = session.data.session?.access_token
      
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-employee`, {
         method: 'POST',
         headers: {
           'Content-Type': 'application/json',
           'Authorization': `Bearer ${token}`
         },
         body: JSON.stringify({
           ...payload,
           organizationId: orgId
         })
      })
      
      const resData = await response.json()
      if (!response.ok) {
        throw new Error(resData.error ?? 'Failed to send invitation')
      }
      return resData
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-users', orgId] })
      toast.success('Invitation email sent successfully!')
      setShowAddUserDialog(false)
    },
    onError: (err: Error) => {
      toast.error('Invitation failed', err.message)
    }
  })

  function handleInviteUser() {
    if (!inviteEmail.trim()) { toast.error('Email is required'); return }
    inviteUserMutation.mutate({
      employeeId: inviteEmployeeId,
      email: inviteEmail.trim(),
      role: inviteRole,
      customRoleId: inviteCustomRoleId || undefined,
      employeeName: inviteEmployeeName
    })
  }

  const updateMembershipMutation = useMutation({
    mutationFn: async ({ membershipId, updates }: { membershipId: string; updates: any }) => {
      const { error } = await supabase
        .from('memberships')
        .update(updates)
        .eq('id', membershipId)
        .eq('organization_id', orgId!)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-users', orgId] })
      toast.success('User updated successfully')
    },
    onError: (err: Error) => {
      toast.error('Update failed', err.message)
    }
  })

  const revokeAccessMutation = useMutation({
    mutationFn: async ({ userId, membershipId }: { userId: string; membershipId: string }) => {
      const { error } = await supabase
        .from('memberships')
        .delete()
        .eq('id', membershipId)
        .eq('organization_id', orgId!)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-users', orgId] })
      toast.success('Dashboard access revoked')
    },
    onError: (err: Error) => {
      toast.error('Revocation failed', err.message)
    }
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
        <p className="text-sm text-muted-foreground mt-0.5">Manage your shop configurations</p>
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
            Dashboard Users
          </TabsTrigger>
          <TabsTrigger value="billing">
            <CreditCard className="h-3.5 w-3.5 mr-1.5" />
            Billing
          </TabsTrigger>
          <TabsTrigger value="invoice">
            <FileText className="h-3.5 w-3.5 mr-1.5" />
            Invoice
          </TabsTrigger>
          <TabsTrigger value="regional">
            <Globe className="h-3.5 w-3.5 mr-1.5" />
            Regional
          </TabsTrigger>
          <TabsTrigger value="backup">
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Backup
          </TabsTrigger>
          <TabsTrigger value="routine">
            <Clock className="h-3.5 w-3.5 mr-1.5" />
            Routine Works
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

        {/* Dashboard Users */}
        <TabsContent value="team">
          <div className="rounded-lg border border-border bg-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-foreground">Dashboard Users</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Manage login access, roles, and status for your shop staff. Only the Owner can modify users.
                </p>
              </div>
              <Button size="sm" onClick={() => {
                setInviteEmployeeId('')
                setInviteEmail('')
                setInviteRole('cashier')
                setInviteCustomRoleId('')
                setInviteEmployeeName('')
                setShowAddUserDialog(true)
              }}>
                <Plus className="h-4 w-4 mr-1.5" />
                Add Dashboard User
              </Button>
            </div>

            {usersError ? (
              <div className="text-center py-8 border border-dashed border-red-900 rounded-lg text-sm text-red-500">
                Failed to load dashboard users: {usersError.message}
              </div>
            ) : usersLoading ? (
              <div className="flex items-center justify-center h-20">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : dashboardUsers.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-border rounded-lg text-sm text-muted-foreground">
                No dashboard users found.
              </div>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee / User</TableHead>
                      <TableHead>Dashboard Role</TableHead>
                      <TableHead>Custom Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dashboardUsers.map((member: any) => {
                      const isOwnerUser = member.role === 'owner'
                      const isCurrentUser = member.user_id === user?.id
                      
                      // Resolve employee name/email or profile name/email
                      const empName = member.employees?.full_name ?? member.profiles?.full_name ?? 'Invited User'
                      const empEmail = member.employees?.email ?? member.profiles?.email ?? 'No email'
                      const customRoleName = roles.find((r: any) => r.id === member.custom_role_id)?.name ?? 'None'

                      return (
                        <TableRow key={member.id} className={cn(!member.is_active && 'opacity-65')}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-700 text-xs font-bold text-white">
                                {empName.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="text-sm font-medium text-zinc-200">
                                  {empName} {isCurrentUser && <span className="text-[10px] text-indigo-400 font-semibold">(You)</span>}
                                </p>
                                <p className="text-xs text-zinc-500">{empEmail}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {isCurrentUser || isOwnerUser ? (
                              <Badge variant={getRoleBadgeVariant(member.role)} className="capitalize">
                                {member.role}
                              </Badge>
                            ) : (
                              <select
                                defaultValue={member.role}
                                onChange={(e) =>
                                  updateMembershipMutation.mutate({
                                    membershipId: member.id,
                                    updates: { role: e.target.value }
                                  })
                                }
                                className="h-7 rounded border border-zinc-700 bg-zinc-800 px-2 text-xs text-zinc-200 focus:outline-none"
                              >
                                <option value="cashier">Cashier</option>
                                <option value="manager">Manager</option>
                                <option value="owner">Owner</option>
                              </select>
                            )}
                          </TableCell>
                          <TableCell>
                            {isCurrentUser || isOwnerUser ? (
                              <span className="text-xs text-zinc-400">{customRoleName}</span>
                            ) : (
                              <select
                                defaultValue={member.custom_role_id ?? ''}
                                onChange={(e) =>
                                  updateMembershipMutation.mutate({
                                    membershipId: member.id,
                                    updates: { custom_role_id: e.target.value || null }
                                  })
                                }
                                className="h-7 rounded border border-zinc-700 bg-zinc-800 px-2 text-xs text-zinc-200 focus:outline-none"
                              >
                                <option value="">None</option>
                                {roles.filter((r: any) => !r.is_system).map((r: any) => (
                                  <option key={r.id} value={r.id}>
                                    {r.name}
                                  </option>
                                ))}
                              </select>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={member.is_active ? 'default' : 'secondary'} className="capitalize">
                              {member.is_active ? 'Active' : 'Disabled'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {!isOwnerUser && !isCurrentUser && (
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs font-medium text-zinc-300 hover:text-white"
                                  onClick={() =>
                                    updateMembershipMutation.mutate({
                                      membershipId: member.id,
                                      updates: { is_active: !member.is_active }
                                    })
                                  }
                                >
                                  {member.is_active ? 'Disable' : 'Enable'}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs font-medium text-red-400 hover:text-red-450"
                                  onClick={() => {
                                    if (confirm(`Revoke dashboard access for "${empName}"? This will delete their membership.`)) {
                                      revokeAccessMutation.mutate({ userId: member.user_id, membershipId: member.id })
                                    }
                                  }}
                                >
                                  Revoke
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
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

        {/* Routine Works */}
        <TabsContent value="routine">
          <div className="rounded-lg border border-border bg-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-foreground">Routine Works Configuration</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Set up monthly recurring tasks and expenses. Enabling these will show them in the navbar notification panel when they are due.
                </p>
              </div>
              <Button size="sm" onClick={openNewTemplate}>
                <Plus className="h-4 w-4 mr-1.5" />
                Add Template
              </Button>
            </div>

            {templatesLoading ? (
              <div className="flex items-center justify-center h-20">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-border rounded-lg text-sm text-muted-foreground">
                No routine templates configured yet. Add your first routine template (e.g. Rent, Salary, or Utilities).
              </div>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Task / Expense Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Default Amount</TableHead>
                      <TableHead>Due Day</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {templates.map((t: any) => (
                      <TableRow key={t.id} className={cn(!t.is_active && 'opacity-65')}>
                        <TableCell className="font-medium text-zinc-200">{t.name}</TableCell>
                        <TableCell className="capitalize text-zinc-400">{t.category}</TableCell>
                        <TableCell className="text-zinc-300">{formatINR(t.default_amount)}</TableCell>
                        <TableCell className="text-zinc-400">Day {t.due_day} of month</TableCell>
                        <TableCell>
                          <Badge variant={t.is_active ? 'default' : 'secondary'}>
                            {t.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEditTemplate(t)}>
                              <Pencil className="h-3.5 w-3.5 text-zinc-400 hover:text-zinc-200" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-400"
                              onClick={() => {
                                if (confirm(`Delete template "${t.name}"?`)) deleteTemplateMutation.mutate(t.id)
                              }}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Add Dashboard User Dialog */}
      <Dialog open={showAddUserDialog} onOpenChange={setShowAddUserDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Dashboard User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="invite-emp">Select Employee *</Label>
              <select
                id="invite-emp"
                value={inviteEmployeeId}
                onChange={(e) => handleSelectEmployee(e.target.value)}
                className="flex h-9 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="" className="bg-zinc-900">-- Select Employee --</option>
                {assignableEmployees.map((e: any) => (
                  <option key={e.id} value={e.id} className="bg-zinc-900">
                    {e.full_name} ({e.role})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="invite-email">Login Email Address *</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="employee@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="invite-role">Dashboard Role *</Label>
                <select
                  id="invite-role"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="cashier" className="bg-zinc-900">Cashier</option>
                  <option value="manager" className="bg-zinc-900">Manager</option>
                  <option value="owner" className="bg-zinc-900">Owner</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="invite-custom-role">Custom Role (Optional)</Label>
                <select
                  id="invite-custom-role"
                  value={inviteCustomRoleId}
                  onChange={(e) => setInviteCustomRoleId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="" className="bg-zinc-900">-- None (Use System Role) --</option>
                  {roles.filter((r: any) => !r.is_system).map((r: any) => (
                    <option key={r.id} value={r.id} className="bg-zinc-900">
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddUserDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleInviteUser} disabled={inviteUserMutation.isPending || !inviteEmployeeId}>
              {inviteUserMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Inviting...</> : 'Invite User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add / Edit Routine Template Dialog */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? 'Edit Routine Template' : 'Add Routine Template'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="temp-name">Task Name *</Label>
              <Input id="temp-name" placeholder="e.g. Shop Monthly Rent" value={tempName} onChange={(e) => setTempName(e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="temp-category">Category</Label>
                <select id="temp-category" value={tempCategory} onChange={(e) => setTempCategory(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="rent" className="bg-zinc-900">Rent</option>
                  <option value="salary" className="bg-zinc-900">Salary</option>
                  <option value="utilities" className="bg-zinc-900">Utilities</option>
                  <option value="maintenance" className="bg-zinc-900">Maintenance</option>
                  <option value="other" className="bg-zinc-900">Other Expense</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="temp-due-day">Due Day of Month (1-31) *</Label>
                <Input id="temp-due-day" type="number" min={1} max={31} value={tempDueDay} onChange={(e) => setTempDueDay(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="temp-amount">Default Amount (₹) *</Label>
              <Input id="temp-amount" type="number" min={0} placeholder="0.00" value={tempAmount} onChange={(e) => setTempAmount(e.target.value)} />
            </div>

            <label className="flex items-center gap-2 cursor-pointer pt-2">
              <input type="checkbox" checked={tempIsActive} onChange={(e) => setTempIsActive(e.target.checked)} className="rounded border-zinc-700 bg-zinc-900" />
              <span className="text-sm text-foreground">Template is Active</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveTemplate} disabled={saveTemplateMutation.isPending}>
              {saveTemplateMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Saving...</> : editingTemplate ? 'Update' : 'Add Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
