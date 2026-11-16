import { getServerDictionary } from '@/i18n/server';
import { getMyRider } from '@/lib/rider/repository';
import { getMyCareerEvents } from '@/lib/contract/repository';
import { CareerHistoryCard } from '@/components/rider/CareerHistoryCard';

/**
 * História tab — the rider's career timeline from real stored events
 * (career start with the league at that moment, contract signed). It lives
 * only as long as the rider does; manager results are stored elsewhere.
 */
export default async function RiderHistoryPage() {
  const { t } = await getServerDictionary();
  const rider = await getMyRider();
  const events = rider ? await getMyCareerEvents(rider.id) : [];
  return (
    <div className="grid grid-cols-12 gap-3">
      <CareerHistoryCard t={t} events={events} className="col-span-12 lg:col-span-6" />
    </div>
  );
}
