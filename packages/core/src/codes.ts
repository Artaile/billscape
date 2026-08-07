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
