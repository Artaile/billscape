import React, { useEffect, useState } from 'react'
import { UserPlus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'

interface CustomerOption {
  id: string
  name: string
  phone?: string | null
  gstin?: string | null
}

interface QuickAddCustomerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  orgId: string
  initialName?: string
  onCreated: (customer: CustomerOption) => void
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10)
  return digits.length <= 5 ? digits : `${digits.slice(0, 5)} ${digits.slice(5)}`
}

export function QuickAddCustomerDialog({
  open,
  onOpenChange,
  orgId,
  initialName,
  onCreated,
}: QuickAddCustomerDialogProps) {
  const [name, setName] = useState(initialName ?? '')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) setName(initialName ?? '')
  }, [open, initialName])

  const rawDigits = phone.replace(/\D/g, '')
  const phoneInvalid = rawDigits.length > 0 && rawDigits.length < 10

  const reset = () => {
    setName('')
    setPhone('')
  }

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Name is required')
      return
    }
    if (phoneInvalid) {
      toast.error('Invalid phone', 'Enter a 10-digit India mobile number')
      return
    }
    setSaving(true)
    const { data, error } = await supabase
      .from('customers')
      .insert({ organization_id: orgId, name: name.trim(), phone: rawDigits || null })
      .select('id, name, phone, gstin')
      .single()
    setSaving(false)

    if (error || !data) {
      toast.error('Failed to add customer', error?.message)
      return
    }

    toast.success('Customer added')
    onCreated(data as CustomerOption)
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) reset()
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" /> Add New Customer
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Full Name *</Label>
            <Input
              placeholder="Customer name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Mobile Number</Label>
            <Input
              placeholder="98765 43210"
              inputMode="numeric"
              type="text"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              maxLength={11}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
            {phoneInvalid && (
              <p className="text-[11px] text-amber-400">10-digit number required</p>
            )}
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="flex-1" disabled={!name.trim() || saving} onClick={handleSave}>
            {saving ? 'Adding...' : 'Add Customer'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
