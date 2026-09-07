'use client';

import { cn } from '@/lib/utils';
import { SEAT_STATUS_STYLES } from '@/lib/seat-status';
import type { SeatStatus } from '@/types/database';

interface Props {
  seatNumber: string;
  status: SeatStatus;
  occupantName: string | null;
  isActive: boolean;
  /** Reserved for its owner but not yet booked — shown with a dashed border and "(reserved)" instead of solid "booked". */
  isReservedPending?: boolean;
  onClick: () => void;
}

/**
 * Seat number and occupant name are both always rendered (not hidden behind
 * hover/tooltip) so the floor map is fully readable at a glance.
 */
export function SeatCell({ seatNumber, status, occupantName, isActive, isReservedPending, onClick }: Props) {
  const style = SEAT_STATUS_STYLES[status];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!isActive}
      className={cn(
        'flex min-h-[4.5rem] w-full flex-col items-center justify-center gap-0.5 rounded-lg border p-1.5 text-center transition-colors',
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
          'line-clamp-2 w-full break-words text-[9px] font-medium leading-tight sm:text-[10px]',
          occupantName ? style.text || 'text-muted-foreground' : 'italic text-muted-foreground/70'
        )}
      >
        {occupantName ? (isReservedPending ? `${occupantName} (reserved)` : occupantName) : 'Available'}
      </span>
    </button>
  );
}
