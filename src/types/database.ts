export type UserRole = 'ADMIN' | 'EMPLOYEE';
export type BookingStatus = 'CONFIRMED' | 'CANCELLED';
export type SeatRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
export type SeatStatus = 'AVAILABLE' | 'OWN' | 'OCCUPIED' | 'PENDING';
export type LayoutMode = 'grid' | 'image';

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          full_name: string;
          role: UserRole;
          default_location_id: string | null;
          default_seat_id: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name: string;
          role?: UserRole;
          default_location_id?: string | null;
          default_seat_id?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['users']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'users_default_location_id_fkey';
            columns: ['default_location_id'];
            isOneToOne: false;
            referencedRelation: 'locations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'users_default_seat_id_fkey';
            columns: ['default_seat_id'];
            isOneToOne: true;
            referencedRelation: 'seats';
            referencedColumns: ['id'];
          },
        ];
      };
      locations: {
        Row: {
          id: string;
          name: string;
          code: string;
          total_seats: number;
          layout_config: { rows: number; cols: number };
          layout_mode: LayoutMode;
          floor_plan_path: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          code: string;
          total_seats?: number;
          layout_config?: { rows: number; cols: number };
          layout_mode?: LayoutMode;
          floor_plan_path?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['locations']['Insert']>;
        Relationships: [];
      };
      seats: {
        Row: {
          id: string;
          location_id: string;
          seat_number: string;
          row_idx: number;
          col_idx: number;
          pos_x: number | null;
          pos_y: number | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          location_id: string;
          seat_number: string;
          row_idx?: number;
          col_idx?: number;
          pos_x?: number | null;
          pos_y?: number | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['seats']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'seats_location_id_fkey';
            columns: ['location_id'];
            isOneToOne: false;
            referencedRelation: 'locations';
            referencedColumns: ['id'];
          },
        ];
      };
      seat_releases: {
        Row: {
          id: string;
          user_id: string;
          seat_id: string;
          start_date: string;
          end_date: string;
          reason: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          seat_id: string;
          start_date: string;
          end_date: string;
          reason?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['seat_releases']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'seat_releases_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'seat_releases_seat_id_fkey';
            columns: ['seat_id'];
            isOneToOne: false;
            referencedRelation: 'seats';
            referencedColumns: ['id'];
          },
        ];
      };
      bookings: {
        Row: {
          id: string;
          user_id: string;
          seat_id: string;
          location_id: string;
          booking_date: string;
          status: BookingStatus;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          seat_id: string;
          location_id: string;
          booking_date: string;
          status?: BookingStatus;
          created_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['bookings']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'bookings_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bookings_seat_id_fkey';
            columns: ['seat_id'];
            isOneToOne: false;
            referencedRelation: 'seats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bookings_location_id_fkey';
            columns: ['location_id'];
            isOneToOne: false;
            referencedRelation: 'locations';
            referencedColumns: ['id'];
          },
        ];
      };
      seat_requests: {
        Row: {
          id: string;
          requester_id: string;
          target_user_id: string;
          seat_id: string;
          requested_date: string;
          status: SeatRequestStatus;
          created_at: string;
          resolved_at: string | null;
        };
        Insert: {
          id?: string;
          requester_id: string;
          target_user_id: string;
          seat_id: string;
          requested_date: string;
          status?: SeatRequestStatus;
          created_at?: string;
          resolved_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['seat_requests']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'seat_requests_requester_id_fkey';
            columns: ['requester_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'seat_requests_target_user_id_fkey';
            columns: ['target_user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'seat_requests_seat_id_fkey';
            columns: ['seat_id'];
            isOneToOne: false;
            referencedRelation: 'seats';
            referencedColumns: ['id'];
          },
        ];
      };
      activity_log: {
        Row: {
          id: string;
          actor_id: string | null;
          action: string;
          seat_id: string | null;
          location_id: string | null;
          details: Record<string, unknown>;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_id?: string | null;
          action: string;
          seat_id?: string | null;
          location_id?: string | null;
          details?: Record<string, unknown>;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['activity_log']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'activity_log_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'activity_log_seat_id_fkey';
            columns: ['seat_id'];
            isOneToOne: false;
            referencedRelation: 'seats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'activity_log_location_id_fkey';
            columns: ['location_id'];
            isOneToOne: false;
            referencedRelation: 'locations';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_seat_map: {
        Args: { p_location_id: string; p_date: string };
        Returns: SeatMapRow[];
      };
      release_seat_range: {
        Args: { p_seat_id: string; p_start_date: string; p_end_date: string; p_reason?: string | null };
        Returns: string;
      };
      cancel_release: {
        Args: { p_release_id: string };
        Returns: undefined;
      };
      book_seat_range: {
        Args: { p_seat_id: string; p_start_date: string; p_end_date: string; p_for_user_id?: string | null };
        Returns: Database['public']['Tables']['bookings']['Row'][];
      };
      cancel_booking_range: {
        Args: { p_seat_id: string; p_start_date: string; p_end_date: string };
        Returns: undefined;
      };
      request_seat: {
        Args: { p_seat_id: string; p_requested_date: string };
        Returns: string;
      };
      respond_seat_request: {
        Args: { p_request_id: string; p_approve: boolean };
        Returns: undefined;
      };
      admin_reassign_default_seat: {
        Args: { p_user_id: string; p_seat_id: string };
        Returns: undefined;
      };
      admin_set_seat_active: {
        Args: { p_seat_id: string; p_is_active: boolean };
        Returns: undefined;
      };
      get_occupancy_trend: {
        Args: { p_days?: number };
        Returns: OccupancyTrendRow[];
      };
      get_activity_log: {
        Args: { p_limit?: number; p_offset?: number };
        Returns: ActivityLogRow[];
      };
      admin_set_location_floor_plan: {
        Args: { p_location_id: string; p_floor_plan_path: string | null; p_layout_mode: LayoutMode };
        Returns: undefined;
      };
      admin_bulk_update_seat_positions: {
        Args: { p_positions: { seat_id: string; pos_x: number; pos_y: number }[] };
        Returns: undefined;
      };
      admin_set_user_active: {
        Args: { p_user_id: string; p_is_active: boolean };
        Returns: undefined;
      };
      admin_upsert_seat: {
        Args: {
          p_id: string | null;
          p_location_id: string;
          p_seat_number: string;
          p_row_idx: number | null;
          p_col_idx: number | null;
          p_is_active: boolean;
        };
        Returns: string;
      };
      get_booking_window: {
        Args: Record<string, never>;
        Returns: BookingWindowRow[];
      };
      get_user_seat_conflicts: {
        Args: { p_start_date: string; p_end_date: string; p_exclude_seat_id: string };
        Returns: SeatConflictRow[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export interface OccupancyTrendRow {
  day: string;
  occupied_count: number;
  released_count: number;
  total_active_seats: number;
}

export interface ActivityLogRow {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  seat_number: string | null;
  location_name: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export interface SeatMapRow {
  seat_id: string;
  seat_number: string;
  row_idx: number;
  col_idx: number;
  pos_x: number | null;
  pos_y: number | null;
  is_active: boolean;
  status: SeatStatus;
  occupant_id: string | null;
  occupant_name: string | null;
  is_default_seat: boolean;
  default_owner_id: string | null;
  default_owner_name: string | null;
  released: boolean;
  is_reserved_pending: boolean;
  pending_request_id: string | null;
}

export interface BookingWindowRow {
  min_date: string;
  max_date: string;
}

export interface SeatConflictRow {
  seat_id: string;
  seat_number: string;
  conflict_date: string;
  hold_type: 'booked' | 'reserved';
}
