'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { FLOOR_PLANS_BUCKET } from '@/lib/floor-plan-url';
import { setLocationFloorPlanAction, bulkUpdateSeatPositionsAction } from '@/app/actions/floor-plan';
import { Loader2, Upload, RotateCcw, Save, LayoutGrid } from 'lucide-react';
import type { LayoutMode } from '@/types/database';

interface SeatRow {
  id: string;
  seat_number: string;
  pos_x: number | null;
  pos_y: number | null;
}

interface LocationRow {
  id: string;
  name: string;
  layout_mode: LayoutMode;
  floor_plan_path: string | null;
}

interface Props {
  location: LocationRow;
  seats: SeatRow[];
  floorPlanUrl: string | null;
}

function scatterDefault(index: number) {
  // Cascades unplaced seats along the top-left so every pin starts visible
  // and draggable instead of stacking at (0, 0).
  const col = index % 10;
  const row = Math.floor(index / 10);
  return { x: 4 + col * 3, y: 4 + row * 5 };
}

export function FloorPlanEditor({ location, seats, floorPlanUrl }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingId = useRef<string | null>(null);

  const initialPositions = useMemo(() => {
    const map = new Map<string, { x: number; y: number; placed: boolean }>();
    seats.forEach((s, i) => {
      if (s.pos_x != null && s.pos_y != null) {
        map.set(s.id, { x: s.pos_x, y: s.pos_y, placed: true });
      } else {
        const fallback = scatterDefault(i);
        map.set(s.id, { ...fallback, placed: false });
      }
    });
    return map;
  }, [seats]);

  const [positions, setPositions] = useState(initialPositions);
  const [dirty, setDirty] = useState(false);

  function handlePointerDown(seatId: string, e: React.PointerEvent<HTMLButtonElement>) {
    e.preventDefault();
    draggingId.current = seatId;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const seatId = draggingId.current;
    if (!seatId || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100));
    setPositions((prev) => {
      const next = new Map(prev);
      next.set(seatId, { x, y, placed: true });
      return next;
    });
    setDirty(true);
  }

  function handlePointerUp(e: React.PointerEvent<HTMLButtonElement>) {
    if (draggingId.current) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    draggingId.current = null;
  }

  async function handleUpload(file: File) {
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image must be under 10MB');
      return;
    }
    setUploading(true);
    const supabase = createClient();
    const ext = file.name.split('.').pop() || 'png';
    const path = `${location.id}/floor-plan-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(FLOOR_PLANS_BUCKET)
      .upload(path, file, { upsert: true, cacheControl: '3600' });

    if (uploadError) {
      setUploading(false);
      toast.error(uploadError.message);
      return;
    }

    const res = await setLocationFloorPlanAction(location.id, path, 'image');
    setUploading(false);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    toast.success('Floor plan uploaded — drag each seat into place below');
    router.refresh();
  }

  function handleSavePositions() {
    startTransition(async () => {
      const payload = Array.from(positions.entries()).map(([seat_id, p]) => ({
        seat_id,
        pos_x: Math.round(p.x * 100) / 100,
        pos_y: Math.round(p.y * 100) / 100,
      }));
      const res = await bulkUpdateSeatPositionsAction(payload);
      if (!res.success) {
        toast.error(res.error);
      } else {
        toast.success('Seat positions saved');
        setDirty(false);
        router.refresh();
      }
    });
  }

  function handleSwitchToGrid() {
    startTransition(async () => {
      const res = await setLocationFloorPlanAction(location.id, location.floor_plan_path, 'grid');
      if (!res.success) toast.error(res.error);
      else {
        toast.success('Switched back to the default grid layout');
        router.refresh();
      }
    });
  }

  const unplacedCount = seats.filter((s) => s.pos_x == null || s.pos_y == null).length;

  if (location.layout_mode === 'grid' || !floorPlanUrl) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload a custom floor plan</CardTitle>
          <CardDescription>
            {location.name} is currently using the default uniform grid. Upload a floor plan image
            (e.g. a CAD export or photo of your seating chart) to switch to a custom layout — you&apos;ll
            then drag each seat onto its exact spot.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-10 text-sm text-muted-foreground hover:bg-muted/40">
            {uploading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6" />}
            <span>{uploading ? 'Uploading…' : 'Click to choose an image, or drag one here'}</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
                e.target.value = '';
              }}
            />
          </label>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>
            Drag each pin onto its seat.{' '}
            {unplacedCount > 0 && (
              <Badge variant="outline" className="ml-1 border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-400">
                {unplacedCount} not yet placed
              </Badge>
            )}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="cursor-pointer">
            <Button variant="outline" size="sm" disabled={uploading} asChild>
              <span>
                {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                Replace image
              </span>
            </Button>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
                e.target.value = '';
              }}
            />
          </label>
          <Button variant="outline" size="sm" onClick={handleSwitchToGrid} disabled={pending}>
            <LayoutGrid className="mr-2 h-4 w-4" />
            Switch to grid
          </Button>
          <Button size="sm" onClick={handleSavePositions} disabled={!dirty || pending}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save positions
          </Button>
        </div>
      </div>

      <div className="overflow-auto rounded-xl border bg-card p-2">
        <div ref={containerRef} className="relative inline-block min-w-full touch-none align-top">
          {/* eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL */}
          <img src={floorPlanUrl} alt="Floor plan" className="block h-auto w-full select-none" draggable={false} />

          {seats.map((seat) => {
            const pos = positions.get(seat.id)!;
            return (
              <button
                key={seat.id}
                type="button"
                onPointerDown={(e) => handlePointerDown(seat.id, e)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                title={seat.seat_number}
                className={cn(
                  'absolute flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full border-2 bg-primary text-[10px] font-semibold text-primary-foreground shadow-md active:cursor-grabbing',
                  pos.placed ? 'border-primary' : 'border-dashed border-amber-500 opacity-80'
                )}
              >
                {seat.seat_number.split('-')[1] ?? seat.seat_number}
              </button>
            );
          })}
        </div>
      </div>

      {dirty && (
        <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
          <RotateCcw className="h-3.5 w-3.5" />
          You have unsaved position changes.
        </p>
      )}
    </div>
  );
}
