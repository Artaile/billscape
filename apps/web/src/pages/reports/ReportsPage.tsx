import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, Calendar, TrendingUp, Package, FileText, BarChart3 } from 'lucide-react'
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

function getDateRange(days: number) {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - days)
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  }
}

export function ReportsPage() {
  const { org, role } = useAuth()
  const orgId = org?.id
  const isOwner = role === 'owner'

  const [dateFrom, setDateFrom] = useState(getDateRange(30).from)
  const [dateTo, setDateTo] = useState(getDateRange(0).to)

  const fromISO = `${dateFrom}T00:00:00.000Z`
  const toISO = `${dateTo}T23:59:59.999Z`

  // Sales summary
  const { data: salesData, isLoading: salesLoading } = useQuery({
    queryKey: ['report-sales', orgId, dateFrom, dateTo],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('sales')
        .select('id, grand_total, discount_total, tax_total, payment_mode, cash_amount, card_amount, upi_amount, created_at')
        .eq('organization_id', orgId!)
        .gte('created_at', fromISO)
        .lte('created_at', toISO)
      return data ?? []
    },
  })

  // Item-wise report
  const { data: itemData, isLoading: itemLoading } = useQuery({
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

  // Stock report
  const { data: stockData, isLoading: stockLoading } = useQuery({
    queryKey: ['report-stock', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('inventory')
        .select('stock_qty, reorder_level, products(name, price, cost_price, categories(name))')
        .eq('organization_id', orgId!)
      return data ?? []
    },
  })

  // GST summary
  const { data: gstData, isLoading: gstLoading } = useQuery({
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

  // Aggregate sales summary
  const salesSummary = React.useMemo(() => {
    if (!salesData) return null
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
  const itemSummary = React.useMemo(() => {
    if (!itemData) return []
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
  const gstSummary = React.useMemo(() => {
    if (!gstData) return []
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

  // CSV export helpers
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
    const rows = stockData.map((row) => {
      const p = row.products as unknown as { name: string; price: number; cost_price: number; categories: { name: string }[] | null } | null
      const base = [
        p?.name ?? '',
        p?.categories?.[0]?.name ?? '',
        row.stock_qty,
        row.reorder_level,
        (p?.price ?? 0).toFixed(2),
      ]
      if (isOwner) {
        base.push((p?.cost_price ?? 0).toFixed(2) as string)
        base.push(((p?.price ?? 0) * row.stock_qty).toFixed(2) as string)
        base.push(((p?.cost_price ?? 0) * row.stock_qty).toFixed(2) as string)
      } else {
        base.push(((p?.price ?? 0) * row.stock_qty).toFixed(2) as string)
      }
      return base
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
    <div className="p-4 lg:p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Reports</h1>
          <p className="text-sm text-zinc-400 mt-0.5">Analyze your business performance</p>
        </div>
      </div>

      {/* Date range picker */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
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
              className="rounded px-2 py-1 text-xs border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 transition-colors"
            >
              {q.label}
            </button>
          ))}
        </div>
      </div>

      <Tabs defaultValue="sales">
        <TabsList className="mb-4">
          <TabsTrigger value="sales">Sales Summary</TabsTrigger>
          <TabsTrigger value="items">Item-wise</TabsTrigger>
          <TabsTrigger value="stock">Stock Report</TabsTrigger>
          <TabsTrigger value="gst">GST Summary</TabsTrigger>
        </TabsList>

        {/* Sales Summary Tab */}
        <TabsContent value="sales">
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={exportSales}>
                <Download className="h-4 w-4" />
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
                      <p className="text-xs text-zinc-400">Total Sales</p>
                      <p className="text-2xl font-bold text-white mt-1">{formatINR(salesSummary?.total ?? 0)}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-5">
                      <p className="text-xs text-zinc-400">Bills</p>
                      <p className="text-2xl font-bold text-white mt-1">{salesSummary?.billCount ?? 0}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-5">
                      <p className="text-xs text-zinc-400">Avg Bill Value</p>
                      <p className="text-2xl font-bold text-white mt-1">{formatINR(salesSummary?.avg ?? 0)}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-5">
                      <p className="text-xs text-zinc-400">Total Tax</p>
                      <p className="text-2xl font-bold text-white mt-1">{formatINR(salesSummary?.tax ?? 0)}</p>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Payment Mode Split</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4">
                      {Object.entries(salesSummary?.paymentSplit ?? {}).map(([mode, amount]) => (
                        amount > 0 && (
                          <div key={mode} className="flex items-center justify-between rounded-lg bg-zinc-800 px-4 py-3">
                            <span className="text-sm capitalize text-zinc-300">{mode}</span>
                            <span className="font-semibold text-indigo-300">{formatINR(amount)}</span>
                          </div>
                        )
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </TabsContent>

        {/* Item-wise Tab */}
        <TabsContent value="items">
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={exportItems}>
                <Download className="h-4 w-4" />
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
                    Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 7 }).map((_, j) => (
                          <TableCell key={j}><div className="h-4 bg-zinc-800 rounded animate-pulse" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : itemSummary.length > 0 ? (
                    itemSummary.map((item) => (
                      <TableRow key={item.name}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell className="text-zinc-500 font-mono text-xs">{item.hsn || '—'}</TableCell>
                        <TableCell className="text-right">{item.qty}</TableCell>
                        <TableCell className="text-right font-semibold">{formatINR(item.revenue)}</TableCell>
                        <TableCell className="text-right text-zinc-400">{formatINR(item.cgst)}</TableCell>
                        <TableCell className="text-right text-zinc-400">{formatINR(item.sgst)}</TableCell>
                        <TableCell className="text-right text-zinc-400">{formatINR(item.igst)}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-zinc-500 py-12">
                        No sales in this period
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* Stock Report Tab */}
        <TabsContent value="stock">
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={exportStock}>
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
            </div>
            {isOwner && (
              <div className="rounded-lg border border-indigo-800 bg-indigo-950/30 px-4 py-3 text-sm text-indigo-300">
                Owner view: cost prices are visible.
              </div>
            )}
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Stock Qty</TableHead>
                    <TableHead className="text-right">Selling Price</TableHead>
                    {isOwner && <TableHead className="text-right">Cost Price</TableHead>}
                    <TableHead className="text-right">Stock Value (Selling)</TableHead>
                    {isOwner && <TableHead className="text-right">Stock Value (Cost)</TableHead>}
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stockLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 6 }).map((_, j) => (
                          <TableCell key={j}><div className="h-4 bg-zinc-800 rounded animate-pulse" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : stockData && stockData.length > 0 ? (
                    stockData.map((row, i) => {
                      const product = (row.products as unknown as { name: string; price: number; cost_price: number; categories: { name: string }[] | null }) ?? null
                      const sellValue = (product?.price ?? 0) * row.stock_qty
                      const costValue = (product?.cost_price ?? 0) * row.stock_qty
                      return (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{product?.name ?? '—'}</TableCell>
                          <TableCell className="text-zinc-400">{product?.categories?.[0]?.name ?? '—'}</TableCell>
                          <TableCell className="text-right">{row.stock_qty}</TableCell>
                          <TableCell className="text-right">{formatINR(product?.price ?? 0)}</TableCell>
                          {isOwner && <TableCell className="text-right text-zinc-400">{formatINR(product?.cost_price ?? 0)}</TableCell>}
                          <TableCell className="text-right font-semibold">{formatINR(sellValue)}</TableCell>
                          {isOwner && <TableCell className="text-right text-zinc-400">{formatINR(costValue)}</TableCell>}
                          <TableCell>
                            {row.stock_qty === 0 ? (
                              <Badge variant="destructive">Out of Stock</Badge>
                            ) : row.stock_qty <= row.reorder_level ? (
                              <Badge variant="warning">Low</Badge>
                            ) : (
                              <Badge variant="success">OK</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-zinc-500 py-12">
                        No inventory data
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* GST Summary Tab */}
        <TabsContent value="gst">
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={exportGST}>
                <Download className="h-4 w-4" />
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
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
