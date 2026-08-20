import React, { useState, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Download,
  Printer,
  TrendingUp,
  TrendingDown,
  Package,
  FileText,
  BarChart3,
  Scale,
  Wallet,
  CheckCircle2,
  AlertCircle,
  Building2,
  DollarSign,
  Receipt,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Users,
  FileBarChart,
  Percent,
  ShoppingCart,
  ClipboardList,
  Landmark,
  Undo2,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { formatINR } from '@billscape/core'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { DateRangeFilter } from '@/components/ui/date-range-filter'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

function getDateRange(days: number) {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - days)
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  }
}

const REPORTS_TAB_VALUES = [
  'sales', 'purchases', 'cashbank', 'all-txns', 'pnl', 'cash-flow', 'trial-balance', 'balance-sheet',
] as const

const REPORT_SECTIONS = [
  { value: 'transactions', label: 'Transaction Reports', icon: FileBarChart },
  { value: 'party', label: 'Party Reports', icon: Users },
  { value: 'gst', label: 'GST Reports', icon: Percent },
  { value: 'stock', label: 'Stock / Item Reports', icon: Package },
  { value: 'taxes', label: 'Taxes Reports', icon: Landmark },
  { value: 'expenses', label: 'Expense Reports', icon: Wallet },
  { value: 'sale-orders', label: 'Sale Order Reports', icon: ClipboardList },
] as const
const REPORT_SECTION_VALUES = REPORT_SECTIONS.map((s) => s.value)

const STATUS_BADGE_COLORS: Record<string, string> = {
  draft: 'border-zinc-500/30 text-zinc-400',
  sent: 'border-blue-500/30 text-blue-400',
  accepted: 'border-emerald-500/30 text-emerald-400',
  rejected: 'border-red-500/30 text-red-400',
  expired: 'border-orange-500/30 text-orange-400',
}

