import React, { createContext, useContext, useEffect, useState } from 'react'
import type { Branch } from '@billscape/core'
import { useAuth } from './AuthContext'
import { supabase } from '@/lib/supabase'


interface BranchContextValue {
  branches: Branch[]
  activeBranch: Branch | null
  setActiveBranchId: (id: string) => void
  loading: boolean
  isBranchUser: boolean
  isHeadOffice: boolean
  canSwitchBranch: boolean
  isEnterprise: boolean
  refetchBranches: () => Promise<void>
}

const BranchContext = createContext<BranchContextValue | null>(null)

export function BranchProvider({ children }: { children: React.ReactNode }) {
  const { org, user, role, permissions } = useAuth()
  const [branches, setBranches] = useState<Branch[]>([])
  const [activeBranch, setActiveBranch] = useState<Branch | null>(null)
  const [assignedBranchId, setAssignedBranchId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [isEnterprise, setIsEnterprise] = useState<boolean>(false)

  useEffect(() => {
    async function checkPlanEnterprise() {
      if (!org?.id) {
        setIsEnterprise(false)
        return
      }

      // 1. Direct check on org.plan
      const directPlan = (org.plan || '').toLowerCase()
      if (directPlan.includes('enterprise') || directPlan.includes('custom')) {
        setIsEnterprise(true)
        return
      }

      // 2. Check org_plans table + plans table
      try {
        const { data: orgPlan } = await supabase
          .from('org_plans')
          .select('plan_id, plans(name, features, limits)')
          .eq('organization_id', org.id)
          .eq('status', 'active')
          .maybeSingle()

        if (orgPlan?.plans) {
          const pName = ((orgPlan.plans as any).name || '').toLowerCase()
          const pFeatures = (orgPlan.plans as any).features || {}
          const pLimits = (orgPlan.plans as any).limits || {}

          if (
            pName.includes('enterprise') ||
            pName.includes('custom') ||
            pFeatures.multi_branch === true ||
            (pLimits.branches && pLimits.branches !== 1)
          ) {
            setIsEnterprise(true)
            return
          }
        }
      } catch (err) {
        console.warn('Notice checking org_plans:', err)
      }

      setIsEnterprise(false)
    }

    checkPlanEnterprise()
  }, [org?.id, org?.plan])



  const fetchBranches = async () => {
    if (!org?.id) {
      setBranches([])
      setActiveBranch(null)
      setLoading(true)
      return
    }

    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .eq('organization_id', org.id)
        .order('created_at', { ascending: true })

      if (error) {
        console.error('Error fetching branches:', error)
        setLoading(false)
        return
      }

      const rawList = (data as Branch[]) || []
      const branchList = rawList.map((b, idx) => {
        const isMainHQ = b.is_main || b.code === 'MAIN' || rawList.length === 1
        return {
          ...b,
          is_main: isMainHQ,
          type: isMainHQ ? ('head_office' as const) : b.type,
        }
      })
      setBranches(branchList)


      // Find user assigned branch from membership
      let userAssignedId: string | null = null
      if (user?.id) {
        const { data: mem } = await supabase
          .from('memberships')
          .select('assigned_branch_id')
          .eq('user_id', user.id)
          .maybeSingle()
        userAssignedId = mem?.assigned_branch_id ?? null
      }
      setAssignedBranchId(userAssignedId)

      // Selection logic:
      // 1. If assignedBranchId exists (Branch user), lock to assigned branch
      // 2. Else check saved localStorage activeBranchId
      // 3. Fallback to main branch or first branch
      let selected: Branch | null = null
      if (userAssignedId) {
        selected = branchList.find((b) => b.id === userAssignedId) ?? null
      }

      if (!selected) {
        const savedId = localStorage.getItem(`active_branch_${org.id}`)
        if (savedId) {
          selected = branchList.find((b) => b.id === savedId) ?? null
        }
      }

      if (!selected) {
        selected = branchList.find((b) => b.is_main) || branchList[0] || null
      }

      setActiveBranch(selected)
    } catch (err) {
      console.error('BranchProvider error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchBranches()
  }, [org?.id, user?.id])

  const setActiveBranchId = (id: string) => {
    const found = branches.find((b) => b.id === id)
    if (found) {
      setActiveBranch(found)
      if (org?.id) {
        localStorage.setItem(`active_branch_${org.id}`, id)
      }
    }
  }

  // Branch user has a specific assigned_branch_id set in membership
  const isBranchUser = !!assignedBranchId
  const isHeadOffice = activeBranch?.is_main === true || activeBranch?.type === 'head_office'
  // Only users without an assigned branch restriction (Head Office users / Owners) can switch branches
  const canSwitchBranch = !assignedBranchId

  return (
    <BranchContext.Provider
      value={{
        branches,
        activeBranch,
        setActiveBranchId,
        loading,
        isBranchUser,
        isHeadOffice,
        canSwitchBranch,
        isEnterprise,
        refetchBranches: fetchBranches,
      }}
    >
      {children}
    </BranchContext.Provider>
  )
}

export function useBranch() {
  const ctx = useContext(BranchContext)
  if (!ctx) throw new Error('useBranch must be used within BranchProvider')
  return ctx
}
