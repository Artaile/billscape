import { useSearchParams } from 'react-router-dom'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { POSTab } from '@/components/billing/POSTab'
import { HistoryTab } from '@/components/billing/HistoryTab'

export function BillingPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const activeTab = tabParam === 'history' ? 'history' : 'pos'

  const handleTabChange = (value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('tab', value)
      return next
    }, { replace: true })
  }

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-border px-3 pt-2">
        <TabsList>
          <TabsTrigger value="pos">POS</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="pos" className="flex-1 overflow-hidden mt-0">
        <POSTab />
      </TabsContent>
      <TabsContent value="history" className="flex-1 overflow-hidden mt-0">
        <HistoryTab />
      </TabsContent>
    </Tabs>
  )
}
