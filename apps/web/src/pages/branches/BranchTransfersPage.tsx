import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRightLeft,
  Plus,
  Truck,
  CheckCircle2,
  Clock,
  XCircle,
  FileText,
  Printer,
  Calendar,
  AlertTriangle,
  Building2,
  Warehouse,
  Store,
  Loader2,
  Trash2,
  Send,
  Download,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useBranch } from '@/contexts/BranchContext'
import { supabase } from '@/lib/supabase'
import {
  getBranches,
  createTransfer,
  dispatchTransfer,
  receiveTransfer,
  cancelTransfer,
} from '@billscape/api'
import type { Branch, BranchTransfer, BranchTransferStatus } from '@billscape/core'
import { formatINR } from '@billscape/core'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { formatDate } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

interface TransferLineItem {
  product_id: string
  product_name: string
  qty: number
  available_stock: number
  unit_cost: number
  unit_symbol?: string
}

export function BranchTransfersPage() {
  const { org, user } = useAuth()
  const orgId = org?.id
  const queryClient = useQueryClient()
  const { branches } = useBranch()

  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [viewTransfer, setViewTransfer] = useState<any | null>(null)

  // New Transfer Form State
  const [fromBranchId, setFromBranchId] = useState<string>('')
  const [toBranchId, setToBranchId] = useState<string>('')
  const [transferDate, setTransferDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [vehicleNo, setVehicleNo] = useState('')
  const [driverContact, setDriverContact] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<TransferLineItem[]>([])
  const [selectedProductId, setSelectedProductId] = useState('')

  // Query Products for selection
  const { data: products = [] } = useQuery({
    queryKey: ['transfer-products', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('products')
        .select('id, name, sku, cost_price, unit:unit_id(symbol), inventory(stock_qty)')
        .eq('organization_id', orgId!)
        .order('name')
      return data || []
    },
  })

  // Query source branch inventory when fromBranchId changes
  const { data: sourceInventory = [] } = useQuery({
    queryKey: ['source-branch-inventory', fromBranchId],
    enabled: !!fromBranchId,
    queryFn: async () => {
      const { data } = await supabase
        .from('branch_inventory')
        .select('product_id, stock_qty')
        .eq('branch_id', fromBranchId)
      return data || []
    },
  })

  // Query Transfers List
  const { data: transfers = [], isLoading } = useQuery({
    queryKey: ['branch-transfers', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('branch_transfers')
        .select(`
          *,
          from_branch:from_branch_id(id, name, code, branch_type, address, phone),
          to_branch:to_branch_id(id, name, code, branch_type, address, phone),
          items:branch_transfer_items(id, product_id, qty, unit_cost, product:product_id(name, sku, unit:unit_id(symbol)))
        `)
        .eq('organization_id', orgId!)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data || []
    },
  })

  // Create Transfer Mutation
  const createMutation = useMutation({
    mutationFn: async (autoDispatch: boolean) => {
      if (!orgId || !user) throw new Error('Not logged in')
      if (!fromBranchId) throw new Error('Select source branch')
      if (!toBranchId) throw new Error('Select destination branch')
      if (fromBranchId === toBranchId) throw new Error('Source and destination cannot be the same')
      if (items.length === 0) throw new Error('Add at least one item to transfer')

      return createTransfer(supabase, {
        organization_id: orgId,
        from_branch_id: fromBranchId,
        to_branch_id: toBranchId,
        transfer_date: transferDate,
        vehicle_no: vehicleNo,
        driver_contact: driverContact,
        notes: notes,
        created_by: user.id,
        auto_dispatch: autoDispatch,
        items: items.map((i) => ({
          product_id: i.product_id,
          qty: i.qty,
          unit_cost: i.unit_cost,
        })),
      })
    },
    onSuccess: (_, autoDispatch) => {
      queryClient.invalidateQueries({ queryKey: ['branch-transfers', orgId] })
      queryClient.invalidateQueries({ queryKey: ['branch_inventory'] })
      queryClient.invalidateQueries({ queryKey: ['branches'] })
      toast.success(autoDispatch ? 'Transfer created & dispatched' : 'Transfer draft saved')
      setCreateDialogOpen(false)
    },
    onError: (err: Error) => toast.error('Failed to create transfer', err.message),
  })

  // Dispatch Mutation
  const dispatchMutation = useMutation({
    mutationFn: (transferId: string) => dispatchTransfer(supabase, transferId, user!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branch-transfers', orgId] })
      queryClient.invalidateQueries({ queryKey: ['branch_inventory'] })
      toast.success('Stock dispatched (in transit)')
    },
    onError: (err: Error) => toast.error('Dispatch failed', err.message),
  })

  // Receive Mutation
  const receiveMutation = useMutation({
    mutationFn: (transferId: string) => receiveTransfer(supabase, transferId, user!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branch-transfers', orgId] })
      queryClient.invalidateQueries({ queryKey: ['branch_inventory'] })
      toast.success('Stock received at destination branch')
    },
    onError: (err: Error) => toast.error('Receive failed', err.message),
  })

  // Cancel Mutation
  const cancelMutation = useMutation({
    mutationFn: (transferId: string) => cancelTransfer(supabase, transferId, user!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branch-transfers', orgId] })
      queryClient.invalidateQueries({ queryKey: ['branch_inventory'] })
      toast.success('Transfer cancelled')
    },
    onError: (err: Error) => toast.error('Cancel failed', err.message),
  })

  const openNewTransferDialog = () => {
    const defaultFrom = branches.find((b) => b.is_default)?.id || branches[0]?.id || ''
    const defaultTo = branches.find((b) => b.id !== defaultFrom)?.id || ''
    setFromBranchId(defaultFrom)
    setToBranchId(defaultTo)
    setTransferDate(new Date().toISOString().slice(0, 10))
    setVehicleNo('')
    setDriverContact('')
    setNotes('')
    setItems([])
    setSelectedProductId('')
    setCreateDialogOpen(true)
  }

  const handleAddItem = (productId: string) => {
    if (!productId) return
    const prod: any = products.find((p: any) => p.id === productId)
    if (!prod) return

    const existing = items.find((i) => i.product_id === productId)
    if (existing) {
      toast.error('Item already in transfer list')
      return
    }

    const srcStock = sourceInventory.find((s: any) => s.product_id === productId)?.stock_qty ?? 0

    setItems((prev) => [
      ...prev,
      {
        product_id: prod.id,
        product_name: prod.name,
        qty: 1,
        available_stock: srcStock,
        unit_cost: prod.cost_price || 0,
        unit_symbol: prod.unit?.symbol || 'pcs',
      },
    ])
    setSelectedProductId('')
  }

  const updateItemQty = (productId: string, qty: number) => {
    setItems((prev) =>
      prev.map((i) => (i.product_id === productId ? { ...i, qty: Math.max(1, qty) } : i))
    )
  }

  const removeItem = (productId: string) => {
    setItems((prev) => prev.filter((i) => i.product_id !== productId))
  }

  const filteredTransfers = transfers.filter((t: any) => {
    if (statusFilter === 'all') return true
    return t.status === statusFilter
  })

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <ArrowRightLeft className="h-6 w-6 text-primary" />
            Inter-Branch Stock Transfers (IBT)
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Move inventory between retail stores, central godowns, and warehouses with full gate pass tracking.
          </p>
        </div>

        <Button onClick={openNewTransferDialog} size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          New Stock Transfer
        </Button>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-xs font-medium">Total Transfers</span>
            <FileText className="h-4 w-4 text-primary" />
          </div>
          <p className="text-2xl font-bold text-foreground">{transfers.length}</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-xs font-medium">In Transit</span>
            <Truck className="h-4 w-4 text-amber-400" />
          </div>
          <p className="text-2xl font-bold text-foreground">
            {transfers.filter((t: any) => t.status === 'in_transit').length}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-xs font-medium">Received / Complete</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-foreground">
            {transfers.filter((t: any) => t.status === 'received').length}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-xs font-medium">Drafts</span>
            <Clock className="h-4 w-4 text-zinc-400" />
          </div>
          <p className="text-2xl font-bold text-foreground">
            {transfers.filter((t: any) => t.status === 'draft').length}
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between">
        <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-auto">
          <TabsList>
            <TabsTrigger value="all">All Transfers</TabsTrigger>
            <TabsTrigger value="draft">Drafts</TabsTrigger>
            <TabsTrigger value="in_transit">In Transit</TabsTrigger>
            <TabsTrigger value="received">Received</TabsTrigger>
            <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Transfers Table / List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filteredTransfers.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <Truck className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-50" />
          <h3 className="font-semibold text-foreground">No stock transfers found</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            Create an inter-branch transfer to move stock from your warehouse or main store to other branches.
          </p>
          <Button onClick={openNewTransferDialog} size="sm" className="mt-4 gap-2">
            <Plus className="h-4 w-4" /> Create First Transfer
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
          <table className="w-full text-xs">
            <thead className="bg-secondary/40 border-b border-border">
              <tr>
                <th className="text-left p-3 font-semibold text-muted-foreground">Transfer No &amp; Date</th>
                <th className="text-left p-3 font-semibold text-muted-foreground">From (Source)</th>
                <th className="text-left p-3 font-semibold text-muted-foreground">To (Destination)</th>
                <th className="text-left p-3 font-semibold text-muted-foreground">Items</th>
                <th className="text-left p-3 font-semibold text-muted-foreground">Status</th>
                <th className="text-right p-3 font-semibold text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredTransfers.map((t: any) => {
                const itemCount = t.items?.length || 0
                const totalUnits = t.items?.reduce((sum: number, i: any) => sum + Number(i.qty), 0) || 0

                return (
                  <tr key={t.id} className="hover:bg-secondary/20 transition-colors">
                    <td className="p-3">
                      <p className="font-mono font-bold text-foreground text-xs">{t.transfer_no}</p>
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Calendar className="h-3 w-3" />
                        {formatDate(t.transfer_date)}
                      </p>
                    </td>

                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-foreground">{t.from_branch?.name}</span>
                        <Badge variant="outline" className="text-[9px] px-1 py-0">{t.from_branch?.code}</Badge>
                      </div>
                    </td>

                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-foreground">{t.to_branch?.name}</span>
                        <Badge variant="outline" className="text-[9px] px-1 py-0">{t.to_branch?.code}</Badge>
                      </div>
                    </td>

                    <td className="p-3">
                      <p className="font-medium text-foreground">{itemCount} items</p>
                      <p className="text-[10px] text-muted-foreground">{totalUnits} total units</p>
                    </td>

                    <td className="p-3">
                      {t.status === 'received' && (
                        <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                          Received
                        </Badge>
                      )}
                      {t.status === 'in_transit' && (
                        <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 flex items-center gap-1 w-fit">
                          <Truck className="h-3 w-3" /> In Transit
                        </Badge>
                      )}
                      {t.status === 'draft' && (
                        <Badge variant="secondary">Draft</Badge>
                      )}
                      {t.status === 'cancelled' && (
                        <Badge variant="destructive">Cancelled</Badge>
                      )}
                    </td>

                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* View / Print Gate Pass */}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => setViewTransfer(t)}
                        >
                          <Printer className="h-3.5 w-3.5" /> Gate Pass
                        </Button>

                        {/* Dispatch Button */}
                        {t.status === 'draft' && (
                          <Button
                            size="sm"
                            className="h-7 text-xs gap-1 bg-amber-600 hover:bg-amber-700 text-white"
                            onClick={() => {
                              if (confirm(`Dispatch transfer ${t.transfer_no}? Stock will be deducted from ${t.from_branch?.name}.`)) {
                                dispatchMutation.mutate(t.id)
                              }
                            }}
                          >
                            <Send className="h-3 w-3" /> Dispatch
                          </Button>
                        )}

                        {/* Receive Button */}
                        {t.status === 'in_transit' && (
                          <Button
                            size="sm"
                            className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={() => {
                              if (confirm(`Confirm receipt of transfer ${t.transfer_no} at ${t.to_branch?.name}? Stock will be added.`)) {
                                receiveMutation.mutate(t.id)
                              }
                            }}
                          >
                            <CheckCircle2 className="h-3 w-3" /> Receive
                          </Button>
                        )}

                        {/* Cancel Button */}
                        {(t.status === 'draft' || t.status === 'in_transit') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-red-400 hover:text-red-400"
                            title="Cancel Transfer"
                            onClick={() => {
                              if (confirm(`Cancel transfer ${t.transfer_no}?`)) {
                                cancelMutation.mutate(t.id)
                              }
                            }}
                          >
                            <XCircle className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* New Transfer Modal */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5 text-primary" />
              New Inter-Branch Stock Transfer
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Source & Destination Branches */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-secondary/30 border border-border">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-xs font-semibold">
                  <Warehouse className="h-3.5 w-3.5 text-amber-400" />
                  From Branch / Warehouse (Source) *
                </Label>
                <select
                  value={fromBranchId}
                  onChange={(e) => {
                    setFromBranchId(e.target.value)
                    setItems([]) // Reset items if source changes
                  }}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.code}) - {b.branch_type}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-xs font-semibold">
                  <Store className="h-3.5 w-3.5 text-emerald-400" />
                  To Branch / Location (Destination) *
                </Label>
                <select
                  value={toBranchId}
                  onChange={(e) => setToBranchId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {branches
                    .filter((b) => b.id !== fromBranchId)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.code}) - {b.branch_type}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {/* Date & Transport Info */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Transfer Date</Label>
                <Input
                  type="date"
                  value={transferDate}
                  onChange={(e) => setTransferDate(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Vehicle / Courier No</Label>
                <Input
                  placeholder="e.g. TN-09-AB-1234"
                  value={vehicleNo}
                  onChange={(e) => setVehicleNo(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Driver / Contact Phone</Label>
                <Input
                  placeholder="e.g. 9876543210"
                  value={driverContact}
                  onChange={(e) => setDriverContact(e.target.value)}
                />
              </div>
            </div>

            {/* Product Selector */}
            <div className="border-t border-border pt-4">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">
                Add Products to Transfer
              </Label>

              <div className="flex gap-2 mb-3">
                <select
                  value={selectedProductId}
                  onChange={(e) => {
                    setSelectedProductId(e.target.value)
                    handleAddItem(e.target.value)
                  }}
                  className="flex h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">-- Select Product to Add --</option>
                  {products.map((p: any) => {
                    const srcStock = sourceInventory.find((s: any) => s.product_id === p.id)?.stock_qty ?? 0
                    return (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.sku ? `(${p.sku})` : ''} — Available: {srcStock}
                      </option>
                    )
                  })}
                </select>
              </div>

              {/* Items Table */}
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-secondary/40 border-b border-border">
                    <tr>
                      <th className="text-left p-2.5">Product</th>
                      <th className="text-center p-2.5">Available Stock</th>
                      <th className="text-center p-2.5 w-28">Transfer Qty</th>
                      <th className="text-right p-2.5">Unit Cost</th>
                      <th className="w-8 p-2.5"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {items.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center p-6 text-muted-foreground">
                          No items added yet. Select a product above to add.
                        </td>
                      </tr>
                    ) : (
                      items.map((item) => (
                        <tr key={item.product_id}>
                          <td className="p-2.5 font-medium text-foreground">
                            {item.product_name}
                          </td>
                          <td className="p-2.5 text-center text-muted-foreground">
                            {item.available_stock} {item.unit_symbol}
                          </td>
                          <td className="p-2.5 text-center">
                            <Input
                              type="number"
                              min="1"
                              value={item.qty}
                              onChange={(e) => updateItemQty(item.product_id, parseFloat(e.target.value) || 1)}
                              className="h-7 text-center font-bold"
                            />
                          </td>
                          <td className="p-2.5 text-right font-mono">
                            {formatINR(item.unit_cost)}
                          </td>
                          <td className="p-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => removeItem(item.product_id)}
                              className="text-red-400 hover:text-red-300 p-1"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Transfer Notes / Remarks</Label>
              <Input
                placeholder="Reason for transfer, special delivery instructions..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="flex justify-between sm:justify-between items-center">
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>

            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => createMutation.mutate(false)}
                disabled={createMutation.isPending || items.length === 0}
              >
                Save as Draft
              </Button>

              <Button
                onClick={() => createMutation.mutate(true)}
                disabled={createMutation.isPending || items.length === 0}
                className="gap-1.5"
              >
                <Send className="h-4 w-4" />
                Dispatch Immediately
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Printable Delivery Challan / Gate Pass Modal */}
      {viewTransfer && (
        <Dialog open={!!viewTransfer} onOpenChange={() => setViewTransfer(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader className="no-print">
              <DialogTitle className="flex items-center justify-between">
                <span>Stock Transfer Gate Pass / Delivery Challan</span>
                <Button size="sm" onClick={() => window.print()} className="gap-1.5">
                  <Printer className="h-4 w-4" /> Print Challan
                </Button>
              </DialogTitle>
            </DialogHeader>

            <div className="p-4 border rounded-lg bg-white text-black text-xs font-sans space-y-4 print:p-0 print:border-none">
              {/* Challan Header */}
              <div className="text-center border-b pb-3">
                <h2 className="text-base font-bold uppercase">{org?.name || 'BillScape Store'}</h2>
                <p className="text-[10px] text-gray-600">INTER-BRANCH STOCK TRANSFER DELIVERY CHALLAN</p>
                <div className="flex justify-between items-center mt-3 text-left">
                  <div>
                    <p><strong>Transfer No:</strong> {viewTransfer.transfer_no}</p>
                    <p><strong>Date:</strong> {formatDate(viewTransfer.transfer_date)}</p>
                  </div>
                  <div className="text-right">
                    <p><strong>Status:</strong> <span className="uppercase font-semibold">{viewTransfer.status}</span></p>
                    {viewTransfer.vehicle_no && <p><strong>Vehicle No:</strong> {viewTransfer.vehicle_no}</p>}
                  </div>
                </div>
              </div>

              {/* Source & Destination */}
              <div className="grid grid-cols-2 gap-4 border-b pb-3">
                <div>
                  <p className="font-bold text-gray-800">DISPATCHED FROM (SOURCE):</p>
                  <p className="font-semibold text-sm">{viewTransfer.from_branch?.name}</p>
                  <p className="text-[10px] text-gray-600">{viewTransfer.from_branch?.address}</p>
                  {viewTransfer.from_branch?.phone && <p className="text-[10px]">Ph: {viewTransfer.from_branch.phone}</p>}
                </div>
                <div>
                  <p className="font-bold text-gray-800">DELIVERY TO (DESTINATION):</p>
                  <p className="font-semibold text-sm">{viewTransfer.to_branch?.name}</p>
                  <p className="text-[10px] text-gray-600">{viewTransfer.to_branch?.address}</p>
                  {viewTransfer.to_branch?.phone && <p className="text-[10px]">Ph: {viewTransfer.to_branch.phone}</p>}
                </div>
              </div>

              {/* Items Table */}
              <table className="w-full border-collapse border border-gray-300 text-xs">
                <thead>
                  <tr className="bg-gray-100 border-b border-gray-300 text-left">
                    <th className="p-2 border-r border-gray-300 w-10">#</th>
                    <th className="p-2 border-r border-gray-300">Item Description</th>
                    <th className="p-2 border-r border-gray-300 text-center w-24">Qty</th>
                    <th className="p-2 text-right w-28">Unit Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {viewTransfer.items?.map((it: any, index: number) => (
                    <tr key={it.id} className="border-b border-gray-300">
                      <td className="p-2 border-r border-gray-300">{index + 1}</td>
                      <td className="p-2 border-r border-gray-300 font-medium">
                        {it.product?.name || 'Item'}
                      </td>
                      <td className="p-2 border-r border-gray-300 text-center font-bold">
                        {it.qty} {it.product?.unit?.symbol || 'pcs'}
                      </td>
                      <td className="p-2 text-right font-mono">
                        {formatINR(it.unit_cost || 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {viewTransfer.notes && (
                <p className="text-[11px] text-gray-700"><strong>Notes:</strong> {viewTransfer.notes}</p>
              )}

              {/* Signature Lines */}
              <div className="grid grid-cols-3 gap-4 pt-10 text-center text-[10px] border-t border-gray-300 mt-6">
                <div>
                  <div className="border-t border-gray-400 pt-1">
                    <p className="font-semibold">Dispatched By</p>
                  </div>
                </div>
                <div>
                  <div className="border-t border-gray-400 pt-1">
                    <p className="font-semibold">Driver / Carrier Sign</p>
                  </div>
                </div>
                <div>
                  <div className="border-t border-gray-400 pt-1">
                    <p className="font-semibold">Received &amp; Verified By</p>
                  </div>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
