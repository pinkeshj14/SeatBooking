'use client';

import { useState, useTransition } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { Calendar as CalendarIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
  const [dateOpen, setDateOpen] = useState(false);
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

      <Popover open={dateOpen} onOpenChange={setDateOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-full justify-start sm:w-[220px]" disabled={pending}>
            {pending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CalendarIcon className="mr-2 h-4 w-4" />
            )}
            {format(selectedDate, 'EEEE, LLL d, y')}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(d) => {
              if (!d) return;
              updateParam('date', format(d, 'yyyy-MM-dd'));
              setDateOpen(false);
            }}
            autoFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
