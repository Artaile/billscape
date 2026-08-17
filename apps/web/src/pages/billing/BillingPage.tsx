import { useSearchParams } from 'react-router-dom'
import { POSTab } from '@/components/billing/POSTab'
import { HistoryTab } from '@/components/billing/HistoryTab'

export function BillingPage() {
  const [searchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') === 'history' ? 'history' : 'pos'

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {activeTab === 'pos' ? <POSTab /> : <HistoryTab />}
    </div>
  )
}
