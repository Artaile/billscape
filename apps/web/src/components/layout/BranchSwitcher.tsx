import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Store, Warehouse, ChevronDown, Check, Building2, Layers, Plus, Settings } from 'lucide-react'
import { useBranch } from '@/contexts/BranchContext'
import { useAuth } from '@/contexts/AuthContext'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export function BranchSwitcher() {
  const { branches, activeBranch, activeBranchId, setActiveBranchId, isMultiBranchEnabled } = useBranch()
  const { role } = useAuth()
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (!isMultiBranchEnabled) {
    return null
  }

  const isAllSelected = activeBranchId === null || activeBranchId === 'all'
  const isOwnerOrAdmin = role === 'owner' || role === 'super_admin' || role === 'manager'

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all shadow-sm',
          isOpen
            ? 'border-primary/60 bg-primary/10 text-foreground ring-1 ring-primary/40'
            : 'border-border bg-secondary/50 text-foreground hover:bg-secondary hover:border-border/80'
        )}
        title="Switch active branch or location"
      >
        <div className="flex items-center justify-center h-5 w-5 rounded bg-primary/20 text-primary">
          {isAllSelected ? (
            <Layers className="h-3.5 w-3.5" />
          ) : activeBranch?.branch_type === 'warehouse' ? (
            <Warehouse className="h-3.5 w-3.5" />
          ) : (
            <Store className="h-3.5 w-3.5" />
          )}
        </div>

        <div className="flex flex-col items-start text-left leading-tight">
          <span className="font-semibold text-xs truncate max-w-[130px] sm:max-w-[180px]">
            {isAllSelected ? 'All Branches' : activeBranch?.name}
          </span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
            {isAllSelected ? 'Consolidated' : activeBranch?.code || activeBranch?.branch_type}
          </span>
        </div>

        <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ml-1', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2 w-64 rounded-xl border border-border bg-popover p-1.5 shadow-xl z-50 animate-in fade-in-0 zoom-in-95 duration-100">
          <div className="px-2 py-1.5 border-b border-border/60 mb-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Select Branch / Location</p>
          </div>

          <div className="max-h-60 overflow-y-auto space-y-0.5">
            {/* All Branches Consolidated Option */}
            {isOwnerOrAdmin && (
              <button
                onClick={() => {
                  setActiveBranchId('all')
                  setIsOpen(false)
                }}
                className={cn(
                  'w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-colors text-left',
                  isAllSelected
                    ? 'bg-primary/15 text-primary font-semibold'
                    : 'text-foreground hover:bg-secondary/80'
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Layers className="h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 truncate">
                    <p className="font-medium truncate">All Branches</p>
                    <p className="text-[10px] text-muted-foreground">Consolidated store overview</p>
                  </div>
                </div>
                {isAllSelected && <Check className="h-4 w-4 shrink-0 text-primary" />}
              </button>
            )}

            {/* Individual Branches List */}
            {branches.map((branch) => {
              const isSelected = !isAllSelected && activeBranch?.id === branch.id
              const isWh = branch.branch_type === 'warehouse'

              return (
                <button
                  key={branch.id}
                  onClick={() => {
                    setActiveBranchId(branch.id)
                    setIsOpen(false)
                  }}
                  className={cn(
                    'w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-colors text-left',
                    isSelected
                      ? 'bg-primary/15 text-primary font-semibold'
                      : 'text-foreground hover:bg-secondary/80'
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={cn('h-6 w-6 rounded flex items-center justify-center shrink-0 text-xs',
                      isWh ? 'bg-amber-500/15 text-amber-400' : 'bg-indigo-500/15 text-indigo-400')}>
                      {isWh ? <Warehouse className="h-3.5 w-3.5" /> : <Store className="h-3.5 w-3.5" />}
                    </div>
                    <div className="min-w-0 truncate">
                      <div className="flex items-center gap-1.5">
                        <p className="font-medium truncate">{branch.name}</p>
                        {branch.is_default && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5">Main</Badge>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {branch.code} • {branch.city || branch.state_code || branch.branch_type}
                      </p>
                    </div>
                  </div>
                  {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </button>
              )
            })}
          </div>

          {/* Manage Branches Footer */}
          {isOwnerOrAdmin && (
            <div className="border-t border-border/60 mt-1 pt-1">
              <button
                onClick={() => {
                  setIsOpen(false)
                  navigate('/branches')
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
              >
                <Settings className="h-3.5 w-3.5" />
                <span>Manage Branches & Locations</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
