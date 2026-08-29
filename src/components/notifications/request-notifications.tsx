'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Check, X } from 'lucide-react';

interface Props {
  userId: string;
}

interface EnrichedRequest {
  id: string;
  requester_name: string;
  seat_number: string;
  requested_date: string;
}

export function RequestNotifications({ userId }: Props) {
  const router = useRouter();
  const shownIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const supabase = createClient();

    async function announce(requestId: string) {
      if (shownIds.current.has(requestId)) return;
      shownIds.current.add(requestId);

      const { data } = await supabase
        .from('seat_requests')
        .select('id, requested_date, seats(seat_number), users!seat_requests_requester_id_fkey(full_name)')
        .eq('id', requestId)
        .single();

      if (!data) return;

      const enriched: EnrichedRequest = {
        id: data.id,
        requester_name: data.users?.full_name ?? 'A colleague',
        seat_number: data.seats?.seat_number ?? 'seat',
        requested_date: data.requested_date,
      };

      toast.custom(
        (t) => (
          <div className="flex w-full flex-col gap-2 rounded-lg border bg-background p-4 shadow-lg">
            <p className="text-sm font-medium">Seat request from {enriched.requester_name}</p>
            <p className="text-sm text-muted-foreground">
              They&apos;d like seat <strong>{enriched.seat_number}</strong> on{' '}
              <strong>{enriched.requested_date}</strong>.
            </p>
            <div className="mt-1 flex gap-2">
              <Button
                size="sm"
                className="flex-1"
                onClick={async () => {
                  const { error } = await supabase.rpc('respond_seat_request', {
                    p_request_id: enriched.id,
                    p_approve: true,
                  });
                  if (error) toast.error(error.message);
                  else toast.success('Seat transferred');
                  toast.dismiss(t);
                  router.refresh();
                }}
              >
                <Check className="mr-1 h-4 w-4" /> Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={async () => {
                  const { error } = await supabase.rpc('respond_seat_request', {
                    p_request_id: enriched.id,
                    p_approve: false,
                  });
                  if (error) toast.error(error.message);
                  else toast.info('Request rejected');
                  toast.dismiss(t);
                  router.refresh();
                }}
              >
                <X className="mr-1 h-4 w-4" /> Reject
              </Button>
            </div>
          </div>
        ),
        { id: enriched.id, duration: Infinity }
      );
    }

    // Catch up on anything pending from before this session connected.
    supabase
      .from('seat_requests')
      .select('id')
      .eq('target_user_id', userId)
      .eq('status', 'PENDING')
      .then(({ data }) => {
        data?.forEach((r) => announce(r.id));
      });

    const channel = supabase
      .channel(`seat_requests:target:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'seat_requests',
          filter: `target_user_id=eq.${userId}`,
        },
        (payload) => announce(payload.new.id as string)
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'seat_requests',
          filter: `requester_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as { status: string; id: string };
          if (row.status === 'APPROVED') {
            toast.success('Your seat request was approved!');
            router.refresh();
          } else if (row.status === 'REJECTED') {
            toast.info('Your seat request was rejected.');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, router]);

  return null;
}
