'use client';

import { useTransition } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { DateInput } from '@/components/shared/date-input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

interface Location {
  id: string;
  name: string;
  code: string;
}

interface Props {
  locations: Location[];
  selectedLocationId: string;
  selectedDate: Date;
}

export function DateAndLocationControls({ locations, selectedLocationId, selectedDate }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    // startTransition keeps this navigation non-blocking and gives us
    // `pending` to show immediate feedback — without it, clicking a new
    // location/date visibly does nothing until the server response lands.
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between', pending && 'opacity-60')}>
      <div className="flex items-center gap-2">
        <Tabs value={selectedLocationId} onValueChange={(v) => updateParam('location', v)}>
          <TabsList>
            {locations.map((loc) => (
              <TabsTrigger key={loc.id} value={loc.id} disabled={pending}>
                {loc.name}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {pending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      <div className="flex items-center gap-2 sm:w-[220px]">
        <span className="hidden shrink-0 text-sm text-muted-foreground sm:inline">
          {format(selectedDate, 'EEE')}
        </span>
        <DateInput
          value={selectedDate}
          onChange={(d) => updateParam('date', format(d, 'yyyy-MM-dd'))}
          loading={pending}
          className="w-full"
        />
      </div>
    </div>
  );
}
