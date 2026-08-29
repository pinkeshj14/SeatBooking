export const USERS_SHEET_NAME = 'Users';
export const SEATS_SHEET_NAME = 'Seats';

export const USERS_HEADERS = [
  'User ID',
  'Email',
  'Full Name',
  'Role',
  'Default Location Code',
  'Default Seat Number',
  'Active',
] as const;

export const SEATS_HEADERS = ['Seat ID', 'Seat Number', 'Location Code', 'Row', 'Col', 'Active'] as const;

export interface RowIssue {
  sheet: 'Users' | 'Seats';
  row: number;
  field?: string;
  message: string;
}

export interface ParsedUserRow {
  rowNumber: number;
  userId: string | null;
  email: string;
  fullName: string;
  role: 'ADMIN' | 'EMPLOYEE';
  defaultLocationId: string | null;
  defaultSeatId: string | null;
  isActive: boolean;
}

export interface ParsedSeatRow {
  rowNumber: number;
  id: string | null;
  locationId: string;
  seatNumber: string;
  rowIdx: number | null;
  colIdx: number | null;
  isActive: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseBool(raw: unknown): boolean | null {
  if (typeof raw === 'boolean') return raw;
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (['true', 'yes', 'y', '1', 'active'].includes(s)) return true;
  if (['false', 'no', 'n', '0', 'inactive'].includes(s)) return false;
  return null;
}

function str(raw: unknown): string {
  if (raw == null) return '';
  return String(raw).trim();
}

export interface UsersValidationContext {
  locationsByCode: Map<string, { id: string }>;
  seatsByNumber: Map<string, { id: string; locationId: string }>;
  existingUserIds: Set<string>;
  /** email (lowercased) -> user id, for existing users */
  existingEmailToId: Map<string, string>;
}

export function validateUserRow(
  raw: Record<string, unknown>,
  rowNumber: number,
  ctx: UsersValidationContext
): { row: ParsedUserRow | null; issues: RowIssue[] } {
  const issues: RowIssue[] = [];
  const push = (message: string, field?: string) => issues.push({ sheet: 'Users', row: rowNumber, field, message });

  const rawUserId = str(raw['User ID']);
  let userId: string | null = null;
  if (rawUserId) {
    if (!UUID_RE.test(rawUserId)) {
      push('User ID is not a valid id', 'User ID');
    } else if (!ctx.existingUserIds.has(rawUserId.toLowerCase())) {
      push('User ID does not match any existing user', 'User ID');
    } else {
      userId = rawUserId;
    }
  }

  const email = str(raw['Email']).toLowerCase();
  if (!email) push('Email is required', 'Email');
  else if (!EMAIL_RE.test(email)) push('Email is not a valid email address', 'Email');
  else if (!userId) {
    const existing = ctx.existingEmailToId.get(email);
    if (existing) {
      push(
        'Email already belongs to an existing user — fill in that user\'s User ID to update them instead of leaving it blank',
        'Email'
      );
    }
  } else {
    const existing = ctx.existingEmailToId.get(email);
    if (existing && existing !== userId.toLowerCase()) {
      push('Email belongs to a different existing user', 'Email');
    }
  }

  const fullName = str(raw['Full Name']);
  if (!fullName) push('Full Name is required', 'Full Name');

  const rawRole = str(raw['Role']).toUpperCase();
  let role: 'ADMIN' | 'EMPLOYEE' | null = null;
  if (rawRole !== 'ADMIN' && rawRole !== 'EMPLOYEE') {
    push('Role must be ADMIN or EMPLOYEE', 'Role');
  } else {
    role = rawRole;
  }

  const locationCode = str(raw['Default Location Code']).toUpperCase();
  let defaultLocationId: string | null = null;
  if (locationCode) {
    const loc = ctx.locationsByCode.get(locationCode);
    if (!loc) push(`Unknown location code "${locationCode}"`, 'Default Location Code');
    else defaultLocationId = loc.id;
  }

  const seatNumber = str(raw['Default Seat Number']);
  let defaultSeatId: string | null = null;
  if (seatNumber) {
    const seat = ctx.seatsByNumber.get(seatNumber.toUpperCase());
    if (!seat) push(`Unknown seat number "${seatNumber}"`, 'Default Seat Number');
    else {
      defaultSeatId = seat.id;
      if (defaultLocationId && seat.locationId !== defaultLocationId) {
        push('Default Seat Number does not belong to Default Location Code', 'Default Seat Number');
      }
      defaultLocationId = seat.locationId;
    }
  }

  const activeRaw = raw['Active'];
  let isActive = true;
  if (activeRaw != null && str(activeRaw) !== '') {
    const parsed = parseBool(activeRaw);
    if (parsed === null) push('Active must be TRUE or FALSE', 'Active');
    else isActive = parsed;
  }

  if (issues.length > 0) return { row: null, issues };

  return {
    row: {
      rowNumber,
      userId,
      email,
      fullName,
      role: role!,
      defaultLocationId,
      defaultSeatId,
      isActive,
    },
    issues: [],
  };
}

export interface SeatsValidationContext {
  locationsByCode: Map<string, { id: string }>;
  existingSeatIds: Set<string>;
  /** `${locationId}::${seatNumberUpper}` -> seat id, for existing seats */
  existingSeatKeyToId: Map<string, string>;
}

export function validateSeatRow(
  raw: Record<string, unknown>,
  rowNumber: number,
  ctx: SeatsValidationContext
): { row: ParsedSeatRow | null; issues: RowIssue[] } {
  const issues: RowIssue[] = [];
  const push = (message: string, field?: string) => issues.push({ sheet: 'Seats', row: rowNumber, field, message });

  const rawId = str(raw['Seat ID']);
  let id: string | null = null;
  if (rawId) {
    if (!UUID_RE.test(rawId)) {
      push('Seat ID is not a valid id', 'Seat ID');
    } else if (!ctx.existingSeatIds.has(rawId.toLowerCase())) {
      push('Seat ID does not match any existing seat', 'Seat ID');
    } else {
      id = rawId;
    }
  }

  const seatNumber = str(raw['Seat Number']);
  if (!seatNumber) push('Seat Number is required', 'Seat Number');

  const locationCode = str(raw['Location Code']).toUpperCase();
  let locationId: string | null = null;
  if (!locationCode) push('Location Code is required', 'Location Code');
  else {
    const loc = ctx.locationsByCode.get(locationCode);
    if (!loc) push(`Unknown location code "${locationCode}"`, 'Location Code');
    else locationId = loc.id;
  }

  if (seatNumber && locationId) {
    const key = `${locationId}::${seatNumber.toUpperCase()}`;
    const existing = ctx.existingSeatKeyToId.get(key);
    if (!id && existing) {
      push(
        'Seat Number already exists in this location — fill in its Seat ID to update it, or use a different seat number',
        'Seat Number'
      );
    } else if (id && existing && existing !== id.toLowerCase()) {
      push('Seat Number is already used by a different seat in this location', 'Seat Number');
    }
  }

  let rowIdx: number | null = null;
  const rawRow = raw['Row'];
  if (rawRow != null && str(rawRow) !== '') {
    const n = Number(rawRow);
    if (!Number.isInteger(n) || n < 0) push('Row must be a non-negative whole number', 'Row');
    else rowIdx = n;
  }

  let colIdx: number | null = null;
  const rawCol = raw['Col'];
  if (rawCol != null && str(rawCol) !== '') {
    const n = Number(rawCol);
    if (!Number.isInteger(n) || n < 0) push('Col must be a non-negative whole number', 'Col');
    else colIdx = n;
  }

  const activeRaw = raw['Active'];
  let isActive = true;
  if (activeRaw != null && str(activeRaw) !== '') {
    const parsed = parseBool(activeRaw);
    if (parsed === null) push('Active must be TRUE or FALSE', 'Active');
    else isActive = parsed;
  }

  if (issues.length > 0) return { row: null, issues };

  return {
    row: {
      rowNumber,
      id,
      locationId: locationId!,
      seatNumber,
      rowIdx,
      colIdx,
      isActive,
    },
    issues: [],
  };
}
