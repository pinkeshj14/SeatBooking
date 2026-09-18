'use client';

import { useEffect, useState } from 'react';
import { format, parse, isValid } from 'date-fns';
import { Calendar as CalendarIcon, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const DISPLAY_FORMAT = 'dd/MM/yyyy';

interface Props {
  value: Date;
  onChange: (date: Date) => void;
  /** Matcher shared by both the typed-text validation and the calendar popup. */
  disabled?: (date: Date) => boolean;
  /** Fully disables typing and the calendar trigger, e.g. while a navigation is pending. */
  loading?: boolean;
  className?: string;
  id?: string;
}

/**
 * A date field that can be set either by typing dd/mm/yyyy directly or by
 * picking from the calendar icon's popup — not just click-to-open-calendar.
 * Typed input is validated against the same `disabled` rule as the
 * calendar (e.g. booking window, weekends, already-booked dates); invalid
 * or disallowed input reverts to the last valid value on blur/Enter.
 */
export function DateInput({ value, onChange, disabled, loading = false, className, id }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(() => format(value, DISPLAY_FORMAT));

  // Keep the visible text in sync when the value changes from outside
  // (calendar pick, or the parent resetting/clamping it), but not on every
  // keystroke — only when we're not actively mid-edit.
  useEffect(() => {
    setText(format(value, DISPLAY_FORMAT));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.getTime()]);

  function commit(raw: string) {
    const parsed = parse(raw.trim(), DISPLAY_FORMAT, new Date());
    if (isValid(parsed) && !(disabled && disabled(parsed))) {
      onChange(parsed);
      setText(format(parsed, DISPLAY_FORMAT));
    } else {
      setText(format(value, DISPLAY_FORMAT));
    }
  }

  return (
    <div className={cn('relative', className)}>
      <Input
        id={id}
        inputMode="numeric"
        placeholder="dd/mm/yyyy"
        value={text}
        disabled={loading}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit(text);
          }
        }}
        className="pr-9"
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={loading}
            className="absolute right-0 top-0 h-full px-2.5 text-muted-foreground hover:text-foreground"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CalendarIcon className="h-4 w-4" />
            )}
            <span className="sr-only">Open calendar</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            selected={value}
            onSelect={(d) => {
              if (!d) return;
              onChange(d);
              setText(format(d, DISPLAY_FORMAT));
              setOpen(false);
            }}
            disabled={disabled}
            autoFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
