'use client';

import { cn } from '@/lib/utils';
import { getSeatStyle, firstName } from '@/lib/seat-status';
import type { SeatStatus } from '@/types/database';

interface Props {
  seatNumber: string;
  status: SeatStatus;
  occupantName: string | null;
  isActive: boolean;
  /** Reserved for its owner but not yet booked — shown in red (vs. purple "Booked") with a dashed border; see legend. */
  isReservedPending?: boolean;
  onClick: () => void;
}

/**
 * Seat number and occupant's first name are both always rendered (not
 * hidden behind hover/tooltip) so the floor map is readable at a glance —
 * full name is still available via the title tooltip on hover.
 */
export function SeatCell({ seatNumber, status, occupantName, isActive, isReservedPending, onClick }: Props) {
  const style = getSeatStyle(status, isReservedPending);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!isActive}
      title={occupantName ? `${seatNumber} — ${occupantName}` : seatNumber}
      className={cn(
        'flex min-h-[3.75rem] w-full flex-col items-center justify-center gap-0.5 rounded-lg border px-1 py-1.5 text-center transition-colors',
        isActive ? style.bg : 'bg-muted/40 opacity-50',
        isActive ? style.border : 'border-dashed border-muted-foreground/30',
        isActive && isReservedPending && 'border-dashed',
        isActive ? style.text : '',
        isActive ? 'cursor-pointer' : 'cursor-not-allowed'
      )}
    >
      <span className="text-[11px] font-bold leading-tight sm:text-xs">{seatNumber}</span>
      <span
        className={cn(
          'max-w-full truncate text-[9px] font-medium leading-tight sm:text-[10px]',
          occupantName ? style.text || 'text-muted-foreground' : 'italic text-muted-foreground/70'
        )}
      >
        {occupantName ? firstName(occupantName) : 'Available'}
      </span>
    </button>
  );
}
