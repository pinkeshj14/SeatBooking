'use client';

import { useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

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

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <Tabs value={selectedLocationId} onValueChange={(v) => updateParam('location', v)}>
        <TabsList>
          {locations.map((loc) => (
            <TabsTrigger key={loc.id} value={loc.id}>
              {loc.name}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Popover open={dateOpen} onOpenChange={setDateOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-full justify-start sm:w-[220px]">
            <CalendarIcon className="mr-2 h-4 w-4" />
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
