import type { SeatMapRow, SeatStatus } from '@/types/database';

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

export const SEAT_STATUS_STYLES: Record<
  SeatStatus,
  { bg: string; border: string; text: string; label: string }
> = {
  AVAILABLE: {
    bg: 'bg-emerald-500/15 hover:bg-emerald-500/25 dark:bg-emerald-500/20',
    border: 'border-emerald-500/60',
    text: '',
    label: 'Available',
  },
  // Solid fill (not a translucent tint like the others) so "your seat" is
  // unmistakable at a glance on the floor map.
  OWN: {
    bg: 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600',
    border: 'border-blue-700 dark:border-blue-400',
    text: 'text-white',
    label: 'Your seat',
  },
  OCCUPIED: {
    bg: 'bg-red-500/15 hover:bg-red-500/25 dark:bg-red-500/20',
    border: 'border-red-500/60',
    text: '',
    label: 'Occupied',
  },
  PENDING: {
    bg: 'bg-amber-500/20 hover:bg-amber-500/30 dark:bg-amber-500/25',
    border: 'border-amber-500/70',
    text: '',
    label: 'Pending approval',
  },
};
