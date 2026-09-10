import { SEAT_STATUS_STYLES, RESERVED_STYLE } from '@/lib/seat-status';
import type { SeatStatus } from '@/types/database';

const ORDER: SeatStatus[] = ['AVAILABLE', 'OWN', 'OCCUPIED', 'PENDING'];

export function FloorMapLegend() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
      {ORDER.map((status) => {
        const style = SEAT_STATUS_STYLES[status];
        return (
          <div key={status} className="flex items-center gap-1.5">
            <span className={`h-3 w-3 rounded border ${style.bg} ${style.border}`} />
            {style.label}
          </div>
        );
      })}
      <div className="flex items-center gap-1.5">
        <span className={`h-3 w-3 rounded border-2 border-dashed ${RESERVED_STYLE.bg} ${RESERVED_STYLE.border}`} />
        {RESERVED_STYLE.label}
      </div>
    </div>
  );
}
