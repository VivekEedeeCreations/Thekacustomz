import { useSearchParams } from 'react-router-dom';

import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useExchanges } from '@/features/exchanges/queries';
import { useOrders } from '@/features/orders/queries';
import { useReturns } from '@/features/returns/queries';

import { DispatchTab } from './dispatch-tab';
import { ExchangesTab } from './exchanges-tab';
import { OrdersTab } from './orders-tab';
import { ReturnsTab } from './returns-tab';

const TABS = ['orders', 'dispatch', 'returns', 'exchanges'] as const;
type TabKey = (typeof TABS)[number];

function isTab(value: string | null): value is TabKey {
  return TABS.includes(value as TabKey);
}

function Count({ n }: { n: number }) {
  if (n === 0) return null;
  return (
    <Badge variant="secondary" className="ml-1.5 px-1.5 py-0">
      {n}
    </Badge>
  );
}

export function OrdersPage() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab: TabKey = isTab(requested) ? requested : 'orders';

  const { data: orders, isLoading } = useOrders();
  const { data: returns } = useReturns();
  const { data: exchanges } = useExchanges();
  const all = orders ?? [];

  const toDispatch = all.filter((o) => o.status === 'NEW' || o.status === 'DISPATCH_READY').length;
  const returnsOpen = (returns ?? []).filter(
    (r) => r.status === 'REQUESTED' || r.status === 'AUTHORIZED',
  ).length;
  const exchangesOpen = (exchanges ?? []).filter(
    (x) => x.status === 'REQUESTED' || x.status === 'APPROVED' || x.status === 'DISPATCHED',
  ).length;

  return (
    <div>
      <PageHeader
        title="Orders"
        description="Fulfil Amazon, Flipkart, Meesho, Shopify and Instagram orders — link AWBs, scan to dispatch, and handle returns and exchanges."
      />
      <Tabs
        value={tab}
        onValueChange={(next) =>
          setParams(next === 'orders' ? {} : { tab: next }, { replace: true })
        }
      >
        <div className="overflow-x-auto">
          <TabsList>
            <TabsTrigger value="orders">Orders</TabsTrigger>
            <TabsTrigger value="dispatch">
              Dispatch
              <Count n={toDispatch} />
            </TabsTrigger>
            <TabsTrigger value="returns">
              Returns
              <Count n={returnsOpen} />
            </TabsTrigger>
            <TabsTrigger value="exchanges">
              Exchange
              <Count n={exchangesOpen} />
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="orders" className="mt-4">
          <OrdersTab orders={all} isLoading={isLoading} />
        </TabsContent>
        <TabsContent value="dispatch" className="mt-4">
          <DispatchTab orders={all} isLoading={isLoading} />
        </TabsContent>
        <TabsContent value="returns" className="mt-4">
          <ReturnsTab orders={all} />
        </TabsContent>
        <TabsContent value="exchanges" className="mt-4">
          <ExchangesTab orders={all} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
