import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { ActivityLogRow } from '@/types/database';

const ACTION_VARIANTS: Record<string, string> = {
  BOOK: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30',
  RELEASE: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  CANCEL_RELEASE: 'bg-muted text-muted-foreground',
  CANCEL_BOOKING: 'bg-muted text-muted-foreground',
  REQUEST_SEAT: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
  TRANSFER_APPROVED: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  TRANSFER_REJECTED: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30',
  ADMIN_REASSIGN: 'bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30',
  ADMIN_LOCK: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30',
  ADMIN_UNLOCK: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
};

export function ActivityLogTable({ rows }: { rows: ActivityLogRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Activity Log</CardTitle>
        <CardDescription>Most recent {rows.length} events across the system</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="max-h-[480px] overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Seat</TableHead>
                <TableHead>Location</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {format(new Date(r.created_at), 'MMM d, HH:mm')}
                  </TableCell>
                  <TableCell className="text-sm">{r.actor_name ?? 'System'}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={ACTION_VARIANTS[r.action] ?? ''}>
                      {r.action.replaceAll('_', ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{r.seat_number ?? '—'}</TableCell>
                  <TableCell className="text-sm">{r.location_name ?? '—'}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                    No activity yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
