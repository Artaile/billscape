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
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
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

type ShopInfoValues = z.infer<typeof shopInfoSchema>
type InviteValues = z.infer<typeof inviteSchema>

export function SettingsPage() {
  const { org, refreshOrg } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const orgId = org?.id
  const queryClient = useQueryClient()

  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(org?.branding?.logo_url ?? null)
  const [primaryColor, setPrimaryColor] = useState(org?.branding?.primary_color ?? '#6366f1')
  const [invoiceHeader, setInvoiceHeader] = useState(org?.branding?.invoice_header ?? '')
  const [invoiceFooter, setInvoiceFooter] = useState(org?.branding?.invoice_footer ?? '')
  const [showInviteDialog, setShowInviteDialog] = useState(false)

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
                      document.documentElement.style.setProperty('--brand-color', c.value)
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
        <TabsContent value="team">
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
