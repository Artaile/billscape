import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Gift, Loader2, Plus, Search, Star, History, ChevronRight, Download, Upload, FileSpreadsheet, ArrowUpDown } from 'lucide-react'
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
import { logActivity } from '@/lib/activityLog'
import { exportToCSV, parseCSV } from '@/lib/csvUtils'

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

  const [sortBy, setSortBy] = useState<'points-desc' | 'points-asc' | 'earned-desc' | 'redeemed-desc' | 'name-asc' | 'name-desc' | 'date-newest' | 'date-oldest'>('points-desc')
  const [pointsFilter, setPointsFilter] = useState('all')
  const [isImporting, setIsImporting] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: rawCustomers = [], isLoading } = useQuery({
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

  // Filter & Sort
  const filtered = rawCustomers
    .filter((c) => {
      if (search.trim()) {
        const q = search.toLowerCase()
        const matchSearch =
          c.customer_name.toLowerCase().includes(q) ||
          (c.customer_phone ?? '').includes(q)
        if (!matchSearch) return false
      }
      if (pointsFilter === 'has-points' && c.points_balance <= 0) return false
      if (pointsFilter === 'zero-points' && c.points_balance > 0) return false
      return true
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'points-desc':
          return b.points_balance - a.points_balance
        case 'points-asc':
          return a.points_balance - b.points_balance
        case 'earned-desc':
          return b.total_points_earned - a.total_points_earned
        case 'redeemed-desc':
          return b.total_points_redeemed - a.total_points_redeemed
        case 'name-asc':
          return a.customer_name.localeCompare(b.customer_name)
        case 'name-desc':
          return b.customer_name.localeCompare(a.customer_name)
        case 'date-newest':
          return (b.created_at || '').localeCompare(a.created_at || '')
        case 'date-oldest':
          return (a.created_at || '').localeCompare(b.created_at || '')
        default:
          return 0
      }
    })

  const handleExportCSV = () => {
    if (!filtered.length) {
      toast.error('No loyalty members to export')
      return
    }
    const headers = ['Customer Name', 'Phone', 'Points Balance', 'Total Points Earned', 'Total Points Redeemed', 'Enrolled Date']
    const rows = filtered.map((c) => [
      c.customer_name,
      c.customer_phone ?? '',
      c.points_balance,
      c.total_points_earned,
      c.total_points_redeemed,
      c.created_at ? new Date(c.created_at).toISOString().slice(0, 10) : '',
    ])
    const dateStr = new Date().toISOString().slice(0, 10)
    exportToCSV(`loyalty-members-${dateStr}`, headers, rows)
    toast.success('Loyalty members exported to CSV')
  }

  const handleDownloadTemplate = () => {
    const headers = ['Customer Name', 'Phone', 'Points Balance', 'Total Points Earned', 'Total Points Redeemed']
    const sampleRows = [
      ['Kumar', '9876543210', '250', '500', '250'],
      ['Lakshmi Store', '9123456789', '1000', '1000', '0'],
    ]
    exportToCSV('loyalty_members_import_template', headers, sampleRows)
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !orgId) return
    setIsImporting(true)
    try {
      const records = await parseCSV(file)
      if (!records.length) {
        toast.error('Import Failed', 'CSV file is empty or invalid format')
        return
      }

      let importedCount = 0
      for (const row of records) {
        const name = row['customer name'] || row['name'] || row['member name'] || ''
        if (!name.trim()) continue

        const rawPhone = row['phone'] || row['mobile'] || row['phone number'] || ''
        const phoneDigits = rawPhone.replace(/\D/g, '').slice(0, 10)
        const pointsBalance = parseInt(row['points balance'] || row['points'] || row['balance'] || '0') || 0
        const totalEarned = parseInt(row['total points earned'] || row['earned'] || String(pointsBalance)) || pointsBalance
        const totalRedeemed = parseInt(row['total points redeemed'] || row['redeemed'] || '0') || 0

        await supabase.from('loyalty_customers').insert({
          organization_id: orgId,
          customer_name: name.trim(),
          customer_phone: phoneDigits || null,
          points_balance: pointsBalance,
          total_points_earned: totalEarned,
          total_points_redeemed: totalRedeemed,
        })
        importedCount++
      }

      await queryClient.invalidateQueries({ queryKey: ['loyalty_customers', orgId] })
      await logActivity({
        organizationId: orgId,
        action: 'imported',
        entity: 'loyalty_customer',
        metadata: { count: importedCount, filename: file.name },
      })
      toast.success(`Import Complete`, `Successfully imported ${importedCount} loyalty members!`)
    } catch (err: any) {
      toast.error('Import Failed', err.message || 'Failed to parse CSV file')
    } finally {
      setIsImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const totalPoints = rawCustomers.reduce((s, c) => s + c.points_balance, 0)
  const totalEarned = rawCustomers.reduce((s, c) => s + c.total_points_earned, 0)

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
      if (!name.trim()) throw new Error('Customer name is required')
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
  const [selectedCustId, setSelectedCustId] = useState('')
  const [historyCustomer, setHistoryCustomer] = useState<LoyaltyCustomer | null>(null)

  const { data: existingCustomers = [] } = useQuery({
    queryKey: ['existing_customers', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('customers')
        .select('id, name, phone')
        .eq('organization_id', orgId!)
        .order('name')
      return data ?? []
    },
  })

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Loyalty Program</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Reward customers with points on every purchase</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setShowImport(true)} disabled={isImporting}>
            {isImporting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Upload className="h-3.5 w-3.5 mr-1 text-indigo-400" />}
            Import CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="h-3.5 w-3.5 mr-1 text-blue-400" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowSettings(true)}>Settings</Button>
          <Button size="sm" onClick={() => setShowAddCustomer(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add Member
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-1"><Star className="h-4 w-4 text-yellow-400" /><span className="text-xs text-muted-foreground">Total Members</span></div>
          <p className="text-2xl font-bold">{rawCustomers.length}</p>
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

      {/* Filters & Sort Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name or phone..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ArrowUpDown className="h-3.5 w-3.5 text-indigo-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="flex h-9 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 text-foreground"
            >
              <option value="points-desc">Sort: Points (High to Low)</option>
              <option value="points-asc">Sort: Points (Low to High)</option>
              <option value="earned-desc">Sort: Earned (High to Low)</option>
              <option value="redeemed-desc">Sort: Redeemed (High to Low)</option>
              <option value="name-asc">Sort: Name (A to Z)</option>
              <option value="name-desc">Sort: Name (Z to A)</option>
              <option value="date-newest">Sort: Enrolled (Newest)</option>
              <option value="date-oldest">Sort: Enrolled (Oldest)</option>
            </select>
          </div>

          <select
            value={pointsFilter}
            onChange={(e) => setPointsFilter(e.target.value)}
            className="flex h-9 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 text-foreground"
          >
            <option value="all">All Members</option>
            <option value="has-points">Has Points (&gt; 0)</option>
            <option value="zero-points">Zero Points (0)</option>
          </select>
        </div>
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
            {existingCustomers.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center justify-between">
                  <span>Select from Existing Customers</span>
                  <span className="text-[10px] text-indigo-400 font-semibold">Optional</span>
                </Label>
                <select
                  value={selectedCustId}
                  onChange={(e) => {
                    const custId = e.target.value
                    setSelectedCustId(custId)
                    const cust = existingCustomers.find((x) => x.id === custId)
                    if (cust) {
                      setNewName(cust.name)
                      setNewPhone(cust.phone ?? '')
                    }
                  }}
                  className="flex h-9 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 text-foreground"
                >
                  <option value="">-- Choose Customer --</option>
                  {existingCustomers.map((cust) => (
                    <option key={cust.id} value={cust.id}>
                      {cust.name} {cust.phone ? `• ${cust.phone}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {existingCustomers.length > 0 && (
              <div className="relative border-t border-border my-1">
                <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-[10px] text-muted-foreground uppercase">
                  Or Enter Details
                </span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Member Name *</Label>
              <Input
                placeholder="Member full name"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value)
                  setSelectedCustId('')
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Phone Number</Label>
              <Input
                placeholder="Mobile number (10 digits)"
                maxLength={10}
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddCustomer(false); setSelectedCustId(''); setNewName(''); setNewPhone('') }}>Cancel</Button>
            <Button
              onClick={() => {
                addCustomerMutation.mutate({ name: newName, phone: newPhone })
                setShowAddCustomer(false)
                setSelectedCustId('')
                setNewName('')
                setNewPhone('')
              }}
              disabled={!newName.trim()}
            >
              Add Member
            </Button>
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

      {/* Import Loyalty Members Modal */}
      <Dialog open={showImport} onOpenChange={setShowImport}>
        <DialogContent className="max-w-md bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-zinc-100">
              <FileSpreadsheet className="h-5 w-5 text-indigo-400" />
              Import Loyalty Members from CSV
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Step 1 */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3.5">
              <div className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-semibold text-indigo-400">
                  1
                </span>
                <div className="space-y-2 flex-1">
                  <div>
                    <p className="text-xs font-semibold text-zinc-200">Download the template</p>
                    <p className="text-[11px] text-zinc-400">Sample CSV format with column headers and example loyalty member rows</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadTemplate}
                    className="w-full text-xs gap-1.5 border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
                  >
                    <Download className="h-3.5 w-3.5 text-emerald-400" />
                    Download Template (CSV)
                  </Button>
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3.5">
              <div className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-semibold text-indigo-400">
                  2
                </span>
                <div className="space-y-2 flex-1">
                  <div>
                    <p className="text-xs font-semibold text-zinc-200">Upload your filled CSV file</p>
                    <p className="text-[11px] text-zinc-400">Select your completed member CSV file to batch import records</p>
                  </div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => {
                      handleFileChange(e)
                      setShowImport(false)
                    }}
                    accept=".csv"
                    className="hidden"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isImporting}
                    className="w-full text-xs gap-1.5 border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
                  >
                    {isImporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 text-indigo-400" />}
                    Choose CSV file
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setShowImport(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
