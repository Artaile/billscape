import React, { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useBranch } from '@/contexts/BranchContext'
import { createBranch, updateBranch, deleteBranch } from '@billscape/api'
import { supabase } from '@/lib/supabase'
import type { Branch, LocationType } from '@billscape/core'
import {
  Building2,
  Plus,
  MapPin,
  Phone,
  Mail,
  ShieldAlert,
  Sparkles,
  Trash2,
  Edit2,
  CheckCircle2,
  Store,
  Warehouse,
  Lock,
  Copy,
  Check,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'


export function BranchesPage() {
  const { org, role } = useAuth()
  const { branches, activeBranch, isEnterprise, refetchBranches } = useBranch()
  const { toast } = useToast()

  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editBranch, setEditBranch] = useState<Branch | null>(null)
  const [deleteModalBranch, setDeleteModalBranch] = useState<Branch | null>(null)
  const [confirmName, setConfirmName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [inviteSuccessData, setInviteSuccessData] = useState<{ open: boolean; email: string; name: string; branchName: string } | null>(null)
  const [copied, setCopied] = useState(false)


  // Form State
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    type: 'retail_branch' as LocationType,
    address: '',
    city: '',
    pincode: '',
    phone: '',
    email: '',
    gstin: '',
    invoice_prefix: '',
    // Primary User Invite
    employee_name: '',
    employee_email: '',
    employee_phone: '',
    employee_role: 'manager' as 'manager' | 'cashier',
    // Feature Toggles
    feature_billing: true,
    feature_products: true,
    feature_inventory: true,
    feature_purchases: true,
    feature_expenses: true,
    feature_reports: true,
    feature_employees: true,
  })

  // Basic/Pro Upsell Banner
  if (!isEnterprise) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Branches & Locations</h1>
            <p className="text-sm text-muted-foreground">
              Manage store locations, central warehouses, and inter-branch stock transfers.
            </p>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-8 text-center space-y-4 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Building2 className="w-32 h-32" />
          </div>

          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <Lock className="w-6 h-6" />
          </div>

          <div className="max-w-md mx-auto space-y-2">
            <h2 className="text-xl font-bold">Multi-Branch & Warehouse Management</h2>
            <p className="text-sm text-muted-foreground">
              Your current subscription plan includes 1 single store location. Opening sub-branches, central warehouses, or shipping stock between stores is an <span className="font-semibold text-primary">Enterprise Plan</span> feature.
            </p>
          </div>

          <div className="pt-2">
            <Button size="lg" className="gap-2 shadow-md">
              <Sparkles className="w-4 h-4 text-amber-300" /> Upgrade to Enterprise
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!org?.id) return

    if (!formData.name || !formData.code || !formData.employee_email) {
      toast({
        title: 'Validation Error',
        description: 'Branch Name, Code, and Primary User Email are required.',
        variant: 'destructive',
      })
      return
    }

    try {
      setSubmitting(true)
      // 1. Create Branch
      const newBranch = await createBranch(supabase, {
        organization_id: org.id,
        name: formData.name,
        code: formData.code,
        type: formData.type,
        address: formData.address,
        city: formData.city,
        pincode: formData.pincode,
        phone: formData.phone,
        email: formData.email,
        gstin: formData.gstin,
        invoice_prefix: formData.invoice_prefix,
        enabled_features: {
          billing: formData.feature_billing,
          products: formData.feature_products,
          inventory: formData.feature_inventory,
          purchases: formData.feature_purchases,
          expenses: formData.feature_expenses,
          reports: formData.feature_reports,
          employees: formData.feature_employees,
        },
      })

      // 2. Dispatch Employee Invite linked to newly created branch
      let empId: string | null = null
      try {
        const { data: emp, error: empErr } = await supabase
          .from('employees')
          .insert({
            organization_id: org.id,
            full_name: formData.employee_name || formData.name + ' Manager',
            email: formData.employee_email,
            phone: formData.employee_phone || null,
            role: formData.employee_role,
            assigned_branch_id: newBranch.id,
            status: 'invited',
            is_active: true,
          })
          .select('id')
          .single()

        if (emp) empId = emp.id
        if (empErr) console.warn('Employee record creation notice:', empErr)
      } catch (e) {
        console.warn('Notice inserting employee:', e)
      }


      // 3. Trigger Email Invitation & user_invitations record
      if (formData.employee_email) {
        // A. Insert into user_invitations
        const { error: invErr } = await supabase.from('user_invitations').upsert({
          organization_id: org.id,
          employee_id: empId,
          email: formData.employee_email,
          role: formData.employee_role,
          otp: 'MAGIC',
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        }, { onConflict: 'organization_id,email' })

        if (invErr) console.warn('user_invitations upsert notice:', invErr)

        // B. Send Magic Link via Supabase Auth
        console.log('[INVITE-SEND] Dispatching signInWithOtp for:', formData.employee_email)
        const res = await supabase.auth.signInWithOtp({
          email: formData.employee_email,
          options: {
            shouldCreateUser: true,
            emailRedirectTo: `${window.location.origin}/accept-invite`,
          },
        })

        console.log('[INVITE-SEND] signInWithOtp response:', res)

        if (res.error) {
          throw new Error(`Email Delivery Failed: ${res.error.message}`)
        }
      }




      toast({
        title: 'Branch Created & Email Sent!',
        description: `Branch "${newBranch.name}" created. Invitation email sent to ${formData.employee_email}.`,
      })

      setCreateDialogOpen(false)
      if (formData.employee_email) {
        setInviteSuccessData({
          open: true,
          email: formData.employee_email,
          name: formData.employee_name || formData.name + ' Manager',
          branchName: newBranch.name,
        })
      }
      refetchBranches()


    } catch (err: any) {
      toast({
        title: 'Error Creating Branch',
        description: err.message || 'Failed to create branch.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteBranch = async () => {
    if (!deleteModalBranch) return
    if (confirmName !== deleteModalBranch.name) {
      toast({
        title: 'Name Mismatch',
        description: 'Typed branch name does not match.',
        variant: 'destructive',
      })
      return
    }

    try {
      setSubmitting(true)
      await deleteBranch(supabase, deleteModalBranch.id)
      toast({
        title: 'Branch Deleted',
        description: `Branch "${deleteModalBranch.name}" deleted. Associated staff have been unassigned.`,
      })
      setDeleteModalBranch(null)
      setConfirmName('')
      refetchBranches()
    } catch (err: any) {
      toast({
        title: 'Delete Failed',
        description: err.message || 'Could not delete branch.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Branches & Warehouses</h1>
          <p className="text-sm text-muted-foreground">
            Manage multi-store locations, warehouses, staff locking, and per-branch features.
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Add Location
        </Button>
      </div>

      {/* Locations List Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {branches.map((b) => (
          <div key={b.id} className="rounded-xl border bg-card p-5 space-y-4 shadow-sm relative">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
                  {b.type === 'warehouse' ? (
                    <Warehouse className="w-5 h-5" />
                  ) : b.type === 'head_office' || b.is_main ? (
                    <Building2 className="w-5 h-5 text-emerald-600" />
                  ) : (
                    <Store className="w-5 h-5 text-amber-600" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-base">{b.name}</h3>
                    {(b.is_main || b.type === 'head_office') && <Badge className="bg-emerald-600/15 text-emerald-600 border-emerald-600/30 text-xs">👑 Head Office</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">Code: {b.code}</p>
                </div>
              </div>

              {!b.is_main && b.type !== 'head_office' && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    setDeleteModalBranch(b)
                    setConfirmName('')
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>

            <div className="space-y-1.5 text-xs text-muted-foreground pt-1 border-t">
              {b.city && (
                <div className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>{b.city} {b.pincode ? `(${b.pincode})` : ''}</span>
                </div>
              )}
              {b.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>{b.phone}</span>
                </div>
              )}
              {b.email && (
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>{b.email}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between text-xs pt-2 border-t text-muted-foreground">
              <span>Type: <strong className="capitalize">{(b.is_main || b.type === 'head_office') ? 'Head Office (Main HQ)' : b.type.replace('_', ' ')}</strong></span>
            </div>
          </div>
        ))}
      </div>



      {/* Add Branch Modal */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Store Location / Warehouse</DialogTitle>
            <DialogDescription>
              Create a new branch or warehouse and send an invite to the Primary Branch Manager.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateBranch} className="space-y-6 py-2">
            {/* Location Details */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Location Profile</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Location Name *</Label>
                  <Input
                    placeholder="e.g. Chennai Retail Store"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Branch Code *</Label>
                  <Input
                    placeholder="e.g. BR-CHE-01"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Location Type</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as LocationType })}
                  >
                    <option value="retail_branch">Retail Branch / Store</option>
                    <option value="warehouse">Central Warehouse</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label>Invoice Prefix</Label>
                  <Input
                    placeholder="e.g. CHE-"
                    value={formData.invoice_prefix}
                    onChange={(e) => setFormData({ ...formData, invoice_prefix: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>City</Label>
                  <Input
                    placeholder="Chennai"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Phone</Label>
                  <Input
                    placeholder="9876543210"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>GSTIN</Label>
                  <Input
                    placeholder="33AAAAA1234A1Z5"
                    value={formData.gstin}
                    onChange={(e) => setFormData({ ...formData, gstin: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Mandatory Primary Branch User Invite */}
            <div className="space-y-3 pt-3 border-t">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-primary">Mandatory Primary Branch Manager Invite</h4>
                <Badge variant="outline" className="text-[10px]">Invite Flow (/accept-invite)</Badge>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-muted/40 p-3.5 rounded-lg border">
                <div className="space-y-1.5">
                  <Label>Manager Full Name *</Label>
                  <Input
                    placeholder="e.g. Suresh Kumar"
                    value={formData.employee_name}
                    onChange={(e) => setFormData({ ...formData, employee_name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Manager Email (Invite Link Sent Here) *</Label>
                  <Input
                    type="email"
                    placeholder="suresh.che@shop.com"
                    value={formData.employee_email}
                    onChange={(e) => setFormData({ ...formData, employee_email: e.target.value })}
                    required
                  />
                </div>
              </div>
            </div>

            {/* Per-Branch Feature Toggles */}
            <div className="space-y-3 pt-3 border-t">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Enabled Modules for this Branch</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <label className="flex items-center justify-between p-2 rounded border cursor-pointer hover:bg-muted/50">
                  <span>POS Billing</span>
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-primary text-primary focus:ring-primary accent-primary"
                    checked={formData.feature_billing}
                    onChange={(e) => setFormData({ ...formData, feature_billing: e.target.checked })}
                  />
                </label>
                <label className="flex items-center justify-between p-2 rounded border cursor-pointer hover:bg-muted/50">
                  <span>Expenses Entry</span>
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-primary text-primary focus:ring-primary accent-primary"
                    checked={formData.feature_expenses}
                    onChange={(e) => setFormData({ ...formData, feature_expenses: e.target.checked })}
                  />
                </label>
                <label className="flex items-center justify-between p-2 rounded border cursor-pointer hover:bg-muted/50">
                  <span>Purchases & Inwarding</span>
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-primary text-primary focus:ring-primary accent-primary"
                    checked={formData.feature_purchases}
                    onChange={(e) => setFormData({ ...formData, feature_purchases: e.target.checked })}
                  />
                </label>
                <label className="flex items-center justify-between p-2 rounded border cursor-pointer hover:bg-muted/50">
                  <span>Branch Staff Management</span>
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-primary text-primary focus:ring-primary accent-primary"
                    checked={formData.feature_employees}
                    onChange={(e) => setFormData({ ...formData, feature_employees: e.target.checked })}
                  />
                </label>
              </div>
            </div>


            <DialogFooter className="pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Creating...' : 'Create Branch & Send Invite'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Safety Deletion Modal */}
      <Dialog open={!!deleteModalBranch} onOpenChange={() => setDeleteModalBranch(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <ShieldAlert className="w-5 h-5" /> Safety Check: Delete Branch
            </DialogTitle>
            <DialogDescription>
              This action will delete <strong>"{deleteModalBranch?.name}"</strong> and unassign all linked staff.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="p-3 bg-destructive/10 rounded-lg text-xs text-destructive space-y-1">
              <p className="font-semibold">Warning Notification:</p>
              <p>Associated Branch Users (e.g. branch staff) will be unassigned. Re-assign them in User Management if needed.</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Type exact branch name <strong>"{deleteModalBranch?.name}"</strong> to confirm:</Label>
              <Input
                placeholder={deleteModalBranch?.name}
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteModalBranch(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={confirmName !== deleteModalBranch?.name || submitting}
              onClick={handleDeleteBranch}
            >
              {submitting ? 'Deleting...' : 'Confirm Delete Branch'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invitation Sent Modal (Identical to SettingsPage Add Dashboard User) */}
      <Dialog open={!!inviteSuccessData?.open} onOpenChange={() => setInviteSuccessData(null)}>
        <DialogContent className="max-w-sm text-center">
          <div className="flex justify-center my-2">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 border border-emerald-500/20">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          </div>
          <DialogHeader className="text-center">
            <DialogTitle className="text-center text-xl font-bold">Invitation Sent!</DialogTitle>
            <DialogDescription className="text-center text-sm pt-1">
              An email has been sent to <strong className="text-foreground font-mono">{inviteSuccessData?.email}</strong> with a secure link to join branch <strong>"{inviteSuccessData?.branchName}"</strong>.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="pt-2">
            <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setInviteSuccessData(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}