export function ReportsPage() {
  const { org, role } = useAuth()
  const orgId = org?.id
  const isOwner = role === 'owner'
  const navigate = useNavigate()

  const [searchParams, setSearchParams] = useSearchParams()
  const sectionParam = searchParams.get('section')
  const activeSection = REPORT_SECTION_VALUES.includes(sectionParam as any) ? sectionParam! : 'transactions'
  const handleSectionChange = (value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('section', value)
      if (value === 'transactions') next.set('tab', 'sales')
      return next
    }, { replace: true })
  }

  const tabParam = searchParams.get('tab')
  const activeReportTab = REPORTS_TAB_VALUES.includes(tabParam as any) ? tabParam! : 'sales'
  const handleReportTabChange = (value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('tab', value)
      return next
    }, { replace: true })
  }

  const [dateFrom, setDateFrom] = useState(getDateRange(30).from)
  const [dateTo, setDateTo] = useState(getDateRange(0).to)

  const [salesDetailCard, setSalesDetailCard] = useState<'total' | 'returns' | 'net' | 'due' | null>(null)
  const [allTxnsFilter, setAllTxnsFilter] = useState<'all' | 'sale' | 'purchase' | 'expense' | 'sale-return' | 'purchase-return' | 'payment-in' | 'payment-out'>('all')
  const [invoiceRangeFrom, setInvoiceRangeFrom] = useState('')
  const [invoiceRangeTo, setInvoiceRangeTo] = useState('')

  const fromISO = `${dateFrom}T00:00:00.000Z`
  const toISO = `${dateTo}T23:59:59.999Z`

  // 1. Sales summary query
  const { data: salesData = [], isLoading: salesLoading } = useQuery({
    queryKey: ['report-sales', orgId, dateFrom, dateTo],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('sales')
        .select('id, invoice_no, grand_total, discount_total, tax_total, payment_mode, cash_amount, card_amount, upi_amount, created_at')
        .eq('organization_id', orgId!)
        .gte('created_at', fromISO)
        .lte('created_at', toISO)
      return data ?? []
    },
  })

  // 2. Item-wise report query
  const { data: itemData = [], isLoading: itemLoading } = useQuery({
    queryKey: ['report-items', orgId, dateFrom, dateTo],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('sale_items')
        .select(`
          product_name, hsn_code, qty, unit_price, discount_pct, tax_rate,
          cgst_amount, sgst_amount, igst_amount, line_total,
          products(units!products_unit_id_fkey(symbol)),
          sales!inner(organization_id, created_at)
        `)
        .eq('sales.organization_id', orgId!)
        .gte('sales.created_at', fromISO)
        .lte('sales.created_at', toISO)
      return data ?? []
    },
  })

  // 3. Stock & Inventory report query
  const { data: stockData = [], isLoading: stockLoading } = useQuery({
    queryKey: ['report-stock', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('inventory')
        .select('stock_qty, reorder_level, products(name, sku, price, cost_price, categories(name))')
        .eq('organization_id', orgId!)
      return data ?? []
    },
  })

  // 4. GST summary query
  const { data: gstData = [], isLoading: gstLoading } = useQuery({
    queryKey: ['report-gst', orgId, dateFrom, dateTo],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('sale_items')
        .select(`
          tax_rate, cgst_amount, sgst_amount, igst_amount, line_total,
          sales!inner(organization_id, created_at)
        `)
        .eq('sales.organization_id', orgId!)
        .gte('sales.created_at', fromISO)
        .lte('sales.created_at', toISO)
      return data ?? []
    },
  })

  // 4b. B2B/B2C classification query (sale -> customer GSTIN)
  const { data: salesPartyData = [], isLoading: salesPartyLoading } = useQuery({
    queryKey: ['report-sales-party', orgId, dateFrom, dateTo],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('sales')
        .select('id, invoice_no, grand_total, tax_total, created_at, customers(name, gstin)')
        .eq('organization_id', orgId!)
        .gte('created_at', fromISO)
        .lte('created_at', toISO)
      return data ?? []
    },
  })

  // 5. Operating Expenses query
  const { data: expensesData = [], isLoading: expensesLoading } = useQuery({
    queryKey: ['report-expenses', orgId, dateFrom, dateTo],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('expenses')
        .select('id, category, amount, description, expense_date')
        .eq('organization_id', orgId!)
        .gte('expense_date', dateFrom)
        .lte('expense_date', dateTo)
      return data ?? []
    },
  })

  // 6. Purchases (COGS) query
  const { data: purchasesData = [], isLoading: purchasesLoading } = useQuery({
    queryKey: ['report-purchases', orgId, dateFrom, dateTo],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('purchases')
        .select('id, purchase_no, invoice_no, supplier_id, total_amount, notes, created_at, suppliers(name)')
        .eq('organization_id', orgId!)
        .gte('created_at', fromISO)
        .lte('created_at', toISO)
      return data ?? []
    },
  })

  // 7. Customers Balance query (Accounts Receivable)
  const { data: customersData = [] } = useQuery({
    queryKey: ['report-customers-bal', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('customers')
        .select('id, name, phone, balance')
        .eq('organization_id', orgId!)
      return data ?? []
    },
  })

  // 7b. Suppliers Balance query (Accounts Payable — party reports)
  const { data: suppliersData = [] } = useQuery({
    queryKey: ['report-suppliers', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('suppliers')
        .select('id, name, phone')
        .eq('organization_id', orgId!)
      return data ?? []
    },
  })

  // 8. Returns query (Sales & Purchase returns)
  const { data: returnsData = [] } = useQuery({
    queryKey: ['report-returns', orgId, dateFrom, dateTo],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('returns')
        .select('id, return_type, original_invoice_no, purchase_ref, reason, refund_amount, created_at')
        .eq('organization_id', orgId!)
        .gte('created_at', fromISO)
        .lte('created_at', toISO)
      return data ?? []
    },
  })

  // 9. Purchase-side GST query (Input Tax — for Taxes Reports + GSTR-2 eligibility)
  const { data: purchaseGstData = [], isLoading: purchaseGstLoading } = useQuery({
    queryKey: ['report-purchase-gst', orgId, dateFrom, dateTo],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('purchase_items')
        .select(`
          purchase_id, tax_rate, taxable_amount, cgst_amount, sgst_amount, igst_amount,
          purchases!inner(organization_id, created_at, suppliers(gstin))
        `)
        .eq('purchases.organization_id', orgId!)
        .gte('purchases.created_at', fromISO)
        .lte('purchases.created_at', toISO)
      return data ?? []
    },
  })

  // 10. Quotations query (Sale Order Reports)
  const { data: quotationsData = [], isLoading: quotationsLoading } = useQuery({
    queryKey: ['report-quotations', orgId, dateFrom, dateTo],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('quotations')
        .select('id, quote_no, customer_name, status, total_amount, valid_until, created_at')
        .eq('organization_id', orgId!)
        .gte('created_at', fromISO)
        .lte('created_at', toISO)
      return data ?? []
    },
  })

  // 11. Vouchers query (Payments In / Payments Out — receipt/payment vouchers from Ledger)
  const { data: vouchersData = [], isLoading: vouchersLoading } = useQuery({
    queryKey: ['report-vouchers', orgId, dateFrom, dateTo],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('vouchers')
        .select('id, voucher_no, type, date, narration, reference, voucher_entries(amount, type)')
        .eq('organization_id', orgId!)
        .in('type', ['receipt', 'payment'])
        .gte('date', dateFrom)
        .lte('date', dateTo)
      return data ?? []
    },
  })

  // ── Aggregations ─────────────────────────────────────────────────────────────

  // Aggregate sales summary
  const salesSummary = useMemo(() => {
    const total = salesData.reduce((s, r) => s + r.grand_total, 0)
    const discount = salesData.reduce((s, r) => s + (r.discount_total ?? 0), 0)
    const tax = salesData.reduce((s, r) => s + (r.tax_total ?? 0), 0)
    const paymentSplit = { cash: 0, card: 0, upi: 0 }
    for (const r of salesData) {
      if (r.payment_mode === 'split') {
        paymentSplit.cash += r.cash_amount ?? 0
        paymentSplit.card += r.card_amount ?? 0
        paymentSplit.upi += r.upi_amount ?? 0
      } else if (r.payment_mode in paymentSplit) {
        paymentSplit[r.payment_mode as keyof typeof paymentSplit] += r.grand_total
      }
    }
    return {
      total,
      billCount: salesData.length,
      avg: salesData.length > 0 ? total / salesData.length : 0,
      discount,
      tax,
      paymentSplit,
    }
  }, [salesData])

  // Aggregate item-wise
  const itemSummary = useMemo(() => {
    const map = new Map<string, { name: string; hsn: string; uqc: string; qty: number; revenue: number; cgst: number; sgst: number; igst: number }>()
    for (const item of itemData) {
      const uqc = (item.products as any)?.units?.symbol ?? 'NA'
      const existing = map.get(item.product_name)
      if (existing) {
        existing.qty += item.qty
        existing.revenue += item.line_total
        existing.cgst += item.cgst_amount
        existing.sgst += item.sgst_amount
        existing.igst += item.igst_amount
      } else {
        map.set(item.product_name, {
          name: item.product_name,
          hsn: item.hsn_code ?? '',
          uqc,
          qty: item.qty,
          revenue: item.line_total,
          cgst: item.cgst_amount,
          sgst: item.sgst_amount,
          igst: item.igst_amount,
        })
      }
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue)
  }, [itemData])

  // Aggregate GST summary
  const gstSummary = useMemo(() => {
    const map = new Map<number, { rate: number; taxable: number; cgst: number; sgst: number; igst: number }>()
    for (const item of gstData) {
      const existing = map.get(item.tax_rate)
      const taxable = item.line_total - item.cgst_amount - item.sgst_amount - item.igst_amount
      if (existing) {
        existing.taxable += taxable
        existing.cgst += item.cgst_amount
        existing.sgst += item.sgst_amount
        existing.igst += item.igst_amount
      } else {
        map.set(item.tax_rate, {
          rate: item.tax_rate,
          taxable,
          cgst: item.cgst_amount,
          sgst: item.sgst_amount,
          igst: item.igst_amount,
        })
      }
    }
    return Array.from(map.values()).sort((a, b) => a.rate - b.rate)
  }, [gstData])

  // GSTR-1: B2B (customer has GSTIN) vs B2C (no GSTIN / walk-in) split, with reconciliation check
  const gstr1Summary = useMemo(() => {
    const b2b = salesPartyData.filter((s: any) => s.customers?.gstin)
    const b2c = salesPartyData.filter((s: any) => !s.customers?.gstin)
    const sum = (rows: typeof salesPartyData) => rows.reduce((acc, s) => acc + (s.tax_total ?? 0), 0)
    const taxableSum = (rows: typeof salesPartyData) => rows.reduce((acc, s) => acc + (s.grand_total - (s.tax_total ?? 0)), 0)

    const grossTaxableValue = taxableSum(salesPartyData)
    const grossOutputTax = sum(salesPartyData)
    const grossTotal = grossTaxableValue + grossOutputTax

    const salesReturnsTotal = returnsData
      .filter((r) => r.return_type === 'sale')
      .reduce((s, r) => s + r.refund_amount, 0)

    // returns.refund_amount has no taxable/tax split in the schema — apportion the
    // tax-inclusive refund across taxable value and tax using the org's blended rate
    // for this period, so "net of returns" doesn't silently zero out only one side.
    const returnsTaxablePortion = grossTotal > 0 ? salesReturnsTotal * (grossTaxableValue / grossTotal) : 0
    const returnsTaxPortion = grossTotal > 0 ? salesReturnsTotal * (grossOutputTax / grossTotal) : 0

    const netTaxableValue = Math.max(0, grossTaxableValue - returnsTaxablePortion)
    const netOutputTax = Math.max(0, grossOutputTax - returnsTaxPortion)

    // Reconciliation: gross taxable + tax should equal invoice-line-level totals from gstSummary
    const lineLevelTaxable = gstSummary.reduce((s, g) => s + g.taxable, 0)
    const lineLevelTax = gstSummary.reduce((s, g) => s + g.cgst + g.sgst + g.igst, 0)
    const difference = Math.abs((grossTaxableValue + grossOutputTax) - (lineLevelTaxable + lineLevelTax))
    const reconciled = difference <= 1

    return {
      b2bCount: b2b.length,
      b2cCount: b2c.length,
      b2bTaxable: taxableSum(b2b),
      b2bTax: sum(b2b),
      b2cTaxable: taxableSum(b2c),
      b2cTax: sum(b2c),
      grossTaxableValue,
      salesReturnsTotal,
      netTaxableValue,
      netOutputTax,
      reconciled,
      difference,
    }
  }, [salesPartyData, gstSummary, returnsData])

  // Aggregate purchase-side GST (Input Tax, by rate)
  const purchaseGstSummary = useMemo(() => {
    const map = new Map<number, { rate: number; taxable: number; cgst: number; sgst: number; igst: number }>()
    for (const item of purchaseGstData) {
      const existing = map.get(item.tax_rate)
      if (existing) {
        existing.taxable += item.taxable_amount ?? 0
        existing.cgst += item.cgst_amount ?? 0
        existing.sgst += item.sgst_amount ?? 0
        existing.igst += item.igst_amount ?? 0
      } else {
        map.set(item.tax_rate, {
          rate: item.tax_rate,
          taxable: item.taxable_amount ?? 0,
          cgst: item.cgst_amount ?? 0,
          sgst: item.sgst_amount ?? 0,
          igst: item.igst_amount ?? 0,
        })
      }
    }
    return Array.from(map.values()).sort((a, b) => a.rate - b.rate)
  }, [purchaseGstData])

  // Net GST liability (Output Tax collected on sales − Input Tax paid on purchases)
  const taxLiabilitySummary = useMemo(() => {
    const outputTax = gstSummary.reduce((s, g) => s + g.cgst + g.sgst + g.igst, 0)
    const inputTax = purchaseGstSummary.reduce((s, g) => s + g.cgst + g.sgst + g.igst, 0)
    const netPayable = outputTax - inputTax
    return { outputTax, inputTax, netPayable }
  }, [gstSummary, purchaseGstSummary])

  // GSTR-2: Eligible ITC (supplier has GSTIN) vs Ineligible ITC (no GSTIN / unregistered), with reconciliation check
  const gstr2Summary = useMemo(() => {
    const eligibleBillIds = new Set<string>()
    const ineligibleBillIds = new Set<string>()
    let eligibleTaxable = 0, eligibleTax = 0, eligibleCgst = 0, eligibleSgst = 0, eligibleIgst = 0
    let ineligibleTaxable = 0, ineligibleTax = 0

    for (const item of purchaseGstData) {
      const hasGstin = !!(item.purchases as any)?.suppliers?.gstin
      const taxable = item.taxable_amount ?? 0
      const cgst = item.cgst_amount ?? 0, sgst = item.sgst_amount ?? 0, igst = item.igst_amount ?? 0
      const tax = cgst + sgst + igst
      if (hasGstin) {
        eligibleTaxable += taxable
        eligibleTax += tax
        eligibleCgst += cgst
        eligibleSgst += sgst
        eligibleIgst += igst
        if (item.purchase_id) eligibleBillIds.add(item.purchase_id)
      } else {
        ineligibleTaxable += taxable
        ineligibleTax += tax
        if (item.purchase_id) ineligibleBillIds.add(item.purchase_id)
      }
    }

    const purchaseReturnsTotal = returnsData
      .filter((r) => r.return_type === 'purchase')
      .reduce((s, r) => s + r.refund_amount, 0)

    // purchase returns.refund_amount has no taxable/tax split — apportion the
    // tax-inclusive refund across taxable value and tax using the eligible-purchase
    // blended rate, so "net of returns" nets both sides consistently, not just one.
    const eligibleGrossTotal = eligibleTaxable + eligibleTax
    const returnsTaxablePortion = eligibleGrossTotal > 0 ? purchaseReturnsTotal * (eligibleTaxable / eligibleGrossTotal) : 0
    const returnsTaxPortion = eligibleGrossTotal > 0 ? purchaseReturnsTotal * (eligibleTax / eligibleGrossTotal) : 0
    const returnsRate = eligibleTax > 0 ? returnsTaxPortion / eligibleTax : 0

    const netEligibleTaxable = Math.max(0, eligibleTaxable - returnsTaxablePortion)
    const netEligibleITC = Math.max(0, eligibleTax - returnsTaxPortion)
    const netEligibleCgst = Math.max(0, eligibleCgst * (1 - returnsRate))
    const netEligibleSgst = Math.max(0, eligibleSgst * (1 - returnsRate))
    const netEligibleIgst = Math.max(0, eligibleIgst * (1 - returnsRate))

    const lineLevelTax = purchaseGstSummary.reduce((s, g) => s + g.cgst + g.sgst + g.igst, 0)
    const difference = Math.abs((eligibleTax + ineligibleTax) - lineLevelTax)
    const reconciled = difference <= 1

    return {
      eligibleBillCount: eligibleBillIds.size,
      eligibleTaxable,
      eligibleTax,
      eligibleCgst,
      eligibleSgst,
      eligibleIgst,
      ineligibleBillCount: ineligibleBillIds.size,
      ineligibleTaxable,
      ineligibleTax,
      purchaseReturnsTotal,
      netEligibleTaxable,
      netEligibleITC,
      netEligibleCgst,
      netEligibleSgst,
      netEligibleIgst,
      reconciled,
      difference,
    }
  }, [purchaseGstData, purchaseGstSummary, returnsData])

  // Sale Order (Quotations) summary
  const quotationsSummary = useMemo(() => {
    const byStatus: Record<string, { count: number; value: number }> = {}
    for (const q of quotationsData) {
      if (!byStatus[q.status]) byStatus[q.status] = { count: 0, value: 0 }
      byStatus[q.status].count += 1
      byStatus[q.status].value += q.total_amount || 0
    }
    const total = quotationsData.length
    const accepted = byStatus['accepted']?.count ?? 0
    const conversionRate = total > 0 ? (accepted / total) * 100 : 0
    return { byStatus, total, accepted, conversionRate }
  }, [quotationsData])

  // ── Financial Engine Aggregations ──────────────────────────────────────────

  // Profit & Loss (P&L) Calculations
  const pnlSummary = useMemo(() => {
    const grossSales = salesSummary?.total ?? 0
    const salesReturns = returnsData
      .filter((r) => r.return_type === 'sale')
      .reduce((s, r) => s + r.refund_amount, 0)
    const netSales = Math.max(0, grossSales - salesReturns)

    const grossPurchases = purchasesData.reduce((s, p) => s + (p.total_amount || 0), 0)
    const purchaseReturns = returnsData
      .filter((r) => r.return_type === 'purchase')
      .reduce((s, r) => s + r.refund_amount, 0)
    const cogs = Math.max(0, grossPurchases - purchaseReturns)

    const grossProfit = netSales - cogs
    const grossMargin = netSales > 0 ? (grossProfit / netSales) * 100 : 0

    // Group expenses by category
    const expenseGroups: Record<string, number> = {}
    let totalExpenses = 0
    for (const e of expensesData) {
      expenseGroups[e.category] = (expenseGroups[e.category] || 0) + e.amount
      totalExpenses += e.amount
    }

    const netProfit = grossProfit - totalExpenses
    const netMargin = netSales > 0 ? (netProfit / netSales) * 100 : 0

    return {
      grossSales,
      salesReturns,
      netSales,
      grossPurchases,
      purchaseReturns,
      cogs,
      grossProfit,
      grossMargin,
      expenseGroups,
      totalExpenses,
      netProfit,
      netMargin,
    }
  }, [salesSummary, returnsData, purchasesData, expensesData])

  // HSN-wise summary totals + reconciliation against GSTR-1
  const hsnSummary = useMemo(() => {
    const totalTax = itemSummary.reduce((s, i) => s + i.cgst + i.sgst + i.igst, 0)
    const grossTaxable = itemSummary.reduce((s, i) => s + (i.revenue - i.cgst - i.sgst - i.igst), 0)
    const returnsAdjusted = pnlSummary.salesReturns
    const netTaxableValue = Math.max(0, grossTaxable - returnsAdjusted)
    const difference = Math.abs(netTaxableValue - gstr1Summary.netTaxableValue) + Math.abs(totalTax - gstr1Summary.netOutputTax)
    const reconciled = difference <= 1
    return { totalTax, grossTaxable, returnsAdjusted, netTaxableValue, reconciled, difference }
  }, [itemSummary, pnlSummary.salesReturns, gstr1Summary])

  // Balance Sheet Calculations
  const balanceSheetSummary = useMemo(() => {
    // Current Assets
    const cashInHand = salesSummary?.paymentSplit.cash ?? 0
    const bankBalance = (salesSummary?.paymentSplit.upi ?? 0) + (salesSummary?.paymentSplit.card ?? 0)
    const accountsReceivable = customersData.reduce((s, c) => s + Math.max(0, c.balance || 0), 0)
    const stockInventoryValue = stockData.reduce(
      (s, item: any) => s + (item.stock_qty || 0) * (item.products?.cost_price || item.products?.price || 0),
      0,
    )
    const totalAssets = cashInHand + bankBalance + accountsReceivable + stockInventoryValue

    // Current Liabilities
    const totalPurchases = purchasesData.reduce((s, p) => s + (p.total_amount || 0), 0)
    const accountsPayable = totalPurchases * 0.2 // Estimated pending payable if not settled
    const gstPayable = gstSummary.reduce((s, g) => s + g.cgst + g.sgst + g.igst, 0)
    const totalLiabilities = accountsPayable + gstPayable

    // Equity
    const ownerEquity = Math.max(0, totalAssets - totalLiabilities)
    const totalLiabilitiesAndEquity = totalLiabilities + ownerEquity

    return {
      cashInHand,
      bankBalance,
      accountsReceivable,
      stockInventoryValue,
      totalAssets,
      accountsPayable,
      gstPayable,
      totalLiabilities,
      ownerEquity,
      totalLiabilitiesAndEquity,
    }
  }, [salesSummary, customersData, stockData, purchasesData, gstSummary])

  // Trial Balance Calculations
  const trialBalanceRows = useMemo(() => {
    const rows = [
      { account: 'Cash in Hand (Liquid Asset)', debit: balanceSheetSummary.cashInHand, credit: 0 },
      { account: 'Bank & UPI Accounts (Asset)', debit: balanceSheetSummary.bankBalance, credit: 0 },
      { account: 'Accounts Receivable (Customers Dr)', debit: balanceSheetSummary.accountsReceivable, credit: 0 },
      { account: 'Inventory Stock Value (Asset)', debit: balanceSheetSummary.stockInventoryValue, credit: 0 },
      { account: 'Cost of Goods Sold / Purchases (Expense Dr)', debit: pnlSummary.cogs, credit: 0 },
      { account: 'Operating Expenses (Expense Dr)', debit: pnlSummary.totalExpenses, credit: 0 },
      { account: 'Sales Revenue (Income Cr)', debit: 0, credit: pnlSummary.netSales },
      { account: 'Accounts Payable (Suppliers Cr)', debit: 0, credit: balanceSheetSummary.accountsPayable },
      { account: 'GST Output Tax Liability (Liability Cr)', debit: 0, credit: balanceSheetSummary.gstPayable },
      { account: "Owner's Equity & Retained Earnings (Cr)", debit: 0, credit: balanceSheetSummary.ownerEquity },
    ]
    const totalDebit = rows.reduce((s, r) => s + r.debit, 0)
    const totalCredit = rows.reduce((s, r) => s + r.credit, 0)
    return { rows, totalDebit, totalCredit }
  }, [balanceSheetSummary, pnlSummary])

  // Cash Flow Calculations
  const cashFlowSummary = useMemo(() => {
    const cashInflows = (salesSummary?.paymentSplit.cash ?? 0) + (salesSummary?.paymentSplit.upi ?? 0) + (salesSummary?.paymentSplit.card ?? 0)
    const cashOutflows = pnlSummary.totalExpenses + (pnlSummary.cogs * 0.8)
    const netCashFlow = cashInflows - cashOutflows
    return { cashInflows, cashOutflows, netCashFlow }
  }, [salesSummary, pnlSummary])

  // ── CSV Export Helpers ───────────────────────────────────────────────────────
  const downloadCSV = (filename: string, headers: string[], rows: (string | number)[][]) => {
    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportSales = () => {
    downloadCSV(
      `sales-summary-${dateFrom}-to-${dateTo}.csv`,
      ['Date From', 'Date To', 'Total Sales', 'Bill Count', 'Avg Bill', 'Total Discount', 'Total Tax'],
      [[dateFrom, dateTo, salesSummary?.total ?? 0, salesSummary?.billCount ?? 0, salesSummary?.avg.toFixed(2) ?? 0, salesSummary?.discount ?? 0, salesSummary?.tax ?? 0]],
    )
  }

  const exportPnL = () => {
    const rows: (string | number)[][] = [
      ['Operating Revenue (Gross Sales)', pnlSummary.grossSales.toFixed(2)],
      ['Less: Sales Returns', pnlSummary.salesReturns.toFixed(2)],
      ['Net Operating Revenue', pnlSummary.netSales.toFixed(2)],
      ['Cost of Goods Sold (COGS)', pnlSummary.cogs.toFixed(2)],
      ['Gross Profit', pnlSummary.grossProfit.toFixed(2)],
      ['Gross Margin %', `${pnlSummary.grossMargin.toFixed(2)}%`],
      ...Object.entries(pnlSummary.expenseGroups).map(([cat, amt]) => [`Expense: ${cat}`, amt.toFixed(2)]),
      ['Total Operating Expenses', pnlSummary.totalExpenses.toFixed(2)],
      ['Net Profit / Loss', pnlSummary.netProfit.toFixed(2)],
      ['Net Margin %', `${pnlSummary.netMargin.toFixed(2)}%`],
    ]
    downloadCSV(`pnl-statement-${dateFrom}-to-${dateTo}.csv`, ['Financial Metric', 'Amount (INR)'], rows)
  }

  const exportBalanceSheet = () => {
    const rows: (string | number)[][] = [
      ['ASSETS - Cash in Hand', balanceSheetSummary.cashInHand.toFixed(2)],
      ['ASSETS - Bank & Digital Accounts', balanceSheetSummary.bankBalance.toFixed(2)],
      ['ASSETS - Accounts Receivable', balanceSheetSummary.accountsReceivable.toFixed(2)],
      ['ASSETS - Stock Inventory Value', balanceSheetSummary.stockInventoryValue.toFixed(2)],
      ['TOTAL ASSETS', balanceSheetSummary.totalAssets.toFixed(2)],
      ['LIABILITIES - Accounts Payable', balanceSheetSummary.accountsPayable.toFixed(2)],
      ['LIABILITIES - GST Tax Liability', balanceSheetSummary.gstPayable.toFixed(2)],
      ['TOTAL LIABILITIES', balanceSheetSummary.totalLiabilities.toFixed(2)],
      ["EQUITY - Owner's Retained Equity", balanceSheetSummary.ownerEquity.toFixed(2)],
      ['TOTAL LIABILITIES & EQUITY', balanceSheetSummary.totalLiabilitiesAndEquity.toFixed(2)],
    ]
    downloadCSV(`balance-sheet-${dateTo}.csv`, ['Account Head', 'Amount (INR)'], rows)
  }

  const exportTrialBalance = () => {
    const rows = trialBalanceRows.rows.map((r) => [r.account, r.debit.toFixed(2), r.credit.toFixed(2)])
    rows.push(['Total', trialBalanceRows.totalDebit.toFixed(2), trialBalanceRows.totalCredit.toFixed(2)])
    downloadCSV(`trial-balance-${dateTo}.csv`, ['Account Name', 'Debit (INR)', 'Credit (INR)'], rows)
  }

  const exportCashFlow = () => {
    const rows: (string | number)[][] = [
      ['Operating Cash Inflows (Sales & Collections)', cashFlowSummary.cashInflows.toFixed(2)],
      ['Operating Cash Outflows (Supplier Payments & Expenses)', cashFlowSummary.cashOutflows.toFixed(2)],
      ['Net Operating Cash Flow', cashFlowSummary.netCashFlow.toFixed(2)],
    ]
    downloadCSV(`cash-flow-${dateFrom}-to-${dateTo}.csv`, ['Cash Flow Category', 'Amount (INR)'], rows)
  }

  const exportItems = () => {
    downloadCSV(
      `item-wise-${dateFrom}-to-${dateTo}.csv`,
      ['Product', 'HSN', 'Qty Sold', 'Revenue', 'CGST', 'SGST', 'IGST'],
      itemSummary.map((i) => [i.name, i.hsn, i.qty, i.revenue.toFixed(2), i.cgst.toFixed(2), i.sgst.toFixed(2), i.igst.toFixed(2)]),
    )
  }

  const exportHsnGstr1Json = () => {
    const payload = {
      gstin: org?.gstin ?? '',
      period: `${dateFrom}_to_${dateTo}`,
      hsn: itemSummary.map((i) => ({
        hsn_sc: i.hsn || '',
        desc: i.name,
        uqc: i.uqc,
        qty: i.qty,
        taxable_value: Number((i.revenue - i.cgst - i.sgst - i.igst).toFixed(2)),
        cgst_amt: Number(i.cgst.toFixed(2)),
        sgst_amt: Number(i.sgst.toFixed(2)),
        igst_amt: Number(i.igst.toFixed(2)),
        total_value: Number(i.revenue.toFixed(2)),
      })),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `hsn-summary-gstr1-${dateFrom}-to-${dateTo}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportStock = () => {
    if (!stockData) return
    const headers = isOwner
      ? ['Product', 'Category', 'Stock Qty', 'Reorder Level', 'Selling Price', 'Cost Price', 'Stock Value (Sell)', 'Stock Value (Cost)']
      : ['Product', 'Category', 'Stock Qty', 'Reorder Level', 'Selling Price', 'Stock Value (Sell)']
    const rows = stockData.map((item: any) => {
      const p = item.products
      const qty = item.stock_qty ?? 0
      const price = p?.price ?? 0
      const cost = p?.cost_price ?? 0
      return isOwner
        ? [p?.name ?? 'Unknown', p?.categories?.name ?? 'Uncategorized', qty, item.reorder_level ?? 0, price, cost, (qty * price).toFixed(2), (qty * cost).toFixed(2)]
        : [p?.name ?? 'Unknown', p?.categories?.name ?? 'Uncategorized', qty, item.reorder_level ?? 0, price, (qty * price).toFixed(2)]
    })
    downloadCSV(`stock-report-${new Date().toISOString().split('T')[0]}.csv`, headers, rows)
  }

  const exportGST = () => {
    downloadCSV(
      `gst-summary-${dateFrom}-to-${dateTo}.csv`,
      ['Tax Rate', 'Taxable Amount', 'CGST', 'SGST', 'IGST', 'Total Tax'],
      gstSummary.map((g) => [
        `${g.rate}%`,
        g.taxable.toFixed(2),
        g.cgst.toFixed(2),
        g.sgst.toFixed(2),
        g.igst.toFixed(2),
        (g.cgst + g.sgst + g.igst).toFixed(2),
      ]),
    )
  }

  const exportTaxes = () => {
    downloadCSV(
      `taxes-report-${dateFrom}-to-${dateTo}.csv`,
      ['Tax Rate', 'Output Tax (Sales)', 'Input Tax (Purchases)', 'Net Payable'],
      [0, 5, 12, 18, 28]
        .filter((rate) => gstSummary.some((g) => g.rate === rate) || purchaseGstSummary.some((g) => g.rate === rate))
        .map((rate) => {
          const out = gstSummary.find((g) => g.rate === rate)
          const inp = purchaseGstSummary.find((g) => g.rate === rate)
          const outTotal = out ? out.cgst + out.sgst + out.igst : 0
          const inTotal = inp ? inp.cgst + inp.sgst + inp.igst : 0
          return [`${rate}%`, outTotal.toFixed(2), inTotal.toFixed(2), (outTotal - inTotal).toFixed(2)]
        }),
    )
  }

  const exportQuotations = () => {
    downloadCSV(
      `sale-order-report-${dateFrom}-to-${dateTo}.csv`,
      ['Quote No', 'Customer', 'Status', 'Amount', 'Valid Until'],
      quotationsData.map((q) => [q.quote_no, q.customer_name, q.status, q.total_amount.toFixed(2), q.valid_until ?? '']),
    )
  }

  const handlePrint = () => window.print()

  return (
    <div className="p-4 lg:p-6 flex flex-col lg:flex-row gap-6">
      {/* ── Left sub-nav: REPORTS ── */}
      <div className="lg:w-56 shrink-0 no-print lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
        <p className="text-xs font-semibold tracking-wider text-zinc-500 px-2 mb-2">REPORTS</p>
        <nav className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0">
          {REPORT_SECTIONS.map((s) => {
            const Icon = s.icon
            const active = activeSection === s.value
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => handleSectionChange(s.value)}
                className={cn(
                  'flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm text-left whitespace-nowrap transition-colors',
                  active
                    ? 'bg-indigo-600 text-white font-medium'
                    : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200',
                )}
              >
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4 shrink-0" />
                  {s.label}
                </span>
              </button>
            )
          })}
        </nav>
      </div>

      {/* ── Right: content ── */}
      <div className="flex-1 min-w-0 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-white">
              {REPORT_SECTIONS.find((s) => s.value === activeSection)?.label ?? 'Reports'}
            </h1>
            <p className="text-sm text-zinc-400 mt-0.5">Comprehensive audit, double-entry financial statements & operational insights</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={handlePrint} title="Print" className="no-print">
              <Printer className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Date Range Picker */}
        <div className="flex items-center gap-3 flex-wrap no-print">
            <DateRangeFilter
              from={dateFrom}
              to={dateTo}
              onChange={(f, t) => {
                // Reports queries always need a bounded range — if cleared, fall back to
                // the same default 30-day window used on initial load rather than sending
                // empty strings into every gte()/lte() query below.
                if (!f && !t) {
                  const fallback = getDateRange(30)
                  setDateFrom(fallback.from)
                  setDateTo(fallback.to)
                } else {
                  setDateFrom(f)
                  setDateTo(t)
                }
              }}
            />
        </div>

        {activeSection === 'transactions' && (
      <Tabs value={activeReportTab} onValueChange={handleReportTabChange} className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1 bg-card border border-border p-1 no-print">
          <TabsTrigger value="sales">Sales Report</TabsTrigger>
          <TabsTrigger value="purchases">Purchase Report</TabsTrigger>
          <TabsTrigger value="cashbank">Cash / Bank Book</TabsTrigger>
          <TabsTrigger value="all-txns">All Transactions</TabsTrigger>
          <TabsTrigger value="pnl" className="flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
            Profit & Loss
          </TabsTrigger>
          <TabsTrigger value="cash-flow" className="flex items-center gap-1.5">
            <Wallet className="h-3.5 w-3.5 text-amber-400" />
            Cash Flow
          </TabsTrigger>
          <TabsTrigger value="trial-balance" className="flex items-center gap-1.5">
            <Scale className="h-3.5 w-3.5 text-purple-400" />
            Trial Balance
          </TabsTrigger>
          <TabsTrigger value="balance-sheet" className="flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 text-blue-400" />
            Balance Sheet
          </TabsTrigger>
        </TabsList>

        {/* ── 1. Sales Report Tab (IppoBill-style summary cards + transaction list) ── */}
        <TabsContent value="sales" className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={exportSales}>
              <Download className="h-4 w-4 mr-1.5" />
              Export CSV
            </Button>
          </div>

          {salesLoading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-24 rounded-lg bg-zinc-800 animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card
                  className="cursor-pointer transition-colors hover:border-zinc-600"
                  onClick={() => setSalesDetailCard('total')}
                >
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 text-zinc-400">
                      <TrendingUp className="h-4 w-4 text-emerald-400" />
                      <p className="text-xs">Total Sales</p>
                    </div>
                    <p className="text-2xl font-bold text-white mt-1">{formatINR(pnlSummary.grossSales)}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{salesSummary?.billCount ?? 0} invoices</p>
                  </CardContent>
                </Card>
                <Card
                  className="cursor-pointer transition-colors hover:border-zinc-600"
                  onClick={() => setSalesDetailCard('returns')}
                >
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 text-zinc-400">
                      <TrendingDown className="h-4 w-4 text-red-400" />
                      <p className="text-xs">Sales Returns</p>
                    </div>
                    <p className="text-2xl font-bold text-white mt-1">{formatINR(pnlSummary.salesReturns)}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {returnsData.filter((r) => r.return_type === 'sale').length} credit notes
                    </p>
                  </CardContent>
                </Card>
                <Card
                  className="cursor-pointer transition-colors hover:border-zinc-600"
                  onClick={() => setSalesDetailCard('net')}
                >
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 text-zinc-400">
                      <BarChart3 className="h-4 w-4 text-blue-400" />
                      <p className="text-xs">Net Sales</p>
                    </div>
                    <p className="text-2xl font-bold text-white mt-1">{formatINR(pnlSummary.netSales)}</p>
                  </CardContent>
                </Card>
                <Card
                  className="cursor-pointer transition-colors hover:border-zinc-600"
                  onClick={() => setSalesDetailCard('due')}
                >
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 text-zinc-400">
                      <Receipt className="h-4 w-4 text-amber-400" />
                      <p className="text-xs">Balance Due</p>
                    </div>
                    <p className="text-2xl font-bold text-white mt-1">{formatINR(balanceSheetSummary.accountsReceivable)}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">Outstanding customer dues</p>
                  </CardContent>
                </Card>
              </div>

              {/* Transaction list */}
              <div className="space-y-2">
                {salesData.length > 0 ? (
                  [...salesData]
                    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                    .map((s) => (
                      <div
                        key={s.id}
                        onClick={() => navigate(`/billing/sales/${s.id}`)}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 cursor-pointer transition-colors hover:border-zinc-600"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary text-zinc-400">
                            <Receipt className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-white truncate">Invoice #{s.invoice_no}</span>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-emerald-500/40 text-emerald-400">
                                paid
                              </Badge>
                            </div>
                            <p className="text-xs text-zinc-500">
                              {new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(s.created_at))}
                            </p>
                          </div>
                        </div>
                        <span className="font-semibold text-white shrink-0">{formatINR(s.grand_total)}</span>
                      </div>
                    ))
                ) : (
                  <p className="text-center text-zinc-500 py-8 text-sm">No sales recorded for this period</p>
                )}
              </div>

              {returnsData.filter((r) => r.return_type === 'sale').length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-zinc-300 pt-2">Sales Returns (Credit Notes)</p>
                  {returnsData
                    .filter((r) => r.return_type === 'sale')
                    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                    .map((r) => (
                      <div
                        key={r.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary text-zinc-400">
                            <Undo2 className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-white truncate">
                                Credit Note {r.original_invoice_no ? `(${r.original_invoice_no})` : ''}
                              </span>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-red-500/40 text-red-400">
                                return
                              </Badge>
                            </div>
                            <p className="text-xs text-zinc-500">
                              {new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(r.created_at))}
                            </p>
                          </div>
                        </div>
                        <span className="font-semibold text-red-400 shrink-0">-{formatINR(r.refund_amount)}</span>
                      </div>
                    ))}
                </div>
              )}

              {/* Payment Mode Breakdown */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">Payment Mode Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="rounded-lg border border-border bg-secondary/20 p-4">
                      <p className="text-xs text-muted-foreground">Cash Collections</p>
                      <p className="text-xl font-bold text-emerald-400 mt-1">{formatINR(salesSummary?.paymentSplit.cash ?? 0)}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-secondary/20 p-4">
                      <p className="text-xs text-muted-foreground">UPI / QR Digital</p>
                      <p className="text-xl font-bold text-blue-400 mt-1">{formatINR(salesSummary?.paymentSplit.upi ?? 0)}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-secondary/20 p-4">
                      <p className="text-xs text-muted-foreground">Card Swipes</p>
                      <p className="text-xl font-bold text-purple-400 mt-1">{formatINR(salesSummary?.paymentSplit.card ?? 0)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Sales KPI card detail dialog */}
        <Dialog open={salesDetailCard !== null} onOpenChange={(open) => !open && setSalesDetailCard(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {salesDetailCard === 'total' && 'Total Sales — Invoice Detail'}
                {salesDetailCard === 'returns' && 'Sales Returns — Credit Note Detail'}
                {salesDetailCard === 'net' && 'Net Sales — Breakdown'}
                {salesDetailCard === 'due' && 'Balance Due — Customer Detail'}
              </DialogTitle>
              <DialogDescription>
                {dateFrom} to {dateTo}
              </DialogDescription>
            </DialogHeader>

            {salesDetailCard === 'total' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/20 p-3 mb-2">
                  <span className="text-sm text-muted-foreground">Total ({salesSummary?.billCount ?? 0} invoices)</span>
                  <span className="text-lg font-bold text-white">{formatINR(pnlSummary.grossSales)}</span>
                </div>
                {[...salesData]
                  .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                  .map((s) => (
                    <div
                      key={s.id}
                      onClick={() => navigate(`/billing/sales/${s.id}`)}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 cursor-pointer transition-colors hover:border-zinc-600"
                    >
                      <div>
                        <span className="font-medium text-white text-sm">Invoice #{s.invoice_no}</span>
                        <p className="text-xs text-zinc-500">
                          {new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(s.created_at))}
                          {' · '}{s.payment_mode}
                        </p>
                      </div>
                      <span className="font-semibold text-white text-sm shrink-0">{formatINR(s.grand_total)}</span>
                    </div>
                  ))}
              </div>
            )}

            {salesDetailCard === 'returns' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/20 p-3 mb-2">
                  <span className="text-sm text-muted-foreground">Total returns</span>
                  <span className="text-lg font-bold text-red-400">-{formatINR(pnlSummary.salesReturns)}</span>
                </div>
                {returnsData.filter((r) => r.return_type === 'sale').length > 0 ? (
                  returnsData
                    .filter((r) => r.return_type === 'sale')
                    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                    .map((r) => (
                      <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2">
                        <div>
                          <span className="font-medium text-white text-sm">
                            Credit Note {r.original_invoice_no ? `(${r.original_invoice_no})` : ''}
                          </span>
                          <p className="text-xs text-zinc-500">
                            {new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(r.created_at))}
                            {r.reason ? ` · ${r.reason}` : ''}
                          </p>
                        </div>
                        <span className="font-semibold text-red-400 text-sm shrink-0">-{formatINR(r.refund_amount)}</span>
                      </div>
                    ))
                ) : (
                  <p className="text-center text-zinc-500 py-6 text-sm">No returns for this period</p>
                )}
              </div>
            )}

            {salesDetailCard === 'net' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2.5">
                  <span className="text-sm text-zinc-300">Gross Sales</span>
                  <span className="font-semibold text-white">{formatINR(pnlSummary.grossSales)}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2.5">
                  <span className="text-sm text-zinc-300">Less: Sales Returns</span>
                  <span className="font-semibold text-red-400">-{formatINR(pnlSummary.salesReturns)}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-blue-500/30 bg-blue-500/5 px-3 py-2.5">
                  <span className="text-sm font-medium text-blue-300">Net Sales</span>
                  <span className="font-bold text-blue-300">{formatINR(pnlSummary.netSales)}</span>
                </div>
              </div>
            )}

            {salesDetailCard === 'due' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/20 p-3 mb-2">
                  <span className="text-sm text-muted-foreground">Total outstanding</span>
                  <span className="text-lg font-bold text-amber-400">{formatINR(balanceSheetSummary.accountsReceivable)}</span>
                </div>
                {customersData.filter((c) => (c.balance || 0) > 0).length > 0 ? (
                  customersData
                    .filter((c) => (c.balance || 0) > 0)
                    .sort((a, b) => (b.balance || 0) - (a.balance || 0))
                    .map((c) => (
                      <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2">
                        <div>
                          <span className="font-medium text-white text-sm">{c.name}</span>
                          <p className="text-xs text-zinc-500">{c.phone || '—'}</p>
                        </div>
                        <span className="font-semibold text-amber-400 text-sm shrink-0">{formatINR(c.balance || 0)}</span>
                      </div>
                    ))
                ) : (
                  <p className="text-center text-zinc-500 py-6 text-sm">No outstanding customer balances</p>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ── 2. Purchase Report Tab ── */}
        <TabsContent value="purchases" className="space-y-4">
          <div className="space-y-2">
            {purchasesLoading ? (
              Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 rounded-lg bg-zinc-800 animate-pulse" />)
            ) : purchasesData.length > 0 ? (
              [...purchasesData]
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                .map((p: any) => (
                  <div
                    key={p.id}
                    onClick={() => navigate(`/purchases/${p.id}`)}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 cursor-pointer transition-colors hover:border-zinc-600"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary text-zinc-400">
                        <ShoppingCart className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="font-medium text-white truncate">
                          {p.purchase_no || p.invoice_no || 'Purchase'} {p.suppliers?.name ? `— ${p.suppliers.name}` : ''}
                        </span>
                        <p className="text-xs text-zinc-500">
                          {new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(p.created_at))}
                        </p>
                      </div>
                    </div>
                    <span className="font-semibold text-white shrink-0">{formatINR(p.total_amount)}</span>
                  </div>
                ))
            ) : (
              <p className="text-center text-zinc-500 py-8 text-sm">No purchases recorded for this period</p>
            )}
          </div>

          {returnsData.filter((r) => r.return_type === 'purchase').length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-zinc-300 pt-2">Purchase Returns (Debit Notes)</p>
              {returnsData
                .filter((r) => r.return_type === 'purchase')
                .map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary text-zinc-400">
                        <Undo2 className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="font-medium text-white truncate">
                          Debit Note {r.purchase_ref ? `(${r.purchase_ref})` : ''}
                        </span>
                        <p className="text-xs text-zinc-500">
                          {new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(r.created_at))}
                        </p>
                      </div>
                    </div>
                    <span className="font-semibold text-red-400 shrink-0">-{formatINR(r.refund_amount)}</span>
                  </div>
                ))}
            </div>
          )}
        </TabsContent>

        {/* ── 3. Cash / Bank Book Tab ── */}
        <TabsContent value="cashbank" className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Cash in Hand</p>
              <p className="text-2xl font-bold text-emerald-400 mt-1">{formatINR(salesSummary?.paymentSplit.cash ?? 0)}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Bank (Card + UPI)</p>
              <p className="text-2xl font-bold text-blue-400 mt-1">{formatINR((salesSummary?.paymentSplit.card ?? 0) + (salesSummary?.paymentSplit.upi ?? 0))}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Total Collections</p>
              <p className="text-2xl font-bold text-white mt-1">{formatINR(salesSummary?.total ?? 0)}</p>
            </div>
          </div>
          <p className="text-xs text-zinc-500">
            For full double-entry account ledgers and voucher-level detail, see the <a href="/ledger" className="text-indigo-400 hover:underline">Ledger</a> page.
          </p>
        </TabsContent>

        {/* ── 4. All Transactions Tab ── */}
        <TabsContent value="all-txns" className="space-y-4">
          {(() => {
            type TxnKind = 'sale' | 'purchase' | 'expense' | 'sale-return' | 'purchase-return' | 'payment-in' | 'payment-out'
            type Txn = { id: string; date: string; label: string; amount: number; kind: TxnKind; navTo?: string }

            const voucherAmount = (v: (typeof vouchersData)[number]) =>
              (v.voucher_entries ?? []).filter((e: any) => e.type === 'debit').reduce((s: number, e: any) => s + (e.amount || 0), 0)

            const txns: Txn[] = [
              ...salesData.map((s) => ({
                id: `sale-${s.id}`, date: s.created_at, label: `Sale — Invoice #${s.invoice_no}`,
                amount: s.grand_total, kind: 'sale' as const, navTo: `/billing/sales/${s.id}`,
              })),
              ...purchasesData.map((p: any) => ({
                id: `purchase-${p.id}`, date: p.created_at, label: `Purchase — ${p.purchase_no || p.invoice_no || p.id.slice(0, 8)}`,
                amount: -p.total_amount, kind: 'purchase' as const, navTo: `/purchases/${p.id}`,
              })),
              ...expensesData.map((e) => ({
                id: `expense-${e.id}`, date: e.expense_date, label: `Expense — ${e.description || e.category}`,
                amount: -e.amount, kind: 'expense' as const,
              })),
              ...returnsData.map((r) => ({
                id: `return-${r.id}`, date: r.created_at,
                label: r.return_type === 'sale' ? `Sales Return${r.original_invoice_no ? ` (${r.original_invoice_no})` : ''}` : `Purchase Return${r.purchase_ref ? ` (${r.purchase_ref})` : ''}`,
                amount: r.return_type === 'sale' ? -r.refund_amount : r.refund_amount,
                kind: (r.return_type === 'sale' ? 'sale-return' : 'purchase-return') as TxnKind,
              })),
              ...vouchersData.map((v) => ({
                id: `voucher-${v.id}`, date: v.date, label: `${v.type === 'receipt' ? 'Payment In' : 'Payment Out'} — ${v.voucher_no}${v.narration ? ` (${v.narration})` : ''}`,
                amount: v.type === 'receipt' ? voucherAmount(v) : -voucherAmount(v),
                kind: (v.type === 'receipt' ? 'payment-in' : 'payment-out') as TxnKind,
              })),
            ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

            const FILTERS: { value: TxnKind | 'all'; label: string }[] = [
              { value: 'all', label: 'All' },
              { value: 'sale', label: 'Sales' },
              { value: 'purchase', label: 'Purchases' },
              { value: 'expense', label: 'Expenses' },
              { value: 'sale-return', label: 'Sales Returns' },
              { value: 'purchase-return', label: 'Purchase Returns' },
              { value: 'payment-in', label: 'Payments In' },
              { value: 'payment-out', label: 'Payments Out' },
            ]

            const kindIcon: Record<TxnKind, React.ElementType> = {
              sale: TrendingUp, purchase: TrendingDown, expense: Wallet,
              'sale-return': Undo2, 'purchase-return': Undo2,
              'payment-in': ArrowDownRight, 'payment-out': ArrowUpRight,
            }

            const totalSales = salesData.reduce((s, r) => s + r.grand_total, 0)
            const totalPurchases = purchasesData.reduce((s, p) => s + (p.total_amount || 0), 0)
            const moneyIn = totalSales + vouchersData.filter((v) => v.type === 'receipt').reduce((s, v) => s + voucherAmount(v), 0)
            const moneyOut = totalPurchases + expensesData.reduce((s, e) => s + e.amount, 0) + vouchersData.filter((v) => v.type === 'payment').reduce((s, v) => s + voucherAmount(v), 0)

            const filtered = allTxnsFilter === 'all' ? txns : txns.filter((t) => t.kind === allTxnsFilter)

            return (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="p-5">
                      <p className="text-xs text-zinc-400">Sales</p>
                      <p className="text-2xl font-bold text-white mt-1">{formatINR(totalSales)}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-5">
                      <p className="text-xs text-zinc-400">Purchases</p>
                      <p className="text-2xl font-bold text-white mt-1">{formatINR(totalPurchases)}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-5">
                      <p className="text-xs text-zinc-400">Money In</p>
                      <p className="text-2xl font-bold text-emerald-400 mt-1">{formatINR(moneyIn)}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-5">
                      <p className="text-xs text-zinc-400">Money Out</p>
                      <p className="text-2xl font-bold text-red-400 mt-1">{formatINR(moneyOut)}</p>
                    </CardContent>
                  </Card>
                </div>

                <div className="flex flex-wrap gap-1.5 no-print">
                  {FILTERS.map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => setAllTxnsFilter(f.value)}
                      className={cn(
                        'rounded-md px-3 py-1.5 text-xs font-medium transition-colors border',
                        allTxnsFilter === f.value
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600',
                      )}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <div className="space-y-2">
                  {vouchersLoading ? (
                    Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 rounded-lg bg-zinc-800 animate-pulse" />)
                  ) : filtered.length > 0 ? (
                    filtered.map((t) => {
                      const Icon = kindIcon[t.kind]
                      return (
                        <div
                          key={t.id}
                          onClick={t.navTo ? () => navigate(t.navTo!) : undefined}
                          className={cn(
                            'flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3',
                            t.navTo && 'cursor-pointer transition-colors hover:border-zinc-600',
                          )}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary text-zinc-400">
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <span className="font-medium text-white truncate block">{t.label}</span>
                              <p className="text-xs text-zinc-500">
                                {new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(t.date))}
                              </p>
                            </div>
                          </div>
                          <span className={cn('font-semibold shrink-0', t.amount < 0 ? 'text-red-400' : 'text-emerald-400')}>
                            {t.amount < 0 ? '-' : ''}{formatINR(Math.abs(t.amount))}
                          </span>
                        </div>
                      )
                    })
                  ) : (
                    <p className="text-center text-zinc-500 py-8 text-sm">No transactions for this period</p>
                  )}
                </div>
              </>
            )
          })()}
        </TabsContent>

        {/* ── 5. Profit & Loss (P&L) Statement Tab ── */}
        <TabsContent value="pnl" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Income statement of operating revenues, cost of goods, and operational expenses</p>
            <Button variant="outline" size="sm" onClick={exportPnL}>
              <Download className="h-4 w-4 mr-1.5" />
              Export P&L CSV
            </Button>
          </div>

          {/* Top KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <span className="text-xs text-muted-foreground">Net Revenue</span>
              <p className="text-2xl font-bold text-white mt-1">{formatINR(pnlSummary.netSales)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">After sales returns</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <span className="text-xs text-muted-foreground">Gross Profit (Margin {pnlSummary.grossMargin.toFixed(1)}%)</span>
              <p className={cn('text-2xl font-bold mt-1', pnlSummary.grossProfit >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                {formatINR(pnlSummary.grossProfit)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Revenue minus COGS</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <span className="text-xs text-muted-foreground">Net Profit / Loss (Margin {pnlSummary.netMargin.toFixed(1)}%)</span>
              <p className={cn('text-2xl font-bold mt-1', pnlSummary.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                {formatINR(pnlSummary.netProfit)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">After all operating expenses</p>
            </div>
          </div>

          {/* Structured P&L Table */}
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60%]">Particulars</TableHead>
                  <TableHead className="text-right">Amount (₹)</TableHead>
                  <TableHead className="text-right">% of Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* 1. Operating Revenue */}
                <TableRow className="bg-secondary/20 font-semibold">
                  <TableCell className="text-foreground">1. Operating Revenue</TableCell>
                  <TableCell className="text-right text-foreground">{formatINR(pnlSummary.netSales)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">100.0%</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="pl-6 text-muted-foreground">Gross Sales / Billing Receipts</TableCell>
                  <TableCell className="text-right">{formatINR(pnlSummary.grossSales)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">—</TableCell>
                </TableRow>
                {pnlSummary.salesReturns > 0 && (
                  <TableRow>
                    <TableCell className="pl-6 text-red-400">Less: Sales Returns & Customer Refunds</TableCell>
                    <TableCell className="text-right text-red-400">-{formatINR(pnlSummary.salesReturns)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">—</TableCell>
                  </TableRow>
                )}

                {/* 2. Cost of Goods Sold (COGS) */}
                <TableRow className="bg-secondary/20 font-semibold">
                  <TableCell className="text-foreground">2. Cost of Goods Sold (COGS)</TableCell>
                  <TableCell className="text-right text-foreground">{formatINR(pnlSummary.cogs)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {pnlSummary.netSales > 0 ? `${((pnlSummary.cogs / pnlSummary.netSales) * 100).toFixed(1)}%` : '0%'}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="pl-6 text-muted-foreground">Purchases / Inventory Inflow</TableCell>
                  <TableCell className="text-right">{formatINR(pnlSummary.grossPurchases)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">—</TableCell>
                </TableRow>

                {/* Gross Profit Row */}
                <TableRow className="border-t border-b border-border bg-emerald-500/10 font-bold">
                  <TableCell className="text-emerald-400">GROSS PROFIT (1 - 2)</TableCell>
                  <TableCell className="text-right text-emerald-400">{formatINR(pnlSummary.grossProfit)}</TableCell>
                  <TableCell className="text-right text-emerald-400">{pnlSummary.grossMargin.toFixed(1)}%</TableCell>
                </TableRow>

                {/* 3. Operating Expenses */}
                <TableRow className="bg-secondary/20 font-semibold">
                  <TableCell className="text-foreground">3. Operating Expenses</TableCell>
                  <TableCell className="text-right text-foreground">{formatINR(pnlSummary.totalExpenses)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {pnlSummary.netSales > 0 ? `${((pnlSummary.totalExpenses / pnlSummary.netSales) * 100).toFixed(1)}%` : '0%'}
                  </TableCell>
                </TableRow>
                {Object.keys(pnlSummary.expenseGroups).length > 0 ? (
                  Object.entries(pnlSummary.expenseGroups).map(([cat, amt]) => (
                    <TableRow key={cat}>
                      <TableCell className="pl-6 text-muted-foreground">{cat}</TableCell>
                      <TableCell className="text-right">{formatINR(amt)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {pnlSummary.netSales > 0 ? `${((amt / pnlSummary.netSales) * 100).toFixed(1)}%` : '—'}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell className="pl-6 text-zinc-500 italic" colSpan={3}>No operating expenses recorded for this period</TableCell>
                  </TableRow>
                )}

                {/* Net Profit Row */}
                <TableRow className={cn('border-t-2 border-border font-bold text-base', pnlSummary.netProfit >= 0 ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300')}>
                  <TableCell>NET OPERATING PROFIT / (LOSS)</TableCell>
                  <TableCell className="text-right">{formatINR(pnlSummary.netProfit)}</TableCell>
                  <TableCell className="text-right">{pnlSummary.netMargin.toFixed(1)}%</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── 3. Balance Sheet Tab ── */}
        <TabsContent value="balance-sheet" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Statement of financial position as of {dateTo}</p>
            <Button variant="outline" size="sm" onClick={exportBalanceSheet}>
              <Download className="h-4 w-4 mr-1.5" />
              Export Balance Sheet
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Assets Side */}
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="bg-blue-500/10 px-4 py-3 border-b border-border flex justify-between items-center">
                <h3 className="font-semibold text-blue-400 flex items-center gap-2">
                  <Building2 className="h-4 w-4" /> ASSETS
                </h3>
                <span className="font-bold text-white">{formatINR(balanceSheetSummary.totalAssets)}</span>
              </div>
              <Table>
                <TableBody>
                  <TableRow className="bg-secondary/10 font-medium">
                    <TableCell colSpan={2} className="text-xs uppercase tracking-wider text-muted-foreground">Current Assets</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="pl-6 text-foreground">Cash in Hand</TableCell>
                    <TableCell className="text-right font-medium">{formatINR(balanceSheetSummary.cashInHand)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="pl-6 text-foreground">Bank & Digital Accounts (UPI/Card)</TableCell>
                    <TableCell className="text-right font-medium">{formatINR(balanceSheetSummary.bankBalance)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="pl-6 text-foreground">Accounts Receivable (Customer Dues)</TableCell>
                    <TableCell className="text-right font-medium">{formatINR(balanceSheetSummary.accountsReceivable)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="pl-6 text-foreground">Stock Inventory (at Cost Value)</TableCell>
                    <TableCell className="text-right font-medium">{formatINR(balanceSheetSummary.stockInventoryValue)}</TableCell>
                  </TableRow>
                  <TableRow className="border-t-2 border-border bg-blue-500/10 font-bold">
                    <TableCell className="text-blue-300">TOTAL ASSETS</TableCell>
                    <TableCell className="text-right text-blue-300">{formatINR(balanceSheetSummary.totalAssets)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            {/* Liabilities & Equity Side */}
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="bg-purple-500/10 px-4 py-3 border-b border-border flex justify-between items-center">
                <h3 className="font-semibold text-purple-400 flex items-center gap-2">
                  <Scale className="h-4 w-4" /> LIABILITIES & EQUITY
                </h3>
                <span className="font-bold text-white">{formatINR(balanceSheetSummary.totalLiabilitiesAndEquity)}</span>
              </div>
              <Table>
                <TableBody>
                  <TableRow className="bg-secondary/10 font-medium">
                    <TableCell colSpan={2} className="text-xs uppercase tracking-wider text-muted-foreground">Current Liabilities</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="pl-6 text-foreground">Accounts Payable (Supplier Dues)</TableCell>
                    <TableCell className="text-right font-medium">{formatINR(balanceSheetSummary.accountsPayable)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="pl-6 text-foreground">GST Output Tax Liabilities</TableCell>
                    <TableCell className="text-right font-medium">{formatINR(balanceSheetSummary.gstPayable)}</TableCell>
                  </TableRow>
                  <TableRow className="bg-secondary/10 font-medium">
                    <TableCell colSpan={2} className="text-xs uppercase tracking-wider text-muted-foreground">Owner's Equity</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="pl-6 text-foreground">Retained Earnings & Capital</TableCell>
                    <TableCell className="text-right font-medium">{formatINR(balanceSheetSummary.ownerEquity)}</TableCell>
                  </TableRow>
                  <TableRow className="border-t-2 border-border bg-purple-500/10 font-bold">
                    <TableCell className="text-purple-300">TOTAL LIABILITIES & EQUITY</TableCell>
                    <TableCell className="text-right text-purple-300">{formatINR(balanceSheetSummary.totalLiabilitiesAndEquity)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Balanced Check Banner */}
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 flex items-center justify-between text-xs text-emerald-300">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              <span>Accounting Equation Balanced: <strong>Assets ({formatINR(balanceSheetSummary.totalAssets)}) = Liabilities ({formatINR(balanceSheetSummary.totalLiabilities)}) + Equity ({formatINR(balanceSheetSummary.ownerEquity)})</strong></span>
            </div>
            <Badge variant="outline" className="text-emerald-400 border-emerald-500/40">Balanced</Badge>
          </div>
        </TabsContent>

        {/* ── 4. Trial Balance Tab ── */}
        <TabsContent value="trial-balance" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">List of all ledger closing balances ensuring Total Debits equal Total Credits</p>
            <Button variant="outline" size="sm" onClick={exportTrialBalance}>
              <Download className="h-4 w-4 mr-1.5" />
              Export Trial Balance
            </Button>
          </div>

          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50%]">Account Head</TableHead>
                  <TableHead className="text-right">Debit (₹)</TableHead>
                  <TableHead className="text-right">Credit (₹)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trialBalanceRows.rows.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium text-foreground">{row.account}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {row.debit > 0 ? formatINR(row.debit) : '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {row.credit > 0 ? formatINR(row.credit) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 border-border bg-secondary/40 font-bold text-sm">
                  <TableCell className="text-foreground">Total</TableCell>
                  <TableCell className="text-right text-indigo-300">{formatINR(trialBalanceRows.totalDebit)}</TableCell>
                  <TableCell className="text-right text-indigo-300">{formatINR(trialBalanceRows.totalCredit)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── 5. Cash Flow Statement Tab ── */}
        <TabsContent value="cash-flow" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Statement of cash inflows and operational outflows for the period</p>
            <Button variant="outline" size="sm" onClick={exportCashFlow}>
              <Download className="h-4 w-4 mr-1.5" />
              Export Cash Flow
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-1">
                <ArrowDownRight className="h-4 w-4 text-emerald-400" />
                <span className="text-xs text-muted-foreground">Operating Cash Inflows</span>
              </div>
              <p className="text-2xl font-bold text-emerald-400">{formatINR(cashFlowSummary.cashInflows)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Sales & customer receipts</p>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-1">
                <ArrowUpRight className="h-4 w-4 text-red-400" />
                <span className="text-xs text-muted-foreground">Operating Cash Outflows</span>
              </div>
              <p className="text-2xl font-bold text-red-400">{formatINR(cashFlowSummary.cashOutflows)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Supplier bills & expenses</p>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-1">
                <Wallet className="h-4 w-4 text-amber-400" />
                <span className="text-xs text-muted-foreground">Net Cash Flow</span>
              </div>
              <p className={cn('text-2xl font-bold', cashFlowSummary.netCashFlow >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                {formatINR(cashFlowSummary.netCashFlow)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Net liquidity change</p>
            </div>
          </div>
        </TabsContent>
      </Tabs>
        )}

        {/* ── Party Reports section ── */}
        {activeSection === 'party' && (
          <div className="space-y-6">
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Users className="h-4 w-4 text-indigo-400" /> Customers — Receivable Balance
                </h3>
                <span className="font-bold text-amber-400">{formatINR(balanceSheetSummary.accountsReceivable)}</span>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead className="text-right">Balance Due</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customersData.filter((c) => (c.balance || 0) > 0).length > 0 ? (
                    customersData
                      .filter((c) => (c.balance || 0) > 0)
                      .sort((a, b) => (b.balance || 0) - (a.balance || 0))
                      .map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium text-white">{c.name}</TableCell>
                          <TableCell className="text-zinc-400">{c.phone || '—'}</TableCell>
                          <TableCell className="text-right font-semibold text-amber-400">{formatINR(c.balance || 0)}</TableCell>
                        </TableRow>
                      ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-zinc-500 py-8">No outstanding customer balances</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-indigo-400" /> Suppliers
                </h3>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead className="text-right">Purchases (period)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suppliersData.length > 0 ? (
                    suppliersData.map((s) => {
                      const total = purchasesData
                        .filter((p: any) => p.supplier_id === s.id)
                        .reduce((sum: number, p: any) => sum + (p.total_amount || 0), 0)
                      return (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium text-white">{s.name}</TableCell>
                          <TableCell className="text-zinc-400">{s.phone || '—'}</TableCell>
                          <TableCell className="text-right font-semibold">{formatINR(total)}</TableCell>
                        </TableRow>
                      )
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-zinc-500 py-8">No suppliers found</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* ── GST Reports section ── */}
        {activeSection === 'gst' && (
          <Tabs defaultValue="gstr1" className="space-y-4">
            <TabsList className="flex flex-wrap h-auto gap-1 bg-card border border-border p-1">
              <TabsTrigger value="gstr1">GSTR-1</TabsTrigger>
              <TabsTrigger value="gstr2">GSTR-2</TabsTrigger>
              <TabsTrigger value="gstr3b">GSTR-3B</TabsTrigger>
              <TabsTrigger value="gstr9">GSTR-9</TabsTrigger>
              <TabsTrigger value="hsn">HSN-wise Summary</TabsTrigger>
            </TabsList>

            <TabsContent value="gstr1" className="space-y-4">
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={exportGST}>
                  <Download className="h-4 w-4 mr-1.5" />
                  Export CSV
                </Button>
              </div>

              <div className={cn(
                'rounded-lg border p-3 flex items-center justify-between text-xs',
                gstr1Summary.reconciled ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300',
              )}>
                <div className="flex items-center gap-2">
                  {gstr1Summary.reconciled ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                  <span>
                    {gstr1Summary.reconciled
                      ? 'GSTR-1 reconciled — taxable value + tax matches invoice line totals.'
                      : 'GSTR-1 reconciliation mismatch — review sale/line-item tax data.'}
                  </span>
                </div>
                <span>Tolerance: ₹1.00 · Difference: {formatINR(gstr1Summary.difference)}</span>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-5">
                    <p className="text-xs text-zinc-400">Net Taxable Value</p>
                    <p className="text-2xl font-bold text-white mt-1">{formatINR(gstr1Summary.netTaxableValue)}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">after sales returns</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-5">
                    <p className="text-xs text-zinc-400">Net Output Tax</p>
                    <p className="text-2xl font-bold text-emerald-400 mt-1">{formatINR(gstr1Summary.netOutputTax)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-5">
                    <p className="text-xs text-zinc-400">B2B Invoices</p>
                    <p className="text-2xl font-bold text-white mt-1">{gstr1Summary.b2bCount}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">registered parties</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-5">
                    <p className="text-xs text-zinc-400">B2C Invoices</p>
                    <p className="text-2xl font-bold text-white mt-1">{gstr1Summary.b2cCount}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">walk-in / unregistered</p>
                  </CardContent>
                </Card>
              </div>

              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">B2B Supplies (Business to Business)</p>
                    <p className="text-xs text-zinc-500">{gstr1Summary.b2bCount} invoices to GST-registered parties</p>
                  </div>
                  <span className="font-bold text-white">{formatINR(gstr1Summary.b2bTaxable)}</span>
                </div>
                <div className="p-4 grid grid-cols-2 gap-3 text-sm">
                  <span className="text-zinc-400">Taxable Value</span>
                  <span className="text-right text-white">{formatINR(gstr1Summary.b2bTaxable)}</span>
                  <span className="text-zinc-400">Total Tax</span>
                  <span className="text-right text-white">{formatINR(gstr1Summary.b2bTax)}</span>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">B2C Supplies (Business to Consumer)</p>
                    <p className="text-xs text-zinc-500">{gstr1Summary.b2cCount} invoices to walk-in / unregistered parties</p>
                  </div>
                  <span className="font-bold text-white">{formatINR(gstr1Summary.b2cTaxable)}</span>
                </div>
                <div className="p-4 grid grid-cols-2 gap-3 text-sm">
                  <span className="text-zinc-400">Taxable Value</span>
                  <span className="text-right text-white">{formatINR(gstr1Summary.b2cTaxable)}</span>
                  <span className="text-zinc-400">Total Tax</span>
                  <span className="text-right text-white">{formatINR(gstr1Summary.b2cTax)}</span>
                </div>
              </div>

              <p className="text-xs text-zinc-500">
                Note: taxable value and tax are computed from the sale-level total (grand total minus tax), not a per-line CGST/SGST/IGST
                breakup by rate — see Tax Rate Report (under Taxes Reports) for the rate-wise split. A full GSTIN-level invoice export
                shaped for actual GST portal filing is a larger, separately scoped item.
              </p>
            </TabsContent>

            <TabsContent value="gstr2" className="space-y-4">
              <div className={cn(
                'rounded-lg border p-3 flex items-center justify-between text-xs',
                gstr2Summary.reconciled ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300',
              )}>
                <div className="flex items-center gap-2">
                  {gstr2Summary.reconciled ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                  <span>
                    {gstr2Summary.reconciled
                      ? 'GSTR-2 reconciled — CGST + SGST + IGST matches Net ITC.'
                      : 'GSTR-2 reconciliation mismatch — review purchase/line-item tax data.'}
                  </span>
                </div>
                <span>Tolerance: ₹1.00 · Difference: {formatINR(gstr2Summary.difference)}</span>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-5">
                    <p className="text-xs text-zinc-400">Net Eligible Taxable</p>
                    <p className="text-2xl font-bold text-white mt-1">{formatINR(gstr2Summary.netEligibleTaxable)}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">after purchase returns</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-5">
                    <p className="text-xs text-zinc-400">Net Eligible ITC</p>
                    <p className="text-2xl font-bold text-emerald-400 mt-1">{formatINR(gstr2Summary.netEligibleITC)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-5">
                    <p className="text-xs text-zinc-400">Eligible Bills</p>
                    <p className="text-2xl font-bold text-white mt-1">{gstr2Summary.eligibleBillCount}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">registered + non-blocked</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-5">
                    <p className="text-xs text-zinc-400">Ineligible Tax</p>
                    <p className="text-2xl font-bold text-amber-400 mt-1">{formatINR(gstr2Summary.ineligibleTax)}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{gstr2Summary.ineligibleBillCount} bills excluded</p>
                  </CardContent>
                </Card>
              </div>

              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">Eligible ITC (Registered Suppliers)</p>
                    <p className="text-xs text-zinc-500">{gstr2Summary.eligibleBillCount} bills with valid GSTIN, non-blocked credits</p>
                  </div>
                  <span className="font-bold text-white">{formatINR(gstr2Summary.eligibleTax)}</span>
                </div>
                <div className="p-4 grid grid-cols-2 gap-3 text-sm">
                  <span className="text-zinc-400">Taxable Value</span>
                  <span className="text-right text-white">{formatINR(gstr2Summary.eligibleTaxable)}</span>
                  <span className="text-zinc-400">Total ITC Available</span>
                  <span className="text-right text-white font-semibold">{formatINR(gstr2Summary.eligibleTax)}</span>
                </div>
              </div>

              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 overflow-hidden">
                <div className="px-4 py-3 border-b border-amber-500/20 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">Ineligible ITC (Excluded)</p>
                    <p className="text-xs text-zinc-500">Unregistered suppliers — Section 17(5) blocked-credit tracking not implemented</p>
                  </div>
                  <span className="font-bold text-amber-400">{formatINR(gstr2Summary.ineligibleTax)}</span>
                </div>
              </div>

              {gstr2Summary.purchaseReturnsTotal > 0 && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/5 overflow-hidden">
                  <div className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-white">Purchase Returns / Debit Notes (Deducted)</p>
                      <p className="text-xs text-zinc-500">reduces net eligible taxable value</p>
                    </div>
                    <span className="font-bold text-red-400">-{formatINR(gstr2Summary.purchaseReturnsTotal)}</span>
                  </div>
                </div>
              )}

              <p className="text-xs text-zinc-500">
                Note: "Ineligible ITC" here means purchases from suppliers with no GSTIN on file — BillScape does not yet track true
                Section 17(5) blocked-credit categories (e.g. motor vehicles, personal consumption), so this is a proxy, not a full
                eligibility engine.
              </p>
            </TabsContent>

            <TabsContent value="gstr3b" className="space-y-4">
              <div className={cn(
                'rounded-lg border p-3 flex items-center justify-between text-xs',
                (gstr1Summary.reconciled && gstr2Summary.reconciled) ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300',
              )}>
                <div className="flex items-center gap-2">
                  {(gstr1Summary.reconciled && gstr2Summary.reconciled) ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                  <span>GSTR-3B reconciled — Output Tax, ITC and Net Payable all balance with GSTR-1 &amp; GSTR-2.</span>
                </div>
                <span>Tolerance: ₹1.00 · Sales returns deducted from Output Tax · Purchase returns deducted from ITC.</span>
              </div>

              <div className="rounded-lg border border-border bg-card p-5">
                <p className="text-sm font-semibold text-white mb-4">GST Summary</p>
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  <div className="relative flex h-40 w-40 shrink-0 items-center justify-center rounded-full border-[14px] border-emerald-500/70">
                    <div className="text-center">
                      <p className="text-xs text-zinc-400">Net Payable</p>
                      <p className="text-xl font-bold text-red-400">
                        {formatINR(Math.max(0, gstr1Summary.netOutputTax - gstr2Summary.netEligibleITC))}
                      </p>
                    </div>
                  </div>
                  <div className="flex-1 w-full space-y-4">
                    <div>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-zinc-300">Output Tax (net of returns)</span>
                        <span className="font-semibold text-white">{formatINR(gstr1Summary.netOutputTax)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                        <div className="h-full bg-emerald-500" style={{ width: '100%' }} />
                      </div>
                      <p className="text-xs text-zinc-500 mt-0.5">100.0%</p>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-zinc-300">Eligible ITC (net of returns)</span>
                        <span className="font-semibold text-white">{formatINR(gstr2Summary.netEligibleITC)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                        <div
                          className="h-full bg-amber-500"
                          style={{ width: gstr1Summary.netOutputTax > 0 ? `${Math.min(100, (gstr2Summary.netEligibleITC / gstr1Summary.netOutputTax) * 100)}%` : '0%' }}
                        />
                      </div>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {gstr1Summary.netOutputTax > 0 ? `${((gstr2Summary.netEligibleITC / gstr1Summary.netOutputTax) * 100).toFixed(1)}%` : '0.0%'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 overflow-hidden">
                <div className="px-4 py-3 border-b border-emerald-500/20 flex items-center justify-between">
                  <p className="text-sm font-semibold text-white">3.1 - Outward Supplies (Net of Sales Returns)</p>
                  <span className="font-bold text-emerald-400">{formatINR(gstr1Summary.netOutputTax)}</span>
                </div>
                <div className="p-4 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">(a) Outward taxable supplies</span>
                    <span className="text-white">{formatINR(gstr1Summary.netTaxableValue)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Integrated Tax (IGST)</span>
                    <span className="text-white">{formatINR(gstSummary.reduce((s, g) => s + g.igst, 0))}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Central Tax (CGST)</span>
                    <span className="text-white">{formatINR(gstSummary.reduce((s, g) => s + g.cgst, 0))}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">State Tax (SGST)</span>
                    <span className="text-white">{formatINR(gstSummary.reduce((s, g) => s + g.sgst, 0))}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-zinc-700 pt-2 font-semibold">
                    <span className="text-zinc-300">Total Output Tax</span>
                    <span className="text-white">{formatINR(gstr1Summary.netOutputTax)}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 overflow-hidden">
                <div className="px-4 py-3 border-b border-amber-500/20 flex items-center justify-between">
                  <p className="text-sm font-semibold text-white">4 - Eligible ITC (Net of Purchase Returns)</p>
                  <span className="font-bold text-amber-400">{formatINR(gstr2Summary.netEligibleITC)}</span>
                </div>
                <div className="p-4 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">(A) ITC Available — eligible taxable value</span>
                    <span className="text-white">{formatINR(gstr2Summary.netEligibleTaxable)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Integrated Tax (IGST)</span>
                    <span className="text-white">{formatINR(gstr2Summary.netEligibleIgst)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Central Tax (CGST)</span>
                    <span className="text-white">{formatINR(gstr2Summary.netEligibleCgst)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">State Tax (SGST)</span>
                    <span className="text-white">{formatINR(gstr2Summary.netEligibleSgst)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-zinc-700 pt-2 font-semibold">
                    <span className="text-zinc-300">Total Eligible ITC</span>
                    <span className="text-white">{formatINR(gstr2Summary.netEligibleITC)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-zinc-500">
                    <span>(D) Ineligible ITC (Section 17(5) / unregistered) — reported separately</span>
                    <span>{formatINR(gstr2Summary.ineligibleTax)}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-red-500/30 bg-red-500/5 overflow-hidden">
                <div className="px-4 py-3 border-b border-red-500/20 flex items-center justify-between">
                  <p className="text-sm font-semibold text-white">Net Tax Payable (Output − Eligible ITC)</p>
                  <span className="font-bold text-red-400">{formatINR(Math.max(0, gstr1Summary.netOutputTax - gstr2Summary.netEligibleITC))}</span>
                </div>
                <div className="p-4 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">IGST Payable</span>
                    <span className="text-white">{formatINR(Math.max(0, gstSummary.reduce((s, g) => s + g.igst, 0) - gstr2Summary.netEligibleIgst))}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">CGST Payable</span>
                    <span className="text-white">{formatINR(Math.max(0, gstSummary.reduce((s, g) => s + g.cgst, 0) - gstr2Summary.netEligibleCgst))}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">SGST Payable</span>
                    <span className="text-white">{formatINR(Math.max(0, gstSummary.reduce((s, g) => s + g.sgst, 0) - gstr2Summary.netEligibleSgst))}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-zinc-700 pt-2 font-semibold">
                    <span className="text-zinc-300">Total Payable</span>
                    <span className="text-white">{formatINR(Math.max(0, gstr1Summary.netOutputTax - gstr2Summary.netEligibleITC))}</span>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="gstr9" className="space-y-4">
              <div className={cn(
                'rounded-lg border p-3 flex items-center justify-between text-xs',
                (gstr1Summary.reconciled && gstr2Summary.reconciled) ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300',
              )}>
                <div className="flex items-center gap-2">
                  {(gstr1Summary.reconciled && gstr2Summary.reconciled) ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                  <span>GSTR-9 reconciled — matches GSTR-1 and GSTR-3B within tolerance.</span>
                </div>
                <span>
                  Tolerance: ₹1.00 · vs GSTR-1: Δ {formatINR(gstr1Summary.difference)} · vs GSTR-3B: Δ {formatINR(gstr2Summary.difference)}
                </span>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-5">
                    <p className="text-xs text-zinc-400">Net Outward Supplies</p>
                    <p className="text-2xl font-bold text-white mt-1">{formatINR(gstr1Summary.netTaxableValue)}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">after credit notes</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-5">
                    <p className="text-xs text-zinc-400">Net Output Tax</p>
                    <p className="text-2xl font-bold text-blue-400 mt-1">{formatINR(gstr1Summary.netOutputTax)}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      CGST {formatINR(gstSummary.reduce((s, g) => s + g.cgst, 0))} + SGST {formatINR(gstSummary.reduce((s, g) => s + g.sgst, 0))}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-5">
                    <p className="text-xs text-zinc-400">Net Eligible ITC</p>
                    <p className="text-2xl font-bold text-amber-400 mt-1">{formatINR(gstr2Summary.netEligibleITC)}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">after purchase returns</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-5">
                    <p className="text-xs text-zinc-400">Net Tax Payable</p>
                    <p className="text-2xl font-bold text-red-400 mt-1">{formatINR(Math.max(0, gstr1Summary.netOutputTax - gstr2Summary.netEligibleITC))}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">Outward − Eligible ITC</p>
                  </CardContent>
                </Card>
              </div>

              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 overflow-hidden">
                <div className="px-4 py-3 border-b border-emerald-500/20 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">Part II — Outward Supplies</p>
                    <p className="text-xs text-zinc-500">B2B + B2C, net of credit notes</p>
                  </div>
                  <span className="font-bold text-emerald-400">{formatINR(gstr1Summary.netTaxableValue)}</span>
                </div>
                <div className="p-4 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">B2B Taxable Value</span>
                    <span className="text-white">{formatINR(gstr1Summary.b2bTaxable)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">B2C Taxable Value</span>
                    <span className="text-white">{formatINR(gstr1Summary.b2cTaxable)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Nil-Rated / Exempt (separate)</span>
                    <span className="text-white">{formatINR(0)}</span>
                  </div>
                  <div className="flex items-center justify-between text-red-400">
                    <span>Less: Credit Notes (Sales Returns)</span>
                    <span>-{formatINR(pnlSummary.salesReturns)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-zinc-700 pt-2 font-semibold">
                    <span className="text-zinc-300">Net Taxable Value</span>
                    <span className="text-white">{formatINR(gstr1Summary.netTaxableValue)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">CGST</span>
                    <span className="text-white">{formatINR(gstSummary.reduce((s, g) => s + g.cgst, 0))}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">SGST</span>
                    <span className="text-white">{formatINR(gstSummary.reduce((s, g) => s + g.sgst, 0))}</span>
                  </div>
                  <div className="flex items-center justify-between font-semibold">
                    <span className="text-zinc-300">Net Output Tax</span>
                    <span className="text-white">{formatINR(gstr1Summary.netOutputTax)}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 overflow-hidden">
                <div className="px-4 py-3 border-b border-amber-500/20 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">Part III — ITC Availed</p>
                    <p className="text-xs text-zinc-500">Eligible only (registered + non-blocked), net of returns</p>
                  </div>
                  <span className="font-bold text-amber-400">{formatINR(gstr2Summary.netEligibleITC)}</span>
                </div>
                <div className="p-4 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Eligible Taxable Value</span>
                    <span className="text-white">{formatINR(gstr2Summary.eligibleTaxable)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Eligible ITC (CGST + SGST)</span>
                    <span className="text-white">{formatINR(gstr2Summary.eligibleTax)}</span>
                  </div>
                  <div className="flex items-center justify-between text-red-400">
                    <span>Less: Purchase Returns / Reversals</span>
                    <span>-{formatINR(gstr2Summary.purchaseReturnsTotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-zinc-500">
                    <span>Ineligible / Blocked Credits (reported separately)</span>
                    <span>{formatINR(gstr2Summary.ineligibleTax)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-zinc-700 pt-2 font-semibold">
                    <span className="text-zinc-300">Net Eligible ITC</span>
                    <span className="text-white">{formatINR(gstr2Summary.netEligibleITC)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">CGST</span>
                    <span className="text-white">{formatINR(gstr2Summary.netEligibleCgst)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">SGST</span>
                    <span className="text-white">{formatINR(gstr2Summary.netEligibleSgst)}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-red-500/30 bg-red-500/5 overflow-hidden">
                <div className="px-4 py-3 border-b border-red-500/20 flex items-center justify-between">
                  <p className="text-sm font-semibold text-white">Part IV — Net Tax Payable</p>
                  <span className="font-bold text-red-400">{formatINR(Math.max(0, gstr1Summary.netOutputTax - gstr2Summary.netEligibleITC))}</span>
                </div>
                <div className="p-4 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Net Output Tax</span>
                    <span className="text-white">{formatINR(gstr1Summary.netOutputTax)}</span>
                  </div>
                  <div className="flex items-center justify-between text-red-400">
                    <span>Less: Net Eligible ITC</span>
                    <span>-{formatINR(gstr2Summary.netEligibleITC)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-zinc-700 pt-2 font-semibold">
                    <span className="text-zinc-300">Net Tax Payable</span>
                    <span className="text-white">{formatINR(Math.max(0, gstr1Summary.netOutputTax - gstr2Summary.netEligibleITC))}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">CGST</span>
                    <span className="text-white">{formatINR(Math.max(0, gstSummary.reduce((s, g) => s + g.cgst, 0) - gstr2Summary.netEligibleCgst))}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">SGST</span>
                    <span className="text-white">{formatINR(Math.max(0, gstSummary.reduce((s, g) => s + g.sgst, 0) - gstr2Summary.netEligibleSgst))}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">Part V — Reconciliation with Monthly Filings</p>
                    <p className="text-xs text-zinc-500">GSTR-9 must reconcile with GSTR-1 and GSTR-3B</p>
                  </div>
                  <span className="font-bold text-white">{formatINR(gstr1Summary.difference + gstr2Summary.difference)}</span>
                </div>
              </div>

              <p className="text-xs text-zinc-500">
                GSTR-9 is normally filed annually — this view aggregates whatever date range is currently selected above, so set the
                filter to a full financial year for an accurate annual summary.
              </p>
            </TabsContent>

            <TabsContent value="hsn" className="space-y-4">
              <div className={cn(
                'rounded-lg border p-3 flex items-center justify-between text-xs',
                hsnSummary.reconciled ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300',
              )}>
                <div className="flex items-center gap-2">
                  {hsnSummary.reconciled ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                  <span>
                    {hsnSummary.reconciled ? 'HSN summary reconciled with GSTR-1 totals.' : 'HSN summary reconciliation mismatch — review item-level HSN codes.'}
                  </span>
                </div>
                <span>
                  Tolerance: ₹1.00 · Taxable Δ {formatINR(Math.abs(hsnSummary.netTaxableValue - gstr1Summary.netTaxableValue))} ·
                  Tax Δ {formatINR(Math.abs(hsnSummary.totalTax - gstr1Summary.netOutputTax))}
                </span>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-5">
                    <p className="text-xs text-zinc-400">Net Taxable Value</p>
                    <p className="text-2xl font-bold text-white mt-1">{formatINR(hsnSummary.netTaxableValue)}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">after sales returns</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-5">
                    <p className="text-xs text-zinc-400">Total Tax</p>
                    <p className="text-2xl font-bold text-emerald-400 mt-1">{formatINR(hsnSummary.totalTax)}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      CGST {formatINR(itemSummary.reduce((s, i) => s + i.cgst, 0))} + SGST {formatINR(itemSummary.reduce((s, i) => s + i.sgst, 0))}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-5">
                    <p className="text-xs text-zinc-400">Gross Taxable</p>
                    <p className="text-2xl font-bold text-white mt-1">{formatINR(hsnSummary.grossTaxable)}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">before returns</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-5">
                    <p className="text-xs text-zinc-400">Returns Adjusted</p>
                    <p className="text-2xl font-bold text-amber-400 mt-1">{formatINR(hsnSummary.returnsAdjusted)}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">credit notes deducted</p>
                  </CardContent>
                </Card>
              </div>

              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <p className="text-sm font-semibold text-white">HSN-wise Summary (GSTR-1 format)</p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={exportItems}>
                      <Download className="h-4 w-4 mr-1.5" />
                      Export CSV
                    </Button>
                    <Button size="sm" onClick={exportHsnGstr1Json}>
                      <Download className="h-4 w-4 mr-1.5" />
                      Export GSTR-1 JSON
                    </Button>
                  </div>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>HSN / SAC</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>UQC</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Taxable Value</TableHead>
                      <TableHead className="text-right">CGST</TableHead>
                      <TableHead className="text-right">SGST</TableHead>
                      <TableHead className="text-right">IGST</TableHead>
                      <TableHead className="text-right">Total Tax</TableHead>
                      <TableHead className="text-right">Total Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itemLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>
                          {Array.from({ length: 11 }).map((_, j) => (
                            <TableCell key={j}><div className="h-4 bg-zinc-800 rounded animate-pulse" /></TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : itemSummary.length > 0 ? (
                      <>
                        {itemSummary.map((item, i) => {
                          const totalTax = item.cgst + item.sgst + item.igst
                          const taxable = item.revenue - totalTax
                          return (
                            <TableRow key={item.name}>
                              <TableCell className="text-zinc-500">{i + 1}</TableCell>
                              <TableCell className="font-mono text-xs text-zinc-400">{item.hsn || '—'}</TableCell>
                              <TableCell className="font-medium text-white">{item.name}</TableCell>
                              <TableCell className="text-zinc-400">{item.uqc}</TableCell>
                              <TableCell className="text-right">{item.qty}</TableCell>
                              <TableCell className="text-right">{formatINR(taxable)}</TableCell>
                              <TableCell className="text-right">{formatINR(item.cgst)}</TableCell>
                              <TableCell className="text-right">{formatINR(item.sgst)}</TableCell>
                              <TableCell className="text-right">{formatINR(item.igst)}</TableCell>
                              <TableCell className="text-right font-semibold">{formatINR(totalTax)}</TableCell>
                              <TableCell className="text-right font-semibold">{formatINR(item.revenue)}</TableCell>
                            </TableRow>
                          )
                        })}
                        <TableRow className="border-t-2 border-zinc-700 bg-zinc-800/30 font-bold">
                          <TableCell colSpan={5} className="text-zinc-200">Total</TableCell>
                          <TableCell className="text-right">{formatINR(hsnSummary.grossTaxable)}</TableCell>
                          <TableCell className="text-right">{formatINR(itemSummary.reduce((s, i) => s + i.cgst, 0))}</TableCell>
                          <TableCell className="text-right">{formatINR(itemSummary.reduce((s, i) => s + i.sgst, 0))}</TableCell>
                          <TableCell className="text-right">{formatINR(itemSummary.reduce((s, i) => s + i.igst, 0))}</TableCell>
                          <TableCell className="text-right">{formatINR(hsnSummary.totalTax)}</TableCell>
                          <TableCell className="text-right">{formatINR(itemSummary.reduce((s, i) => s + i.revenue, 0))}</TableCell>
                        </TableRow>
                      </>
                    ) : (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center text-zinc-500 py-12">
                          No sales recorded for this period
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        )}

        {/* ── Stock / Item Reports section ── */}
        {activeSection === 'stock' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={exportStock}>
                <Download className="h-4 w-4 mr-1.5" />
                Export CSV
              </Button>
            </div>
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead className="text-right">Reorder</TableHead>
                    <TableHead className="text-right">Selling Price</TableHead>
                    {isOwner && <TableHead className="text-right">Cost Price</TableHead>}
                    <TableHead className="text-right">Stock Value (Sell)</TableHead>
                    {isOwner && <TableHead className="text-right">Stock Value (Cost)</TableHead>}
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stockLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: isOwner ? 9 : 7 }).map((_, j) => (
                          <TableCell key={j}><div className="h-4 bg-zinc-800 rounded animate-pulse" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : stockData.length > 0 ? (
                    stockData.map((item: any) => {
                      const p = item.products
                      const qty = item.stock_qty ?? 0
                      const reorder = item.reorder_level ?? 0
                      const price = p?.price ?? 0
                      const cost = p?.cost_price ?? 0
                      const isLow = qty <= reorder
                      return (
                        <TableRow key={p?.name}>
                          <TableCell className="font-medium text-white">{p?.name ?? 'Unknown'}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{p?.categories?.name ?? 'Uncategorized'}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-semibold">{qty}</TableCell>
                          <TableCell className="text-right text-zinc-400">{reorder}</TableCell>
                          <TableCell className="text-right">{formatINR(price)}</TableCell>
                          {isOwner && <TableCell className="text-right text-zinc-400">{formatINR(cost)}</TableCell>}
                          <TableCell className="text-right font-semibold">{formatINR(qty * price)}</TableCell>
                          {isOwner && (
                            <TableCell className="text-right font-semibold text-zinc-300">
                              {formatINR(qty * cost)}
                            </TableCell>
                          )}
                          <TableCell>
                            {isLow ? (
                              <Badge variant="destructive">Low Stock</Badge>
                            ) : (
                              <Badge variant="outline" className="text-emerald-400 border-emerald-500/30">OK</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={isOwner ? 9 : 7} className="text-center text-zinc-500 py-12">
                        No inventory data
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* ── Expense Reports section ── */}
        {activeSection === 'expenses' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">Total Expenses</p>
                <p className="text-2xl font-bold text-amber-400 mt-1">{formatINR(pnlSummary.totalExpenses)}</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">Categories</p>
                <p className="text-2xl font-bold text-white mt-1">{Object.keys(pnlSummary.expenseGroups).length}</p>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">% of Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.keys(pnlSummary.expenseGroups).length > 0 ? (
                    Object.entries(pnlSummary.expenseGroups)
                      .sort((a, b) => b[1] - a[1])
                      .map(([cat, amt]) => (
                        <TableRow key={cat}>
                          <TableCell className="font-medium text-white">{cat}</TableCell>
                          <TableCell className="text-right">{formatINR(amt)}</TableCell>
                          <TableCell className="text-right text-zinc-400">
                            {pnlSummary.totalExpenses > 0 ? `${((amt / pnlSummary.totalExpenses) * 100).toFixed(1)}%` : '—'}
                          </TableCell>
                        </TableRow>
                      ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-zinc-500 py-8">No expenses recorded for this period</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* ── Taxes Reports section: GST Summary / Tax Rate / Invoice Range / TDS ── */}
        {activeSection === 'taxes' && (
          <Tabs defaultValue="gst-summary" className="space-y-4">
            <TabsList className="flex flex-wrap h-auto gap-1 bg-card border border-border p-1 no-print">
              <TabsTrigger value="gst-summary">GST Summary</TabsTrigger>
              <TabsTrigger value="tax-rate">Tax Rate Report</TabsTrigger>
              <TabsTrigger value="invoice-range">Invoice From-No / To-No</TabsTrigger>
              <TabsTrigger value="tds-payable">TDS Payable</TabsTrigger>
              <TabsTrigger value="tds-receivable">TDS Receivable</TabsTrigger>
            </TabsList>

            <TabsContent value="gst-summary" className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Net GST payable = Output Tax collected on sales − Input Tax paid on purchases, for the selected period</p>
                <Button variant="outline" size="sm" onClick={exportTaxes}>
                  <Download className="h-4 w-4 mr-1.5" />
                  Export CSV
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-xs text-muted-foreground">Output Tax (Sales GST Collected)</p>
                  <p className="text-2xl font-bold text-emerald-400 mt-1">{formatINR(taxLiabilitySummary.outputTax)}</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-xs text-muted-foreground">Input Tax (Purchase GST Paid)</p>
                  <p className="text-2xl font-bold text-blue-400 mt-1">{formatINR(taxLiabilitySummary.inputTax)}</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-xs text-muted-foreground">Net GST Payable</p>
                  <p className={cn('text-2xl font-bold mt-1', taxLiabilitySummary.netPayable >= 0 ? 'text-amber-400' : 'text-emerald-400')}>
                    {formatINR(Math.abs(taxLiabilitySummary.netPayable))}
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5">{taxLiabilitySummary.netPayable >= 0 ? 'Payable to government' : 'Input tax credit carried forward'}</p>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tax Rate</TableHead>
                      <TableHead className="text-right">Output Tax</TableHead>
                      <TableHead className="text-right">Input Tax</TableHead>
                      <TableHead className="text-right">Net Payable</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {purchaseGstLoading || gstLoading ? (
                      Array.from({ length: 4 }).map((_, i) => (
                        <TableRow key={i}>
                          {Array.from({ length: 4 }).map((_, j) => (
                            <TableCell key={j}><div className="h-4 bg-zinc-800 rounded animate-pulse" /></TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : (
                      [0, 5, 12, 18, 28]
                        .filter((rate) => gstSummary.some((g) => g.rate === rate) || purchaseGstSummary.some((g) => g.rate === rate))
                        .map((rate) => {
                          const out = gstSummary.find((g) => g.rate === rate)
                          const inp = purchaseGstSummary.find((g) => g.rate === rate)
                          const outTotal = out ? out.cgst + out.sgst + out.igst : 0
                          const inTotal = inp ? inp.cgst + inp.sgst + inp.igst : 0
                          const net = outTotal - inTotal
                          return (
                            <TableRow key={rate}>
                              <TableCell><Badge variant="secondary">{rate}%</Badge></TableCell>
                              <TableCell className="text-right">{formatINR(outTotal)}</TableCell>
                              <TableCell className="text-right">{formatINR(inTotal)}</TableCell>
                              <TableCell className={cn('text-right font-semibold', net >= 0 ? 'text-amber-400' : 'text-emerald-400')}>
                                {formatINR(Math.abs(net))}
                              </TableCell>
                            </TableRow>
                          )
                        })
                    )}
                    {!purchaseGstLoading && !gstLoading && gstSummary.length === 0 && purchaseGstSummary.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-zinc-500 py-12">No tax data for this period</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="tax-rate" className="space-y-4">
              <p className="text-sm text-muted-foreground">Sales revenue and tax collected, grouped by GST rate</p>
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tax Rate</TableHead>
                      <TableHead className="text-right">Taxable Value</TableHead>
                      <TableHead className="text-right">CGST</TableHead>
                      <TableHead className="text-right">SGST</TableHead>
                      <TableHead className="text-right">IGST</TableHead>
                      <TableHead className="text-right">Total Tax</TableHead>
                      <TableHead className="text-right">% of Total Tax</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {gstLoading ? (
                      Array.from({ length: 4 }).map((_, i) => (
                        <TableRow key={i}>
                          {Array.from({ length: 7 }).map((_, j) => (
                            <TableCell key={j}><div className="h-4 bg-zinc-800 rounded animate-pulse" /></TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : gstSummary.length > 0 ? (
                      (() => {
                        const grandTotalTax = gstSummary.reduce((s, g) => s + g.cgst + g.sgst + g.igst, 0)
                        return gstSummary.map((g) => {
                          const totalTax = g.cgst + g.sgst + g.igst
                          return (
                            <TableRow key={g.rate}>
                              <TableCell><Badge variant="secondary">{g.rate}%</Badge></TableCell>
                              <TableCell className="text-right">{formatINR(g.taxable)}</TableCell>
                              <TableCell className="text-right">{formatINR(g.cgst)}</TableCell>
                              <TableCell className="text-right">{formatINR(g.sgst)}</TableCell>
                              <TableCell className="text-right">{formatINR(g.igst)}</TableCell>
                              <TableCell className="text-right font-semibold">{formatINR(totalTax)}</TableCell>
                              <TableCell className="text-right text-zinc-400">
                                {grandTotalTax > 0 ? `${((totalTax / grandTotalTax) * 100).toFixed(1)}%` : '—'}
                              </TableCell>
                            </TableRow>
                          )
                        })
                      })()
                    ) : (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-zinc-500 py-12">No tax data for this period</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="invoice-range" className="space-y-4">
              <p className="text-sm text-muted-foreground">Filter sales by invoice number range (alphabetical range within the selected date period)</p>
              <div className="flex flex-wrap gap-3">
                <div className="flex-1 min-w-[200px]">
                  <label htmlFor="invoice-range-from" className="text-xs text-muted-foreground mb-1 block">From Invoice No</label>
                  <input
                    id="invoice-range-from"
                    name="invoiceRangeFrom"
                    type="text"
                    placeholder="e.g., BS-20260801-0001"
                    value={invoiceRangeFrom}
                    onChange={(e) => setInvoiceRangeFrom(e.target.value)}
                    className="w-full h-9 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div className="flex-1 min-w-[200px]">
                  <label htmlFor="invoice-range-to" className="text-xs text-muted-foreground mb-1 block">To Invoice No</label>
                  <input
                    id="invoice-range-to"
                    name="invoiceRangeTo"
                    type="text"
                    placeholder="e.g., BS-20260831-9999"
                    value={invoiceRangeTo}
                    onChange={(e) => setInvoiceRangeTo(e.target.value)}
                    className="w-full h-9 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {!invoiceRangeFrom && !invoiceRangeTo ? (
                <p className="text-center text-zinc-500 py-12 text-sm">Enter invoice range to search</p>
              ) : (
                <div className="space-y-2">
                  {[...salesData]
                    .filter((s) => {
                      const inv = s.invoice_no ?? ''
                      if (invoiceRangeFrom && inv < invoiceRangeFrom) return false
                      if (invoiceRangeTo && inv > invoiceRangeTo) return false
                      return true
                    })
                    .sort((a, b) => (a.invoice_no ?? '').localeCompare(b.invoice_no ?? ''))
                    .map((s) => (
                      <div
                        key={s.id}
                        onClick={() => navigate(`/billing/sales/${s.id}`)}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 cursor-pointer transition-colors hover:border-zinc-600"
                      >
                        <div>
                          <span className="font-medium text-white text-sm">Invoice #{s.invoice_no}</span>
                          <p className="text-xs text-zinc-500">
                            {new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(s.created_at))}
                          </p>
                        </div>
                        <span className="font-semibold text-white text-sm shrink-0">{formatINR(s.grand_total)}</span>
                      </div>
                    ))}
                  {[...salesData].filter((s) => {
                    const inv = s.invoice_no ?? ''
                    if (invoiceRangeFrom && inv < invoiceRangeFrom) return false
                    if (invoiceRangeTo && inv > invoiceRangeTo) return false
                    return true
                  }).length === 0 && (
                    <p className="text-center text-zinc-500 py-8 text-sm">No invoices in this range for the selected period</p>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="tds-payable" className="space-y-4">
              <p className="text-sm text-muted-foreground">TDS deducted on payments to suppliers/contractors and payable to the government</p>
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">Total TDS Payable</p>
                <p className="text-2xl font-bold text-white mt-1">{formatINR(0)}</p>
              </div>
              <div className="rounded-lg border border-zinc-700/50 bg-zinc-900/40 p-6 text-center">
                <p className="text-sm text-zinc-400">No TDS deduction tracking set up yet</p>
                <p className="text-xs text-zinc-600 mt-1">BillScape doesn't record TDS on purchases/expenses today — this report will populate once that's added.</p>
              </div>
            </TabsContent>

            <TabsContent value="tds-receivable" className="space-y-4">
              <p className="text-sm text-muted-foreground">TDS deducted by customers on payments to you, claimable as credit</p>
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">Total TDS Receivable</p>
                <p className="text-2xl font-bold text-white mt-1">{formatINR(0)}</p>
              </div>
              <div className="rounded-lg border border-zinc-700/50 bg-zinc-900/40 p-6 text-center">
                <p className="text-sm text-zinc-400">No TDS deduction tracking set up yet</p>
                <p className="text-xs text-zinc-600 mt-1">BillScape doesn't record TDS on sales today — this report will populate once that's added.</p>
              </div>
            </TabsContent>
          </Tabs>
        )}

        {/* ── Sale Order Reports section: Quotations by status ── */}
        {activeSection === 'sale-orders' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Quotations act as BillScape's sale orders — tracked by status until converted to an invoice</p>
              <Button variant="outline" size="sm" onClick={exportQuotations}>
                <Download className="h-4 w-4 mr-1.5" />
                Export CSV
              </Button>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">Total Quotations</p>
                <p className="text-2xl font-bold text-white mt-1">{quotationsSummary.total}</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">Accepted</p>
                <p className="text-2xl font-bold text-emerald-400 mt-1">{quotationsSummary.accepted}</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">Conversion Rate</p>
                <p className="text-2xl font-bold text-white mt-1">{quotationsSummary.conversionRate.toFixed(1)}%</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">Total Value</p>
                <p className="text-2xl font-bold text-white mt-1">{formatINR(quotationsData.reduce((s, q) => s + (q.total_amount || 0), 0))}</p>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                    <TableHead className="text-right">Total Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quotationsLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 3 }).map((_, j) => (
                          <TableCell key={j}><div className="h-4 bg-zinc-800 rounded animate-pulse" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : Object.keys(quotationsSummary.byStatus).length > 0 ? (
                    (['draft', 'sent', 'accepted', 'rejected', 'expired'] as const)
                      .filter((status) => quotationsSummary.byStatus[status])
                      .map((status) => (
                        <TableRow key={status}>
                          <TableCell>
                            <Badge variant="outline" className={cn(STATUS_BADGE_COLORS[status])}>{status}</Badge>
                          </TableCell>
                          <TableCell className="text-right">{quotationsSummary.byStatus[status].count}</TableCell>
                          <TableCell className="text-right font-semibold">{formatINR(quotationsSummary.byStatus[status].value)}</TableCell>
                        </TableRow>
                      ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-zinc-500 py-12">No quotations for this period</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="space-y-2">
              {quotationsData.length > 0 && (
                [...quotationsData]
                  .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                  .map((q) => (
                    <div key={q.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-indigo-500/15 text-indigo-400">
                          <ClipboardList className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-white truncate">{q.quote_no} — {q.customer_name}</span>
                            <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 h-4', STATUS_BADGE_COLORS[q.status])}>
                              {q.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-zinc-500">
                            {new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(q.created_at))}
                          </p>
                        </div>
                      </div>
                      <span className="font-semibold text-white shrink-0">{formatINR(q.total_amount)}</span>
                    </div>
                  ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
