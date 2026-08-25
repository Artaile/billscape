import { supabase } from '@/lib/supabase'

export interface LogActivityParams {
  organizationId: string
  userId?: string | null
  userName?: string | null
  action: string
  entity: string
  entityId?: string | null
  metadata?: Record<string, unknown>
}

/**
 * Log an audit trail entry in activity_log table
 */
export async function logActivity({
  organizationId,
  userId,
  userName,
  action,
  entity,
  entityId,
  metadata,
}: LogActivityParams): Promise<void> {
  if (!organizationId) return

  try {
    let resolvedUserId = userId
    let resolvedUserName = userName

    // If userId or userName not passed, try to fetch current session user
    if (!resolvedUserId || !resolvedUserName) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        resolvedUserId = resolvedUserId || user.id
        resolvedUserName =
          resolvedUserName ||
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.email?.split('@')[0] ||
          user.email ||
          'User'
      }
    }

    if (!resolvedUserId) return

    // Ensure actor_name includes role e.g. "muhammadfazilsl455 (Owner)"
    if (resolvedUserId && organizationId && (!resolvedUserName || !resolvedUserName.includes('('))) {
      let roleLabel = 'User'
      try {
        const { data: mem } = await supabase
          .from('org_memberships')
          .select('role')
          .eq('organization_id', organizationId)
          .eq('user_id', resolvedUserId)
          .maybeSingle()

        if (mem?.role) {
          roleLabel = mem.role.charAt(0).toUpperCase() + mem.role.slice(1)
        } else {
          const { data: emp } = await supabase
            .from('employees')
            .select('role')
            .eq('organization_id', organizationId)
            .eq('auth_user_id', resolvedUserId)
            .maybeSingle()
          if (emp?.role) {
            roleLabel = emp.role.charAt(0).toUpperCase() + emp.role.slice(1)
          }
        }
      } catch {}

      const cleanName = resolvedUserName || 'User'
      resolvedUserName = `${cleanName} (${roleLabel})`
    }

    await supabase.from('activity_log').insert({
      organization_id: organizationId,
      actor_id: resolvedUserId,
      actor_name: resolvedUserName || 'User',
      action: action.toLowerCase().trim(),
      entity: entity.toLowerCase().trim(),
      entity_id: entityId || null,
      metadata: {
        ...metadata,
        user_email: metadata?.user_email || undefined,
      },
    })
  } catch (err) {
    // Non-blocking log failure
    console.warn('Failed to record activity log:', err)
  }
}
