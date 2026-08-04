import React, { createContext, useCallback, useContext, useRef, useState } from 'react'

interface NavigationGuardContextValue {
  /** Register a function that returns true when navigating away should be blocked. */
  setGuard: (guard: (() => boolean) | null) => void
  /** Called by navigation triggers (sidebar links, etc). Returns true if navigation should proceed. */
  requestNavigation: (proceed: () => void) => void
}

const NavigationGuardContext = createContext<NavigationGuardContextValue | null>(null)

export function NavigationGuardProvider({ children }: { children: React.ReactNode }) {
  const guardRef = useRef<(() => boolean) | null>(null)
  const pendingActionRef = useRef<(() => void) | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)

  const setGuard = useCallback((guard: (() => boolean) | null) => {
    guardRef.current = guard
  }, [])

  const requestNavigation = useCallback((proceed: () => void) => {
    if (guardRef.current && guardRef.current()) {
      pendingActionRef.current = proceed
      setShowConfirm(true)
      return
    }
    proceed()
  }, [])

  const confirmLeave = useCallback(() => {
    setShowConfirm(false)
    pendingActionRef.current?.()
    pendingActionRef.current = null
  }, [])

  const cancelLeave = useCallback(() => {
    setShowConfirm(false)
    pendingActionRef.current = null
  }, [])

  return (
    <NavigationGuardContext.Provider value={{ setGuard, requestNavigation }}>
      {children}
      <UnsavedCartDialog open={showConfirm} onConfirm={confirmLeave} onCancel={cancelLeave} />
    </NavigationGuardContext.Provider>
  )
}

export function useNavigationGuard() {
  const ctx = useContext(NavigationGuardContext)
  if (!ctx) throw new Error('useNavigationGuard must be used within NavigationGuardProvider')
  return ctx
}

/** Registers a guard for the lifetime of the calling component. */
export function useRegisterNavigationGuard(shouldBlock: () => boolean) {
  const { setGuard } = useNavigationGuard()
  const shouldBlockRef = useRef(shouldBlock)
  shouldBlockRef.current = shouldBlock

  React.useEffect(() => {
    setGuard(() => shouldBlockRef.current())
    return () => setGuard(null)
  }, [setGuard])
}

// Imported lazily below to avoid circular import churn at top of file
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

function UnsavedCartDialog({
  open,
  onConfirm,
  onCancel,
}: {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            Leave this bill?
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          You have items in the cart that haven&apos;t been saved. Hold the bill first if you
          want to come back to it later, or leave to discard the cart.
        </p>
        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={onCancel}>
            Stay
          </Button>
          <Button variant="destructive" className="flex-1" onClick={onConfirm}>
            Leave &amp; discard
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
