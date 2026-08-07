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
  customPermissions: Record<string, boolean> | null
}

interface AuthContextValue extends AuthState {
  signOut: () => Promise<void>
  refreshOrg: () => Promise<void>
  hasPermission: (permissionKey: string) => boolean
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
    customPermissions: null,
  })

  const loadOrgFromSession = async (session: Session | null) => {
    if (!session?.user) {
      setState({ session: null, user: null, role: null, org: null, loading: false, isSuperAdmin: false, customPermissions: null })
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
        .select('role, organization_id, is_active, custom_role_id')
        .eq('user_id', session.user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: true })

      // Pick the first non-super_admin membership for tenant context
      const tenantMembership = memberships?.find((m) => m.role !== 'super_admin')
      const role = (tenantMembership?.role as UserRole) ?? null
      const orgId = tenantMembership?.organization_id ?? null

      if (!orgId) {
        setState({ session, user: session.user, role, org: null, loading: false, isSuperAdmin, customPermissions: null })
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

      // Fetch custom role permissions if applicable
      let customPermissions: Record<string, boolean> | null = null
      if (tenantMembership?.custom_role_id) {
        const { data: roleData } = await supabase
          .from('roles')
          .select('permissions')
          .eq('id', tenantMembership.custom_role_id)
          .single()
        if (roleData) {
          customPermissions = roleData.permissions as Record<string, boolean>
        }
      }

      setState({ session, user: session.user, role, org, loading: false, isSuperAdmin, customPermissions })
    } catch {
      setState({ session, user: session.user, role: null, org: null, loading: false, isSuperAdmin: false, customPermissions: null })
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

  const hasPermission = (permissionKey: string): boolean => {
    if (state.isSuperAdmin || state.role === 'owner') return true
    if (!state.role) return false

    // 1. If user has a custom role with explicit permissions, check that first
    if (state.customPermissions && state.customPermissions[permissionKey] !== undefined) {
      return state.customPermissions[permissionKey] === true
    }

    // 2. Fallback to system role defaults
    if (state.role === 'manager') {
      // Managers have access to all modules except system admin controls
      return !['roles', 'settings'].includes(permissionKey)
    }

    if (state.role === 'cashier') {
      // Cashiers only have access to POS billing and dashboard operations
      return ['billing', 'dashboard', 'customers'].includes(permissionKey)
    }

    return false
  }

  return (
    <AuthContext.Provider value={{ ...state, signOut, refreshOrg, hasPermission }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
