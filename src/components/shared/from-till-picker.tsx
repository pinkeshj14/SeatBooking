'use client';

import { Label } from '@/components/ui/label';
import { DateInput } from '@/components/shared/date-input';
import { cn } from '@/lib/utils';

interface Props {
  from: Date;
  till: Date;
  onChange: (range: { from: Date; till: Date }) => void;
  disabledBefore?: Date;
  disabledAfter?: Date;
  /** Disable Saturdays/Sundays — used for the daily-booking flows, not release. */
  disableWeekends?: boolean;
  /** Exact dates to disable outright — e.g. dates the user already has a confirmed booking on. */
  disabledDates?: Date[];
  className?: string;
}

function isWeekend(date: Date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function sameDate(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * Two explicit date fields (From / Till) rather than a single combined range
 * calendar — defaults to the same day (a 1-day release/booking) and makes it
 * obvious you can extend the "Till" date for a longer range. Each field is
 * typeable (dd/mm/yyyy) via DateInput, in addition to the calendar popup.
 */
export function FromTillPicker({
  from,
  till,
  onChange,
  disabledBefore,
  disabledAfter,
  disableWeekends = false,
  disabledDates,
  className,
}: Props) {
  function isDisabled(date: Date, minDate?: Date) {
    if (disabledBefore && date < disabledBefore) return true;
    if (minDate && date < minDate) return true;
    if (disabledAfter && date > disabledAfter) return true;
    if (disableWeekends && isWeekend(date)) return true;
    if (disabledDates?.some((d) => sameDate(d, date))) return true;
    return false;
  }

  function handleFromChange(date: Date) {
    // Keep till >= from.
    const nextTill = till < date ? date : till;
    onChange({ from: date, till: nextTill });
  }

  function handleTillChange(date: Date) {
    const nextFrom = from > date ? date : from;
    onChange({ from: nextFrom, till: date });
  }

  return (
    <div className={cn('grid grid-cols-2 gap-3', className)}>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">From</Label>
        <DateInput value={from} onChange={handleFromChange} disabled={(d) => isDisabled(d)} />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Till</Label>
        <DateInput value={till} onChange={handleTillChange} disabled={(d) => isDisabled(d, from)} />
      </div>
    </div>
  );
}
