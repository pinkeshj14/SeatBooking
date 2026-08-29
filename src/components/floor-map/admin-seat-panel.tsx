'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FromTillPicker } from '@/components/shared/from-till-picker';
import {
  bookSeatAction,
  releaseSeatAction,
  adminSetSeatActiveAction,
} from '@/app/actions/seats';
import type { SeatMapRow } from '@/types/database';
import { ShieldAlert, Loader2 } from 'lucide-react';

interface Employee {
  id: string;
  full_name: string;
}

interface Props {
  seat: SeatMapRow;
  selectedDate: Date;
  employees: Employee[];
  onDone: () => void;
}

export function AdminSeatPanel({ seat, selectedDate, employees, onDone }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [employeeId, setEmployeeId] = useState<string>('');
  const [dateRange, setDateRange] = useState({ from: selectedDate, till: selectedDate });
  const [seatActive, setSeatActive] = useState(seat.is_active);

  function fmt(d: Date) {
    return format(d, 'yyyy-MM-dd');
  }

  function handleForceBook() {
    if (!employeeId) {
      toast.error('Select an employee first');
      return;
    }
    startTransition(async () => {
      const res = await bookSeatAction(seat.seat_id, fmt(dateRange.from), fmt(dateRange.till), employeeId);
      if (!res.success) toast.error(res.error);
      else {
        toast.success('Seat booked on behalf of employee');
        onDone();
        router.refresh();
      }
    });
  }

  function handleForceRelease() {
    startTransition(async () => {
      const res = await releaseSeatAction(
        seat.seat_id,
        fmt(dateRange.from),
        fmt(dateRange.till),
        'Released by admin override'
      );
      if (!res.success) toast.error(res.error);
      else {
        toast.success('Seat released');
        onDone();
        router.refresh();
      }
    });
  }

  function handleToggleActive(next: boolean) {
    setSeatActive(next);
    startTransition(async () => {
      const res = await adminSetSeatActiveAction(seat.seat_id, next);
      if (!res.success) {
        toast.error(res.error);
        setSeatActive(!next);
      } else {
        toast.success(next ? 'Seat unlocked' : 'Seat locked');
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-dashed border-amber-500/50 bg-amber-500/5 p-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-400">
        <ShieldAlert className="h-4 w-4" />
        Admin override
      </div>

      <div className="flex items-center justify-between">
        <Label htmlFor="seat-active" className="text-sm">
          Seat active (uncheck to lock)
        </Label>
        <Switch id="seat-active" checked={seatActive} onCheckedChange={handleToggleActive} disabled={pending} />
      </div>

      <Separator />

      <div className="space-y-2">
        <Label>Book / transfer to employee</Label>
        <Select value={employeeId} onValueChange={setEmployeeId}>
          <SelectTrigger>
            <SelectValue placeholder="Select employee" />
          </SelectTrigger>
          <SelectContent>
            {employees.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FromTillPicker from={dateRange.from} till={dateRange.till} onChange={setDateRange} />
        <Button size="sm" variant="secondary" className="w-full" onClick={handleForceBook} disabled={pending}>
          {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Force book / transfer
        </Button>
      </div>

      <Button size="sm" variant="outline" className="w-full" onClick={handleForceRelease} disabled={pending}>
        {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Force release for these dates
      </Button>
    </div>
  );
}
