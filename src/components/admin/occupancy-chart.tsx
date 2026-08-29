'use client';

import { format } from 'date-fns';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { OccupancyTrendRow } from '@/types/database';

interface Props {
  data: OccupancyTrendRow[];
}

export function OccupancyChart({ data }: Props) {
  const chartData = data.map((d) => ({
    date: format(new Date(`${d.day}T00:00:00`), 'MMM d'),
    Occupied: d.occupied_count,
    Released: d.released_count,
    Total: d.total_active_seats,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Daily Occupancy & Release Trends</CardTitle>
        <CardDescription>Across both locations, last {data.length} days</CardDescription>
      </CardHeader>
      <CardContent className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ left: -20, right: 12, top: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="occupiedGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="date" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area
              type="monotone"
              dataKey="Occupied"
              stroke="hsl(var(--primary))"
              fill="url(#occupiedGradient)"
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="Released"
              stroke="#f59e0b"
              fill="#f59e0b"
              fillOpacity={0.08}
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
