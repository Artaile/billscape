export interface Expense {
  id: string
  expense_no: string | null
  description: string
  amount: number
  category: string
  expense_type: 'direct' | 'indirect'
  payment_mode: string
  status: 'paid' | 'unpaid'
  supplier_id: string | null
  expense_date: string
  notes: string | null
  created_at: string
}

export interface ExpenseCategory {
  id: string
  name: string
  type: 'direct' | 'indirect'
  created_at: string
}

export const PAYMENT_MODES = ['Cash', 'Card', 'UPI', 'Bank Transfer'] as const
