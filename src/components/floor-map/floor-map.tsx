'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { GridSeats } from '@/components/floor-map/grid-seats';
import { ImageSeats } from '@/components/floor-map/image-seats';
import { SeatDetailsDialog } from '@/components/floor-map/seat-details-dialog';
import { FloorMapLegend } from '@/components/floor-map/legend';
import { deriveSeatStatus } from '@/lib/seat-status';
import type { LayoutMode, SeatMapRow } from '@/types/database';
import type { BookingWindow } from '@/types/booking-window';

interface Employee {
  id: string;
  full_name: string;
}

interface Props {
  seatMap: SeatMapRow[];
  locationId: string;
  cols: number;
  layoutMode: LayoutMode;
  floorPlanUrl: string | null;
  currentUserId: string;
  currentUserDefaultLocationId: string | null;
  viewingDate: Date;
  isAdmin?: boolean;
  employees?: Employee[];
  /** Employee-facing booking window (next 3 working days); omitted/null for admin, who is unrestricted. */
  bookingWindow?: BookingWindow | null;
}

export function FloorMap({
  seatMap,
  locationId,
  cols,
  layoutMode,
  floorPlanUrl,
  currentUserId,
  currentUserDefaultLocationId,
  viewingDate,
  isAdmin = false,
  employees = [],
  bookingWindow = null,
}: Props) {
  const router = useRouter();
  const [selectedSeat, setSelectedSeat] = useState<SeatMapRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`floor-map:${locationId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings', filter: `location_id=eq.${locationId}` },
        () => router.refresh()
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'seat_releases' }, () =>
        router.refresh()
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'seat_requests' }, () =>
        router.refresh()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [locationId, router]);

  function openSeat(seat: SeatMapRow) {
    setSelectedSeat(seat);
    setDialogOpen(true);
  }

  return (
    <div className="space-y-4">
      <FloorMapLegend />

      {layoutMode === 'image' && floorPlanUrl ? (
        <ImageSeats
          seatMap={seatMap}
          floorPlanUrl={floorPlanUrl}
          currentUserId={currentUserId}
          onSeatClick={openSeat}
        />
      ) : (
        <GridSeats seatMap={seatMap} cols={cols} currentUserId={currentUserId} onSeatClick={openSeat} />
      )}

      <SeatDetailsDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        seat={selectedSeat}
        status={selectedSeat ? deriveSeatStatus(selectedSeat, currentUserId) : 'AVAILABLE'}
        selectedDate={viewingDate}
        currentUserId={currentUserId}
        isCrossLocation={currentUserDefaultLocationId !== null && currentUserDefaultLocationId !== locationId}
        isAdmin={isAdmin}
        employees={employees}
        bookingWindow={bookingWindow}
      />
    </div>
  );
}
