import React from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Sparkles, ArrowRight } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export interface PlanLimitInfo {
  resourceName: string // e.g. "Products", "Staff Accounts", "Monthly Invoices", "Branches"
  currentLimit: number
  planName: string
}

interface PlanLimitModalProps {
  open: boolean
  onClose: () => void
  limitInfo: PlanLimitInfo | null
}

export function PlanLimitModal({ open, onClose, limitInfo }: PlanLimitModalProps) {
  const navigate = useNavigate()

  if (!limitInfo) return null

  const handleUpgradeClick = () => {
    onClose()
    navigate('/settings?section=billing')
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-amber-400 font-bold text-lg">
            <AlertTriangle className="h-5.5 w-5.5 text-amber-400 shrink-0" />
            Plan Limit Reached
          </div>
          <DialogDescription className="text-xs text-slate-300 mt-1">
            You cannot create additional <span className="font-semibold text-white">{limitInfo.resourceName.toLowerCase()}</span> on your current subscription tier.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-300">Active Subscription:</span>
              <span className="text-xs font-bold text-white uppercase px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/30">
                {limitInfo.planName}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-300">{limitInfo.resourceName} Limit:</span>
              <span className="text-sm font-black text-amber-200">
                {limitInfo.currentLimit} {limitInfo.resourceName} Max
              </span>
            </div>

            <p className="text-xs text-slate-300 pt-1 border-t border-amber-500/20">
              Your shop has reached the maximum allowed limit of <span className="font-bold text-white">{limitInfo.currentLimit}</span> {limitInfo.resourceName.toLowerCase()}.
            </p>
          </div>

          <div className="rounded-xl border border-indigo-500/30 bg-indigo-950/30 p-3.5 flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-indigo-400 shrink-0" />
            <div className="text-xs text-slate-300">
              <p className="font-semibold text-white">Upgrade to unlock higher limits</p>
              <p className="text-[11px] text-slate-400">Upgrade to Starter, Pro or Enterprise plan to get more quota and premium tools.</p>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleUpgradeClick}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold gap-2"
          >
            <Sparkles className="h-4 w-4" />
            Upgrade Plan
            <ArrowRight className="h-4 w-4 ml-0.5" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
