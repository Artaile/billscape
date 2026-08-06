import { useEffect, useState } from 'react'
import { Building2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'

export interface SupplierOption {
  id: string
  name: string
  phone: string | null
  email?: string | null
  gstin: string | null
  address?: string | null
  bank_name?: string | null
  bank_account?: string | null
  bank_ifsc?: string | null
}

interface SupplierFormState {
  name: string
  phone: string
  email: string
  gstin: string
  address: string
  bankName: string
  bankAccount: string
  bankIfsc: string
}

function emptyForm(initialName?: string): SupplierFormState {
  return {
    name: initialName ?? '',
    phone: '',
    email: '',
    gstin: '',
    address: '',
    bankName: '',
    bankAccount: '',
    bankIfsc: '',
  }
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10)
  return digits.length <= 5 ? digits : `${digits.slice(0, 5)} ${digits.slice(5)}`
}

interface SupplierFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  orgId: string
  editTarget?: SupplierOption | null
  initialName?: string
  onSaved: (supplier: SupplierOption) => void
}

// Shared full supplier form — used both from /suppliers (add + edit) and as the
// "add new supplier" popup inside New/Edit Purchase, so both places create/edit the
// exact same fields (including bank details) rather than two divergent forms.
export function SupplierFormDialog({
  open,
  onOpenChange,
  orgId,
  editTarget,
  initialName,
  onSaved,
}: SupplierFormDialogProps) {
  const [form, setForm] = useState<SupplierFormState>(emptyForm(initialName))
  const [nameError, setNameError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (editTarget) {
      setForm({
        name: editTarget.name,
        phone: editTarget.phone ?? '',
        email: editTarget.email ?? '',
        gstin: editTarget.gstin ?? '',
        address: editTarget.address ?? '',
        bankName: editTarget.bank_name ?? '',
        bankAccount: editTarget.bank_account ?? '',
        bankIfsc: editTarget.bank_ifsc ?? '',
      })
    } else {
      setForm(emptyForm(initialName))
    }
    setNameError('')
  }, [open, editTarget, initialName])

  function setField(field: keyof SupplierFormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (field === 'name' && value.trim()) setNameError('')
  }

  const rawPhoneDigits = form.phone.replace(/\D/g, '')
  const phoneInvalid = rawPhoneDigits.length > 0 && rawPhoneDigits.length < 10

  async function handleSave() {
    if (!form.name.trim()) {
      setNameError('Name is required')
      return
    }
    if (phoneInvalid) {
      toast.error('Invalid phone', 'Enter a 10-digit India mobile number')
      return
    }

    const payload = {
      organization_id: orgId,
      name: form.name.trim(),
      phone: rawPhoneDigits || null,
      email: form.email.trim() || null,
      gstin: form.gstin.trim() || null,
      address: form.address.trim() || null,
      bank_name: form.bankName.trim() || null,
      bank_account: form.bankAccount.trim() || null,
      bank_ifsc: form.bankIfsc.trim() || null,
    }

    setSaving(true)
    const result = editTarget
      ? await supabase
          .from('suppliers')
          .update(payload)
          .eq('id', editTarget.id)
          .eq('organization_id', orgId)
          .select()
          .single()
      : await supabase.from('suppliers').insert(payload).select().single()
    setSaving(false)

    if (result.error || !result.data) {
      toast.error(editTarget ? 'Failed to update supplier' : 'Failed to add supplier', result.error?.message)
      return
    }

    toast.success(editTarget ? 'Supplier updated' : 'Supplier added')
    onSaved(result.data as SupplierOption)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-indigo-400" />
            {editTarget ? 'Edit Supplier' : 'Add Supplier'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sup-name">Name *</Label>
            <Input
              id="sup-name"
              placeholder="Supplier name"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              autoFocus
            />
            {nameError && <p className="text-xs text-red-400">{nameError}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sup-phone">Phone</Label>
            <Input
              id="sup-phone"
              inputMode="numeric"
              placeholder="98765 43210"
              value={form.phone}
              onChange={(e) => setField('phone', formatPhone(e.target.value))}
              maxLength={11}
            />
            {phoneInvalid && <p className="text-[11px] text-amber-400">Enter 10-digit mobile number</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sup-email">Email</Label>
            <Input
              id="sup-email"
              type="email"
              placeholder="supplier@example.com"
              value={form.email}
              onChange={(e) => setField('email', e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sup-gstin">GSTIN</Label>
            <Input
              id="sup-gstin"
              placeholder="33AABCU9603R1ZX"
              value={form.gstin}
              onChange={(e) => setField('gstin', e.target.value.toUpperCase())}
              className="uppercase"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sup-address">Address</Label>
            <textarea
              id="sup-address"
              rows={3}
              placeholder="Street, City, Pincode"
              value={form.address}
              onChange={(e) => setField('address', e.target.value)}
              className="flex w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          <div className="space-y-2 rounded-lg border border-zinc-800 p-3">
            <p className="text-xs font-medium text-zinc-400">Bank Details (for payments)</p>
            <div className="space-y-1.5">
              <Label htmlFor="sup-bank-name">Bank Name</Label>
              <Input
                id="sup-bank-name"
                placeholder="State Bank of India"
                value={form.bankName}
                onChange={(e) => setField('bankName', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sup-bank-account">Account Number</Label>
              <Input
                id="sup-bank-account"
                inputMode="numeric"
                placeholder="1234567890"
                value={form.bankAccount}
                onChange={(e) => setField('bankAccount', e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sup-bank-ifsc">IFSC Code</Label>
              <Input
                id="sup-bank-ifsc"
                placeholder="SBIN0001234"
                value={form.bankIfsc}
                onChange={(e) => setField('bankIfsc', e.target.value.toUpperCase())}
                className="uppercase"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={saving} onClick={handleSave}>
            {saving
              ? editTarget ? 'Saving...' : 'Adding...'
              : editTarget ? 'Save Changes' : 'Add Supplier'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
