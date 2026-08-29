import { createClient } from '@/lib/supabase/server';
import { ReassignTable } from '@/components/admin/reassign-table';

export default async function ReassignPage() {
  const supabase = await createClient();

  const { data: users } = await supabase
    .from('users')
    .select('id, full_name, email, role, default_seat_id')
    .order('full_name');

  const { data: seats } = await supabase
    .from('seats')
    .select('id, seat_number, location_id, is_active, locations(name, code)')
    .order('seat_number');

  const { data: owners } = await supabase.from('users').select('full_name, default_seat_id');
  const ownerBySeat = new Map((owners ?? []).filter((o) => o.default_seat_id).map((o) => [o.default_seat_id as string, o.full_name]));

  const seatRows = (seats ?? []).map((s) => ({
    id: s.id,
    seat_number: s.seat_number,
    location_id: s.location_id,
    location_name: s.locations?.name ?? '',
    location_code: s.locations?.code ?? '',
    taken_by: ownerBySeat.get(s.id) ?? null,
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Master Seat Reassignment</h1>
        <p className="text-sm text-muted-foreground">
          Change any employee&apos;s permanent/default seat allocation. Assigning a seat that&apos;s
          already someone&apos;s default will automatically free it from them.
        </p>
      </div>
      <ReassignTable users={users ?? []} seats={seatRows} />
    </div>
  );
}
