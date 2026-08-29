import ExcelJS from 'exceljs';
import { createClient } from '@/lib/supabase/server';
import { USERS_HEADERS, USERS_SHEET_NAME, SEATS_HEADERS, SEATS_SHEET_NAME } from '@/lib/master-data/schema';

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'ADMIN') return new Response('Forbidden', { status: 403 });

  const [{ data: users }, { data: seats }] = await Promise.all([
    supabase
      .from('users')
      .select(
        'id, email, full_name, role, is_active, locations!users_default_location_id_fkey(code), seats!users_default_seat_id_fkey(seat_number)'
      )
      .order('email'),
    supabase.from('seats').select('id, seat_number, row_idx, col_idx, is_active, locations(code)').order('seat_number'),
  ]);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Office Seat Booking';
  workbook.created = new Date();

  const usersSheet = workbook.addWorksheet(USERS_SHEET_NAME);
  usersSheet.columns = USERS_HEADERS.map((header) => ({ header, key: header, width: 24 }));
  usersSheet.getRow(1).font = { bold: true };

  for (const u of users ?? []) {
    usersSheet.addRow({
      'User ID': u.id,
      Email: u.email,
      'Full Name': u.full_name,
      Role: u.role,
      'Default Location Code': u.locations?.code ?? '',
      'Default Seat Number': u.seats?.seat_number ?? '',
      Active: u.is_active ? 'TRUE' : 'FALSE',
    });
  }

  const seatsSheet = workbook.addWorksheet(SEATS_SHEET_NAME);
  seatsSheet.columns = SEATS_HEADERS.map((header) => ({ header, key: header, width: 18 }));
  seatsSheet.getRow(1).font = { bold: true };

  for (const s of seats ?? []) {
    seatsSheet.addRow({
      'Seat ID': s.id,
      'Seat Number': s.seat_number,
      'Location Code': s.locations?.code ?? '',
      Row: s.row_idx,
      Col: s.col_idx,
      Active: s.is_active ? 'TRUE' : 'FALSE',
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="office-seat-booking-master-data.xlsx"`,
    },
  });
}
