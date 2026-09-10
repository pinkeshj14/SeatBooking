'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { FromTillPicker } from '@/components/shared/from-till-picker';
import { Separator } from '@/components/ui/separator';
import { AdminSeatPanel } from '@/components/floor-map/admin-seat-panel';
import { getSeatStyle } from '@/lib/seat-status';
import { createClient } from '@/lib/supabase/client';
import {
  bookSeatAction,
  releaseSeatAction,
  requestSeatAction,
} from '@/app/actions/seats';
import type { SeatMapRow, SeatStatus, SeatConflictRow } from '@/types/database';
import type { BookingWindow } from '@/types/booking-window';
import { Loader2, CalendarClock, TriangleAlert } from 'lucide-react';

interface Employee {
  id: string;
  full_name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seat: SeatMapRow | null;
  status: SeatStatus;
  selectedDate: Date;
  currentUserId: string;
  isCrossLocation: boolean;
  isAdmin?: boolean;
  employees?: Employee[];
  bookingWindow?: BookingWindow | null;
}

interface PendingBooking {
  range: { from: Date; till: Date };
  conflicts: SeatConflictRow[];
}

export function SeatDetailsDialog({
  open,
  onOpenChange,
  seat,
  status,
  selectedDate,
  currentUserId,
  isCrossLocation,
  isAdmin = false,
  employees = [],
  bookingWindow = null,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  const [dateRange, setDateRange] = useState({ from: selectedDate, till: selectedDate });
  const [confirmRange, setConfirmRange] = useState({ from: selectedDate, till: selectedDate });
  const [reason, setReason] = useState('');
  const [pendingBooking, setPendingBooking] = useState<PendingBooking | null>(null);

  const isOwnConfirmedBooking = status === 'OWN' && !seat?.is_reserved_pending;

  // This dialog instance stays mounted across seat selections (only `open`
  // toggles), so without this the date range from the last action (e.g. a
  // multi-day release) would silently carry over to the next seat's dialog.
  // Reset to a fresh single-day default every time it opens for a seat.
  useEffect(() => {
    if (open) {
      let bookable = selectedDate;
      // If the viewed date is already booked (own seat), there's nothing to
      // confirm there — default the "book more days" picker to the next day
      // instead of a date that's already taken care of.
      if (isOwnConfirmedBooking) {
        bookable = new Date(bookable);
        do {
          bookable.setDate(bookable.getDate() + 1);
        } while (bookable.getDay() === 0 || bookable.getDay() === 6);
      }
      if (bookingWindow) {
        if (bookable < bookingWindow.minDate) bookable = bookingWindow.minDate;
        if (bookable > bookingWindow.maxDate) bookable = bookingWindow.maxDate;
      }
      // dateRange doubles as the release picker (status OWN, unrestricted —
      // uses the raw viewed date) and the AVAILABLE-booking picker (must
      // start inside the bookable window so it isn't pre-filled invalid).
      const dateRangeStart = status === 'AVAILABLE' ? bookable : selectedDate;
      setDateRange({ from: dateRangeStart, till: dateRangeStart });
      setConfirmRange({ from: bookable, till: bookable });
      setReason('');
      setPendingBooking(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, seat?.seat_id]);

  if (!seat) return null;

  const style = getSeatStyle(status, seat.is_reserved_pending);
  const dateStr = format(selectedDate, 'yyyy-MM-dd');
  const isOwnPendingReservation = status === 'OWN' && seat.is_reserved_pending;

  function fmt(d: Date) {
    return format(d, 'yyyy-MM-dd');
  }

  function performBook(range: { from: Date; till: Date }) {
    startTransition(async () => {
      const res = await bookSeatAction(seat!.seat_id, fmt(range.from), fmt(range.till));
      if (!res.success) {
        toast.error(res.error);
      } else {
        toast.success(
          pendingBooking?.conflicts.length
            ? `Seat ${seat!.seat_number} booked — your other seat for that date has been released`
            : `Seat ${seat!.seat_number} booked`
        );
        setPendingBooking(null);
        onOpenChange(false);
        router.refresh();
      }
    });
  }

  // One seat per person per date: before booking, check whether the user
  // already holds a different seat (booked, or their own default seat still
  // in its pre-cutoff reservation window) for any date in this range. If
  // so, confirm with them first rather than silently releasing it — the
  // server enforces this rule regardless, but a silent auto-release without
  // asking is exactly the "very big issue" being fixed here.
  function attemptBook(range: { from: Date; till: Date }) {
    setCheckingConflicts(true);
    (async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('get_user_seat_conflicts', {
        p_start_date: fmt(range.from),
        p_end_date: fmt(range.till),
        p_exclude_seat_id: seat!.seat_id,
      });
      setCheckingConflicts(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      if (data && data.length > 0) {
        setPendingBooking({ range, conflicts: data });
      } else {
        performBook(range);
      }
    })();
  }

  function handleRelease() {
    startTransition(async () => {
      const res = await releaseSeatAction(
        seat!.seat_id,
        fmt(dateRange.from),
        fmt(dateRange.till),
        reason || null
      );
      if (!res.success) {
        toast.error(res.error);
      } else {
        toast.success(`Seat ${seat!.seat_number} released`);
        onOpenChange(false);
        router.refresh();
      }
    });
  }

  function handleRequest() {
    startTransition(async () => {
      const res = await requestSeatAction(seat!.seat_id, dateStr);
      if (!res.success) {
        toast.error(res.error);
      } else {
        toast.success(`Request sent to ${seat!.occupant_name}`);
        onOpenChange(false);
        router.refresh();
      }
    });
  }

  if (pendingBooking) {
    const { conflicts, range } = pendingBooking;
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <TriangleAlert className="h-5 w-5" />
              Release your other seat?
            </DialogTitle>
            <DialogDescription>
              You can only hold one seat per day. Booking <strong>{seat.seat_number}</strong> will
              release the following:
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 rounded-md border p-3 text-sm">
            {conflicts.map((c, i) => (
              <div key={`${c.seat_id}-${c.conflict_date}-${i}`} className="flex items-center justify-between">
                <span className="font-medium">{c.seat_number}</span>
                <span className="text-muted-foreground">
                  {format(new Date(`${c.conflict_date}T00:00:00`), 'EEE, MMM d')} —{' '}
                  {c.hold_type === 'booked' ? 'booked' : 'reserved for you'}
                </span>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingBooking(null)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={() => performBook(range)} disabled={pending}>
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Release &amp; book {seat.seat_number}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Seat {seat.seat_number}
            <Badge variant="outline" className={`${style.bg} ${style.border} ${style.text} border`}>
              {style.label}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            {isOwnPendingReservation
              ? `Reserved for you on ${dateStr} — not booked yet. Confirm it below, or release it if you won't need it.`
              : isOwnConfirmedBooking
                ? `You're booked in this seat on ${dateStr}. Book more days below, or release this date.`
                : seat.occupant_name
                  ? `Currently held by ${seat.occupant_name} on ${dateStr}.`
                  : `Unassigned seat, available on ${dateStr}.`}
          </DialogDescription>
        </DialogHeader>

        {status === 'OWN' && (
          <div className="space-y-3 rounded-lg border p-3">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <CalendarClock className="h-4 w-4" />
              {isOwnPendingReservation ? 'Confirm your booking' : 'Book additional days'}
            </p>
            <p className="text-xs text-muted-foreground">
              Book this seat for any day in the next 3 working days — including days beyond{' '}
              {dateStr} you haven&apos;t booked yet.
            </p>
            <FromTillPicker
              from={confirmRange.from}
              till={confirmRange.till}
              onChange={setConfirmRange}
              disabledBefore={bookingWindow?.minDate}
              disabledAfter={bookingWindow?.maxDate}
              disableWeekends
            />
            <Button
              size="sm"
              className="w-full"
              onClick={() => attemptBook(confirmRange)}
              disabled={pending || checkingConflicts}
            >
              {(pending || checkingConflicts) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Book seat
            </Button>
          </div>
        )}

        {status === 'OWN' && (
          <div className="space-y-4">
            <Separator />
            <p className="text-sm font-medium">Release</p>
            <p className="text-sm text-muted-foreground">
              {isOwnConfirmedBooking
                ? 'You have this seat booked. Release it so a colleague can use it instead.'
                : "Don't need your reserved seat? Release it so a colleague can book it."}
            </p>
            <FromTillPicker
              from={dateRange.from}
              till={dateRange.till}
              onChange={setDateRange}
              disabledBefore={new Date()}
            />
            <div className="space-y-2">
              <Label htmlFor="reason">Reason (optional)</Label>
              <Textarea
                id="reason"
                placeholder="e.g. Working from home, on leave..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </div>
        )}

        {status === 'AVAILABLE' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Book this seat for a date range (next 3 working days only).
              {isCrossLocation && (
                <span className="mt-1 block font-medium text-amber-600 dark:text-amber-400">
                  Your default seat will be automatically released for the same dates.
                </span>
              )}
            </p>
            <FromTillPicker
              from={dateRange.from}
              till={dateRange.till}
              onChange={setDateRange}
              disabledBefore={bookingWindow?.minDate ?? new Date()}
              disabledAfter={bookingWindow?.maxDate}
              disableWeekends
            />
          </div>
        )}

        {status === 'OCCUPIED' && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Send a request to <strong>{seat.occupant_name}</strong> asking them to release seat{' '}
              {seat.seat_number} for {dateStr}. They&apos;ll get a real-time approval prompt.
            </p>
          </div>
        )}

        {status === 'PENDING' && (
          <p className="text-sm text-muted-foreground">
            A request for this seat on {dateStr} is already pending approval.
          </p>
        )}

        {isAdmin && (
          <>
            <Separator />
            <AdminSeatPanel
              seat={seat}
              selectedDate={selectedDate}
              employees={employees}
              onDone={() => onOpenChange(false)}
            />
          </>
        )}

        <DialogFooter>
          {status === 'OWN' && (
            <Button onClick={handleRelease} disabled={pending} variant="outline">
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Release seat
            </Button>
          )}
          {status === 'AVAILABLE' && (
            <Button onClick={() => attemptBook(dateRange)} disabled={pending || checkingConflicts}>
              {(pending || checkingConflicts) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Book seat
            </Button>
          )}
          {status === 'OCCUPIED' && seat.occupant_id !== currentUserId && (
            <Button onClick={handleRequest} disabled={pending}>
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Request seat
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
