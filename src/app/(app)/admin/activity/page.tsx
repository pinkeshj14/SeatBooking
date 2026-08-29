import { createClient } from '@/lib/supabase/server';
import { OccupancyChart } from '@/components/admin/occupancy-chart';
import { ActivityLogTable } from '@/components/admin/activity-log-table';
import type { OccupancyTrendRow, ActivityLogRow } from '@/types/database';

export default async function ActivityPage() {
  const supabase = await createClient();

  const [{ data: trend, error: trendError }, { data: log, error: logError }] = await Promise.all([
    supabase.rpc('get_occupancy_trend', { p_days: 14 }),
    supabase.rpc('get_activity_log', { p_limit: 100, p_offset: 0 }),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Activity & Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Daily occupancy, release trends, and a full audit trail of seat activity.
        </p>
      </div>

      {(trendError || logError) && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {trendError?.message || logError?.message}
        </div>
      )}

      <OccupancyChart data={(trend as OccupancyTrendRow[]) ?? []} />
      <ActivityLogTable rows={(log as ActivityLogRow[]) ?? []} />
    </div>
  );
}
