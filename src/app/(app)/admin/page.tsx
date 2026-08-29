import { format } from 'date-fns';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import { FloorMap } from '@/components/floor-map/floor-map';
import { DateAndLocationControls } from '@/components/shared/date-and-location-controls';
import { Card, CardContent } from '@/components/ui/card';
import { getFloorPlanUrl } from '@/lib/floor-plan-url';
import type { SeatMapRow } from '@/types/database';

interface SearchParams {
  location?: string;
  date?: string;
}

export default async function AdminOverviewPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { location, date } = await searchParams;
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: locations } = await supabase.from('locations').select('*').order('code');
  const activeLocation = locations?.find((l) => l.id === location) ?? locations?.[0];

  const viewingDateStr = date || format(new Date(), 'yyyy-MM-dd');
  const viewingDate = new Date(`${viewingDateStr}T00:00:00`);

  const { data: seatMap } = activeLocation
    ? await supabase.rpc('get_seat_map', { p_location_id: activeLocation.id, p_date: viewingDateStr })
    : { data: [] as SeatMapRow[] };

  const { data: employees } = await supabase
    .from('users')
    .select('id, full_name')
    .order('full_name');

  const rows = (seatMap as SeatMapRow[]) ?? [];
  const occupied = rows.filter((r) => r.status === 'OCCUPIED').length;
  const available = rows.filter((r) => r.status === 'AVAILABLE').length;
  const pending = rows.filter((r) => r.pending_request_id).length;
  const occupancyRate = rows.length > 0 ? Math.round((occupied / rows.length) * 100) : 0;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin Overview</h1>
        <p className="text-sm text-muted-foreground">
          Full visual map with override controls. Click any seat to manage it.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Occupied" value={occupied} />
        <StatCard label="Available" value={available} />
        <StatCard label="Pending requests" value={pending} />
        <StatCard label="Occupancy rate" value={`${occupancyRate}%`} />
      </div>

      {locations && locations.length > 0 && activeLocation && (
        <div className="space-y-4">
          <DateAndLocationControls
            locations={locations}
            selectedLocationId={activeLocation.id}
            selectedDate={viewingDate}
          />
          <FloorMap
            seatMap={rows}
            locationId={activeLocation.id}
            cols={activeLocation.layout_config?.cols ?? 10}
            layoutMode={activeLocation.layout_mode}
            floorPlanUrl={getFloorPlanUrl(supabase, activeLocation.floor_plan_path)}
            currentUserId={profile.id}
            currentUserDefaultLocationId={profile.default_location_id}
            viewingDate={viewingDate}
            isAdmin
            employees={employees ?? []}
          />
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
