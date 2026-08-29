import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getFloorPlanUrl } from '@/lib/floor-plan-url';
import { FloorPlanEditor } from '@/components/admin/floor-plan-editor';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface SearchParams {
  location?: string;
}

export default async function FloorPlanPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { location } = await searchParams;
  const supabase = await createClient();

  const { data: locations } = await supabase
    .from('locations')
    .select('id, name, code, layout_mode, floor_plan_path')
    .order('code');

  const activeLocation = locations?.find((l) => l.id === location) ?? locations?.[0];

  const { data: seats } = activeLocation
    ? await supabase
        .from('seats')
        .select('id, seat_number, pos_x, pos_y')
        .eq('location_id', activeLocation.id)
        .order('seat_number')
    : { data: [] };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Floor Layout</h1>
        <p className="text-sm text-muted-foreground">
          Upload a custom floor plan image and position each seat exactly where it sits in your
          office, per location.
        </p>
      </div>

      {locations && locations.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {locations.map((loc) => (
            <Link
              key={loc.id}
              href={`/admin/floor-plan?location=${loc.id}`}
              className={cn(
                'flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
                loc.id === activeLocation?.id
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'hover:bg-muted'
              )}
            >
              {loc.name}
              <Badge
                variant="outline"
                className={cn(
                  'text-[10px]',
                  loc.id === activeLocation?.id && 'border-primary-foreground/40 text-primary-foreground'
                )}
              >
                {loc.layout_mode === 'image' ? 'Custom' : 'Grid'}
              </Badge>
            </Link>
          ))}
        </div>
      )}

      {activeLocation ? (
        <FloorPlanEditor
          location={activeLocation}
          seats={seats ?? []}
          floorPlanUrl={getFloorPlanUrl(supabase, activeLocation.floor_plan_path)}
        />
      ) : (
        <p className="text-muted-foreground">No locations configured yet.</p>
      )}
    </div>
  );
}
