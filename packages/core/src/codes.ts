export function generateBarcode(): string {
  const timestamp = Date.now().toString(36).toUpperCase()
  const random = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `BS${timestamp}${random}`
}

export function generateSku(): string {
  const timestamp = Date.now().toString(36).toUpperCase()
  const random = Math.random().toString(36).slice(2, 5).toUpperCase()
  return `SKU${timestamp}${random}`
}

export function formatFinancialYear(date: Date = new Date()): string {
  const month = date.getMonth() + 1 // 1-12
  const year = date.getFullYear()
  // In India, April (month >= 4) starts the new FY
  const startYear = month >= 4 ? year : year - 1
  const endYear = startYear + 1
  const s2 = String(startYear).slice(-2)
  const e2 = String(endYear).slice(-2)
  return `${s2}-${e2}`
}

export function formatDocumentNumber(
  prefix: string,
  seq: number,
  config?: {
    format?: string
    suffix?: string
    date?: Date
  },
): string {
  const d = config?.date ?? new Date()
  const dateStr = d.toISOString().slice(0, 10).replace(/-/g, '')
  const seqStr = String(seq).padStart(4, '0')
  const cleanPrefix = (prefix || 'DOC').trim().toUpperCase()

  let result = ''
  if (config?.format === 'PREFIX/FY/1 (With Financial Year)') {
    const fy = formatFinancialYear(d)
    result = `${cleanPrefix}/${fy}/${seqStr}`
  } else if (config?.format === 'PREFIX/MM/1 (With Month)') {
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yyyy = String(d.getFullYear())
    result = `${cleanPrefix}/${yyyy}${mm}/${seqStr}`
  } else {
    // Default simple standard format: PREFIX-YYYYMMDD-XXXX
    result = `${cleanPrefix}-${dateStr}-${seqStr}`
  }

  if (config?.suffix?.trim()) {
    result = `${result}/${config.suffix.trim()}`
  }

  return result
}
