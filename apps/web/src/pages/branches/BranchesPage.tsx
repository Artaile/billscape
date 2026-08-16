import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Building2,
  Store,
  Warehouse,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  XCircle,
  MapPin,
  Phone,
  Mail,
  User,
  CreditCard,
  QrCode,
  FileText,
  AlertCircle,
  Loader2,
  ShieldCheck,
  Layers,
  ArrowRightLeft,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useBranch } from '@/contexts/BranchContext'
import { supabase } from '@/lib/supabase'
import { getBranches, createBranch, updateBranch, deleteBranch } from '@billscape/api'
import type { Branch, BranchType } from '@billscape/core'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

export function BranchesPage() {
  const { org, role } = useAuth()
  const orgId = org?.id
  const queryClient = useQueryClient()
  const { refetchBranches, activeBranchId, setActiveBranchId } = useBranch()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null)

  // Form State
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [branchType, setBranchType] = useState<BranchType>('retail')
  const [isDefault, setIsDefault] = useState(false)
  const [managerName, setManagerName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [stateCode, setStateCode] = useState(org?.state_code || 'TN')
  const [pincode, setPincode] = useState('')
  const [gstin, setGstin] = useState('')
  const [invoicePrefix, setInvoicePrefix] = useState('')
  const [bankName, setBankName] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  const [bankIfsc, setBankIfsc] = useState('')
  const [upiId, setUpiId] = useState('')

  // Query branches
  const { data: branches = [], isLoading } = useQuery({
    queryKey: ['branches', orgId],
    enabled: !!orgId,
    queryFn: () => getBranches(supabase, orgId!, true),
  })

  // Create / Edit Mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error('No organization')
      if (!name.trim()) throw new Error('Branch name is required')
      if (!code.trim()) throw new Error('Branch code is required')

      const payload = {
        organization_id: orgId,
        name: name.trim(),
        code: code.trim().toUpperCase(),
        branch_type: branchType,
        is_default: isDefault,
        manager_name: managerName.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
        city: city.trim() || null,
        state_code: stateCode.trim() || null,
        pincode: pincode.trim() || null,
        gstin: gstin.trim() || null,
        invoice_prefix: invoicePrefix.trim() || null,
        bank_name: bankName.trim() || null,
        bank_account: bankAccount.trim() || null,
        bank_ifsc: bankIfsc.trim() || null,
        upi_id: upiId.trim() || null,
      }

      if (editingBranch) {
        return updateBranch(supabase, editingBranch.id, payload)
      } else {
        return createBranch(supabase, payload)
      }
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['branches', orgId] })
      refetchBranches()
      toast.success(editingBranch ? 'Branch updated' : 'Branch created')
      setDialogOpen(false)
    },
    onError: (err: Error) => {
      toast.error('Failed to save branch', err.message)
    },
  })

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: (branchId: string) => deleteBranch(supabase, branchId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches', orgId] })
      refetchBranches()
      toast.success('Branch deleted')
    },
    onError: (err: Error) => {
      toast.error('Cannot delete branch', err.message)
    },
  })

  // Toggle Active Status
  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      updateBranch(supabase, id, { is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches', orgId] })
      refetchBranches()
      toast.success('Status updated')
    },
    onError: (err: Error) => toast.error('Failed to update status', err.message),
  })

  const openCreateDialog = () => {
    setEditingBranch(null)
    setName('')
    setCode(`BR0${branches.length + 1}`)
    setBranchType('retail')
    setIsDefault(branches.length === 0)
    setManagerName('')
    setPhone((org as any)?.phone || '')
    setEmail((org as any)?.email || '')
    setAddress('')
    setCity((org as any)?.city || '')
    setStateCode(org?.state_code || 'TN')
    setPincode('')
    setGstin('')
    setInvoicePrefix('')
    setBankName('')
    setBankAccount('')
    setBankIfsc('')
    setUpiId('')
    setDialogOpen(true)
  }

  const openEditDialog = (branch: Branch) => {
    setEditingBranch(branch)
    setName(branch.name)
    setCode(branch.code)
    setBranchType(branch.branch_type)
    setIsDefault(branch.is_default)
    setManagerName(branch.manager_name || '')
    setPhone(branch.phone || '')
    setEmail(branch.email || '')
    setAddress(branch.address || '')
    setCity(branch.city || '')
    setStateCode(branch.state_code || 'TN')
    setPincode(branch.pincode || '')
    setGstin(branch.gstin || '')
    setInvoicePrefix(branch.invoice_prefix || '')
    setBankName(branch.bank_name || '')
    setBankAccount(branch.bank_account || '')
    setBankIfsc(branch.bank_ifsc || '')
    setUpiId(branch.upi_id || '')
    setDialogOpen(true)
  }

  const retailCount = branches.filter((b) => b.branch_type === 'retail').length
  const warehouseCount = branches.filter((b) => b.branch_type === 'warehouse').length

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            Branches &amp; Locations
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage your retail outlets, central godowns, warehouses, and satellite counters.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="gap-2">
            <Link to="/transfers">
              <ArrowRightLeft className="h-4 w-4 text-indigo-400" />
              Stock Transfers (IBT)
            </Link>
          </Button>

          <Button onClick={openCreateDialog} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Add New Branch
          </Button>
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-xs font-medium">Total Locations</span>
            <Building2 className="h-4 w-4 text-primary" />
          </div>
          <p className="text-2xl font-bold text-foreground">{branches.length}</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-xs font-medium">Retail Stores</span>
            <Store className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-foreground">{retailCount}</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-xs font-medium">Warehouses &amp; Godowns</span>
            <Warehouse className="h-4 w-4 text-amber-400" />
          </div>
          <p className="text-2xl font-bold text-foreground">{warehouseCount}</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-xs font-medium">Active Outlets</span>
            <CheckCircle2 className="h-4 w-4 text-indigo-400" />
          </div>
          <p className="text-2xl font-bold text-foreground">{branches.filter((b) => b.is_active).length}</p>
        </div>
      </div>

      {/* Branch Cards List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {branches.map((branch) => {
            const isWh = branch.branch_type === 'warehouse'
            const isDefaultMain = branch.is_default

            return (
              <div
                key={branch.id}
                className={cn(
                  'rounded-xl border bg-card p-5 shadow-sm transition-all hover:shadow-md flex flex-col justify-between',
                  isDefaultMain ? 'border-primary/50 ring-1 ring-primary/20' : 'border-border',
                  !branch.is_active && 'opacity-60 bg-muted/20'
                )}
              >
                <div>
                  {/* Top Bar of Card */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          'h-10 w-10 rounded-xl flex items-center justify-center shrink-0 font-bold',
                          isWh ? 'bg-amber-500/15 text-amber-400' : 'bg-primary/15 text-primary'
                        )}
                      >
                        {isWh ? <Warehouse className="h-5 w-5" /> : <Store className="h-5 w-5" />}
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground text-base leading-tight">
                          {branch.name}
                        </h3>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-xs font-mono font-bold text-primary">{branch.code}</span>
                          <span className="text-xs text-muted-foreground">•</span>
                          <span className="text-xs text-muted-foreground capitalize">{branch.branch_type}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      {isDefaultMain && (
                        <Badge className="bg-primary/20 text-primary border-primary/40 text-[10px] px-2">
                          Main Branch
                        </Badge>
                      )}
                      <Badge variant={branch.is_active ? 'default' : 'secondary'} className="text-[10px]">
                        {branch.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  </div>

                  {/* Branch Details */}
                  <div className="space-y-2 text-xs text-muted-foreground border-t border-border/60 pt-3 my-3">
                    {branch.address ? (
                      <div className="flex items-start gap-2">
                        <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5 text-zinc-400" />
                        <span className="line-clamp-2">
                          {branch.address}
                          {branch.city && `, ${branch.city}`}
                          {branch.state_code && ` (${branch.state_code})`}
                          {branch.pincode && ` - ${branch.pincode}`}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-zinc-500 italic">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span>Address not specified</span>
                      </div>
                    )}

                    {branch.manager_name && (
                      <div className="flex items-center gap-2">
                        <User className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                        <span>Manager: <strong>{branch.manager_name}</strong></span>
                      </div>
                    )}

                    {branch.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                        <span>{branch.phone}</span>
                      </div>
                    )}

                    {branch.gstin && (
                      <div className="flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                        <span>GSTIN: <strong>{branch.gstin}</strong></span>
                      </div>
                    )}

                    {branch.invoice_prefix && (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono bg-secondary px-1.5 py-0.5 rounded text-foreground">
                          Prefix: {branch.invoice_prefix}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer Action Buttons */}
                <div className="flex items-center justify-between border-t border-border/60 pt-3 mt-2">
                  <button
                    type="button"
                    onClick={() => setActiveBranchId(branch.id)}
                    className={cn(
                      'text-xs font-semibold px-2.5 py-1 rounded transition-colors',
                      activeBranchId === branch.id
                        ? 'bg-primary/20 text-primary'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                    )}
                  >
                    {activeBranchId === branch.id ? '✓ Current Selection' : 'Switch To This Branch'}
                  </button>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => openEditDialog(branch)}
                      title="Edit branch details"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>

                    {!isDefaultMain && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-red-400 hover:text-red-400 hover:bg-red-500/10"
                        onClick={() => {
                          if (confirm(`Delete branch "${branch.name}" (${branch.code})?`)) {
                            deleteMutation.mutate(branch.id)
                          }
                        }}
                        title="Delete branch"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              {editingBranch ? `Edit Branch: ${editingBranch.name}` : 'Add New Branch / Location'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Basic Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Branch Name *</Label>
                <Input
                  placeholder="e.g. Anna Nagar Branch"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Branch Code *</Label>
                <Input
                  placeholder="e.g. ANN, BR02, WH01"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  className="font-mono uppercase"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Branch Type</Label>
                <select
                  value={branchType}
                  onChange={(e) => setBranchType(e.target.value as BranchType)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="retail">Retail Store / Counter (POS Sales &amp; Stock)</option>
                  <option value="warehouse">Central Godown / Warehouse (Storage &amp; Receiving)</option>
                  <option value="franchise">Franchise Outlet</option>
                  <option value="kiosk">Kiosk / Satellite Stall</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label>Branch Manager Name</Label>
                <Input
                  placeholder="e.g. Karthi R"
                  value={managerName}
                  onChange={(e) => setManagerName(e.target.value)}
                />
              </div>
            </div>

            {/* Checkbox: Is Default Main Branch */}
            <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary/40 border border-border">
              <input
                type="checkbox"
                id="is-default-branch"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="rounded border-input text-primary focus:ring-primary h-4 w-4"
              />
              <Label htmlFor="is-default-branch" className="text-xs font-medium cursor-pointer">
                Set as Default Main Branch for Organization
              </Label>
            </div>

            {/* Contact & Address */}
            <div className="border-t border-border pt-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Contact &amp; Location Address
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
                <div className="space-y-1.5">
                  <Label>Phone Number</Label>
                  <Input placeholder="9876543210" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Email Address</Label>
                  <Input placeholder="branch@shop.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              </div>

              <div className="space-y-1.5 mb-3">
                <Label>Street Address</Label>
                <Input placeholder="Shop No. 12, Main Road" value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>City</Label>
                  <Input placeholder="Chennai" value={city} onChange={(e) => setCity(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>State Code</Label>
                  <Input placeholder="TN" value={stateCode} onChange={(e) => setStateCode(e.target.value.toUpperCase())} maxLength={2} />
                </div>
                <div className="space-y-1.5">
                  <Label>Pincode</Label>
                  <Input placeholder="600040" value={pincode} onChange={(e) => setPincode(e.target.value)} />
                </div>
              </div>
            </div>

            {/* Optional Tax & Banking Overrides */}
            <div className="border-t border-border pt-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Invoicing, GST &amp; UPI (Optional Overrides)
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
                <div className="space-y-1.5">
                  <Label>Branch GSTIN (Optional)</Label>
                  <Input placeholder="Leave blank to use Org GSTIN" value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} />
                </div>
                <div className="space-y-1.5">
                  <Label>Invoice Prefix Override</Label>
                  <Input placeholder="e.g. ANN/INV" value={invoicePrefix} onChange={(e) => setInvoicePrefix(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Branch UPI ID (for QR Code)</Label>
                  <Input placeholder="branch@upi" value={upiId} onChange={(e) => setUpiId(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Bank Account Number</Label>
                  <Input placeholder="Account number" value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  Saving...
                </>
              ) : editingBranch ? (
                'Update Branch'
              ) : (
                'Create Branch'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
