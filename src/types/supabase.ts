export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      reservations: {
        Row: {
          id: string;
          customer_name: string;
          reservation_time: string;
          party_size: number;
          phone: string;
          inserted_at: string;
        };
        Insert: {
          id?: string;
          customer_name: string;
          reservation_time: string;
          party_size: number;
          phone: string;
        };
        Update: {
          customer_name?: string;
          reservation_time?: string;
          party_size?: number;
          phone?: string;
        };
      };
      // ... inne tabele
    };
    Views: {};
    Functions: {};
    Enums: {};
    CompositeTypes: {};
  };
}
