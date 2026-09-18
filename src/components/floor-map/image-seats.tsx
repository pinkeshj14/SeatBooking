'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { TransformWrapper, TransformComponent, useControls } from 'react-zoom-pan-pinch';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { deriveSeatStatus, getSeatStyle, firstName } from '@/lib/seat-status';
import type { SeatMapRow } from '@/types/database';

interface Props {
  seatMap: SeatMapRow[];
  floorPlanUrl: string;
  currentUserId: string;
  onSeatClick: (seat: SeatMapRow) => void;
}

// Fallback height/width ratio used for the very first render, before the
// image has loaded and reported its real aspect ratio.
const DEFAULT_ASPECT = 0.6;

function ZoomControls() {
  const { zoomIn, zoomOut, resetTransform } = useControls();
  return (
    <div className="absolute right-2 top-2 z-10 flex gap-1 rounded-md border bg-background/90 p-1 shadow-sm backdrop-blur">
      <button
        type="button"
        onClick={() => zoomIn()}
        className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        title="Zoom in"
      >
        <ZoomIn className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => zoomOut()}
        className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        title="Zoom out"
      >
        <ZoomOut className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => resetTransform()}
        className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        title="Reset view"
      >
        <Maximize2 className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * Seats placed by percentage (x, y) over an uploaded floor plan image, in
 * lieu of the uniform CSS grid. Each marker always shows the seat number and
 * occupant's first name directly (full name via the title tooltip) — sized
 * to fit a short name on one line without wrapping or overlapping neighbors.
 *
 * The whole page no longer pinch-zooms (see the `viewport` export in
 * app/layout.tsx) — a two-finger pinch, mouse wheel, or the +/- controls
 * zoom just this floor plan instead, via react-zoom-pan-pinch. The viewport
 * box is sized in JS from the image's natural aspect ratio so the *default*
 * view still fits the whole layout to the container width exactly as
 * before (no letterboxing); zooming in pans/clips within that same
 * on-screen box instead of growing the page.
 */
export function ImageSeats({ seatMap, floorPlanUrl, currentUserId, onSeatClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const aspectRef = useRef<number>(DEFAULT_ASPECT); // naturalHeight / naturalWidth
  const [boxSize, setBoxSize] = useState<{ width: number; height: number } | null>(null);

  const recompute = useCallback(() => {
    const width = containerRef.current?.clientWidth;
    if (!width) return;
    setBoxSize({ width, height: width * aspectRef.current });
  }, []);

  useEffect(() => {
    recompute();
    window.addEventListener('resize', recompute);
    return () => window.removeEventListener('resize', recompute);
  }, [recompute]);

  function handleImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    if (img.naturalWidth > 0) {
      aspectRef.current = img.naturalHeight / img.naturalWidth;
      recompute();
    }
  }

  return (
    <div ref={containerRef} className="relative overflow-hidden rounded-xl border bg-card">
      <TransformWrapper initialScale={1} minScale={1} maxScale={4} limitToBounds wheel={{ step: 0.2 }} pinch={{ step: 5 }} doubleClick={{ mode: 'toggle', step: 1.5 }}>
        <ZoomControls />
        <TransformComponent
          wrapperStyle={{ width: boxSize?.width, height: boxSize?.height ?? 300 }}
          contentStyle={{ width: boxSize?.width, height: boxSize?.height }}
        >
          <div className="relative" style={{ width: boxSize?.width, height: boxSize?.height }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL, not a local asset */}
            <img
              src={floorPlanUrl}
              alt="Floor plan"
              className="block h-full w-full select-none"
              draggable={false}
              onLoad={handleImageLoad}
            />

            {seatMap.filter((seat) => seat.is_active).map((seat) => {
              const status = deriveSeatStatus(seat, currentUserId);
              const style = getSeatStyle(status, seat.is_reserved_pending);
              const x = seat.pos_x ?? 2;
              const y = seat.pos_y ?? 2;

              return (
                <button
                  key={seat.seat_id}
                  type="button"
                  onClick={() => onSeatClick(seat)}
                  disabled={!seat.is_active}
                  title={seat.occupant_name ? `${seat.seat_number} — ${seat.occupant_name}` : seat.seat_number}
                  style={{ left: `${x}%`, top: `${y}%` }}
                  className={cn(
                    'absolute flex min-w-[3rem] max-w-[5rem] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-md border-2 px-1 py-1 text-center shadow-sm transition-transform sm:min-w-[3.5rem]',
                    seat.is_active ? 'cursor-pointer hover:z-10 hover:scale-105' : 'cursor-not-allowed opacity-50',
                    seat.is_active ? style.bg : 'bg-muted',
                    seat.is_active ? style.border : 'border-dashed border-muted-foreground/40',
                    seat.is_active && seat.is_reserved_pending && 'border-dashed',
                    seat.is_active ? style.text : ''
                  )}
                >
                  <span className="text-[9px] font-bold leading-tight sm:text-[10px]">{seat.seat_number}</span>
                  <span
                    className={cn(
                      'max-w-full truncate text-[8px] font-medium leading-tight sm:text-[9px]',
                      seat.occupant_name ? '' : 'italic opacity-70'
                    )}
                  >
                    {seat.occupant_name ? firstName(seat.occupant_name) : 'Available'}
                  </span>
                </button>
              );
            })}
          </div>
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
}
