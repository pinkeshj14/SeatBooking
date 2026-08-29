'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { adminReassignSeatAction } from '@/app/actions/seats';
import { Search, Loader2 } from 'lucide-react';

interface Seat {
  id: string;
  seat_number: string;
  location_id: string;
  location_name: string;
  location_code: string;
  taken_by: string | null;
}

interface UserRow {
  id: string;
  full_name: string;
  email: string;
  role: string;
  default_seat_id: string | null;
}

interface Props {
  users: UserRow[];
  seats: Seat[];
}

export function ReassignTable({ users, seats }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const seatById = useMemo(() => new Map(seats.map((s) => [s.id, s])), [seats]);
  const seatsByLocation = useMemo(() => {
    const map = new Map<string, Seat[]>();
    for (const s of seats) {
      const arr = map.get(s.location_id) ?? [];
      arr.push(s);
      map.set(s.location_id, arr);
    }
    Array.from(map.values()).forEach((arr) => arr.sort((a, b) => a.seat_number.localeCompare(b.seat_number)));
    return map;
  }, [seats]);

  const filtered = users.filter(
    (u) =>
      u.full_name.toLowerCase().includes(query.toLowerCase()) ||
      u.email.toLowerCase().includes(query.toLowerCase())
  );

  function handleChange(userId: string, seatId: string) {
    setPendingUserId(userId);
    startTransition(async () => {
      const res = await adminReassignSeatAction(userId, seatId);
      setPendingUserId(null);
      if (!res.success) toast.error(res.error);
      else {
        toast.success('Default seat reassigned');
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search employees..."
          className="pl-8"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Current default seat</TableHead>
              <TableHead className="w-[280px]">Reassign to</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((u) => {
              const currentSeat = u.default_seat_id ? seatById.get(u.default_seat_id) : null;
              return (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="font-medium">{u.full_name}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.role === 'ADMIN' ? 'default' : 'outline'}>{u.role}</Badge>
                  </TableCell>
                  <TableCell>
                    {currentSeat ? (
                      <span>
                        {currentSeat.seat_number}{' '}
                        <span className="text-muted-foreground">({currentSeat.location_code})</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Select value={u.default_seat_id ?? ''} onValueChange={(v) => handleChange(u.id, v)}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select seat" />
                        </SelectTrigger>
                        <SelectContent className="max-h-80">
                          {Array.from(seatsByLocation.entries()).map(([locId, locSeats]) => (
                            <SelectGroup key={locId}>
                              <SelectLabel>{locSeats[0]?.location_name}</SelectLabel>
                              {locSeats.map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                  {s.seat_number}
                                  {s.taken_by && s.id !== u.default_seat_id ? ` — ${s.taken_by}` : ''}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          ))}
                        </SelectContent>
                      </Select>
                      {pendingUserId === u.id && <Loader2 className="h-4 w-4 shrink-0 animate-spin" />}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
