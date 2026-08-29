'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface Props {
  from: Date;
  till: Date;
  onChange: (range: { from: Date; till: Date }) => void;
  disabledBefore?: Date;
  className?: string;
}

/**
 * Two explicit date fields (From / Till) rather than a single combined range
 * calendar — defaults to the same day (a 1-day release/booking) and makes it
 * obvious you can extend the "Till" date for a longer range.
 */
export function FromTillPicker({ from, till, onChange, disabledBefore, className }: Props) {
  const minDate = disabledBefore;
  const [fromOpen, setFromOpen] = useState(false);
  const [tillOpen, setTillOpen] = useState(false);

  function handleFromChange(date: Date | undefined) {
    if (!date) return;
    // Keep till >= from.
    const nextTill = till < date ? date : till;
    onChange({ from: date, till: nextTill });
    setFromOpen(false);
  }

  function handleTillChange(date: Date | undefined) {
    if (!date) return;
    const nextFrom = from > date ? date : from;
    onChange({ from: nextFrom, till: date });
    setTillOpen(false);
  }

  return (
    <div className={cn('grid grid-cols-2 gap-3', className)}>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">From</Label>
        <Popover open={fromOpen} onOpenChange={setFromOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full justify-start text-left font-normal">
              <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
              {format(from, 'LLL d, y')}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={from}
              onSelect={handleFromChange}
              disabled={minDate ? { before: minDate } : undefined}
              autoFocus
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Till</Label>
        <Popover open={tillOpen} onOpenChange={setTillOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full justify-start text-left font-normal">
              <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
              {format(till, 'LLL d, y')}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={till}
              onSelect={handleTillChange}
              disabled={{ before: from }}
              autoFocus
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
