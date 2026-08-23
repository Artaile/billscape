import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date, dateFormat?: string) {
  const d = new Date(date)
  if (isNaN(d.getTime())) return ''

  if (dateFormat === 'YYYY-MM-DD') {
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }
  if (dateFormat === 'MM/DD/YYYY') {
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${mm}/${dd}/${yyyy}`
  }
  if (dateFormat === 'DD/MM/YYYY') {
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${dd}/${mm}/${yyyy}`
  }

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d)
}

export function formatDateTime(date: string | Date, dateFormat?: string) {
  const d = new Date(date)
  if (isNaN(d.getTime())) return ''
  const datePart = formatDate(d, dateFormat)
  const timePart = new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
  return `${datePart}, ${timePart}`
}

export { generateBarcode, generateSku } from '@billscape/core'

export function debounce<T extends (...args: unknown[]) => unknown>(fn: T, ms: number) {
  let timer: ReturnType<typeof setTimeout>
  return (...args: Parameters<T>) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}

export function parseBilledBy(notes?: string | null, fallbackUser?: string, fallbackRole?: string): string {
  if (notes && notes.includes('[BILLED_BY:')) {
    const match = notes.match(/\[BILLED_BY:\s*"?(.*?)"?\s*\]/)
    if (match && match[1]) {
      const val = match[1]
      if ((val === 'Cashier' || val === 'User' || !val.includes('(')) && fallbackUser) {
        const rLabel = fallbackRole ? (fallbackRole.charAt(0).toUpperCase() + fallbackRole.slice(1)) : 'Cashier'
        const uName = (val !== 'Cashier' && val !== 'User') ? val : fallbackUser
        return `${uName} (${rLabel})`
      }
      return val
    }
  }
  const uName = fallbackUser || 'User'
  const rLabel = fallbackRole ? (fallbackRole.charAt(0).toUpperCase() + fallbackRole.slice(1)) : 'Cashier'
  return `${uName} (${rLabel})`
}
