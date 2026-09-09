'use client';

import { cn } from '@/lib/utils';
import { deriveSeatStatus, SEAT_STATUS_STYLES, firstName } from '@/lib/seat-status';
import type { SeatMapRow } from '@/types/database';

interface Props {
  seatMap: SeatMapRow[];
  floorPlanUrl: string;
  currentUserId: string;
  onSeatClick: (seat: SeatMapRow) => void;
}

/**
 * Seats placed by percentage (x, y) over an uploaded floor plan image, in
 * lieu of the uniform CSS grid. Each marker always shows the seat number and
 * occupant's first name directly (full name via the title tooltip) — sized
 * to fit a short name on one line without wrapping or overlapping neighbors.
 */
export function ImageSeats({ seatMap, floorPlanUrl, currentUserId, onSeatClick }: Props) {
  return (
    <div className="overflow-auto rounded-xl border bg-card p-2">
      <div className="relative inline-block min-w-full align-top">
        {/* eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL, not a local asset */}
        <img src={floorPlanUrl} alt="Floor plan" className="block h-auto w-full select-none" draggable={false} />

        {seatMap.map((seat) => {
          const status = deriveSeatStatus(seat, currentUserId);
          const style = SEAT_STATUS_STYLES[status];
          const x = seat.pos_x ?? 2;
          const y = seat.pos_y ?? 2;

          return (
            <button
              key={seat.seat_id}
              type="button"
              onClick={() => onSeatClick(seat)}
              disabled={!seat.is_active}
              title={seat.occupant_name ? `${seat.seat_number} — ${seat.occupant_name}` : seat.seat_number}
              style={{ left: `${x}%`, top: `${y}%` }}
              className={cn(
                'absolute flex min-w-[3rem] max-w-[5rem] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-md border-2 px-1 py-1 text-center shadow-sm transition-transform sm:min-w-[3.5rem]',
                seat.is_active ? 'cursor-pointer hover:z-10 hover:scale-105' : 'cursor-not-allowed opacity-50',
                seat.is_active ? style.bg : 'bg-muted',
                seat.is_active ? style.border : 'border-dashed border-muted-foreground/40',
                seat.is_active && seat.is_reserved_pending && 'border-dashed',
                seat.is_active ? style.text : ''
              )}
            >
              <span className="text-[9px] font-bold leading-tight sm:text-[10px]">{seat.seat_number}</span>
              <span
                className={cn(
                  'max-w-full truncate text-[8px] font-medium leading-tight sm:text-[9px]',
                  seat.occupant_name ? '' : 'italic opacity-70'
                )}
              >
                {seat.occupant_name ? firstName(seat.occupant_name) : 'Available'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
