import { createClient } from '@/lib/supabase/server';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MasterDataToolbar } from '@/components/admin/master-data/master-data-toolbar';
import { UsersTable, type UserRow } from '@/components/admin/master-data/users-table';
import { SeatsTable, type SeatRow } from '@/components/admin/master-data/seats-table';

export default async function MasterDataPage() {
  const supabase = await createClient();

  const [{ data: locations }, { data: users }, { data: seats }] = await Promise.all([
    supabase.from('locations').select('id, name, code, layout_config').order('code'),
    supabase
      .from('users')
      .select(
        'id, email, full_name, role, is_active, default_location_id, default_seat_id, locations!users_default_location_id_fkey(code), seats!users_default_seat_id_fkey(seat_number)'
      )
      .order('full_name'),
    supabase
      .from('seats')
      .select('id, seat_number, location_id, row_idx, col_idx, is_active, locations(name)')
      .order('seat_number'),
  ]);

  const { data: owners } = await supabase.from('users').select('full_name, default_seat_id');
  const ownerBySeat = new Map(
    (owners ?? []).filter((o) => o.default_seat_id).map((o) => [o.default_seat_id as string, o.full_name])
  );

  const userRows: UserRow[] = (users ?? []).map((u) => ({
    id: u.id,
    email: u.email,
    full_name: u.full_name,
    role: u.role,
    is_active: u.is_active,
    default_location_id: u.default_location_id,
    default_seat_id: u.default_seat_id,
    default_seat_number: u.seats?.seat_number ?? null,
    default_location_code: u.locations?.code ?? null,
  }));

  const seatRows: SeatRow[] = (seats ?? []).map((s) => ({
    id: s.id,
    seat_number: s.seat_number,
    location_id: s.location_id,
    location_name: s.locations?.name ?? '',
    row_idx: s.row_idx,
    col_idx: s.col_idx,
    is_active: s.is_active,
    occupant_name: ownerBySeat.get(s.id) ?? null,
  }));

  const seatOptions = (seats ?? []).map((s) => ({ id: s.id, seat_number: s.seat_number, location_id: s.location_id }));

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Master Data</h1>
          <p className="text-sm text-muted-foreground">
            Create, edit, and activate/deactivate users and seats — no direct database access needed.
            Export to Excel for bulk edits, then re-upload the same file.
          </p>
        </div>
        <MasterDataToolbar />
      </div>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="seats">Seats</TabsTrigger>
        </TabsList>
        <TabsContent value="users" className="pt-4">
          <UsersTable users={userRows} locations={locations ?? []} seats={seatOptions} />
        </TabsContent>
        <TabsContent value="seats" className="pt-4">
          <SeatsTable
            seats={seatRows}
            locations={(locations ?? []).map((l) => ({
              id: l.id,
              name: l.name,
              code: l.code,
              cols: l.layout_config?.cols ?? 10,
            }))}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
