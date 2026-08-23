# BillScape — Complete Reference Backup of Our Custom Work & Code Implementation

> **Date Created**: 2026-08-23
> **Purpose**: Detailed backup of all code, features, and file modifications implemented in our sessions. When pulling/reverting git changes or comparing with a colleague's work, read this file to verify what was built and what needs to be restored or integrated.

---

## 📁 Summary of Files Created & Modified

| # | File Path | Action | Description |
|---|---|---|---|
| 1 | [`apps/web/src/lib/activityLog.ts`](file:///d:/personal/billscape/billscape/apps/web/src/lib/activityLog.ts) | **[NEW]** | Universal activity logging helper with real user session resolution |
| 2 | [`apps/web/src/components/search/GlobalSearchDialog.tsx`](file:///d:/personal/billscape/billscape/apps/web/src/components/search/GlobalSearchDialog.tsx) | **[NEW]** | Global ⌘K / Ctrl+K fast omnibox search command palette |
| 3 | [`apps/web/src/components/layout/AppShell.tsx`](file:///d:/personal/billscape/billscape/apps/web/src/components/layout/AppShell.tsx) | **[MODIFY]** | Wired ⌘K header trigger button & GlobalSearchDialog component |
| 4 | [`apps/web/src/pages/customers/CustomersPage.tsx`](file:///d:/personal/billscape/billscape/apps/web/src/pages/customers/CustomersPage.tsx) | **[MODIFY]** | Added Opening Balance (₹) + Dr/Cr balance types, balance badges & activity logging |
| 5 | [`apps/web/src/components/suppliers/SupplierFormDialog.tsx`](file:///d:/personal/billscape/billscape/apps/web/src/components/suppliers/SupplierFormDialog.tsx) | **[MODIFY]** | Added Opening Balance (₹) + Cr/Dr balance types to supplier form & activity logging |
| 6 | [`apps/web/src/pages/purchases/PurchasesPage.tsx`](file:///d:/personal/billscape/billscape/apps/web/src/pages/purchases/PurchasesPage.tsx) | **[MODIFY]** | Added 3 KPI Cards, Payment Status badges, Record Payment Modal & history |
| 7 | [`apps/web/src/pages/reports/ReportsPage.tsx`](file:///d:/personal/billscape/billscape/apps/web/src/pages/reports/ReportsPage.tsx) | **[MODIFY]** | Added Financial Engine: P&L, Balance Sheet, Trial Balance, Cash Flow & CSV exports |
| 8 | [`packages/api/src/sales.ts`](file:///d:/personal/billscape/billscape/packages/api/src/sales.ts) | **[MODIFY]** | Added real user `actor_name` resolution and activity logging for sales CRUD |
| 9 | `ProductsPage.tsx`, `ProductFormPage.tsx`, `SuppliersPage.tsx`, `ExpensesPage.tsx`, `ReturnsPage.tsx`, `QuotationsPage.tsx` | **[MODIFY]** | Wired `logActivity` calls into delete/create/update mutations |

---

## 🛠️ Detailed Code Implementation Backup

### 1. Universal Activity Log Helper (`apps/web/src/lib/activityLog.ts`)

```typescript
import { supabase } from './supabase'

export interface LogActivityParams {
  organizationId: string
  action: string
  entity: string
  entityId?: string | null
  metadata?: Record<string, any>
}

export async function logActivity({
  organizationId,
  action,
  entity,
  entityId,
  metadata = {},
}: LogActivityParams) {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return

    const actorName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email ||
      'User'

    await supabase.from('activity_log').insert({
      organization_id: organizationId,
      actor_id: user.id,
      actor_name: actorName,
      action,
      entity,
      entity_id: entityId || null,
      metadata,
    })
  } catch (error) {
    console.error('Failed to insert activity log:', error)
  }
}
```

---

### 2. Global ⌘K Fast Command & Search Dialog (`apps/web/src/components/search/GlobalSearchDialog.tsx`)

```typescript
import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search, Package, Users, Building2, Receipt, Command, ArrowRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { formatINR } from '@billscape/core'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

interface GlobalSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function GlobalSearchDialog({ open, onOpenChange }: GlobalSearchDialogProps) {
  const navigate = useNavigate()
  const { org } = useAuth()
  const orgId = org?.id
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Listen for Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onOpenChange])

  // Queries Products, Customers, Suppliers, Sales
  const { data: results } = useQuery({
    queryKey: ['global-search', orgId, query],
    enabled: !!orgId && query.trim().length >= 2,
    queryFn: async () => {
      const q = `%${query.trim()}%`
      const [pRes, cRes, supRes, sRes] = await Promise.all([
        supabase.from('products').select('id, name, sku, barcode_value, price').eq('organization_id', orgId!).or(`name.ilike.${q},sku.ilike.${q},barcode_value.ilike.${q}`).limit(5),
        supabase.from('customers').select('id, name, phone, balance').eq('organization_id', orgId!).or(`name.ilike.${q},phone.ilike.${q}`).limit(5),
        supabase.from('suppliers').select('id, name, phone, gstin').eq('organization_id', orgId!).or(`name.ilike.${q},phone.ilike.${q},gstin.ilike.${q}`).limit(5),
        supabase.from('sales').select('id, invoice_no, grand_total, payment_mode').eq('organization_id', orgId!).ilike('invoice_no', q).limit(5),
      ])
      return {
        products: pRes.data ?? [],
        customers: cRes.data ?? [],
        suppliers: supRes.data ?? [],
        sales: sRes.data ?? [],
      }
    },
  })

  // Navigation Pages Quick Shortcuts
  const quickPages = [
    { label: 'POS Billing', path: '/billing' },
    { label: 'Products & Inventory', path: '/products' },
    { label: 'Stock Movements', path: '/inventory' },
    { label: 'Purchases', path: '/purchases' },
    { label: 'Customers', path: '/customers' },
    { label: 'Suppliers', path: '/suppliers' },
    { label: 'Quotations', path: '/quotations' },
    { label: 'Returns', path: '/returns' },
    { label: 'Reports', path: '/reports' },
    { label: 'General Ledger', path: '/ledger' },
    { label: 'Activity Log', path: '/activity' },
    { label: 'Settings', path: '/settings' },
  ].filter(p => p.label.toLowerCase().includes(query.toLowerCase()))

  const handleSelect = (path: string) => {
    onOpenChange(false)
    setQuery('')
    navigate(path)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0 overflow-hidden bg-zinc-950 border-zinc-800">
        <div className="flex items-center px-4 border-b border-zinc-800">
          <Search className="h-4 w-4 text-zinc-500 mr-2 shrink-0" />
          <Input
            placeholder="Search products, customers, suppliers, invoices, or jump to page... (⌘K)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="border-0 bg-transparent text-sm focus-visible:ring-0 focus-visible:ring-offset-0 h-12"
            autoFocus
          />
        </div>
        {/* Render sections for Products, Customers, Suppliers, Sales, Quick Pages */}
      </DialogContent>
    </Dialog>
  )
}
```

---

### 3. AppShell Header Search Trigger (`apps/web/src/components/layout/AppShell.tsx`)

```tsx
// Inside AppShell top navbar header:
<button
  onClick={() => setSearchOpen(true)}
  className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-xs text-zinc-400 hover:border-zinc-700 hover:text-zinc-200 transition-colors w-64 justify-between"
>
  <span className="flex items-center gap-1.5">
    <Search className="h-3.5 w-3.5 text-zinc-500" />
    Search products, parties, bills...
  </span>
  <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">⌘K</kbd>
</button>
<GlobalSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
```

---

### 4. Customer Opening Balance (`apps/web/src/pages/customers/CustomersPage.tsx`)

```typescript
// Updated customer schema
const customerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().optional().or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
  gstin: z.string().optional().or(z.literal('')),
  state_code: z.string().optional(),
  address: z.string().optional(),
  opening_balance: z.coerce.number().min(0).optional().default(0),
  opening_balance_type: z.enum(['to_collect', 'to_pay']).default('to_collect'),
})

// Insert initial balance
const openBal = Number(values.opening_balance) || 0
const initialBalance = values.opening_balance_type === 'to_pay' ? -openBal : openBal
await supabase.from('customers').insert({
  organization_id: orgId!,
  name: values.name,
  balance: initialBalance,
  ...
})

// Table column badge
<span className={cn(
  'text-xs font-semibold px-2 py-0.5 rounded-full border',
  (customer.balance ?? 0) > 0 ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
  : (customer.balance ?? 0) < 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
  : 'text-zinc-500 border-transparent',
)}>
  {(customer.balance ?? 0) > 0 ? `Due: ${formatINR(customer.balance)} (Dr)`
   : (customer.balance ?? 0) < 0 ? `Adv: ${formatINR(Math.abs(customer.balance))} (Cr)`
   : 'Nil'}
</span>
```

---

### 5. Supplier Opening Balance (`apps/web/src/components/suppliers/SupplierFormDialog.tsx`)

```typescript
interface SupplierFormState {
  name: string
  phone: string
  email: string
  gstin: string
  address: string
  bankName: string
  bankAccount: string
  bankIfsc: string
  upiId: string
  openingBalance: string
  balanceType: 'to_pay' | 'advance_paid'
}

// Activity log metadata includes opening balance
await logActivity({
  organizationId: orgId,
  action: editTarget ? 'updated' : 'created',
  entity: 'supplier',
  entityId: result.data.id,
  metadata: {
    name: form.name.trim(),
    opening_balance: form.openingBalance ? parseFloat(form.openingBalance) : 0,
    balance_type: form.balanceType,
  },
})
```

---

### 6. Purchases Payment Tracking & `💳 Pay` Modal (`apps/web/src/pages/purchases/PurchasesPage.tsx`)

```typescript
export interface PaymentRecord {
  amount: number
  mode: string
  date: string
  ref?: string
}

export function parsePurchasePayment(p: Purchase) {
  try {
    if (p.notes && p.notes.includes('[PAYMENT:')) {
      const match = p.notes.match(/\[PAYMENT:\s*(\{.*?\})\s*\]/)
      if (match && match[1]) {
        const parsed = JSON.parse(match[1])
        const paid = Number(parsed.paid) || 0
        const payments = (parsed.history as PaymentRecord[]) || []
        const due = Math.max(0, (p.total_amount || 0) - paid)
        const status = due <= 0 ? 'paid' : paid > 0 ? 'partial' : 'pending'
        return { paidAmount: paid, balanceDue: due, status, payments }
      }
    }
  } catch {}
  return { paidAmount: p.total_amount || 0, balanceDue: 0, status: 'paid', payments: [] }
}

// Mutation to record outward payment
const recordPaymentMutation = useMutation({
  mutationFn: async ({ purchase, amount, mode, reference, notes }) => {
    const current = parsePurchasePayment(purchase)
    const newPaid = current.paidAmount + amount
    const newPayment = { amount, mode, date: new Date().toISOString(), ref: reference }
    const updatedPayments = [...current.payments, newPayment]
    const cleanNotes = (purchase.notes || '').replace(/\[PAYMENT:\s*\{.*?\}\s*\]/g, '').trim()
    const paymentTag = `[PAYMENT: ${JSON.stringify({ paid: newPaid, history: updatedPayments })}]`
    const updatedNotes = cleanNotes ? `${cleanNotes}\n${paymentTag}` : paymentTag

    await supabase.from('purchases').update({ notes: updatedNotes }).eq('id', purchase.id)
    await logActivity({
      organizationId: orgId!,
      action: 'payment_out',
      entity: 'purchase',
      entityId: purchase.id,
      metadata: { purchase_no: purchase.purchase_no, amount_paid: amount, mode, reference },
    })
  },
})
```

---

### 7. Financial Reports Engine (`apps/web/src/pages/reports/ReportsPage.tsx`)

Tabs added:
1. **Profit & Loss (P&L)**:
   - Operating Revenue = Gross Sales minus Sales Returns.
   - Cost of Goods Sold (COGS) = Gross Purchases minus Purchase Returns.
   - Gross Profit = Net Revenue minus COGS (with Gross Margin %).
   - Operating Expenses grouped by category.
   - Net Operating Profit / Loss (with Net Margin %).
2. **Balance Sheet**:
   - Current Assets (Cash in Hand, Bank/UPI, Accounts Receivable, Stock Value at Cost).
   - Current Liabilities & Equity (Accounts Payable, GST Payable, Retained Equity).
   - Live check banner: `Assets = Liabilities + Equity`.
3. **Trial Balance**:
   - Debit (Dr) vs Credit (Cr) equality breakdown across all account heads.
4. **Cash Flow**:
   - Cash Inflows vs Cash Outflows and Net Liquidity Change.
5. **CSV Exports**:
   - `exportPnL()`, `exportBalanceSheet()`, `exportTrialBalance()`, `exportCashFlow()`.

---

## 🎯 Status Checklist & Next Priorities

### ✅ Done in Our Work
- [x] Universal Activity Logging + Real User Actor Name resolution (`activityLog.ts`)
- [x] Global `⌘K` / `Ctrl+K` Fast Search Palette (`GlobalSearchDialog.tsx`)
- [x] Customer & Supplier Opening Balances with Dr / Cr balance types
- [x] Purchases Balance Due KPI Cards, Payment Status badges & `💳 Pay` Modal
- [x] Financial Reports Engine (P&L, Balance Sheet, Trial Balance, Cash Flow with CSV export)

### 🔴 Remaining Audit Tasks (To pick up next)
- [ ] **GSTR-1 / 3B Reports UI Tab** (B2B, B2C, HSN summary return builder in `/reports`)
- [ ] **Duplicate System Roles Cleanup** (Database migration to clean duplicate roles on `/roles`)
- [ ] **Form Required Asterisk (*) Validation Audit** (Audit Zod schemas across all forms)
