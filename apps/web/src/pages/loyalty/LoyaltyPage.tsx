import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Gift, Loader2, Plus, Search, Star, History, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { formatINR } from '@billscape/core'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import { toast } from '@/hooks/use-toast'

interface LoyaltyCustomer {
  id: string
  customer_name: string
  customer_phone: string | null
  points_balance: number
  total_points_earned: number
  total_points_redeemed: number
  created_at: string
}

interface LoyaltySetting {
  points_per_rupee: number
  rupees_per_point: number
  min_redeem_points: number
}

export function LoyaltyPage() {
  const { org, user } = useAuth()
  const orgId = org?.id
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [showAdjust, setShowAdjust] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<LoyaltyCustomer | null>(null)
  const [adjustPoints, setAdjustPoints] = useState('')
  const [adjustType, setAdjustType] = useState<'add' | 'redeem'>('add')
  const [adjustNote, setAdjustNote] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings] = useState<LoyaltySetting>({ points_per_rupee: 1, rupees_per_point: 0.5, min_redeem_points: 100 })

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['loyalty_customers', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('loyalty_customers')
        .select('*')
        .eq('organization_id', orgId!)
        .order('points_balance', { ascending: false })
      if (error) throw error
      return (data ?? []) as LoyaltyCustomer[]
    },
  })

  const { data: loyaltySettings } = useQuery({
    queryKey: ['loyalty_settings', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('loyalty_settings')
        .select('*')
        .eq('organization_id', orgId!)
        .maybeSingle()
      if (data) setSettings(data as LoyaltySetting)
      return data as LoyaltySetting | null
    },
  })

  const filtered = search.trim()
    ? customers.filter((c) =>
        c.customer_name.toLowerCase().includes(search.toLowerCase()) ||
        (c.customer_phone ?? '').includes(search)
      )
    : customers

  const totalPoints = customers.reduce((s, c) => s + c.points_balance, 0)
  const totalEarned = customers.reduce((s, c) => s + c.total_points_earned, 0)

  const adjustMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCustomer) return
      const pts = parseInt(adjustPoints)
      if (isNaN(pts) || pts <= 0) throw new Error('Enter valid points')
      if (adjustType === 'redeem' && pts > selectedCustomer.points_balance) throw new Error('Insufficient points balance')

      const delta = adjustType === 'add' ? pts : -pts
      const { error } = await supabase.from('loyalty_customers').update({
        points_balance: selectedCustomer.points_balance + delta,
        total_points_earned: adjustType === 'add' ? selectedCustomer.total_points_earned + pts : selectedCustomer.total_points_earned,
        total_points_redeemed: adjustType === 'redeem' ? selectedCustomer.total_points_redeemed + pts : selectedCustomer.total_points_redeemed,
      }).eq('id', selectedCustomer.id).eq('organization_id', orgId!)
      if (error) throw error

      await supabase.from('loyalty_transactions').insert({
        organization_id: orgId!,
        loyalty_customer_id: selectedCustomer.id,
        type: adjustType,
        points: pts,
        note: adjustNote.trim() || null,
        created_by: user!.id,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loyalty_customers', orgId] })
      toast.success(adjustType === 'add' ? 'Points added' : 'Points redeemed')
      setShowAdjust(false); setAdjustPoints(''); setAdjustNote('')
    },
    onError: (err: Error) => toast.error('Failed', err.message),
  })

  const saveSettingsMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('loyalty_settings').upsert({
        organization_id: orgId!,
        ...settings,
      }, { onConflict: 'organization_id' })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loyalty_settings', orgId] })
      toast.success('Settings saved')
      setShowSettings(false)
    },
    onError: (err: Error) => toast.error('Failed', err.message),
  })

  const addCustomerMutation = useMutation({
    mutationFn: async ({ name, phone }: { name: string; phone: string }) => {
      const { error } = await supabase.from('loyalty_customers').insert({
        organization_id: orgId!,
        customer_name: name.trim(),
        customer_phone: phone.trim() || null,
        points_balance: 0,
        total_points_earned: 0,
        total_points_redeemed: 0,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loyalty_customers', orgId] })
      toast.success('Customer added to loyalty program')
    },
    onError: (err: Error) => toast.error('Failed', err.message),
  })

  const [showAddCustomer, setShowAddCustomer] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [historyCustomer, setHistoryCustomer] = useState<LoyaltyCustomer | null>(null)

  const { data: transactions = [], isLoading: txLoading } = useQuery({
    queryKey: ['loyalty_transactions', orgId, historyCustomer?.id],
    enabled: !!orgId && !!historyCustomer,
    queryFn: async () => {
      const { data } = await supabase
        .from('loyalty_transactions')
        .select('*')
        .eq('organization_id', orgId!)
        .eq('loyalty_customer_id', historyCustomer!.id)
        .order('created_at', { ascending: false })
        .limit(50)
      return data ?? []
    },
  })

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Loyalty Program</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Reward customers with points on every purchase</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowSettings(true)}>Settings</Button>
          <Button onClick={() => setShowAddCustomer(true)}>
            <Plus className="h-4 w-4" /> Add Customer
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-1"><Star className="h-4 w-4 text-yellow-400" /><span className="text-xs text-muted-foreground">Total Members</span></div>
          <p className="text-2xl font-bold">{customers.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-1"><Gift className="h-4 w-4 text-green-400" /><span className="text-xs text-muted-foreground">Points in Circulation</span></div>
          <p className="text-2xl font-bold">{totalPoints.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Points Earned</p>
          <p className="text-2xl font-bold">{totalEarned.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Points Rate</p>
          <p className="text-lg font-bold">{loyaltySettings?.points_per_rupee ?? 1} pt / ₹1</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search by name or phone..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-32"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32">
            <Gift className="h-8 w-8 text-zinc-600 mb-2" />
            <p className="text-sm text-muted-foreground">No loyalty members yet</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Points Balance</TableHead>
                <TableHead className="text-right">Total Earned</TableHead>
                <TableHead className="text-right">Total Redeemed</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <p className="text-sm font-medium text-foreground">{c.customer_name}</p>
                    {c.customer_phone && <p className="text-xs text-muted-foreground">{c.customer_phone}</p>}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="inline-flex items-center gap-1 text-sm font-bold text-yellow-400">
                      <Star className="h-3 w-3" />{c.points_balance.toLocaleString()}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">{c.total_points_earned.toLocaleString()}</TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">{c.total_points_redeemed.toLocaleString()}</TableCell>
                  <TableCell className="text-right text-sm font-medium text-green-400">
                    {formatINR(c.points_balance * (loyaltySettings?.rupees_per_point ?? 0.5))}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="outline" size="sm" className="h-7 text-xs"
                        onClick={() => { setSelectedCustomer(c); setAdjustType('add'); setShowAdjust(true) }}>
                        + Add
                      </Button>
                      <Button variant="outline" size="sm" className="h-7 text-xs"
                        onClick={() => { setSelectedCustomer(c); setAdjustType('redeem'); setShowAdjust(true) }}>
                        Redeem
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                        title="Transaction History"
                        onClick={() => setHistoryCustomer(c)}>
                        <History className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Add Customer Dialog */}
      <Dialog open={showAddCustomer} onOpenChange={setShowAddCustomer}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Loyalty Member</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Name *</Label><Input placeholder="Customer name" value={newName} onChange={(e) => setNewName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Phone</Label><Input placeholder="Phone number" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddCustomer(false)}>Cancel</Button>
            <Button onClick={() => { addCustomerMutation.mutate({ name: newName, phone: newPhone }); setShowAddCustomer(false); setNewName(''); setNewPhone('') }}
              disabled={!newName.trim()}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjust Points Dialog */}
      <Dialog open={showAdjust} onOpenChange={setShowAdjust}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{adjustType === 'add' ? 'Add Points' : 'Redeem Points'}</DialogTitle>
          </DialogHeader>
          {selectedCustomer && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted p-3 text-sm">
                <p className="font-medium">{selectedCustomer.customer_name}</p>
                <p className="text-muted-foreground">Current balance: <span className="text-yellow-400 font-bold">{selectedCustomer.points_balance.toLocaleString()} pts</span></p>
              </div>
              <div className="space-y-1.5">
                <Label>Points to {adjustType === 'add' ? 'Add' : 'Redeem'} *</Label>
                <Input type="number" min={1} placeholder="0" value={adjustPoints} onChange={(e) => setAdjustPoints(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Note (optional)</Label>
                <Input placeholder="Reason..." value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdjust(false)}>Cancel</Button>
            <Button onClick={() => adjustMutation.mutate()} disabled={adjustMutation.isPending}>
              {adjustMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Processing...</> : adjustType === 'add' ? 'Add Points' : 'Redeem'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transaction History Dialog */}
      <Dialog open={!!historyCustomer} onOpenChange={(o) => { if (!o) setHistoryCustomer(null) }}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-4 w-4" />
              {historyCustomer?.customer_name} — Transaction History
            </DialogTitle>
          </DialogHeader>
          {historyCustomer && (
            <div className="flex-1 overflow-y-auto space-y-2">
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="rounded-lg bg-muted p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Balance</p>
                  <p className="text-lg font-bold text-yellow-400">{historyCustomer.points_balance.toLocaleString()}</p>
                </div>
                <div className="rounded-lg bg-muted p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Earned</p>
                  <p className="text-lg font-bold text-emerald-400">{historyCustomer.total_points_earned.toLocaleString()}</p>
                </div>
                <div className="rounded-lg bg-muted p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Redeemed</p>
                  <p className="text-lg font-bold text-orange-400">{historyCustomer.total_points_redeemed.toLocaleString()}</p>
                </div>
              </div>
              {txLoading ? (
                <div className="flex items-center justify-center h-20">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : transactions.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">No transactions yet</div>
              ) : (
                <div className="space-y-2">
                  {transactions.map((tx: any) => (
                    <div key={tx.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold ${tx.type === 'add' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-orange-500/15 text-orange-400'}`}>
                          {tx.type === 'add' ? '+' : '−'}
                        </div>
                        <div>
                          <p className="text-xs font-medium text-foreground capitalize">{tx.type === 'add' ? 'Points Earned' : 'Points Redeemed'}</p>
                          {tx.note && <p className="text-[10px] text-muted-foreground">{tx.note}</p>}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-bold ${tx.type === 'add' ? 'text-emerald-400' : 'text-orange-400'}`}>
                          {tx.type === 'add' ? '+' : '−'}{tx.points.toLocaleString()} pts
                        </p>
                        <p className="text-[10px] text-zinc-600">
                          {new Date(tx.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Loyalty Settings</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Points earned per ₹1 spent</Label>
              <Input type="number" min={0} step="0.1" value={settings.points_per_rupee}
                onChange={(e) => setSettings((s) => ({ ...s, points_per_rupee: Number(e.target.value) }))} />
            </div>
            <div className="space-y-1.5">
              <Label>₹ value per point (for redemption)</Label>
              <Input type="number" min={0} step="0.01" value={settings.rupees_per_point}
                onChange={(e) => setSettings((s) => ({ ...s, rupees_per_point: Number(e.target.value) }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Minimum points to redeem</Label>
              <Input type="number" min={0} value={settings.min_redeem_points}
                onChange={(e) => setSettings((s) => ({ ...s, min_redeem_points: Number(e.target.value) }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSettings(false)}>Cancel</Button>
            <Button onClick={() => saveSettingsMutation.mutate()} disabled={saveSettingsMutation.isPending}>Save Settings</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
