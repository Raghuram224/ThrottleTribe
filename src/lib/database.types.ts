// Generated with the Supabase MCP `generate_typescript_types` (project aqzpdxyckwbxlvqnsnye).
// Regenerate after schema changes. The Phase 1 spike table and the verbose helper generics are left out.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type RideRow = {
  code: string;
  created_at: string;
  ended_at: string | null;
  id: string;
  leader_id: string;
  name: string;
  started_at: string | null;
  status: Database['public']['Enums']['ride_status'];
  stop_threshold_s: number;
  stop_name: string | null;
  stop_address: string | null;
  stop_lat: number | null;
  stop_lng: number | null;
  stop_kind: string | null;
  stop_set_by: string | null;
  stop_set_at: string | null;
};

export type Database = {
  // Allows to automatically instantiate createClient with right options
  __InternalSupabase: {
    PostgrestVersion: '14.18';
  };
  public: {
    Tables: {
      app_errors: {
        Row: {
          app_version: string | null;
          client_at: string;
          component_stack: string | null;
          created_at: string;
          device_model: string | null;
          extra: Json;
          id: number;
          is_fatal: boolean;
          kind: 'js_fatal' | 'js_error' | 'unhandled_rejection' | 'render' | 'background_task';
          message: string;
          os_version: string | null;
          platform: 'ios' | 'android';
          ride_id: string | null;
          screen: string | null;
          session_id: string;
          stack: string | null;
          user_id: string;
        };
        Insert: {
          app_version?: string | null;
          client_at: string;
          component_stack?: string | null;
          created_at?: string;
          device_model?: string | null;
          extra?: Json;
          id?: never;
          is_fatal?: boolean;
          kind: 'js_fatal' | 'js_error' | 'unhandled_rejection' | 'render' | 'background_task';
          message: string;
          os_version?: string | null;
          platform: 'ios' | 'android';
          ride_id?: string | null;
          screen?: string | null;
          session_id: string;
          stack?: string | null;
          user_id?: string;
        };
        // Insert-only for clients (no UPDATE grant).
        Update: { [_ in never]: never };
        Relationships: [];
      };
      app_events: {
        Row: {
          app_version: string | null;
          client_at: string;
          created_at: string;
          device_model: string | null;
          id: number;
          name: string;
          os_version: string | null;
          platform: 'ios' | 'android';
          props: Json;
          ride_id: string | null;
          screen: string | null;
          session_id: string;
          user_id: string;
        };
        Insert: {
          app_version?: string | null;
          client_at: string;
          created_at?: string;
          device_model?: string | null;
          id?: never;
          name: string;
          os_version?: string | null;
          platform: 'ios' | 'android';
          props?: Json;
          ride_id?: string | null;
          screen?: string | null;
          session_id: string;
          user_id?: string;
        };
        // Insert-only for clients (no UPDATE grant).
        Update: { [_ in never]: never };
        Relationships: [];
      };
      // --- sos contacts ---
      emergency_contacts: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          phone: string;
          position: number;
          relation: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          phone: string;
          position?: number;
          relation?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          phone?: string;
          position?: number;
          relation?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      // --- end sos contacts ---
      profiles: {
        Row: {
          bike: string | null;
          created_at: string;
          display_name: string;
          emergency_contact: string | null;
          id: string;
          updated_at: string;
        };
        Insert: {
          bike?: string | null;
          created_at?: string;
          display_name: string;
          emergency_contact?: string | null;
          id: string;
          updated_at?: string;
        };
        Update: {
          bike?: string | null;
          created_at?: string;
          display_name?: string;
          emergency_contact?: string | null;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      ride_events: {
        Row: {
          created_at: string;
          id: number;
          payload: Json;
          ride_id: string;
          type: string;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          id?: never;
          payload?: Json;
          ride_id: string;
          type: string;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: never;
          payload?: Json;
          ride_id?: string;
          type?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'ride_events_ride_id_fkey';
            columns: ['ride_id'];
            isOneToOne: false;
            referencedRelation: 'rides';
            referencedColumns: ['id'];
          },
        ];
      };
      ride_members: {
        Row: {
          color_index: number;
          joined_at: string;
          left_at: string | null;
          ride_id: string;
          role: string;
          sos: boolean;
          sos_at: string | null;
          user_id: string;
        };
        Insert: {
          color_index?: number;
          joined_at?: string;
          left_at?: string | null;
          ride_id: string;
          role?: string;
          sos?: boolean;
          sos_at?: string | null;
          user_id: string;
        };
        Update: {
          color_index?: number;
          joined_at?: string;
          left_at?: string | null;
          ride_id?: string;
          role?: string;
          sos?: boolean;
          sos_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ride_members_ride_id_fkey';
            columns: ['ride_id'];
            isOneToOne: false;
            referencedRelation: 'rides';
            referencedColumns: ['id'];
          },
        ];
      };
      ride_samples: {
        Row: {
          accuracy_m: number | null;
          app_state: string | null;
          battery: number | null;
          heading: number | null;
          id: number;
          lat: number;
          lng: number;
          received_at: string;
          recorded_at: string;
          ride_id: string;
          speed_mps: number | null;
          user_id: string;
        };
        Insert: {
          accuracy_m?: number | null;
          app_state?: string | null;
          battery?: number | null;
          heading?: number | null;
          id?: never;
          lat: number;
          lng: number;
          received_at?: string;
          recorded_at: string;
          ride_id: string;
          speed_mps?: number | null;
          user_id?: string;
        };
        Update: {
          accuracy_m?: number | null;
          app_state?: string | null;
          battery?: number | null;
          heading?: number | null;
          id?: never;
          lat?: number;
          lng?: number;
          received_at?: string;
          recorded_at?: string;
          ride_id?: string;
          speed_mps?: number | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ride_samples_ride_id_user_id_fkey';
            columns: ['ride_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'ride_members';
            referencedColumns: ['ride_id', 'user_id'];
          },
        ];
      };
      rider_positions: {
        Row: {
          accuracy_m: number | null;
          heading: number | null;
          lat: number;
          lng: number;
          recorded_at: string;
          ride_id: string;
          slow_since: string | null;
          speed_mps: number | null;
          stop_notified: boolean;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          accuracy_m?: number | null;
          heading?: number | null;
          lat: number;
          lng: number;
          recorded_at: string;
          ride_id: string;
          slow_since?: string | null;
          speed_mps?: number | null;
          stop_notified?: boolean;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          accuracy_m?: number | null;
          heading?: number | null;
          lat?: number;
          lng?: number;
          recorded_at?: string;
          ride_id?: string;
          slow_since?: string | null;
          speed_mps?: number | null;
          stop_notified?: boolean;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'rider_positions_ride_id_user_id_fkey';
            columns: ['ride_id', 'user_id'];
            isOneToOne: true;
            referencedRelation: 'ride_members';
            referencedColumns: ['ride_id', 'user_id'];
          },
        ];
      };
      rides: {
        Row: RideRow;
        Insert: {
          code: string;
          created_at?: string;
          ended_at?: string | null;
          id?: string;
          leader_id: string;
          name: string;
          started_at?: string | null;
          status?: Database['public']['Enums']['ride_status'];
          stop_threshold_s?: number;
          stop_name?: string | null;
          stop_address?: string | null;
          stop_lat?: number | null;
          stop_lng?: number | null;
          stop_kind?: string | null;
          stop_set_by?: string | null;
          stop_set_at?: string | null;
        };
        Update: {
          code?: string;
          created_at?: string;
          ended_at?: string | null;
          id?: string;
          leader_id?: string;
          name?: string;
          started_at?: string | null;
          status?: Database['public']['Enums']['ride_status'];
          stop_threshold_s?: number;
          stop_name?: string | null;
          stop_address?: string | null;
          stop_lat?: number | null;
          stop_lng?: number | null;
          stop_kind?: string | null;
          stop_set_by?: string | null;
          stop_set_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      clear_stop: { Args: { p_ride_id: string }; Returns: undefined };
      create_ride: {
        Args: { p_name: string; p_stop_threshold_s?: number };
        Returns: RideRow;
        SetofOptions: { from: '*'; to: 'rides'; isOneToOne: true; isSetofReturn: false };
      };
      decide_stop: { Args: { p_accept: boolean; p_proposal_id: number; p_ride_id: string }; Returns: undefined };
      delete_my_account: { Args: Record<string, never>; Returns: undefined };
      end_ride: {
        Args: { p_ride_id: string };
        Returns: RideRow;
        SetofOptions: { from: '*'; to: 'rides'; isOneToOne: true; isSetofReturn: false };
      };
      join_ride: {
        Args: { p_code: string };
        Returns: RideRow;
        SetofOptions: { from: '*'; to: 'rides'; isOneToOne: true; isSetofReturn: false };
      };
      leave_ride: { Args: { p_ride_id: string }; Returns: undefined };
      propose_stop: {
        Args: { p_address: string; p_kind: string; p_lat: number; p_lng: number; p_name: string; p_ride_id: string };
        Returns: Json;
      };
      send_ride_message: { Args: { p_kind: string; p_ride_id: string }; Returns: undefined };
      set_sos: { Args: { p_on: boolean; p_ride_id: string }; Returns: undefined };
      start_ride: {
        Args: { p_ride_id: string };
        Returns: RideRow;
        SetofOptions: { from: '*'; to: 'rides'; isOneToOne: true; isSetofReturn: false };
      };
    };
    Enums: {
      ride_status: 'lobby' | 'active' | 'ended';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type PublicSchema = Database['public'];

export type Tables<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row'];
export type TablesInsert<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Insert'];
export type Enums<T extends keyof PublicSchema['Enums']> = PublicSchema['Enums'][T];

export const Constants = {
  public: {
    Enums: {
      ride_status: ['lobby', 'active', 'ended'],
    },
  },
} as const;
