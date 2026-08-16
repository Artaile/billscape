import React, { createContext, useContext, useState, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from './AuthContext'
import { supabase } from '@/lib/supabase'
import type { Branch } from '@billscape/core'

interface BranchContextType {
  branches: Branch[]
  activeBranch: Branch | null
  activeBranchId: string | null
  setActiveBranchId: (id: string | null) => void
  isMultiBranchEnabled: boolean
  isLoading: boolean
  defaultBranch: Branch | null
  refetchBranches: () => void
}

const BranchContext = createContext<BranchContextType | undefined>(undefined)

const ACTIVE_BRANCH_STORAGE_KEY = 'billscape_active_branch_id'

export function BranchProvider({ children }: { children: React.ReactNode }) {
  const { org } = useAuth()
  const orgId = org?.id
  const queryClient = useQueryClient()

  const isMultiBranchEnabled = useMemo(() => {
    return Boolean((org as any)?.feature_flags?.enable_multi_branch)
  }, [org])

  const [activeBranchId, setActiveBranchIdState] = useState<string | null>(() => {
    return localStorage.getItem(ACTIVE_BRANCH_STORAGE_KEY)
  })

  // Fetch branches for this org
  const { data: rawBranches = [], isLoading, refetch } = useQuery({
    queryKey: ['branches', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .eq('organization_id', orgId!)
        .order('is_default', { ascending: false })
        .order('name', { ascending: true })

      if (error) {
        console.warn('Error fetching branches (table might be initializing):', error.message)
        return []
      }
      return (data || []) as Branch[]
    },
  })

  // Fallback virtual default branch if DB table doesn't have rows yet
  const branches = useMemo<Branch[]>(() => {
    if (rawBranches.length > 0) return rawBranches
    if (!org) return []
    return [
      {
        id: 'default-main',
        organization_id: org.id,
        name: org.name || 'Main Branch',
        code: 'MAIN',
        branch_type: 'retail',
        is_default: true,
        is_active: true,
        phone: (org as any)?.phone || null,
        email: (org as any)?.email || null,
        address: org.address || null,
        city: (org as any)?.city || null,
        state_code: org.state_code || null,
        pincode: (org as any)?.pincode || null,
        gstin: org.gstin || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]
  }, [rawBranches, org])

  const defaultBranch = useMemo(() => {
    return branches.find((b) => b.is_default) || branches[0] || null
  }, [branches])

  const activeBranch = useMemo<Branch | null>(() => {
    if (!isMultiBranchEnabled) {
      return defaultBranch
    }
    if (activeBranchId === null || activeBranchId === 'all') {
      return null // Represents 'All Branches / Consolidated'
    }
    const found = branches.find((b) => b.id === activeBranchId)
    return found || defaultBranch
  }, [isMultiBranchEnabled, activeBranchId, branches, defaultBranch])

  const setActiveBranchId = (id: string | null) => {
    if (id) {
      localStorage.setItem(ACTIVE_BRANCH_STORAGE_KEY, id)
    } else {
      localStorage.removeItem(ACTIVE_BRANCH_STORAGE_KEY)
    }
    setActiveBranchIdState(id)
  }

  // Ensure activeBranchId is valid on branches load
  useEffect(() => {
    if (branches.length > 0 && activeBranchId && activeBranchId !== 'all') {
      const exists = branches.some((b) => b.id === activeBranchId)
      if (!exists && defaultBranch) {
        setActiveBranchId(defaultBranch.id)
      }
    }
  }, [branches, activeBranchId, defaultBranch])

  return (
    <BranchContext.Provider
      value={{
        branches,
        activeBranch,
        activeBranchId,
        setActiveBranchId,
        isMultiBranchEnabled,
        isLoading,
        defaultBranch,
        refetchBranches: refetch,
      }}
    >
      {children}
    </BranchContext.Provider>
  )
}

export function useBranch() {
  const context = useContext(BranchContext)
  if (!context) {
    throw new Error('useBranch must be used within a BranchProvider')
  }
  return context
}
