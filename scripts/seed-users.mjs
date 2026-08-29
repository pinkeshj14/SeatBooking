// ============================================================================
// scripts/seed-users.mjs
//
// Seeds sample auth users (2 admins + 90 employees) and assigns each
// employee a default seat, split across the two locations. auth.users
// cannot be populated with plain SQL (passwords must go through Supabase
// Auth), so this script uses the Auth Admin API with the service role key.
//
// Usage:
//   npm run seed:users
//
// Requires (in .env.local, NOT committed):
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SEED_PASSWORD = process.env.SEED_USER_PASSWORD || 'ChangeMe123!';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local'
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const EMPLOYEE_COUNT = 90;
const ADMIN_COUNT = 2;

async function getLocations() {
  const { data, error } = await supabase
    .from('locations')
    .select('id, code, name')
    .order('code');
  if (error) throw error;
  if (data.length < 2) {
    throw new Error(
      'Expected 2 locations to already exist. Run the SQL migrations first (0004_seed_locations_seats.sql).'
    );
  }
  return data;
}

async function getSeats(locationId) {
  const { data, error } = await supabase
    .from('seats')
    .select('id, seat_number')
    .eq('location_id', locationId)
    .order('seat_number');
  if (error) throw error;
  return data;
}

async function createAuthUser(email, fullName, role) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: SEED_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName, role },
  });
  if (error) {
    if (error.message?.toLowerCase().includes('already registered')) {
      console.log(`  (skip) ${email} already exists`);
      const { data: existing } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .single();
      return existing?.id ?? null;
    }
    throw error;
  }
  return data.user.id;
}

async function main() {
  console.log('Fetching locations & seats...');
  const locations = await getLocations();
  const locA = locations.find((l) => l.code === 'A');
  const locB = locations.find((l) => l.code === 'B');
  const seatsA = await getSeats(locA.id);
  const seatsB = await getSeats(locB.id);

  console.log(`Location A: ${seatsA.length} seats, Location B: ${seatsB.length} seats`);

  console.log(`\nCreating ${ADMIN_COUNT} admin user(s)...`);
  const admins = [
    { email: 'admin1@seatbooking.dev', name: 'Alex Admin' },
    { email: 'admin2@seatbooking.dev', name: 'Priya Admin' },
  ];
  for (const a of admins) {
    const id = await createAuthUser(a.email, a.name, 'ADMIN');
    if (id) console.log(`  created admin ${a.email} (${id})`);
  }

  console.log(`\nCreating ${EMPLOYEE_COUNT} employee user(s)...`);
  const perLocation = EMPLOYEE_COUNT / 2; // 45 / 45, leaves 5 spare seats per location
  const firstNames = [
    'Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Krishna',
    'Ishaan', 'Rohan', 'Ananya', 'Diya', 'Saanvi', 'Aadhya', 'Kiara', 'Myra',
    'Anika', 'Navya', 'Riya', 'Isha', 'Kabir', 'Aryan', 'Dev', 'Yash', 'Rudra',
  ];
  const lastNames = [
    'Sharma', 'Verma', 'Gupta', 'Iyer', 'Nair', 'Patel', 'Reddy', 'Rao', 'Mehta',
    'Joshi', 'Kapoor', 'Malhotra', 'Chopra', 'Singh', 'Bhat', 'Menon', 'Pillai',
  ];

  function nameFor(i) {
    const f = firstNames[i % firstNames.length];
    const l = lastNames[Math.floor(i / firstNames.length) % lastNames.length];
    return `${f} ${l}`;
  }

  const employeeAssignments = [];
  let counter = 0;
  for (const [loc, seats, label] of [
    [locA, seatsA, 'a'],
    [locB, seatsB, 'b'],
  ]) {
    for (let i = 0; i < perLocation; i++) {
      const fullName = nameFor(counter);
      const email = `employee.${label}${String(i + 1).padStart(2, '0')}@seatbooking.dev`;
      employeeAssignments.push({ email, fullName, locationId: loc.id, seatId: seats[i].id });
      counter++;
    }
  }

  for (const emp of employeeAssignments) {
    const userId = await createAuthUser(emp.email, emp.fullName, 'EMPLOYEE');
    if (!userId) continue;

    const { error: updateError } = await supabase
      .from('users')
      .update({
        default_location_id: emp.locationId,
        default_seat_id: emp.seatId,
        full_name: emp.fullName,
      })
      .eq('id', userId);

    if (updateError) {
      console.error(`  failed to assign seat for ${emp.email}:`, updateError.message);
    } else {
      console.log(`  ${emp.email} -> seat assigned`);
    }
  }

  console.log('\nDone. Sample login:');
  console.log(`  Admin:    admin1@seatbooking.dev / ${SEED_PASSWORD}`);
  console.log(`  Employee: employee.a01@seatbooking.dev / ${SEED_PASSWORD}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
