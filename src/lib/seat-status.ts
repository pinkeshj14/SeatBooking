import type { SeatMapRow, SeatStatus } from '@/types/database';

/** "Manish Goyal" -> "Manish" — keeps seat labels short enough to fit without wrapping/overlap. */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName;
}

/**
 * The DB only distinguishes AVAILABLE / OCCUPIED. OWN and PENDING are
 * viewer-relative, so they're derived client-side against the current user.
 */
export function deriveSeatStatus(row: SeatMapRow, currentUserId: string | null | undefined): SeatStatus {
  if (row.pending_request_id && row.occupant_id !== currentUserId) {
    return 'PENDING';
  }
  if (row.occupant_id && row.occupant_id === currentUserId) {
    return 'OWN';
  }
  return row.status;
}

export interface SeatStyle {
  bg: string;
  border: string;
  text: string;
  label: string;
}

export const SEAT_STATUS_STYLES: Record<SeatStatus, SeatStyle> = {
  AVAILABLE: {
    bg: 'bg-emerald-500/15 hover:bg-emerald-500/25 dark:bg-emerald-500/20',
    border: 'border-emerald-500/60',
    text: '',
    label: 'Available',
  },
  // Solid fills + a black border wherever a person's name is shown (OWN,
  // OCCUPIED, RESERVED below) so who's who reads clearly at a glance,
  // instead of the softer translucent tints used for AVAILABLE/PENDING.
  OWN: {
    bg: 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600',
    border: 'border-black dark:border-neutral-950',
    text: 'text-white',
    label: 'Your seat',
  },
  // A real, confirmed booking by someone else — "they're definitely coming
  // in". Deliberately a different hue from RESERVED_STYLE below so the two
  // are distinguishable even without relying on the dashed/solid border.
  OCCUPIED: {
    bg: 'bg-purple-600 hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600',
    border: 'border-black dark:border-neutral-950',
    text: 'text-white',
    label: 'Booked',
  },
  PENDING: {
    bg: 'bg-amber-500/20 hover:bg-amber-500/30 dark:bg-amber-500/25',
    border: 'border-amber-500/70',
    text: '',
    label: 'Pending approval',
  },
};

/** The assigned owner's seat, still inside its pre-cutoff window and not booked yet — distinct from OCCUPIED ("Booked"). */
export const RESERVED_STYLE: SeatStyle = {
  bg: 'bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600',
  border: 'border-black dark:border-neutral-950',
  text: 'text-white',
  label: 'Reserved, not booked',
};

/** Resolves the correct style, splitting OCCUPIED into "Booked" (purple) vs "Reserved, not booked" (red). */
export function getSeatStyle(status: SeatStatus, isReservedPending?: boolean | null): SeatStyle {
  if (status === 'OCCUPIED' && isReservedPending) return RESERVED_STYLE;
  return SEAT_STATUS_STYLES[status];
}
