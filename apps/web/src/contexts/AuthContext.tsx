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
    currency?: string
    date_format?: string
    timezone?: string
  }
  feature_flags?: Record<string, boolean>
}

interface AuthState {
  session: Session | null
  user: User | null
  role: UserRole | null
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
    org: null,
    loading: true,
    isSuperAdmin: false,
  })

  const loadOrgFromSession = async (session: Session | null) => {
    if (!session?.user) {
      setState({ session: null, user: null, role: null, org: null, loading: false, isSuperAdmin: false })
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
        .select('role, organization_id')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: true })

      // Pick the first non-super_admin membership for tenant context
      const tenantMembership = memberships?.find((m) => m.role !== 'super_admin')
      const role = (tenantMembership?.role as UserRole) ?? null
      const orgId = tenantMembership?.organization_id ?? null

      if (!orgId) {
        setState({ session, user: session.user, role, org: null, loading: false, isSuperAdmin })
        return
      }

      const [orgResult, settingsResult] = await Promise.all([
        supabase.from('organizations').select('id,name,state_code,gstin,address').eq('id', orgId).single(),
        supabase.from('org_settings').select('branding,feature_flags').eq('organization_id', orgId).single(),
      ])

      const org: OrgInfo = {
        id: orgId,
        name: orgResult.data?.name ?? 'My Shop',
        state_code: orgResult.data?.state_code ?? 'TN',
        gstin: orgResult.data?.gstin ?? undefined,
        address: orgResult.data?.address ?? undefined,
        branding: settingsResult.data?.branding as OrgInfo['branding'],
        feature_flags: settingsResult.data?.feature_flags as Record<string, boolean>,
      }

      applyBrandColor(org.branding?.primary_color ?? '#6366f1')

      setState({ session, user: session.user, role, org, loading: false, isSuperAdmin })
    } catch {
      setState({ session, user: session.user, role: null, org: null, loading: false, isSuperAdmin: false })
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => loadOrgFromSession(data.session))

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        // Recovery session must not be treated as a normal sign-in (would fall
        // through to /dashboard via RequireAuth/RequireOrg before the user sets
        // a new password) — send them to the reset-password screen instead.
        setState({ session, user: session?.user ?? null, role: null, org: null, loading: false, isSuperAdmin: false })
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
