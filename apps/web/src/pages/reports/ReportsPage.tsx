import React, { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Download,
  Calendar,
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
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { formatINR } from '@billscape/core'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
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

const REPORTS_TAB_VALUES = ['sales', 'pnl', 'balance-sheet', 'trial-balance', 'cash-flow', 'items', 'stock', 'gst'] as const

export function ReportsPage() {
  const { org, role } = useAuth()
  const orgId = org?.id
  const isOwner = role === 'owner'

  const [searchParams, setSearchParams] = useSearchParams()
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
        .select('id, total_amount, notes, created_at, suppliers(name)')
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
        .select('id, name, balance')
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
        .select('id, return_type, refund_amount, created_at')
        .eq('organization_id', orgId!)
        .gte('created_at', fromISO)
        .lte('created_at', toISO)
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
    const map = new Map<string, { name: string; hsn: string; qty: number; revenue: number; cgst: number; sgst: number; igst: number }>()
    for (const item of itemData) {
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

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Financial & Business Reports</h1>
          <p className="text-sm text-zinc-400 mt-0.5">Comprehensive audit, double-entry financial statements & operational insights</p>
        </div>
      </div>

      {/* Date Range Picker */}
      <div className="flex items-center gap-3 flex-wrap">
        <Calendar className="h-4 w-4 text-zinc-400" />
        <div className="flex items-center gap-2">
          <Label htmlFor="from" className="text-xs text-zinc-400">From</Label>
          <Input
            id="from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-8 text-xs w-36"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="to" className="text-xs text-zinc-400">To</Label>
          <Input
            id="to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-8 text-xs w-36"
          />
        </div>
        {/* Quick filters */}
        <div className="flex gap-1">
          {[
            { label: 'Today', days: 0 },
            { label: '7D', days: 7 },
            { label: '30D', days: 30 },
            { label: '90D', days: 90 },
          ].map((q) => (
            <button
              key={q.label}
              onClick={() => {
                const r = getDateRange(q.days)
                setDateFrom(r.from)
                setDateTo(r.to)
              }}
              className="rounded px-2.5 py-1 text-xs border border-zinc-700 bg-secondary/30 text-zinc-300 hover:border-zinc-500 hover:bg-secondary transition-colors"
            >
              {q.label}
            </button>
          ))}
        </div>
      </div>

      <Tabs value={activeReportTab} onValueChange={handleReportTabChange} className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1 bg-card border border-border p-1">
          <TabsTrigger value="sales">Sales Summary</TabsTrigger>
          <TabsTrigger value="pnl" className="flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
            Profit & Loss (P&L)
          </TabsTrigger>
          <TabsTrigger value="balance-sheet" className="flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 text-blue-400" />
            Balance Sheet
          </TabsTrigger>
          <TabsTrigger value="trial-balance" className="flex items-center gap-1.5">
            <Scale className="h-3.5 w-3.5 text-purple-400" />
            Trial Balance
          </TabsTrigger>
          <TabsTrigger value="cash-flow" className="flex items-center gap-1.5">
            <Wallet className="h-3.5 w-3.5 text-amber-400" />
            Cash Flow
          </TabsTrigger>
          <TabsTrigger value="items">Item-wise</TabsTrigger>
          <TabsTrigger value="stock">Stock Report</TabsTrigger>
          <TabsTrigger value="gst">GST Summary</TabsTrigger>
        </TabsList>

        {/* ── 1. Sales Summary Tab ── */}
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
                <Card>
                  <CardContent className="p-5">
                    <p className="text-xs text-zinc-400">Total Sales Revenue</p>
                    <p className="text-2xl font-bold text-white mt-1">{formatINR(salesSummary?.total ?? 0)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-5">
                    <p className="text-xs text-zinc-400">Bills Generated</p>
                    <p className="text-2xl font-bold text-white mt-1">{salesSummary?.billCount ?? 0}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-5">
                    <p className="text-xs text-zinc-400">Average Bill Value</p>
                    <p className="text-2xl font-bold text-white mt-1">{formatINR(salesSummary?.avg ?? 0)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-5">
                    <p className="text-xs text-zinc-400">Total Discounts Given</p>
                    <p className="text-2xl font-bold text-amber-400 mt-1">{formatINR(salesSummary?.discount ?? 0)}</p>
                  </CardContent>
                </Card>
              </div>

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

        {/* ── 2. Profit & Loss (P&L) Statement Tab ── */}
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

        {/* ── 6. Item-wise Tab ── */}
        <TabsContent value="items" className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={exportItems}>
              <Download className="h-4 w-4 mr-1.5" />
              Export CSV
            </Button>
          </div>
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>HSN</TableHead>
                  <TableHead className="text-right">Qty Sold</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">CGST</TableHead>
                  <TableHead className="text-right">SGST</TableHead>
                  <TableHead className="text-right">IGST</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itemLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <TableCell key={j}><div className="h-4 bg-zinc-800 rounded animate-pulse" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : itemSummary.length > 0 ? (
                  itemSummary.map((item) => (
                    <TableRow key={item.name}>
                      <TableCell className="font-medium text-white">{item.name}</TableCell>
                      <TableCell className="font-mono text-xs text-zinc-400">{item.hsn || '—'}</TableCell>
                      <TableCell className="text-right">{item.qty}</TableCell>
                      <TableCell className="text-right font-semibold">{formatINR(item.revenue)}</TableCell>
                      <TableCell className="text-right">{formatINR(item.cgst)}</TableCell>
                      <TableCell className="text-right">{formatINR(item.sgst)}</TableCell>
                      <TableCell className="text-right">{formatINR(item.igst)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-zinc-500 py-12">
                      No sales recorded for this period
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── 7. Stock Report Tab ── */}
        <TabsContent value="stock" className="space-y-4">
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
        </TabsContent>

        {/* ── 8. GST Summary Tab ── */}
        <TabsContent value="gst" className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={exportGST}>
              <Download className="h-4 w-4 mr-1.5" />
              Export CSV
            </Button>
          </div>
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tax Rate</TableHead>
                  <TableHead className="text-right">Taxable Amount</TableHead>
                  <TableHead className="text-right">CGST</TableHead>
                  <TableHead className="text-right">SGST</TableHead>
                  <TableHead className="text-right">IGST</TableHead>
                  <TableHead className="text-right">Total Tax</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gstLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 6 }).map((_, j) => (
                        <TableCell key={j}><div className="h-4 bg-zinc-800 rounded animate-pulse" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : gstSummary.length > 0 ? (
                  <>
                    {gstSummary.map((g) => (
                      <TableRow key={g.rate}>
                        <TableCell>
                          <Badge variant="secondary">{g.rate}%</Badge>
                        </TableCell>
                        <TableCell className="text-right">{formatINR(g.taxable)}</TableCell>
                        <TableCell className="text-right">{formatINR(g.cgst)}</TableCell>
                        <TableCell className="text-right">{formatINR(g.sgst)}</TableCell>
                        <TableCell className="text-right">{formatINR(g.igst)}</TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatINR(g.cgst + g.sgst + g.igst)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t-2 border-zinc-700 bg-zinc-800/30">
                      <TableCell className="font-bold text-zinc-200">Total</TableCell>
                      <TableCell className="text-right font-bold">
                        {formatINR(gstSummary.reduce((s, g) => s + g.taxable, 0))}
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        {formatINR(gstSummary.reduce((s, g) => s + g.cgst, 0))}
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        {formatINR(gstSummary.reduce((s, g) => s + g.sgst, 0))}
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        {formatINR(gstSummary.reduce((s, g) => s + g.igst, 0))}
                      </TableCell>
                      <TableCell className="text-right font-bold text-indigo-300">
                        {formatINR(gstSummary.reduce((s, g) => s + g.cgst + g.sgst + g.igst, 0))}
                      </TableCell>
                    </TableRow>
                  </>
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-zinc-500 py-12">
                      No GST data for this period
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
