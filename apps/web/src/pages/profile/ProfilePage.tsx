import React, { useState } from 'react'
import {
  User,
  Mail,
  Phone,
  ShieldCheck,
  Building2,
  Calendar,
  KeyRound,
  Copy,
  Check,
  Save,
  Loader2,
  CheckCircle2,
  Lock,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/hooks/use-toast'
import { formatDate } from '@/lib/utils'

export function ProfilePage() {
  const { user, org, role, permissions, refreshOrg } = useAuth()

  const [fullName, setFullName] = useState(() => user?.user_metadata?.full_name || user?.email?.split('@')[0] || '')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [resetSending, setResetSending] = useState(false)
  const [copiedId, setCopiedId] = useState(false)

  const brandColor = org?.branding?.primary_color ?? '#6366f1'
  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'
  const initials = displayName
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U'

  const roleLabel = role ? role.charAt(0).toUpperCase() + role.slice(1) : 'Cashier'

  const getRoleBadgeStyle = (r?: string | null) => {
    switch (r) {
      case 'owner':
        return 'bg-amber-500/15 text-amber-400 border-amber-500/30'
      case 'admin':
        return 'bg-purple-500/15 text-purple-400 border-purple-500/30'
      case 'manager':
        return 'bg-blue-500/15 text-blue-400 border-blue-500/30'
      default:
        return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
    }
  }

  const handleCopyUserId = () => {
    if (user?.id) {
      navigator.clipboard.writeText(user.id)
      setCopiedId(true)
      toast.success('User ID copied to clipboard')
      setTimeout(() => setCopiedId(false), 2000)
    }
  }

  const handleSaveProfile = async () => {
    if (!user) return
    const phoneDigits = phone.replace(/\D/g, '')
    if (phoneDigits && phoneDigits.length !== 10) {
      toast.error('Invalid Phone', 'Enter a valid 10-digit Indian mobile number')
      return
    }

    setSaving(true)
    try {
      // 1. Update Supabase Auth user metadata
      const { error: authError } = await supabase.auth.updateUser({
        data: { full_name: fullName.trim() },
      })
      if (authError) throw authError

      // 2. If user is linked in employees table, update full_name & phone
      if (org?.id) {
        await supabase
          .from('employees')
          .update({
            full_name: fullName.trim(),
            phone: phoneDigits || null,
          })
          .eq('auth_user_id', user.id)
          .eq('organization_id', org.id)
      }

      await refreshOrg()
      toast.success('Profile updated successfully')
    } catch (err: any) {
      toast.error('Failed to update profile', err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleSendPasswordReset = async () => {
    if (!user?.email) return
    setResetSending(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) throw error
      toast.success('Password reset email sent', `Check ${user.email} for the reset link.`)
    } catch (err: any) {
      toast.error('Failed to send reset email', err.message)
    } finally {
      setResetSending(false)
    }
  }

  const permissionsList = [
    { key: 'billing', label: 'POS Billing' },
    { key: 'products', label: 'Products & Catalog' },
    { key: 'inventory', label: 'Stock & Inventory' },
    { key: 'purchases', label: 'Purchases Management' },
    { key: 'expenses', label: 'Expenses Tracking' },
    { key: 'customers', label: 'Customer Directory' },
    { key: 'suppliers', label: 'Supplier Directory' },
    { key: 'reports', label: 'Reports & GST Filings' },
    { key: 'roles', label: 'Roles & Staff Permissions' },
  ]

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 relative z-10">
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-xl font-bold text-white shadow-lg border border-white/20"
            style={{ backgroundColor: brandColor }}
          >
            {initials}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground truncate">{displayName}</h1>
              <Badge className={getRoleBadgeStyle(role)} variant="outline">
                <ShieldCheck className="h-3 w-3 mr-1" />
                {roleLabel}
              </Badge>
              <Badge variant="secondary" className="bg-emerald-950/60 text-emerald-400 border-emerald-800/50">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Active Account
              </Badge>
            </div>

            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
              <Mail className="h-3.5 w-3.5" /> {user?.email}
              <span className="text-border">•</span>
              <Building2 className="h-3.5 w-3.5" /> {org?.name || 'BillScape Shop'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Personal Information Form */}
        <div className="md:col-span-2 space-y-6">
          <div className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-sm">
            <div className="flex items-center gap-2 border-b border-border pb-3">
              <User className="h-4 w-4 text-indigo-400" />
              <h2 className="text-base font-semibold text-foreground">Personal Information</h2>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="full_name">Full Name</Label>
                <Input
                  id="full_name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter your full name"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email Address (Auth ID)</Label>
                  <div className="relative">
                    <Input id="email" value={user?.email || ''} disabled className="bg-secondary/50 text-muted-foreground pr-8" />
                    <Lock className="h-3.5 w-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="phone">Phone Number (10-digit mobile)</Label>
                  <Input
                    id="phone"
                    maxLength={10}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="9876543210"
                  />
                </div>
              </div>

              <div className="space-y-1.5 pt-2">
                <Label className="text-xs text-muted-foreground">User ID (System UUID)</Label>
                <div className="flex items-center gap-2">
                  <Input value={user?.id || ''} disabled className="font-mono text-xs bg-secondary/50" />
                  <Button variant="outline" size="sm" onClick={handleCopyUserId} className="shrink-0 gap-1.5">
                    {copiedId ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedId ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              </div>

              <div className="pt-3 border-t border-border flex justify-end">
                <Button onClick={handleSaveProfile} disabled={saving} className="gap-2 font-semibold">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {saving ? 'Saving...' : 'Save Profile Changes'}
                </Button>
              </div>
            </div>
          </div>

          {/* Security & Password */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-sm">
            <div className="flex items-center gap-2 border-b border-border pb-3">
              <KeyRound className="h-4 w-4 text-indigo-400" />
              <h2 className="text-base font-semibold text-foreground">Security &amp; Password</h2>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">Reset Password</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Send a password reset email link to change your login password securely.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSendPasswordReset}
                disabled={resetSending}
                className="gap-1.5 shrink-0"
              >
                {resetSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5 text-indigo-400" />}
                {resetSending ? 'Sending Link...' : 'Send Reset Link'}
              </Button>
            </div>
          </div>
        </div>

        {/* Right Column: Role & Organization Access Overview */}
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-sm">
            <div className="flex items-center gap-2 border-b border-border pb-3">
              <ShieldCheck className="h-4 w-4 text-indigo-400" />
              <h2 className="text-base font-semibold text-foreground">Role &amp; Permissions</h2>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">Assigned Role</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge className={getRoleBadgeStyle(role)} variant="outline">
                    {roleLabel}
                  </Badge>
                </div>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-2">Module Access Level</p>
                <div className="space-y-1.5">
                  {permissionsList.map((perm) => {
                    const hasAccess = !permissions || permissions[perm.key] !== false
                    return (
                      <div
                        key={perm.key}
                        className="flex items-center justify-between px-2.5 py-1.5 rounded-md bg-secondary/30 text-xs"
                      >
                        <span className="font-medium text-foreground">{perm.label}</span>
                        {hasAccess ? (
                          <Badge variant="secondary" className="bg-emerald-950/60 text-emerald-400 border-emerald-800/40 text-[10px]">
                            Allowed
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-red-950/40 text-red-400 border-red-900/50 text-[10px]">
                            Restricted
                          </Badge>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 space-y-3 shadow-sm">
            <div className="flex items-center gap-2 border-b border-border pb-2">
              <Building2 className="h-4 w-4 text-indigo-400" />
              <h2 className="text-base font-semibold text-foreground">Organization Info</h2>
            </div>
            <div className="space-y-2 text-xs">
              <div>
                <span className="text-muted-foreground">Shop Name: </span>
                <span className="font-semibold text-foreground">{org?.name}</span>
              </div>
              {user?.created_at && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Calendar className="h-3 w-3" /> Joined: {formatDate(user.created_at)}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
