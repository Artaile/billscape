import React, { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { useBranch } from '@/contexts/BranchContext'
import { getStockTransfers, createStockTransfer, acceptStockTransfer, markTransferDiscrepancy, getProducts } from '@billscape/api'
import { supabase } from '@/lib/supabase'
import type { StockTransfer, Product } from '@billscape/core'
import {
  Truck,
  Plus,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Clock,
  Printer,
  Package,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {

  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'

export function StockTransfersPage() {
  const { org, user } = useAuth()
  const { branches, activeBranch, isHeadOffice, refetchBranches } = useBranch()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const [transfers, setTransfers] = useState<StockTransfer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  const [createOpen, setCreateOpen] = useState(false)
  const [gatePassTransfer, setGatePassTransfer] = useState<StockTransfer | null>(null)
  const [discrepancyTransfer, setDiscrepancyTransfer] = useState<StockTransfer | null>(null)

  // Transfer Form State
  const [senderBranchId, setSenderBranchId] = useState('')
  const [receiverBranchId, setReceiverBranchId] = useState('')
  const [vehicleNumber, setVehicleNumber] = useState('')
  const [driverName, setDriverName] = useState('')
  const [driverPhone, setDriverPhone] = useState('')
  const [notes, setNotes] = useState('')

  const [items, setItems] = useState<{ product_id: string; sent_qty: number }[]>([
    { product_id: '', sent_qty: 1 },
  ])

  const [discrepancyNotes, setDiscrepancyNotes] = useState('')
  const [itemReceivedQtys, setItemReceivedQtys] = useState<Record<string, number>>({})

  useEffect(() => {
    if (discrepancyTransfer) {
      const initial: Record<string, number> = {}
      ;(discrepancyTransfer.items || []).forEach((it) => {
        if (it.id) initial[it.id] = it.sent_qty
      })
      setItemReceivedQtys(initial)
      setDiscrepancyNotes('')
    }
  }, [discrepancyTransfer])

  const fetchTransfers = async () => {
    if (!org?.id) return
    try {
      setLoading(true)
      const data = await getStockTransfers(supabase, org.id, isHeadOffice ? undefined : activeBranch?.id)
      setTransfers(data)
    } catch (err: any) {
      console.error('Error loading transfers:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchProductList = async () => {
    if (!org?.id) return
    try {
      const res = await getProducts(supabase, org.id)
      const prodsList = Array.isArray(res) ? res : (res?.data || [])
      setProducts(prodsList as Product[])
    } catch (e) {
      console.error('Error fetching product list:', e)
      setProducts([])
    }
  }


  useEffect(() => {
    fetchTransfers()
    fetchProductList()
  }, [org?.id, activeBranch?.id])

  const [availableProducts, setAvailableProducts] = useState<Product[]>([])

  useEffect(() => {
    if (activeBranch?.id) {
      setSenderBranchId(activeBranch.id)
    }
  }, [activeBranch?.id])

  useEffect(() => {
    async function updateAvailableProducts() {
      const effectiveSenderId = senderBranchId || activeBranch?.id
      if (!org?.id || !effectiveSenderId || products.length === 0) {
        setAvailableProducts(products)
        return
      }

      const senderBranchObj = branches.find((b) => b.id === effectiveSenderId)
      const isSenderHO = senderBranchObj ? (senderBranchObj.is_main || senderBranchObj.type === 'head_office') : isHeadOffice

      if (isSenderHO) {
        setAvailableProducts(products)
      } else {
        const { data: bInvList } = await supabase
          .from('branch_inventory')
          .select('product_id')
          .eq('branch_id', effectiveSenderId)

        const bInvSet = new Set(bInvList?.map((b) => b.product_id) || [])

        const filtered = products.filter((p) => p.branch_id === effectiveSenderId || bInvSet.has(p.id))
        setAvailableProducts(filtered)
      }
    }

    updateAvailableProducts()
  }, [senderBranchId, activeBranch?.id, products, branches, isHeadOffice, org?.id])

  const handleAddItemRow = () => {
    setItems([...items, { product_id: '', sent_qty: 1 }])
  }

  const handleCreateTransfer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!org?.id || !user?.id) return

    const validSenderId = isHeadOffice ? senderBranchId : activeBranch?.id
    if (!validSenderId || !receiverBranchId) {
      toast({ title: 'Validation Error', description: 'Sender and Receiver locations are required.', variant: 'destructive' })
      return
    }

    if (validSenderId === receiverBranchId) {
      toast({ title: 'Validation Error', description: 'Sender and Receiver cannot be the same location.', variant: 'destructive' })
      return
    }

    const validItems = items.filter((i) => i.product_id && i.sent_qty > 0)
    if (validItems.length === 0) {
      toast({ title: 'Validation Error', description: 'Add at least one product with quantity > 0.', variant: 'destructive' })
      return
    }

    try {
      const transfer = await createStockTransfer(supabase, {
        organization_id: org.id,
        sender_branch_id: validSenderId,
        receiver_branch_id: receiverBranchId,
        sender_user_id: user.id,
        vehicle_number: vehicleNumber,
        driver_name: driverName,
        driver_phone: driverPhone,
        notes,
        items: validItems,
      })

      toast({ title: 'Stock Transfer Dispatched', description: `Ticket ${transfer.transfer_no} created.` })
      setCreateOpen(false)
      fetchTransfers()
      refetchBranches()
    } catch (err: any) {
      toast({ title: 'Error Creating Transfer', description: err.message, variant: 'destructive' })
    }
  }

  const handleAcceptTransfer = async (transferId: string) => {
    if (!user?.id) return
    try {
      await acceptStockTransfer(supabase, transferId, user.id)
      toast({ title: 'Stock Received & Accepted', description: 'Inventory added to store stock.' })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      fetchTransfers()
      refetchBranches()
    } catch (err: any) {
      toast({ title: 'Error Accepting Stock', description: err.message, variant: 'destructive' })
    }
  }

  const handleSaveDiscrepancy = async () => {
    if (!discrepancyTransfer || !user?.id) return
    try {
      const recItems = (discrepancyTransfer.items || []).map((it) => ({
        itemId: it.id!,
        receivedQty: itemReceivedQtys[it.id!] ?? it.sent_qty,
      }))

      await markTransferDiscrepancy(supabase, discrepancyTransfer.id, user.id, discrepancyNotes, recItems)
      toast({ title: 'Discrepancy Logged', description: 'Stock updated with actual received quantities.' })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      setDiscrepancyTransfer(null)
      fetchTransfers()
      refetchBranches()
    } catch (err: any) {
      toast({ title: 'Error Logging Discrepancy', description: err.message, variant: 'destructive' })
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Stock Transfers & Gate Pass</h1>
          <p className="text-sm text-muted-foreground">
            Inter-branch goods dispatch, transport gate passes, and discrepancy tracking.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Truck className="w-4 h-4" /> Dispatch Stock Shipment
        </Button>
      </div>

      {/* Inbound Shipment Banner for Receiver Branch */}
      {transfers.some((t) => t.status === 'open_in_transit' && t.receiver_branch_id === activeBranch?.id) && (
        <div className="rounded-xl border bg-amber-500/10 border-amber-500/20 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-amber-600 animate-pulse" />
            <div>
              <h4 className="font-semibold text-sm text-amber-900 dark:text-amber-300">Inbound Stock Shipments</h4>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Inspect received truck quantities before accepting stock into inventory.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Transfer List Table */}
      <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
        <table className="w-full text-sm text-left">
          <thead className="bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b">
            <tr>
              <th className="p-3.5">Ticket #</th>
              <th className="p-3.5">Route (From → To)</th>
              <th className="p-3.5">Transport / Vehicle</th>
              <th className="p-3.5">Status</th>
              <th className="p-3.5">Date</th>
              <th className="p-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {transfers.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground text-sm">
                  No stock transfer shipments logged yet.
                </td>
              </tr>
            ) : (
              transfers.map((t) => {
                // Accept/Discrepancy actions are reserved strictly for the RECEIVER branch location
                const canReceive = t.status === 'open_in_transit' && activeBranch?.id === t.receiver_branch_id

                return (
                  <tr key={t.id} className="hover:bg-muted/30">
                    <td className="p-3.5 font-mono font-medium">{t.transfer_no}</td>
                    <td className="p-3.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{t.sender_branch?.name || 'Sender'}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="font-medium text-primary">{t.receiver_branch?.name || 'Receiver'}</span>
                      </div>
                    </td>
                    <td className="p-3.5 text-xs text-muted-foreground">
                      <div>Vehicle: <strong>{t.vehicle_number || 'N/A'}</strong></div>
                      <div>Driver: {t.driver_name || 'N/A'}</div>
                    </td>
                    <td className="p-3.5">
                      <Badge
                        variant={
                          t.status === 'closed_accepted'
                            ? 'outline'
                            : t.status === 'pending_discrepancy'
                            ? 'destructive'
                            : 'default'
                        }
                        className="text-xs"
                      >
                        {t.status.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="p-3.5 text-xs text-muted-foreground">
                      {new Date(t.created_at).toLocaleDateString()}
                    </td>
                    <td className="p-3.5 text-right space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5"
                        onClick={() => setGatePassTransfer(t)}
                      >
                        <FileText className="w-3.5 h-3.5" /> Gate Pass
                      </Button>

                      {canReceive && (
                        <>
                          <Button
                            size="sm"
                            className="h-8 gap-1"
                            onClick={() => handleAcceptTransfer(t.id)}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Accept
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="h-8 gap-1"
                            onClick={() => setDiscrepancyTransfer(t)}
                          >
                            <AlertTriangle className="w-3.5 h-3.5" /> Discrepancy
                          </Button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Dispatch Transfer Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Dispatch Stock Shipment & Generate Gate Pass</DialogTitle>
            <DialogDescription>
              Transfer products between stores or warehouses and generate a printable Gate Pass.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateTransfer} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>From Location (Sender)</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={isHeadOffice ? senderBranchId : activeBranch?.id}
                  onChange={(e) => setSenderBranchId(e.target.value)}
                  disabled={!isHeadOffice}
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label>To Location (Destination) *</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={receiverBranchId}
                  onChange={(e) => setReceiverBranchId(e.target.value)}
                  required
                >
                  <option value="">Select Destination Location</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.code})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 bg-muted/40 p-3 rounded-lg border">
              <div className="space-y-1">
                <Label className="text-xs">Vehicle Number</Label>
                <Input placeholder="TN-01-AB-1234" value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Driver Name</Label>
                <Input placeholder="Murugan" value={driverName} onChange={(e) => setDriverName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Driver Phone</Label>
                <Input placeholder="9876543210" value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} />
              </div>
            </div>

            {/* Product Items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Shipment Products</Label>
                <Button type="button" variant="ghost" size="sm" onClick={handleAddItemRow} className="h-7 text-xs gap-1">
                  <Plus className="w-3 h-3" /> Add Line
                </Button>
              </div>

              {items.map((it, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <select
                    className="flex h-9 flex-1 rounded-md border border-input bg-background px-3 text-xs"
                    value={it.product_id}
                    onChange={(e) => {
                      const updated = [...items]
                      updated[idx].product_id = e.target.value
                      setItems(updated)
                    }}
                  >
                    <option value="">Select Product</option>
                    {(Array.isArray(availableProducts) ? availableProducts : []).map((p) => (
                      <option key={p.id} value={p.id}>{p.name} (SKU: {p.sku || 'N/A'})</option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    min="1"
                    className="w-24 h-9 text-xs"
                    placeholder="Qty"
                    value={it.sent_qty}
                    onChange={(e) => {
                      const updated = [...items]
                      updated[idx].sent_qty = parseFloat(e.target.value) || 1
                      setItems(updated)
                    }}
                  />
                </div>
              ))}
            </div>

            <DialogFooter className="pt-3 border-t">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit">Dispatch Shipment</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Gate Pass Printable Modal */}
      <Dialog open={!!gatePassTransfer} onOpenChange={() => setGatePassTransfer(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Goods Transport Gate Pass</span>
              <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1 print:hidden">
                <Printer className="w-3.5 h-3.5" /> Print
              </Button>
            </DialogTitle>
          </DialogHeader>

          {gatePassTransfer && (
            <div className="space-y-4 p-4 border rounded-lg bg-card text-xs space-y-3">
              <div className="flex justify-between border-b pb-3">
                <div>
                  <h3 className="font-bold text-sm text-primary">{org?.name}</h3>
                  <p className="text-muted-foreground font-mono">Ticket #: {gatePassTransfer.transfer_no}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">Date: {new Date(gatePassTransfer.created_at).toLocaleDateString()}</p>
                  <Badge variant="outline">{gatePassTransfer.status.replace('_', ' ')}</Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 bg-muted/40 p-3 rounded">
                <div>
                  <p className="font-bold text-muted-foreground uppercase text-[10px]">Sender Location</p>
                  <p className="font-semibold text-sm">{gatePassTransfer.sender_branch?.name}</p>
                </div>
                <div>
                  <p className="font-bold text-muted-foreground uppercase text-[10px]">Destination Location</p>
                  <p className="font-semibold text-sm text-primary">{gatePassTransfer.receiver_branch?.name}</p>
                </div>
              </div>

              <div className="border rounded overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-muted text-[10px] uppercase font-bold">
                    <tr>
                      <th className="p-2">Item</th>
                      <th className="p-2 text-right">Sent Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(gatePassTransfer.items || []).map((it, idx) => (
                      <tr key={idx}>
                        <td className="p-2">{it.product_name || `Product ID ${it.product_id}`}</td>
                        <td className="p-2 text-right font-mono font-bold">{it.sent_qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pt-2 border-t flex justify-between text-muted-foreground">
                <div>Vehicle #: <strong>{gatePassTransfer.vehicle_number || 'N/A'}</strong></div>
                <div>Driver: <strong>{gatePassTransfer.driver_name || 'N/A'} ({gatePassTransfer.driver_phone || 'N/A'})</strong></div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Log Discrepancy Modal */}
      <Dialog open={!!discrepancyTransfer} onOpenChange={() => setDiscrepancyTransfer(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" /> Report Transfer Discrepancy
            </DialogTitle>
            <DialogDescription>
              Record damaged, missing, or mismatched stock received for Ticket #{discrepancyTransfer?.transfer_no}.
            </DialogDescription>
          </DialogHeader>

          {discrepancyTransfer && (
            <div className="space-y-4 py-2 text-xs">
              <div className="border rounded-lg p-3 bg-muted/30 space-y-1">
                <div className="flex justify-between font-semibold">
                  <span>Route: {discrepancyTransfer.sender_branch?.name} → {discrepancyTransfer.receiver_branch?.name}</span>
                  <span className="font-mono">Vehicle: {discrepancyTransfer.vehicle_number || 'N/A'}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold">Inspect Received Items & Update Quantities</Label>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted uppercase font-bold text-[10px] text-muted-foreground border-b">
                      <tr>
                        <th className="p-2.5">Product</th>
                        <th className="p-2.5 text-center">Sent Qty</th>
                        <th className="p-2.5 text-right w-32">Actual Received</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {(discrepancyTransfer.items || []).map((it) => {
                        const prodName = it.product_name || products.find((p) => p.id === it.product_id)?.name || `Product ID ${it.product_id}`
                        return (
                          <tr key={it.id}>
                            <td className="p-2.5 font-medium">{prodName}</td>
                            <td className="p-2.5 text-center font-mono font-bold">{it.sent_qty}</td>
                            <td className="p-2.5 text-right">
                              <Input
                                type="number"
                                min="0"
                                max={it.sent_qty}
                                className="w-24 h-8 text-xs text-right font-mono ml-auto"
                                value={itemReceivedQtys[it.id!] ?? it.sent_qty}
                                onChange={(e) => {
                                  const val = Math.max(0, parseInt(e.target.value) || 0)
                                  setItemReceivedQtys((prev) => ({ ...prev, [it.id!]: val }))
                                }}
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Discrepancy Reason / Notes *</Label>
                <textarea
                  className="w-full rounded-md border border-input bg-background p-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring min-h-[70px]"
                  placeholder="e.g., 2 Colgate Strong Teeth damaged during transit, 55 received clean."
                  value={discrepancyNotes}
                  onChange={(e) => setDiscrepancyNotes(e.target.value)}
                />
              </div>

              <DialogFooter className="pt-3 border-t">
                <Button type="button" variant="outline" onClick={() => setDiscrepancyTransfer(null)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleSaveDiscrepancy}>
                  Log Discrepancy & Accept Stock
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
