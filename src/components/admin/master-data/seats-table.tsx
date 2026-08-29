'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { adminSetSeatActiveAction } from '@/app/actions/seats';
import { SeatFormDialog, type EditingSeat } from '@/components/admin/master-data/seat-form-dialog';
import { Search, Plus, Pencil, Loader2 } from 'lucide-react';

interface Location {
  id: string;
  name: string;
  code: string;
}

export interface SeatRow {
  id: string;
  seat_number: string;
  location_id: string;
  location_name: string;
  row_idx: number;
  col_idx: number;
  is_active: boolean;
  occupant_name: string | null;
}

interface Props {
  seats: SeatRow[];
  locations: Location[];
}

export function SeatsTable({ seats, locations }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<EditingSeat | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const filtered = seats.filter(
    (s) =>
      s.seat_number.toLowerCase().includes(query.toLowerCase()) ||
      s.location_name.toLowerCase().includes(query.toLowerCase()) ||
      (s.occupant_name ?? '').toLowerCase().includes(query.toLowerCase())
  );

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(s: SeatRow) {
    setEditing({
      id: s.id,
      location_id: s.location_id,
      seat_number: s.seat_number,
      row_idx: s.row_idx,
      col_idx: s.col_idx,
      is_active: s.is_active,
    });
    setDialogOpen(true);
  }

  function handleToggleActive(s: SeatRow, next: boolean) {
    setTogglingId(s.id);
    startTransition(async () => {
      const res = await adminSetSeatActiveAction(s.id, next);
      setTogglingId(null);
      if (!res.success) toast.error(res.error);
      else {
        toast.success(next ? 'Seat unlocked' : 'Seat locked');
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search seats..."
            className="pl-8"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add seat
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Seat</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Default owner</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.seat_number}</TableCell>
                <TableCell>
                  <Badge variant="outline">{s.location_name}</Badge>
                </TableCell>
                <TableCell>
                  {s.occupant_name ?? <span className="text-muted-foreground">Unassigned</span>}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={s.is_active}
                      onCheckedChange={(v) => handleToggleActive(s, v)}
                      disabled={togglingId === s.id}
                    />
                    {togglingId === s.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                  </div>
                </TableCell>
                <TableCell>
                  <Button size="icon" variant="ghost" onClick={() => openEdit(s)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                  No seats found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <SeatFormDialog open={dialogOpen} onOpenChange={setDialogOpen} seat={editing} locations={locations} />
    </div>
  );
}
