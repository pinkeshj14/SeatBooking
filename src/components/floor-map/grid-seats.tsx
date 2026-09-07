'use client';

import { useMemo } from 'react';
import { SeatCell } from '@/components/floor-map/seat-cell';
import { deriveSeatStatus } from '@/lib/seat-status';
import type { SeatMapRow } from '@/types/database';

interface Props {
  seatMap: SeatMapRow[];
  cols: number;
  currentUserId: string;
  onSeatClick: (seat: SeatMapRow) => void;
}

export function GridSeats({ seatMap, cols, currentUserId, onSeatClick }: Props) {
  const ordered = useMemo(() => {
    const byRow = new Map<number, SeatMapRow[]>();
    for (const seat of seatMap) {
      const row = byRow.get(seat.row_idx) ?? [];
      row.push(seat);
      byRow.set(seat.row_idx, row);
    }
    return Array.from(byRow.entries())
      .sort(([a], [b]) => a - b)
      .flatMap(([, seats]) => seats.sort((a, b) => a.col_idx - b.col_idx));
  }, [seatMap]);

  return (
    <div className="overflow-x-auto rounded-xl border bg-card p-4">
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(5rem, 1fr))`, minWidth: cols * 80 }}
      >
        {ordered.map((seat) => (
          <SeatCell
            key={seat.seat_id}
            seatNumber={seat.seat_number}
            status={deriveSeatStatus(seat, currentUserId)}
            occupantName={seat.occupant_name}
            isActive={seat.is_active}
            isReservedPending={seat.is_reserved_pending}
            onClick={() => onSeatClick(seat)}
          />
        ))}
      </div>
    </div>
  );
}
