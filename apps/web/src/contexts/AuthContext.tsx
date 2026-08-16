import React, { createContext, useContext, useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { applyBrandColor } from '@/lib/brandColor'
import type { UserRole } from '@billscape/core'

interface OrgInfo {
  id: string
  name: string
  state_code: string
  gstin?: string
  address?: string
  city?: string
  pincode?: string
  phone?: string
  email?: string
  pan?: string
  business_type?: string
  website?: string
  branding?: {
    primary_color: string
    logo_url?: string
    shop_name: string
    invoice_header?: string
    invoice_footer?: string
    bank_name?: string
    bank_account?: string
    bank_ifsc?: string
    invoice_terms?: string
    invoice_prefix?: string
    invoice_start_number?: number
    currency?: string
    date_format?: string
    timezone?: string
    // Tax & GST
    tax_inclusive?: boolean
    default_gst_rate?: number
    composition_scheme?: boolean
    inter_state_tax?: boolean
    show_hsn_on_invoice?: boolean
    rcm_enabled?: boolean
    // Barcode
    barcode_type?: string
    barcode_label_size?: string
    auto_print_barcode_on_purchase?: boolean
    // UPI / Payments
    upi_id?: string
    default_payment_mode?: string
    default_payment_terms?: number
    payment_reminder_days?: number
    // Signature
    signature_url?: string
    show_signature_on_invoice?: boolean
    // Notifications
    notify_low_stock?: boolean
    notify_expiry?: boolean
    notify_invoice_due?: boolean
    notify_payment_received?: boolean
    notify_daily_summary?: boolean
    notify_trial_expiry?: boolean
    payment_reminders?: boolean
    due_date_reminders?: boolean
    remind_before_due?: number
    remind_after_due?: number
    // Print & PDF Layout
    print_paper_size?: 'a4' | 'a5' | 'thermal_3inch' | 'thermal_2inch'
    print_template_theme?: string
    print_show_logo?: boolean
    print_show_shop_name?: boolean
    print_show_address?: boolean
    print_show_contact?: boolean
    print_show_gstin?: boolean
    print_show_pan?: boolean
    print_show_column_sno?: boolean
    print_show_column_hsn?: boolean
    print_show_column_mrp?: boolean
    print_show_column_unit?: boolean
    print_show_column_discount?: boolean
    print_show_column_tax_rate?: boolean
    print_show_column_tax_amount?: boolean
    print_show_bank_details?: boolean
    print_show_upi_qr?: boolean
    print_show_terms?: boolean
    print_show_signature?: boolean
    print_thank_you_note?: string
    // Custom Fields
    custom_fields?: any[]
    [key: string]: any
  }
  feature_flags?: Record<string, any>
  invoice_template?: any
}

interface AuthState {
  session: Session | null
  user: User | null
  role: UserRole | null // Base system role
  permissions: Record<string, boolean> | null // Custom role UI permissions
  org: OrgInfo | null
  loading: boolean
  isSuperAdmin: boolean
}

interface AuthContextValue extends AuthState {
  signOut: () => Promise<void>
  refreshOrg: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    role: null,
    permissions: null,
    org: null,
    loading: true,
    isSuperAdmin: false,
  })

  const loadOrgFromSession = async (session: Session | null) => {
    if (!session?.user) {
      setState({ session: null, user: null, role: null, permissions: null, org: null, loading: false, isSuperAdmin: false })
      return
    }

    try {
      // Check super admin first via profiles.is_super_admin
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_super_admin')
        .eq('id', session.user.id)
        .single()

      const isSuperAdmin = profile?.is_super_admin === true

      // Get primary membership (non-super_admin first for tenant context)
      const { data: memberships } = await supabase
        .from('memberships')
        .select('role, role_id, organization_id, roles!memberships_role_id_fkey(permissions)')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: true })

      // Pick the first non-super_admin membership for tenant context
      const tenantMembership = memberships?.find((m) => m.role !== 'super_admin')
      const role = (tenantMembership?.role as UserRole) ?? null
      const permissions = ((tenantMembership?.roles as any)?.permissions as Record<string, boolean>) ?? null
      const orgId = tenantMembership?.organization_id ?? null

      if (!orgId) {
        setState({ session, user: session.user, role, permissions, org: null, loading: false, isSuperAdmin })
        return
      }

      const [orgResult, settingsResult] = await Promise.all([
        supabase.from('organizations').select('id,name,state_code,gstin,address,city,pincode,phone,email,pan,business_type,website').eq('id', orgId).single(),
        supabase.from('org_settings').select('branding,feature_flags,invoice_template').eq('organization_id', orgId).single(),
      ])

      const org: OrgInfo = {
        id: orgId,
        name: orgResult.data?.name ?? 'My Shop',
        state_code: orgResult.data?.state_code ?? 'TN',
        gstin: orgResult.data?.gstin ?? undefined,
        address: orgResult.data?.address ?? undefined,
        city: orgResult.data?.city ?? undefined,
        pincode: orgResult.data?.pincode ?? undefined,
        phone: orgResult.data?.phone ?? undefined,
        email: orgResult.data?.email ?? undefined,
        pan: orgResult.data?.pan ?? undefined,
        business_type: orgResult.data?.business_type ?? undefined,
        website: orgResult.data?.website ?? undefined,
        branding: settingsResult.data?.branding as OrgInfo['branding'],
        feature_flags: settingsResult.data?.feature_flags as OrgInfo['feature_flags'],
        invoice_template: settingsResult.data?.invoice_template as OrgInfo['invoice_template'],
      }

      applyBrandColor(org.branding?.primary_color ?? '#6366f1')

      setState({ session, user: session.user, role, permissions, org, loading: false, isSuperAdmin })
    } catch (error) {
      console.error("AuthContext fetchUserAndOrg error:", error)
      setState({ session, user: session.user, role: null, permissions: null, org: null, loading: false, isSuperAdmin: false })
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => loadOrgFromSession(data.session))

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        // Recovery session must not be treated as a normal sign-in (would fall
        // through to /dashboard via RequireAuth/RequireOrg before the user sets
        // a new password) — send them to the reset-password screen instead.
        setState({ session, user: session?.user ?? null, role: null, permissions: null, org: null, loading: false, isSuperAdmin: false })
        if (window.location.pathname !== '/reset-password') {
          window.location.replace('/reset-password')
        }
        return
      }
      loadOrgFromSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  const refreshOrg = async () => {
    const { data } = await supabase.auth.getSession()
    await loadOrgFromSession(data.session)
  }

  return (
    <AuthContext.Provider value={{ ...state, signOut, refreshOrg }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
