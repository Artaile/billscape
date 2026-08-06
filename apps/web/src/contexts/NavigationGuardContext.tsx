import React, { createContext, useCallback, useContext, useRef, useState } from 'react'

interface GuardConfig {
  shouldBlock: () => boolean
  title?: string
  message?: string
  /** When provided, the leave dialog shows a third "Save Draft" button that calls this before proceeding. */
  onSaveDraft?: () => void
}

interface NavigationGuardContextValue {
  /** Register a guard config, or a bare predicate (defaults to the POS "unsaved bill" copy). */
  setGuard: (guard: GuardConfig | (() => boolean) | null) => void
  /** Called by navigation triggers (sidebar links, etc). Returns true if navigation should proceed. */
  requestNavigation: (proceed: () => void) => void
}

const NavigationGuardContext = createContext<NavigationGuardContextValue | null>(null)

const DEFAULT_TITLE = 'Leave this bill?'
const DEFAULT_MESSAGE =
  "You have items in the cart that haven't been saved. Hold the bill first if you want to come back to it later, or leave to discard the cart."

export function NavigationGuardProvider({ children }: { children: React.ReactNode }) {
  const guardRef = useRef<GuardConfig | null>(null)
  const pendingActionRef = useRef<(() => void) | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)

  const setGuard = useCallback((guard: GuardConfig | (() => boolean) | null) => {
    guardRef.current = guard === null ? null : typeof guard === 'function' ? { shouldBlock: guard } : guard
  }, [])

  const requestNavigation = useCallback((proceed: () => void) => {
    if (guardRef.current && guardRef.current.shouldBlock()) {
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

  const saveDraftAndLeave = useCallback(() => {
    guardRef.current?.onSaveDraft?.()
    setShowConfirm(false)
    pendingActionRef.current?.()
    pendingActionRef.current = null
  }, [])

  return (
    <NavigationGuardContext.Provider value={{ setGuard, requestNavigation }}>
      {children}
      <UnsavedCartDialog
        open={showConfirm}
        title={guardRef.current?.title ?? DEFAULT_TITLE}
        message={guardRef.current?.message ?? DEFAULT_MESSAGE}
        onSaveDraft={guardRef.current?.onSaveDraft ? saveDraftAndLeave : undefined}
        onConfirm={confirmLeave}
        onCancel={cancelLeave}
      />
    </NavigationGuardContext.Provider>
  )
}

export function useNavigationGuard() {
  const ctx = useContext(NavigationGuardContext)
  if (!ctx) throw new Error('useNavigationGuard must be used within NavigationGuardProvider')
  return ctx
}

/** Registers a guard for the lifetime of the calling component. Accepts a bare predicate
 * (POS's original usage) or a config object with custom copy and an optional Save Draft action.
 * Uses a ref so callers can pass a fresh inline function/object each render without needing
 * useCallback/useMemo — only the initial mount registers/unregisters the guard; live reads
 * (shouldBlock, title, message, onSaveDraft) always go through the ref for current values. */
export function useRegisterNavigationGuard(guard: GuardConfig | (() => boolean)) {
  const { setGuard } = useNavigationGuard()
  const guardRef = useRef(guard)
  guardRef.current = guard

  React.useEffect(() => {
    setGuard({
      shouldBlock: () =>
        typeof guardRef.current === 'function' ? guardRef.current() : guardRef.current.shouldBlock(),
      get title() { return typeof guardRef.current === 'function' ? undefined : guardRef.current.title },
      get message() { return typeof guardRef.current === 'function' ? undefined : guardRef.current.message },
      get onSaveDraft() { return typeof guardRef.current === 'function' ? undefined : guardRef.current.onSaveDraft },
    })
    return () => setGuard(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setGuard])
}

// Imported lazily below to avoid circular import churn at top of file
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

function UnsavedCartDialog({
  open,
  title,
  message,
  onSaveDraft,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: string
  onSaveDraft?: () => void
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            {title}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{message}</p>
        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={onCancel}>
            Stay
          </Button>
          {onSaveDraft && (
            <Button variant="secondary" className="flex-1" onClick={onSaveDraft}>
              Save Draft
            </Button>
          )}
          <Button variant="destructive" className="flex-1" onClick={onConfirm}>
            {onSaveDraft ? 'Discard' : 'Leave & discard'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
