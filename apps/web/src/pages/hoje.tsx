import { useSearchParams } from 'react-router-dom';

import { TodayWorkspace } from '../features/today/today-workspace';
import { todayIsoDate } from '../utils/date';

export function HojePage() {
  const [searchParams] = useSearchParams();
  const requestedDate = searchParams.get('date');
  const date = requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
    ? requestedDate
    : todayIsoDate();

  return (
    <TodayWorkspace
      date={date}
      initialInboxOpen={searchParams.get('inbox') === 'open'}
    />
  );
}
