'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { adminUpsertSeatAction, type SeatInput } from '@/app/actions/admin-seats';
import { Loader2 } from 'lucide-react';

interface Location {
  id: string;
  name: string;
  code: string;
}

export interface EditingSeat {
  id: string;
  location_id: string;
  seat_number: string;
  row_idx: number;
  col_idx: number;
  is_active: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seat: EditingSeat | null;
  locations: Location[];
}

function emptyForm(defaultLocationId: string | null): SeatInput {
  return {
    id: null,
    locationId: defaultLocationId ?? '',
    seatNumber: '',
    rowIdx: 0,
    colIdx: 0,
    isActive: true,
  };
}

export function SeatFormDialog({ open, onOpenChange, seat, locations }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<SeatInput>(emptyForm(locations[0]?.id ?? null));

  useEffect(() => {
    if (open) {
      setForm(
        seat
          ? {
              id: seat.id,
              locationId: seat.location_id,
              seatNumber: seat.seat_number,
              rowIdx: seat.row_idx,
              colIdx: seat.col_idx,
              isActive: seat.is_active,
            }
          : emptyForm(locations[0]?.id ?? null)
      );
    }
  }, [open, seat, locations]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.locationId) {
      toast.error('Select a location');
      return;
    }
    startTransition(async () => {
      const res = await adminUpsertSeatAction(form);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success(seat ? 'Seat updated' : 'Seat created');
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{seat ? 'Edit seat' : 'Add seat'}</DialogTitle>
          <DialogDescription>
            {seat
              ? 'Renaming a seat keeps its bookings, releases, and default assignment intact.'
              : 'New seats start unplaced on an image-mode floor plan — position them from Floor Layout afterward.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Location</Label>
            <Select value={form.locationId} onValueChange={(v) => setForm((f) => ({ ...f, locationId: v }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select location" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="seat-number">Seat number</Label>
            <Input
              id="seat-number"
              required
              placeholder="e.g. A-51"
              value={form.seatNumber}
              onChange={(e) => setForm((f) => ({ ...f, seatNumber: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="row">Row</Label>
              <Input
                id="row"
                type="number"
                min={0}
                value={form.rowIdx ?? 0}
                onChange={(e) => setForm((f) => ({ ...f, rowIdx: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="col">Col</Label>
              <Input
                id="col"
                type="number"
                min={0}
                value={form.colIdx ?? 0}
                onChange={(e) => setForm((f) => ({ ...f, colIdx: Number(e.target.value) }))}
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="seat-active">Active</Label>
            <Switch
              id="seat-active"
              checked={form.isActive}
              onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {seat ? 'Save changes' : 'Create seat'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
