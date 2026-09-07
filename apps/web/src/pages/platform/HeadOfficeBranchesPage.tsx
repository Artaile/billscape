import React, { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useBranch } from '@/contexts/BranchContext'
import { getStockTransfers } from '@billscape/api'
import { supabase } from '@/lib/supabase'
import type { StockTransfer } from '@billscape/core'
import {
  Building2,
  Store,
  Warehouse,
  Truck,
  TrendingUp,
  Package,
  Users,
  ShieldCheck,
  MapPin,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export function HeadOfficeBranchesPage() {
  const { org } = useAuth()
  const { branches } = useBranch()
  const [transfers, setTransfers] = useState<StockTransfer[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (org?.id) {
      getStockTransfers(supabase, org.id)
        .then(setTransfers)
        .catch(console.error)
        .finally(() => setLoading(false))
    }
  }, [org?.id])

  const retailBranches = branches.filter((b) => b.type === 'retail_branch' || b.is_main)
  const warehouses = branches.filter((b) => b.type === 'warehouse')

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Head Office Central Control</h1>
            <Badge className="bg-emerald-600 text-white gap-1 text-xs">
              <ShieldCheck className="w-3.5 h-3.5" /> All Locations View
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Central monitoring across all store locations, central warehouses, and logistics transport.
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-xl border bg-card p-4 space-y-1 shadow-sm">
          <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Total Locations</p>
          <div className="flex items-baseline justify-between">
            <p className="text-2xl font-bold">{branches.length}</p>
            <Building2 className="w-5 h-5 text-primary" />
          </div>
          <p className="text-xs text-muted-foreground">{retailBranches.length} Stores • {warehouses.length} Warehouses</p>
        </div>

        <div className="rounded-xl border bg-card p-4 space-y-1 shadow-sm">
          <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Active Shipments</p>
          <div className="flex items-baseline justify-between">
            <p className="text-2xl font-bold">
              {transfers.filter((t) => t.status === 'open_in_transit').length}
            </p>
            <Truck className="w-5 h-5 text-amber-500" />
          </div>
          <p className="text-xs text-muted-foreground">In-Transit goods transfers</p>
        </div>

        <div className="rounded-xl border bg-card p-4 space-y-1 shadow-sm">
          <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Discrepancies</p>
          <div className="flex items-baseline justify-between">
            <p className="text-2xl font-bold text-destructive">
              {transfers.filter((t) => t.status === 'pending_discrepancy').length}
            </p>
            <Package className="w-5 h-5 text-destructive" />
          </div>
          <p className="text-xs text-muted-foreground">Shipments with missing items</p>
        </div>

        <div className="rounded-xl border bg-card p-4 space-y-1 shadow-sm">
          <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Branch Network</p>
          <div className="flex items-baseline justify-between">
            <p className="text-2xl font-bold text-emerald-600">Active</p>
            <TrendingUp className="w-5 h-5 text-emerald-600" />
          </div>
          <p className="text-xs text-muted-foreground">Synced in real-time</p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="locations" className="space-y-4">
        <TabsList>
          <TabsTrigger value="locations">Locations Directory ({branches.length})</TabsTrigger>
          <TabsTrigger value="transfers">Logistics Master Audit ({transfers.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="locations" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {branches.map((b) => (
              <div key={b.id} className="rounded-xl border bg-card p-4 space-y-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {b.type === 'warehouse' ? (
                      <Warehouse className="w-4 h-4 text-primary" />
                    ) : (
                      <Store className="w-4 h-4 text-amber-600" />
                    )}
                    <span className="font-semibold">{b.name}</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-mono">{b.code}</Badge>
                </div>

                {b.city && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>{b.city}</span>
                  </div>
                )}

                <div className="pt-2 border-t flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Type: <strong className="capitalize">{b.type.replace('_', ' ')}</strong></span>
                  <Badge className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 text-[10px]">
                    Online
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="transfers">
          <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted text-xs uppercase font-semibold text-muted-foreground border-b">
                <tr>
                  <th className="p-3">Ticket #</th>
                  <th className="p-3">Sender Branch</th>
                  <th className="p-3">Receiver Branch</th>
                  <th className="p-3">Vehicle #</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y text-xs">
                {transfers.map((t) => (
                  <tr key={t.id}>
                    <td className="p-3 font-mono font-medium">{t.transfer_no}</td>
                    <td className="p-3">{t.sender_branch?.name || 'Sender'}</td>
                    <td className="p-3 font-semibold text-primary">{t.receiver_branch?.name || 'Receiver'}</td>
                    <td className="p-3">{t.vehicle_number || 'N/A'}</td>
                    <td className="p-3">
                      <Badge variant="outline">{t.status.replace('_', ' ')}</Badge>
                    </td>
                    <td className="p-3 text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
