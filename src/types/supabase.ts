export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      admin_notifications: {
        Row: {
          created_at: string
          id: string
          message: string | null
          read: boolean
          restaurant_id: string
          title: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          read?: boolean
          restaurant_id: string
          title: string
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          read?: boolean
          restaurant_id?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_notifications_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_push_subscriptions: {
        Row: {
          auth: string | null
          created_at: string
          endpoint: string
          id: string
          p256dh: string | null
          restaurant_id: string
          restaurant_slug: string | null
          subscription: Json
        }
        Insert: {
          auth?: string | null
          created_at?: string
          endpoint: string
          id?: string
          p256dh?: string | null
          restaurant_id: string
          restaurant_slug?: string | null
          subscription: Json
        }
        Update: {
          auth?: string | null
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string | null
          restaurant_id?: string
          restaurant_slug?: string | null
          subscription?: Json
        }
        Relationships: []
      }
      blocked_addresses: {
        Row: {
          active: boolean
          created_at: string
          id: string
          note: string | null
          pattern: string
          restaurant_id: string
          type: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          note?: string | null
          pattern: string
          restaurant_id: string
          type?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          note?: string | null
          pattern?: string
          restaurant_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocked_addresses_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      closure_windows: {
        Row: {
          created_at: string
          end_time: string | null
          id: string
          is_active: boolean
          restaurant_id: string
          start_time: string | null
          weekday: number | null
        }
        Insert: {
          created_at?: string
          end_time?: string | null
          id?: string
          is_active?: boolean
          restaurant_id: string
          start_time?: string | null
          weekday?: number | null
        }
        Update: {
          created_at?: string
          end_time?: string | null
          id?: string
          is_active?: boolean
          restaurant_id?: string
          start_time?: string | null
          weekday?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "closure_windows_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_settings: {
        Row: {
          blocked_hours: Json | null
          max_delivery_km: number
          restaurant_id: string
        }
        Insert: {
          blocked_hours?: Json | null
          max_delivery_km?: number
          restaurant_id: string
        }
        Update: {
          blocked_hours?: Json | null
          max_delivery_km?: number
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_zones: {
        Row: {
          active: boolean
          cost: number
          cost_fixed: number
          cost_per_km: number
          eta_max_minutes: number
          eta_min_minutes: number
          free_over: number | null
          id: string
          max_distance_km: number
          min_distance_km: number
          min_order_value: number
          pricing_type: string
          restaurant_id: string
        }
        Insert: {
          active?: boolean
          cost?: number
          cost_fixed?: number
          cost_per_km?: number
          eta_max_minutes: number
          eta_min_minutes: number
          free_over?: number | null
          id?: string
          max_distance_km: number
          min_distance_km?: number
          min_order_value?: number
          pricing_type?: string
          restaurant_id: string
        }
        Update: {
          active?: boolean
          cost?: number
          cost_fixed?: number
          cost_per_km?: number
          eta_max_minutes?: number
          eta_min_minutes?: number
          free_over?: number | null
          id?: string
          max_distance_km?: number
          min_distance_km?: number
          min_order_value?: number
          pricing_type?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_zones_restaurant_fk"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_zones_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      discount_codes: {
        Row: {
          active: boolean
          apply_scope: Database["public"]["Enums"]["discount_apply_scope"]
          code: string | null
          created_at: string
          description: string | null
          exclude_categories: string[]
          exclude_products: string[]
          expires_at: string | null
          id: string
          include_categories: string[]
          include_products: string[]
          is_loyalty: boolean | null
          min_order: number | null
          require_code: boolean
          restaurant_id: string | null
          type: string
          value: number
        }
        Insert: {
          active?: boolean
          apply_scope?: Database["public"]["Enums"]["discount_apply_scope"]
          code?: string | null
          created_at?: string
          description?: string | null
          exclude_categories?: string[]
          exclude_products?: string[]
          expires_at?: string | null
          id?: string
          include_categories?: string[]
          include_products?: string[]
          is_loyalty?: boolean | null
          min_order?: number | null
          require_code?: boolean
          restaurant_id?: string | null
          type: string
          value: number
        }
        Update: {
          active?: boolean
          apply_scope?: Database["public"]["Enums"]["discount_apply_scope"]
          code?: string | null
          created_at?: string
          description?: string | null
          exclude_categories?: string[]
          exclude_products?: string[]
          expires_at?: string | null
          id?: string
          include_categories?: string[]
          include_products?: string[]
          is_loyalty?: boolean | null
          min_order?: number | null
          require_code?: boolean
          restaurant_id?: string | null
          type?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "discount_codes_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_accounts: {
        Row: {
          roll_reward_claimed: boolean
          stickers: number
          updated_at: string
          user_id: string
        }
        Insert: {
          roll_reward_claimed?: boolean
          stickers?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          roll_reward_claimed?: boolean
          stickers?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      loyalty_ledger: {
        Row: {
          created_at: string
          id: number
          kind: string
          order_id: string | null
          stickers_awarded: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: number
          kind?: string
          order_id?: string | null
          stickers_awarded: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: number
          kind?: string
          order_id?: string | null
          stickers_awarded?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_ledger_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      modifier_groups: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_required: boolean
          max_select: number
          metadata: Json
          min_select: number
          name: string
          position: number
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          max_select?: number
          metadata?: Json
          min_select?: number
          name: string
          position?: number
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          max_select?: number
          metadata?: Json
          min_select?: number
          name?: string
          position?: number
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      modifiers: {
        Row: {
          created_at: string
          description: string | null
          group_id: string
          id: string
          is_active: boolean
          metadata: Json
          name: string
          position: number
          price_delta_cents: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          group_id: string
          id?: string
          is_active?: boolean
          metadata?: Json
          name: string
          position?: number
          price_delta_cents?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          group_id?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          name?: string
          position?: number
          price_delta_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "modifiers_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "modifier_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      notice_bars: {
        Row: {
          close_time: string | null
          created_at: string
          enabled: boolean
          key: string
          message_post_close: string
          message_pre_open: string
          open_time: string
          restaurant_slug: string
          scope: string
          updated_at: string
        }
        Insert: {
          close_time?: string | null
          created_at?: string
          enabled?: boolean
          key: string
          message_post_close?: string
          message_pre_open?: string
          open_time?: string
          restaurant_slug: string
          scope: string
          updated_at?: string
        }
        Update: {
          close_time?: string | null
          created_at?: string
          enabled?: boolean
          key?: string
          message_post_close?: string
          message_pre_open?: string
          open_time?: string
          restaurant_slug?: string
          scope?: string
          updated_at?: string
        }
        Relationships: []
      }
      option_groups: {
        Row: {
          created_at: string | null
          id: string
          is_required: boolean | null
          max_select: number | null
          min_select: number | null
          name: string
          position: number | null
          restaurant_id: string | null
          type: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_required?: boolean | null
          max_select?: number | null
          min_select?: number | null
          name: string
          position?: number | null
          restaurant_id?: string | null
          type?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_required?: boolean | null
          max_select?: number | null
          min_select?: number | null
          name?: string
          position?: number | null
          restaurant_id?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "option_groups_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      options: {
        Row: {
          group_id: string
          id: string
          is_active: boolean
          is_default: boolean | null
          name: string
          position: number | null
          price_modifier: number | null
        }
        Insert: {
          group_id: string
          id?: string
          is_active?: boolean
          is_default?: boolean | null
          name: string
          position?: number | null
          price_modifier?: number | null
        }
        Update: {
          group_id?: string
          id?: string
          is_active?: boolean
          is_default?: boolean | null
          name?: string
          position?: number | null
          price_modifier?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "options_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "option_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          id: string
          line_no: number
          name: string
          options: Json | null
          order_id: string
          product_id: string | null
          quantity: number
          unit_price: number
        }
        Insert: {
          id?: string
          line_no?: number
          name: string
          options?: Json | null
          order_id: string
          product_id?: string | null
          quantity?: number
          unit_price: number
        }
        Update: {
          id?: string
          line_no?: number
          name?: string
          options?: Json | null
          order_id?: string
          product_id?: string | null
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          address: string | null
          chopsticks_qty: number
          city: string | null
          client_delivery_time: string | null
          contact_email: string | null
          created_at: string
          delivery_address: string | null
          delivery_cost: number | null
          delivery_lat: number | null
          delivery_lng: number | null
          deliveryTime: string | null
          discount_amount: number | null
          eta: string | null
          flat_number: string | null
          fulfill_method: string
          id: string
          items: Json | null
          kitchen_note: string | null
          legal_accept: Json | null
          loyalty_applied: boolean | null
          loyalty_awarded: number
          loyalty_awarded_at: string | null
          loyalty_choice: string | null
          loyalty_free_roll_name: string | null
          loyalty_min_order: number | null
          loyalty_reward_type: string | null
          loyalty_reward_value: number | null
          loyalty_stickers_after: number | null
          loyalty_stickers_before: number | null
          loyalty_stickers_earned: number | null
          loyalty_stickers_used: number | null
          name: string | null
          note: string | null
          notice_payment: string | null
          packaging_cost: number | null
          payment_method: string
          payment_status: string
          phone: string
          postal_code: string | null
          promo_code: string | null
          public_id: string
          reservation_date: string | null
          reservation_id: string | null
          reservation_time: string | null
          restaurant_id: string
          restaurant_slug: string | null
          scheduled_delivery_at: string | null
          selected_option: string | null
          status: string
          street: string | null
          total_price: number | null
          tracking_token: string
          user: string | null
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          address?: string | null
          chopsticks_qty?: number
          city?: string | null
          client_delivery_time?: string | null
          contact_email?: string | null
          created_at?: string
          delivery_address?: string | null
          delivery_cost?: number | null
          delivery_lat?: number | null
          delivery_lng?: number | null
          deliveryTime?: string | null
          discount_amount?: number | null
          eta?: string | null
          flat_number?: string | null
          fulfill_method?: string
          id?: string
          items?: Json | null
          kitchen_note?: string | null
          legal_accept?: Json | null
          loyalty_applied?: boolean | null
          loyalty_awarded?: number
          loyalty_awarded_at?: string | null
          loyalty_choice?: string | null
          loyalty_free_roll_name?: string | null
          loyalty_min_order?: number | null
          loyalty_reward_type?: string | null
          loyalty_reward_value?: number | null
          loyalty_stickers_after?: number | null
          loyalty_stickers_before?: number | null
          loyalty_stickers_earned?: number | null
          loyalty_stickers_used?: number | null
          name?: string | null
          note?: string | null
          notice_payment?: string | null
          packaging_cost?: number | null
          payment_method?: string
          payment_status?: string
          phone: string
          postal_code?: string | null
          promo_code?: string | null
          public_id: string
          reservation_date?: string | null
          reservation_id?: string | null
          reservation_time?: string | null
          restaurant_id: string
          restaurant_slug?: string | null
          scheduled_delivery_at?: string | null
          selected_option?: string | null
          status?: string
          street?: string | null
          total_price?: number | null
          tracking_token: string
          user?: string | null
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          address?: string | null
          chopsticks_qty?: number
          city?: string | null
          client_delivery_time?: string | null
          contact_email?: string | null
          created_at?: string
          delivery_address?: string | null
          delivery_cost?: number | null
          delivery_lat?: number | null
          delivery_lng?: number | null
          deliveryTime?: string | null
          discount_amount?: number | null
          eta?: string | null
          flat_number?: string | null
          fulfill_method?: string
          id?: string
          items?: Json | null
          kitchen_note?: string | null
          legal_accept?: Json | null
          loyalty_applied?: boolean | null
          loyalty_awarded?: number
          loyalty_awarded_at?: string | null
          loyalty_choice?: string | null
          loyalty_free_roll_name?: string | null
          loyalty_min_order?: number | null
          loyalty_reward_type?: string | null
          loyalty_reward_value?: number | null
          loyalty_stickers_after?: number | null
          loyalty_stickers_before?: number | null
          loyalty_stickers_earned?: number | null
          loyalty_stickers_used?: number | null
          name?: string | null
          note?: string | null
          notice_payment?: string | null
          packaging_cost?: number | null
          payment_method?: string
          payment_status?: string
          phone?: string
          postal_code?: string | null
          promo_code?: string | null
          public_id?: string
          reservation_date?: string | null
          reservation_id?: string | null
          reservation_time?: string | null
          restaurant_id?: string
          restaurant_slug?: string | null
          scheduled_delivery_at?: string | null
          selected_option?: string | null
          status?: string
          street?: string | null
          total_price?: number | null
          tracking_token?: string
          user?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_restaurant_fk"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_modifier_groups: {
        Row: {
          created_at: string
          group_id: string
          is_active: boolean
          is_required: boolean | null
          max_select: number | null
          min_select: number | null
          position: number
          product_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          group_id: string
          is_active?: boolean
          is_required?: boolean | null
          max_select?: number | null
          min_select?: number | null
          position?: number
          product_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          group_id?: string
          is_active?: boolean
          is_required?: boolean | null
          max_select?: number | null
          min_select?: number | null
          position?: number
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_modifier_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "modifier_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_modifier_groups_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_option_configs: {
        Row: {
          config: Json
          created_at: string
          id: string
          product_id: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          product_id: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          product_id?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_option_configs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_option_configs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_option_groups: {
        Row: {
          id: string
          option_group_id: string
          product_id: string
          sort_order: number | null
        }
        Insert: {
          id?: string
          option_group_id: string
          product_id: string
          sort_order?: number | null
        }
        Update: {
          id?: string
          option_group_id?: string
          product_id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_option_groups_option_group_id_fkey"
            columns: ["option_group_id"]
            isOneToOne: false
            referencedRelation: "option_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_option_groups_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_prices: {
        Row: {
          is_available: boolean
          price_cents: number
          product_id: string
          restaurant_id: string
        }
        Insert: {
          is_available?: boolean
          price_cents: number
          product_id: string
          restaurant_id: string
        }
        Update: {
          is_available?: boolean
          price_cents?: number
          product_id?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_prices_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          metadata: Json
          name: string
          position: number
          price_cents: number | null
          price_delta_cents: number | null
          product_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          name: string
          position?: number
          price_cents?: number | null
          price_delta_cents?: number | null
          product_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          name?: string
          position?: number
          price_cents?: number | null
          price_delta_cents?: number | null
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          available: boolean | null
          description: string | null
          has_variants: boolean
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          position: number | null
          price: number | null
          price_cents: number
          restaurant_id: string
          subcategory: string | null
        }
        Insert: {
          available?: boolean | null
          description?: string | null
          has_variants?: boolean
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          position?: number | null
          price?: number | null
          price_cents: number
          restaurant_id: string
          subcategory?: string | null
        }
        Update: {
          available?: boolean | null
          description?: string | null
          has_variants?: boolean
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          position?: number | null
          price?: number | null
          price_cents?: number
          restaurant_id?: string
          subcategory?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_restaurant_fk"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
        }
        Relationships: []
      }
      reservations: {
        Row: {
          admin_note: string | null
          confirmed_at: string | null
          created_at: string
          email: string | null
          guests: number
          id: string
          name: string
          note: string | null
          phone: string
          reservation_date: string
          reservation_time: string
          restaurant_id: string | null
          restaurant_slug: string | null
          source_ip: unknown
          status: string
          table_id: string | null
          table_label: string | null
          table_ref: string | null
          user_id: string | null
        }
        Insert: {
          admin_note?: string | null
          confirmed_at?: string | null
          created_at?: string
          email?: string | null
          guests: number
          id?: string
          name: string
          note?: string | null
          phone: string
          reservation_date: string
          reservation_time: string
          restaurant_id?: string | null
          restaurant_slug?: string | null
          source_ip?: unknown
          status?: string
          table_id?: string | null
          table_label?: string | null
          table_ref?: string | null
          user_id?: string | null
        }
        Update: {
          admin_note?: string | null
          confirmed_at?: string | null
          created_at?: string
          email?: string | null
          guests?: number
          id?: string
          name?: string
          note?: string | null
          phone?: string
          reservation_date?: string
          reservation_time?: string
          restaurant_id?: string | null
          restaurant_slug?: string | null
          source_ip?: unknown
          status?: string
          table_id?: string | null
          table_label?: string | null
          table_ref?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reservations_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_addon_options: {
        Row: {
          active: boolean
          created_at: string
          group_key: string
          id: string
          restaurant_id: string
          sort: number
          value: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          group_key: string
          id?: string
          restaurant_id: string
          sort?: number
          value: string
        }
        Update: {
          active?: boolean
          created_at?: string
          group_key?: string
          id?: string
          restaurant_id?: string
          sort?: number
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_addon_options_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_admins: {
        Row: {
          added_at: string
          restaurant_id: string
          role: string
          user_id: string
        }
        Insert: {
          added_at?: string
          restaurant_id: string
          role?: string
          user_id: string
        }
        Update: {
          added_at?: string
          restaurant_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_admins_restaurant_fk"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_admins_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_blocked_times: {
        Row: {
          block_date: string
          created_at: string
          from_time: string | null
          full_day: boolean
          id: string
          kind: Database["public"]["Enums"]["blocked_time_kind"]
          note: string | null
          restaurant_id: string
          to_time: string | null
        }
        Insert: {
          block_date: string
          created_at?: string
          from_time?: string | null
          full_day?: boolean
          id?: string
          kind?: Database["public"]["Enums"]["blocked_time_kind"]
          note?: string | null
          restaurant_id: string
          to_time?: string | null
        }
        Update: {
          block_date?: string
          created_at?: string
          from_time?: string | null
          full_day?: boolean
          id?: string
          kind?: Database["public"]["Enums"]["blocked_time_kind"]
          note?: string | null
          restaurant_id?: string
          to_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_blocked_times_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_checkout_config: {
        Row: {
          config: Json
          restaurant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          config?: Json
          restaurant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          config?: Json
          restaurant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_checkout_config_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_info: {
        Row: {
          id: number
          lat: number
          lng: number
          ordering_open: boolean
          updated_at: string
        }
        Insert: {
          id: number
          lat: number
          lng: number
          ordering_open?: boolean
          updated_at?: string
        }
        Update: {
          id?: number
          lat?: number
          lng?: number
          ordering_open?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      restaurant_popups: {
        Row: {
          btn_label: string
          btn_type: string
          btn_url: string
          content: string
          created_at: string
          id: string
          image_url: string | null
          is_active: boolean
          position: number
          restaurant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          btn_label?: string
          btn_type?: string
          btn_url?: string
          content?: string
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          position?: number
          restaurant_id: string
          title?: string
          updated_at?: string
        }
        Update: {
          btn_label?: string
          btn_type?: string
          btn_url?: string
          content?: string
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          position?: number
          restaurant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_popups_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_tables: {
        Row: {
          active: boolean
          capacity: number
          created_at: string
          h: number
          id: string
          label: string
          name: string | null
          restaurant_id: string
          rotation: number
          seats: number
          updated_at: string
          w: number
          x: number
          y: number
        }
        Insert: {
          active?: boolean
          capacity?: number
          created_at?: string
          h?: number
          id?: string
          label?: string
          name?: string | null
          restaurant_id: string
          rotation?: number
          seats?: number
          updated_at?: string
          w?: number
          x?: number
          y?: number
        }
        Update: {
          active?: boolean
          capacity?: number
          created_at?: string
          h?: number
          id?: string
          label?: string
          name?: string | null
          restaurant_id?: string
          rotation?: number
          seats?: number
          updated_at?: string
          w?: number
          x?: number
          y?: number
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_tables_restaurant_fk"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_tables_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurants: {
        Row: {
          active: boolean
          address: string | null
          checkout_config: Json
          city: string
          created_at: string
          email: string | null
          facebook_url: string | null
          id: string
          instagram_url: string | null
          is_active: boolean
          lat: number | null
          lng: number | null
          lon: number | null
          maps_url: string | null
          max_delivery_km: number | null
          name: string
          opening_hours: Json | null
          ordering_delivery_active: boolean
          ordering_takeaway_active: boolean
          phone: string | null
          popup_active: boolean | null
          popup_btn_label: string | null
          popup_btn_type: string | null
          popup_btn_url: string | null
          popup_content: string | null
          popup_image_url: string | null
          popup_title: string | null
          slug: string
          tiktok_url: string | null
          timezone: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          checkout_config?: Json
          city: string
          created_at?: string
          email?: string | null
          facebook_url?: string | null
          id?: string
          instagram_url?: string | null
          is_active?: boolean
          lat?: number | null
          lng?: number | null
          lon?: number | null
          maps_url?: string | null
          max_delivery_km?: number | null
          name: string
          opening_hours?: Json | null
          ordering_delivery_active?: boolean
          ordering_takeaway_active?: boolean
          phone?: string | null
          popup_active?: boolean | null
          popup_btn_label?: string | null
          popup_btn_type?: string | null
          popup_btn_url?: string | null
          popup_content?: string | null
          popup_image_url?: string | null
          popup_title?: string | null
          slug: string
          tiktok_url?: string | null
          timezone?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          checkout_config?: Json
          city?: string
          created_at?: string
          email?: string | null
          facebook_url?: string | null
          id?: string
          instagram_url?: string | null
          is_active?: boolean
          lat?: number | null
          lng?: number | null
          lon?: number | null
          maps_url?: string | null
          max_delivery_km?: number | null
          name?: string
          opening_hours?: Json | null
          ordering_delivery_active?: boolean
          ordering_takeaway_active?: boolean
          phone?: string | null
          popup_active?: boolean | null
          popup_btn_label?: string | null
          popup_btn_type?: string | null
          popup_btn_url?: string | null
          popup_content?: string | null
          popup_image_url?: string | null
          popup_title?: string | null
          slug?: string
          tiktok_url?: string | null
          timezone?: string
        }
        Relationships: []
      }
      staff: {
        Row: {
          role: string
          user_id: string
        }
        Insert: {
          role: string
          user_id: string
        }
        Update: {
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      sushi_of_month: {
        Row: {
          created_at: string
          description: string | null
          ends_on: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          legacy_id: string
          name: string
          product_id: string | null
          product_slug: string | null
          promo_price_cents: number | null
          restaurant_id: string | null
          starts_on: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          ends_on?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          legacy_id?: string
          name: string
          product_id?: string | null
          product_slug?: string | null
          promo_price_cents?: number | null
          restaurant_id?: string | null
          starts_on?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          ends_on?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          legacy_id?: string
          name?: string
          product_id?: string | null
          product_slug?: string | null
          promo_price_cents?: number | null
          restaurant_id?: string | null
          starts_on?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sushi_of_month_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sushi_of_month_restaurant_fk"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sushi_of_month_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      table_layouts: {
        Row: {
          active: boolean
          id: string
          name: string
          plan: Json
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          id?: string
          name?: string
          plan?: Json
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          id?: string
          name?: string
          plan?: Json
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "table_layouts_restaurant_fk"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_layouts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          restaurant_id: string | null
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          restaurant_id?: string | null
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          restaurant_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          user_id?: string
        }
        Relationships: []
      }
      variant_modifier_groups: {
        Row: {
          created_at: string
          group_id: string
          is_active: boolean
          position: number
          updated_at: string
          variant_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          is_active?: boolean
          position?: number
          updated_at?: string
          variant_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          is_active?: boolean
          position?: number
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "variant_modifier_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "modifier_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "variant_modifier_groups_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      loyalty_balances_by_restaurant: {
        Row: {
          last_order_at: string | null
          restaurant_id: string | null
          restaurant_slug: string | null
          stickers: number | null
          stickers_earned: number | null
          stickers_used: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_restaurant_fk"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_balances_global: {
        Row: {
          last_order_at: string | null
          stickers: number | null
          stickers_earned: number | null
          stickers_used: number | null
          user_id: string | null
        }
        Relationships: []
      }
      v_menu_by_slug: {
        Row: {
          items: Json | null
          slug: string | null
          subcategory: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _sample_json: {
        Args: { lim?: number; tablename: string }
        Returns: Json[]
      }
      add_loyalty_sticker:
        | { Args: { p_count?: number; p_user_id: string }; Returns: undefined }
        | {
            Args: {
              p_count: number
              p_restaurant_id: string
              p_user_id: string
            }
            Returns: undefined
          }
      cleanup_dead_push_subscription: {
        Args: { endpoint_to_remove: string }
        Returns: undefined
      }
      gen_order_public_id: { Args: never; Returns: string }
      gen_order_tracking_token: { Args: never; Returns: string }
      get_loyalty_balance: {
        Args: { p_restaurant_id: string; p_user_id: string }
        Returns: number
      }
      get_reservations_for_day: {
        Args: { _day: string }
        Returns: {
          reservation_time: string
          total: number
        }[]
      }
      get_reservations_per_day: {
        Args: { _from: string; _to: string }
        Returns: {
          reservation_date: string
          total: number
        }[]
      }
      is_restaurant_admin: {
        Args: { rid: string; uid: string }
        Returns: boolean
      }
      is_restaurant_staff: { Args: { rid: string }; Returns: boolean }
      loyalty_award: {
        Args: { p_add: number; p_cap?: number; p_user_id: string }
        Returns: {
          added: number
          after: number
          before: number
        }[]
      }
      loyalty_compute_earned: { Args: { p_base: number }; Returns: number }
      loyalty_earned: {
        Args: { min_order: number; total: number }
        Returns: number
      }
      loyalty_earned_from_base: { Args: { p_base: number }; Returns: number }
      loyalty_finalize_order: {
        Args: { p_cap?: number; p_order_id: string }
        Returns: {
          after: number
          applied: boolean
          before: number
          earned: number
        }[]
      }
      loyalty_int: { Args: { v: string }; Returns: number }
      loyalty_recalc_account: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      loyalty_reverse_for_cancel: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      loyalty_spend: {
        Args: { p_count: number; p_user_id: string }
        Returns: {
          after: number
          before: number
        }[]
      }
      loyalty_truthy: { Args: { v: string }; Returns: boolean }
      process_loyalty_for_order:
        | {
            Args: { p_order_id: string }
            Returns: {
              after: number
              awarded: number
              before: number
            }[]
          }
        | {
            Args: {
              p_order_id: string
              p_restaurant_id: string
              p_user_id: string
            }
            Returns: undefined
          }
      recalc_loyalty_account_global: {
        Args: { p_user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      block_type: "exact" | "prefix" | "contains"
      blocked_time_kind: "reservation" | "order" | "both"
      discount_apply_scope: "all" | "include_only" | "exclude"
      user_role: "super_admin" | "restaurant_admin" | "staff"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      block_type: ["exact", "prefix", "contains"],
      blocked_time_kind: ["reservation", "order", "both"],
      discount_apply_scope: ["all", "include_only", "exclude"],
      user_role: ["super_admin", "restaurant_admin", "staff"],
    },
  },
} as const
