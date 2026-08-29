'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { adminSetUserActiveAction } from '@/app/actions/admin-users';
import { UserFormDialog, type EditingUser } from '@/components/admin/master-data/user-form-dialog';
import { Search, Plus, Pencil, Loader2 } from 'lucide-react';
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

export interface UserRow {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  default_location_id: string | null;
  default_seat_id: string | null;
  default_seat_number: string | null;
  default_location_code: string | null;
}

interface Props {
  users: UserRow[];
  locations: Location[];
  seats: Seat[];
}

export function UsersTable({ users, locations, seats }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<EditingUser | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const filtered = users.filter(
    (u) =>
      u.full_name.toLowerCase().includes(query.toLowerCase()) ||
      u.email.toLowerCase().includes(query.toLowerCase())
  );

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(u: UserRow) {
    setEditing({
      id: u.id,
      email: u.email,
      full_name: u.full_name,
      role: u.role,
      default_location_id: u.default_location_id,
      default_seat_id: u.default_seat_id,
      is_active: u.is_active,
    });
    setDialogOpen(true);
  }

  function handleToggleActive(u: UserRow, next: boolean) {
    setTogglingId(u.id);
    startTransition(async () => {
      const res = await adminSetUserActiveAction(u.id, next);
      setTogglingId(null);
      if (!res.success) toast.error(res.error);
      else {
        toast.success(next ? 'User activated' : 'User deactivated — they can no longer sign in');
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
            placeholder="Search users..."
            className="pl-8"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add user
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Default seat</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <div className="font-medium">{u.full_name}</div>
                  <div className="text-xs text-muted-foreground">{u.email}</div>
                </TableCell>
                <TableCell>
                  <Badge variant={u.role === 'ADMIN' ? 'default' : 'outline'}>{u.role}</Badge>
                </TableCell>
                <TableCell>
                  {u.default_seat_number ? (
                    <span>
                      {u.default_seat_number}{' '}
                      <span className="text-muted-foreground">({u.default_location_code})</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Unassigned</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={u.is_active}
                      onCheckedChange={(v) => handleToggleActive(u, v)}
                      disabled={togglingId === u.id}
                    />
                    {togglingId === u.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                  </div>
                </TableCell>
                <TableCell>
                  <Button size="icon" variant="ghost" onClick={() => openEdit(u)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                  No users found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <UserFormDialog open={dialogOpen} onOpenChange={setDialogOpen} user={editing} locations={locations} seats={seats} />
    </div>
  );
}
