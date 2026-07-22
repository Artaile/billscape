import * as React from 'react'

const TOAST_LIMIT = 5
const TOAST_REMOVE_DELAY = 4000

export type ToastVariant = 'default' | 'destructive' | 'success' | 'warning'

export interface Toast {
  id: string
  title?: string
  description?: string
  variant?: ToastVariant
  duration?: number
}

type ToastAction =
  | { type: 'ADD_TOAST'; toast: Toast }
  | { type: 'DISMISS_TOAST'; toastId: string }
  | { type: 'REMOVE_TOAST'; toastId: string }

interface ToastState {
  toasts: Toast[]
}

let count = 0
function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return count.toString()
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

function addToRemoveQueue(toastId: string, dispatch: React.Dispatch<ToastAction>, duration = TOAST_REMOVE_DELAY) {
  if (toastTimeouts.has(toastId)) return

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId)
    dispatch({ type: 'REMOVE_TOAST', toastId })
  }, duration)

  toastTimeouts.set(toastId, timeout)
}

function toastReducer(state: ToastState, action: ToastAction): ToastState {
  switch (action.type) {
    case 'ADD_TOAST':
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      }
    case 'DISMISS_TOAST': {
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      }
    }
    case 'REMOVE_TOAST':
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      }
  }
}

// Global listeners
type Listener = (state: ToastState) => void
const listeners: Listener[] = []
let memoryState: ToastState = { toasts: [] }

function dispatch(action: ToastAction) {
  memoryState = toastReducer(memoryState, action)
  listeners.forEach((listener) => listener(memoryState))
}

export interface ToastOptions {
  title?: string
  description?: string
  variant?: ToastVariant
  duration?: number
}

function toast(options: ToastOptions) {
  const id = genId()
  const t: Toast = { id, ...options }

  dispatch({ type: 'ADD_TOAST', toast: t })

  const duration = options.duration ?? TOAST_REMOVE_DELAY
  addToRemoveQueue(id, dispatch, duration)

  return {
    id,
    dismiss: () => dispatch({ type: 'DISMISS_TOAST', toastId: id }),
  }
}

toast.success = (title: string, description?: string) =>
  toast({ title, description, variant: 'success' })

toast.error = (title: string, description?: string) =>
  toast({ title, description, variant: 'destructive' })

toast.warning = (title: string, description?: string) =>
  toast({ title, description, variant: 'warning' })

function useToast() {
  const [state, setState] = React.useState<ToastState>(memoryState)

  React.useEffect(() => {
    listeners.push(setState)
    return () => {
      const index = listeners.indexOf(setState)
      if (index > -1) listeners.splice(index, 1)
    }
  }, [])

  return {
    toasts: state.toasts,
    toast,
    dismiss: (toastId: string) => dispatch({ type: 'DISMISS_TOAST', toastId }),
  }
}

export { useToast, toast }
