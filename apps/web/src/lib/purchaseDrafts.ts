import type { PurchaseRow } from '@/pages/purchases/PurchaseFormPage'

const PURCHASE_DRAFTS_KEY = 'billscape_purchase_drafts'

export interface PurchaseDraft {
  id: string
  name: string
  supplierId: string
  supplierName: string | null
  invoiceNo: string
  purchaseDate: string
  purchaseType: 'credit' | 'cash'
  notes: string
  rows: PurchaseRow[]
  billDiscountType: 'flat' | 'percent'
  billDiscountValue: string
  roundOffEnabled: boolean
  savedAt: number
}

export function getPurchaseDrafts(): PurchaseDraft[] {
  try {
    return JSON.parse(sessionStorage.getItem(PURCHASE_DRAFTS_KEY) ?? '[]')
  } catch {
    return []
  }
}

export function savePurchaseDrafts(drafts: PurchaseDraft[]): void {
  sessionStorage.setItem(PURCHASE_DRAFTS_KEY, JSON.stringify(drafts))
}
