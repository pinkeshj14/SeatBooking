import { format } from 'date-fns';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import { FloorMap } from '@/components/floor-map/floor-map';
import { DateAndLocationControls } from '@/components/shared/date-and-location-controls';
import { MySeatPanel } from '@/components/dashboard/my-seat-panel';
import { groupConsecutiveDates } from '@/lib/date-ranges';
import { getFloorPlanUrl } from '@/lib/floor-plan-url';
import type { SeatMapRow } from '@/types/database';

interface SearchParams {
  location?: string;
  date?: string;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { location, date } = await searchParams;
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: locations } = await supabase.from('locations').select('*').order('code');
  const activeLocation =
    locations?.find((l) => l.id === location) ??
    locations?.find((l) => l.id === profile.default_location_id) ??
    locations?.[0];

  const viewingDateStr = date || format(new Date(), 'yyyy-MM-dd');
  const viewingDate = new Date(`${viewingDateStr}T00:00:00`);

  const { data: seatMap, error } = activeLocation
    ? await supabase.rpc('get_seat_map', {
        p_location_id: activeLocation.id,
        p_date: viewingDateStr,
      })
    : { data: [] as SeatMapRow[], error: null };

  const today = format(new Date(), 'yyyy-MM-dd');

  const { data: releaseRows } = await supabase
    .from('seat_releases')
    .select('id, start_date, end_date, reason, seats(seat_number)')
    .eq('user_id', profile.id)
    .gte('end_date', today)
    .order('start_date');

  const { data: bookingRows } = await supabase
    .from('bookings')
    .select('booking_date, seat_id, seats(seat_number), locations(name)')
    .eq('user_id', profile.id)
    .eq('status', 'CONFIRMED')
    .neq('seat_id', profile.default_seat_id ?? '00000000-0000-0000-0000-000000000000')
    .gte('booking_date', today)
    .order('booking_date');

  const bookingsBySeat = new Map<string, { seat_number: string; location_name: string; dates: string[] }>();
  for (const row of bookingRows ?? []) {
    const seat = row.seats;
    const loc = row.locations;
    const key = row.seat_id;
    if (!bookingsBySeat.has(key)) {
      bookingsBySeat.set(key, {
        seat_number: seat?.seat_number ?? '—',
        location_name: loc?.name ?? '—',
        dates: [],
      });
    }
    bookingsBySeat.get(key)!.dates.push(row.booking_date);
  }

  const bookingRanges = Array.from(bookingsBySeat.entries()).flatMap(([seatId, info]) =>
    groupConsecutiveDates(info.dates).map((range) => ({
      seat_id: seatId,
      seat_number: info.seat_number,
      location_name: info.location_name,
      start_date: range.start,
      end_date: range.end,
    }))
  );

  let defaultSeatNumber: string | null = null;
  if (profile.default_seat_id) {
    const { data: defaultSeatRow } = await supabase
      .from('seats')
      .select('seat_number')
      .eq('id', profile.default_seat_id)
      .single();
    defaultSeatNumber = defaultSeatRow?.seat_number ?? null;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My Floor Map</h1>
        <p className="text-sm text-muted-foreground">
          View seat availability, release your seat, or book one elsewhere.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load seat map: {error.message}
        </div>
      )}

      {locations && locations.length > 0 && activeLocation ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <DateAndLocationControls
              locations={locations}
              selectedLocationId={activeLocation.id}
              selectedDate={viewingDate}
            />
            <FloorMap
              seatMap={(seatMap as SeatMapRow[]) ?? []}
              locationId={activeLocation.id}
              cols={activeLocation.layout_config?.cols ?? 10}
              layoutMode={activeLocation.layout_mode}
              floorPlanUrl={getFloorPlanUrl(supabase, activeLocation.floor_plan_path)}
              currentUserId={profile.id}
              currentUserDefaultLocationId={profile.default_location_id}
              viewingDate={viewingDate}
            />
          </div>

          <MySeatPanel
            defaultSeatNumber={defaultSeatNumber}
            defaultLocationName={locations.find((l) => l.id === profile.default_location_id)?.name ?? null}
            releases={(releaseRows ?? []).map((r) => ({
              id: r.id,
              seat_number: r.seats?.seat_number ?? '—',
              start_date: r.start_date,
              end_date: r.end_date,
              reason: r.reason,
            }))}
            bookings={bookingRanges}
          />
        </div>
      ) : (
        <p className="text-muted-foreground">No locations configured yet.</p>
      )}
    </div>
  );
}
