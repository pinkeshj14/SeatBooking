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
import { SEAT_STATUS_STYLES } from '@/lib/seat-status';
import {
  bookSeatAction,
  releaseSeatAction,
  requestSeatAction,
} from '@/app/actions/seats';
import type { SeatMapRow, SeatStatus } from '@/types/database';
import type { BookingWindow } from '@/types/booking-window';
import { Loader2, CalendarClock } from 'lucide-react';

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
  const [dateRange, setDateRange] = useState({ from: selectedDate, till: selectedDate });
  const [confirmRange, setConfirmRange] = useState({ from: selectedDate, till: selectedDate });
  const [reason, setReason] = useState('');

  // This dialog instance stays mounted across seat selections (only `open`
  // toggles), so without this the date range from the last action (e.g. a
  // multi-day release) would silently carry over to the next seat's dialog.
  // Reset to a fresh single-day default every time it opens for a seat.
  useEffect(() => {
    if (open) {
      let bookable = selectedDate;
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, seat?.seat_id]);

  if (!seat) return null;

  const style = SEAT_STATUS_STYLES[status];
  const dateStr = format(selectedDate, 'yyyy-MM-dd');
  const isOwnConfirmedBooking = status === 'OWN' && !seat.is_reserved_pending;
  const isOwnPendingReservation = status === 'OWN' && seat.is_reserved_pending;

  function fmt(d: Date) {
    return format(d, 'yyyy-MM-dd');
  }

  function handleBook() {
    startTransition(async () => {
      const res = await bookSeatAction(seat!.seat_id, fmt(dateRange.from), fmt(dateRange.till));
      if (!res.success) {
        toast.error(res.error);
      } else {
        toast.success(`Seat ${seat!.seat_number} booked`);
        onOpenChange(false);
        router.refresh();
      }
    });
  }

  function handleConfirmBooking() {
    startTransition(async () => {
      const res = await bookSeatAction(seat!.seat_id, fmt(confirmRange.from), fmt(confirmRange.till));
      if (!res.success) {
        toast.error(res.error);
      } else {
        toast.success(`Booking confirmed for seat ${seat!.seat_number}`);
        onOpenChange(false);
        router.refresh();
      }
    });
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
              : seat.occupant_name
                ? `Currently held by ${seat.occupant_name} on ${dateStr}.`
                : `Unassigned seat, available on ${dateStr}.`}
          </DialogDescription>
        </DialogHeader>

        {isOwnPendingReservation && (
          <div className="space-y-3 rounded-lg border p-3">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <CalendarClock className="h-4 w-4" />
              Confirm your booking
            </p>
            <FromTillPicker
              from={confirmRange.from}
              till={confirmRange.till}
              onChange={setConfirmRange}
              disabledBefore={bookingWindow?.minDate}
              disabledAfter={bookingWindow?.maxDate}
              disableWeekends
            />
            <Button size="sm" className="w-full" onClick={handleConfirmBooking} disabled={pending}>
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Book this seat
            </Button>
          </div>
        )}

        {status === 'OWN' && (
          <div className="space-y-4">
            {isOwnPendingReservation && <Separator />}
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
            <Button onClick={handleRelease} disabled={pending} variant={isOwnPendingReservation ? 'outline' : 'default'}>
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Release seat
            </Button>
          )}
          {status === 'AVAILABLE' && (
            <Button onClick={handleBook} disabled={pending}>
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
