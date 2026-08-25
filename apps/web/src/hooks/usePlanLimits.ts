import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { PlanLimitInfo } from '@/components/common/PlanLimitModal'

export function usePlanLimits() {
  const { org } = useAuth()
  const orgId = org?.id
  const [limitModalOpen, setLimitModalOpen] = useState(false)
  const [limitInfo, setLimitInfo] = useState<PlanLimitInfo | null>(null)

  const parseLimitError = (errorMessage: string): PlanLimitInfo | null => {
    if (!errorMessage.includes('PLAN_LIMIT_EXCEEDED')) return null

    // Format: PLAN_LIMIT_EXCEEDED:RESOURCE:LIMIT:PLAN_NAME
    const parts = errorMessage.split(':')
    if (parts.length >= 4) {
      const resourceRaw = parts[1]
      const limitVal = parseInt(parts[2], 10) || 0
      const planNameVal = parts[3] || 'Current Plan'

      let resourceName = 'Items'
      if (resourceRaw === 'PRODUCTS') resourceName = 'Products'
      else if (resourceRaw === 'EMPLOYEES') resourceName = 'Staff Accounts'
      else if (resourceRaw === 'INVOICES') resourceName = 'Monthly Invoices'
      else if (resourceRaw === 'BRANCHES') resourceName = 'Branches'

      return {
        resourceName,
        currentLimit: limitVal,
        planName: planNameVal,
      }
    }

    return null
  }

  const checkQuota = async (
    resourceType: 'products' | 'employees' | 'invoices' | 'branches' | 'customers'
  ): Promise<{ allowed: boolean; limitInfo?: PlanLimitInfo }> => {
    if (!orgId) return { allowed: true }

    try {
      // 1. Fetch current org plan limit
      const { data: orgPlan } = await supabase
        .from('org_plans')
        .select('plan_id, plans(name, limits)')
        .eq('organization_id', orgId)
        .eq('status', 'active')
        .maybeSingle()

      let limit = 100
      let planName = 'Free Trial'

      if (orgPlan?.plans) {
        const p = orgPlan.plans as any
        planName = p.name || 'Current Plan'
        const limitsObj = p.limits || {}
        limit = limitsObj[resourceType === 'invoices' ? 'monthly_invoices' : resourceType] ?? 100
      } else {
        // Fallback check matching organization.plan enum
        const { data: orgData } = await supabase
          .from('organizations')
          .select('plan')
          .eq('id', orgId)
          .single()

        const pEnum = orgData?.plan || 'free'
        const { data: pMatched } = await supabase
          .from('plans')
          .select('name, limits')
          .ilike('name', `%${pEnum}%`)
          .maybeSingle()

        if (pMatched) {
          planName = pMatched.name
          limit = pMatched.limits?.[resourceType === 'invoices' ? 'monthly_invoices' : resourceType] ?? 100
        }
      }

      // If limit is -1, it means unlimited
      if (limit === -1) return { allowed: true }

      // 2. Count existing records
      let currentCount = 0

      if (resourceType === 'products') {
        const { count } = await supabase
          .from('products')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
        currentCount = count ?? 0
      } else if (resourceType === 'employees') {
        const { count: empCount } = await supabase
          .from('employees')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
        const { count: memCount } = await supabase
          .from('memberships')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
        currentCount = Math.max(empCount ?? 0, memCount ?? 0)
      } else if (resourceType === 'branches') {
        const { count } = await supabase
          .from('branches')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
        currentCount = count ?? 0
      } else if (resourceType === 'customers') {
        const { count } = await supabase
          .from('customers')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
        currentCount = count ?? 0
      } else if (resourceType === 'invoices') {
        const startOfMonth = new Date()
        startOfMonth.setDate(1)
        startOfMonth.setHours(0, 0, 0, 0)

        const { count } = await supabase
          .from('sales')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .gte('created_at', startOfMonth.toISOString())
        currentCount = count ?? 0
      }

      if (currentCount >= limit) {
        let resourceName = 'Products'
        if (resourceType === 'employees') resourceName = 'Staff Accounts'
        else if (resourceType === 'invoices') resourceName = 'Monthly Invoices'
        else if (resourceType === 'branches') resourceName = 'Branches'
        else if (resourceType === 'customers') resourceName = 'Customers'

        const info: PlanLimitInfo = {
          resourceName,
          currentLimit: limit,
          planName,
        }
        setLimitInfo(info)
        setLimitModalOpen(true)
        return { allowed: false, limitInfo: info }
      }

      return { allowed: true }
    } catch (err) {
      console.error('Error checking quota:', err)
      return { allowed: true }
    }
  }

  const handleInsertError = (err: any): boolean => {
    const message = err?.message || String(err || '')
    const parsed = parseLimitError(message)
    if (parsed) {
      setLimitInfo(parsed)
      setLimitModalOpen(true)
      return true
    }
    return false
  }

  return {
    limitModalOpen,
    setLimitModalOpen,
    limitInfo,
    setLimitInfo,
    checkQuota,
    handleInsertError,
  }
}
