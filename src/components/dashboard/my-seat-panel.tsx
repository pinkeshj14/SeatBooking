'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { format, isToday } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cancelReleaseAction, cancelBookingAction } from '@/app/actions/seats';
import { X, Armchair, CalendarClock } from 'lucide-react';

interface ReleaseRow {
  id: string;
  seat_number: string;
  start_date: string;
  end_date: string;
  reason: string | null;
}

interface BookingRow {
  seat_id: string;
  seat_number: string;
  location_name: string;
  start_date: string;
  end_date: string;
}

interface Props {
  defaultSeatNumber: string | null;
  defaultLocationName: string | null;
  releases: ReleaseRow[];
  bookings: BookingRow[];
}

export function MySeatPanel({ defaultSeatNumber, defaultLocationName, releases, bookings }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleCancelRelease(id: string) {
    startTransition(async () => {
      const res = await cancelReleaseAction(id);
      if (!res.success) toast.error(res.error);
      else {
        toast.success('Release cancelled');
        router.refresh();
      }
    });
  }

  function handleCancelBooking(seatId: string, start: string, end: string) {
    startTransition(async () => {
      const res = await cancelBookingAction(seatId, start, end);
      if (!res.success) toast.error(res.error);
      else {
        toast.success('Booking cancelled');
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Armchair className="h-4 w-4" />
          My Seat
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm text-muted-foreground">Default seat</p>
          <p className="font-medium">
            {defaultSeatNumber ? `${defaultSeatNumber} — ${defaultLocationName}` : 'Not assigned'}
          </p>
        </div>

        <Separator />

        <div>
          <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
            <CalendarClock className="h-4 w-4" />
            My bookings
          </p>
          <p className="mb-2 text-xs text-muted-foreground">
            One seat per day — booking a new seat for a date releases whatever you held there.
          </p>
          {bookings.length === 0 && (
            <p className="text-sm text-muted-foreground">No upcoming bookings yet.</p>
          )}
          <div className="space-y-2">
            {bookings.map((b) => (
              <div
                key={`${b.seat_id}-${b.start_date}`}
                className="flex items-center justify-between rounded-md border p-2 text-sm"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-1.5 font-medium">
                    {b.seat_number}
                    <Badge variant="outline">{b.location_name}</Badge>
                    {b.seat_number === defaultSeatNumber && (
                      <Badge className="bg-blue-600 hover:bg-blue-600">Your seat</Badge>
                    )}
                    {isToday(new Date(`${b.start_date}T00:00:00`)) && (
                      <Badge variant="outline" className="border-emerald-500/60 text-emerald-700 dark:text-emerald-400">
                        Today
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {format(new Date(b.start_date), 'MMM d')} to {format(new Date(b.end_date), 'MMM d')}
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => handleCancelBooking(b.seat_id, b.start_date, b.end_date)}
                  title="Cancel this booking"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        <div>
          <p className="mb-2 text-sm font-medium">Released seats</p>
          {releases.length === 0 && (
            <p className="text-sm text-muted-foreground">No upcoming releases.</p>
          )}
          <div className="space-y-2">
            {releases.map((r) => {
              const isAuto = r.reason?.startsWith('Auto-released');
              return (
                <div key={r.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5 font-medium">
                      {r.seat_number} — {format(new Date(r.start_date), 'MMM d')} to{' '}
                      {format(new Date(r.end_date), 'MMM d')}
                      {isAuto && (
                        <Badge variant="outline" className="border-amber-500/60 text-amber-700 dark:text-amber-400">
                          Auto-released
                        </Badge>
                      )}
                    </div>
                    {r.reason && !isAuto && <div className="text-xs text-muted-foreground">{r.reason}</div>}
                    {isAuto && (
                      <div className="text-xs text-muted-foreground">
                        Released because you booked a different seat for these dates.
                      </div>
                    )}
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => handleCancelRelease(r.id)}
                    title="Undo this release"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
