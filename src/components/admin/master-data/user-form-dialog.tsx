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
import { adminCreateUserAction, adminUpdateUserAction, type UserInput } from '@/app/actions/admin-users';
import { Loader2 } from 'lucide-react';
import type { UserRole } from '@/types/database';

interface Location {
  id: string;
  name: string;
  code: string;
}

interface Seat {
  id: string;
  seat_number: string;
  location_id: string;
}

export interface EditingUser {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  default_location_id: string | null;
  default_seat_id: string | null;
  is_active: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: EditingUser | null;
  locations: Location[];
  seats: Seat[];
}

const EMPTY: UserInput = {
  email: '',
  fullName: '',
  role: 'EMPLOYEE',
  defaultLocationId: null,
  defaultSeatId: null,
  isActive: true,
};

export function UserFormDialog({ open, onOpenChange, user, locations, seats }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<UserInput>(EMPTY);

  useEffect(() => {
    if (open) {
      setForm(
        user
          ? {
              email: user.email,
              fullName: user.full_name,
              role: user.role,
              defaultLocationId: user.default_location_id,
              defaultSeatId: user.default_seat_id,
              isActive: user.is_active,
            }
          : EMPTY
      );
    }
  }, [open, user]);

  const seatsForLocation = seats.filter((s) => s.location_id === form.defaultLocationId);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = user
        ? await adminUpdateUserAction(user.id, form)
        : await adminCreateUserAction(form);

      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success(user ? 'User updated' : 'User created — they can sign in via Magic Link');
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{user ? 'Edit user' : 'Add user'}</DialogTitle>
          <DialogDescription>
            {user
              ? 'Changing the email updates their login. Password is never needed — sign-in is via Magic Link or Microsoft SSO.'
              : 'Creates a new account. The new user signs in via Magic Link (no password to share).'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="full-name">Full name</Label>
            <Input
              id="full-name"
              required
              value={form.fullName}
              onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v as UserRole }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EMPLOYEE">Employee</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col justify-end gap-2 pb-0.5">
              <Label htmlFor="active">Active</Label>
              <div className="flex h-9 items-center">
                <Switch
                  id="active"
                  checked={form.isActive}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Default location</Label>
            <Select
              value={form.defaultLocationId ?? 'none'}
              onValueChange={(v) =>
                setForm((f) => ({
                  ...f,
                  defaultLocationId: v === 'none' ? null : v,
                  defaultSeatId: null,
                }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {locations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Default seat</Label>
            <Select
              value={form.defaultSeatId ?? 'none'}
              onValueChange={(v) => setForm((f) => ({ ...f, defaultSeatId: v === 'none' ? null : v }))}
              disabled={!form.defaultLocationId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="none">Unassigned</SelectItem>
                {seatsForLocation.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.seat_number}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {user ? 'Save changes' : 'Create user'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
