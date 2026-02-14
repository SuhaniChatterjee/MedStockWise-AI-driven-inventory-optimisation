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
      activity_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_configurations: {
        Row: {
          alert_type: string
          created_at: string
          id: string
          is_enabled: boolean | null
          notification_channels: string[] | null
          recipient_roles: string[] | null
          threshold_type: string | null
          threshold_value: number | null
          updated_at: string
        }
        Insert: {
          alert_type: string
          created_at?: string
          id?: string
          is_enabled?: boolean | null
          notification_channels?: string[] | null
          recipient_roles?: string[] | null
          threshold_type?: string | null
          threshold_value?: number | null
          updated_at?: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          id?: string
          is_enabled?: boolean | null
          notification_channels?: string[] | null
          recipient_roles?: string[] | null
          threshold_type?: string | null
          threshold_value?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      alerts_history: {
        Row: {
          alert_type: string
          created_at: string
          id: string
          is_read: boolean | null
          item_id: string | null
          message: string
          metadata: Json | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          title: string
        }
        Insert: {
          alert_type: string
          created_at?: string
          id?: string
          is_read?: boolean | null
          item_id?: string | null
          message: string
          metadata?: Json | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity: string
          title: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          id?: string
          is_read?: boolean | null
          item_id?: string | null
          message?: string
          metadata?: Json | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_history_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_optimization: {
        Row: {
          calculation_date: string
          eoq: number | null
          estimated_annual_cost: number | null
          id: string
          item_id: string | null
          optimal_order_quantity: number | null
          parameters: Json | null
          reorder_point: number | null
          safety_stock: number | null
        }
        Insert: {
          calculation_date?: string
          eoq?: number | null
          estimated_annual_cost?: number | null
          id?: string
          item_id?: string | null
          optimal_order_quantity?: number | null
          parameters?: Json | null
          reorder_point?: number | null
          safety_stock?: number | null
        }
        Update: {
          calculation_date?: string
          eoq?: number | null
          estimated_annual_cost?: number | null
          id?: string
          item_id?: string | null
          optimal_order_quantity?: number | null
          parameters?: Json | null
          reorder_point?: number | null
          safety_stock?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cost_optimization_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          avg_usage_per_day: number
          created_at: string
          current_stock: number
          id: string
          item_name: string
          item_type: string
          max_capacity: number
          min_required: number
          restock_lead_time: number
          unit_cost: number
          updated_at: string
          vendor_name: string | null
        }
        Insert: {
          avg_usage_per_day: number
          created_at?: string
          current_stock: number
          id?: string
          item_name: string
          item_type: string
          max_capacity: number
          min_required: number
          restock_lead_time: number
          unit_cost: number
          updated_at?: string
          vendor_name?: string | null
        }
        Update: {
          avg_usage_per_day?: number
          created_at?: string
          current_stock?: number
          id?: string
          item_name?: string
          item_type?: string
          max_capacity?: number
          min_required?: number
          restock_lead_time?: number
          unit_cost?: number
          updated_at?: string
          vendor_name?: string | null
        }
        Relationships: []
      }
      login_attempts: {
        Row: {
          attempt_time: string | null
          id: string
          identifier: string
          success: boolean | null
        }
        Insert: {
          attempt_time?: string | null
          id?: string
          identifier: string
          success?: boolean | null
        }
        Update: {
          attempt_time?: string | null
          id?: string
          identifier?: string
          success?: boolean | null
        }
        Relationships: []
      }
      model_registry: {
        Row: {
          created_at: string
          created_by: string | null
          dataset_summary: Json | null
          feature_importance: Json | null
          hyperparameters: Json | null
          id: string
          is_active: boolean | null
          mae: number
          model_type: string
          model_version: string
          r2_score: number | null
          rmse: number | null
          training_date: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dataset_summary?: Json | null
          feature_importance?: Json | null
          hyperparameters?: Json | null
          id?: string
          is_active?: boolean | null
          mae: number
          model_type?: string
          model_version: string
          r2_score?: number | null
          rmse?: number | null
          training_date?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dataset_summary?: Json | null
          feature_importance?: Json | null
          hyperparameters?: Json | null
          id?: string
          is_active?: boolean | null
          mae?: number
          model_type?: string
          model_version?: string
          r2_score?: number | null
          rmse?: number | null
          training_date?: string
        }
        Relationships: []
      }
      password_history: {
        Row: {
          created_at: string | null
          id: string
          password_hash: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          password_hash: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          password_hash?: string
          user_id?: string
        }
        Relationships: []
      }
      prediction_history: {
        Row: {
          confidence_score: number | null
          created_at: string
          created_by: string | null
          feature_contributions: Json | null
          feature_values: Json
          id: string
          item_id: string | null
          model_version_id: string | null
          predicted_demand: number
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string
          created_by?: string | null
          feature_contributions?: Json | null
          feature_values: Json
          id?: string
          item_id?: string | null
          model_version_id?: string | null
          predicted_demand: number
        }
        Update: {
          confidence_score?: number | null
          created_at?: string
          created_by?: string | null
          feature_contributions?: Json | null
          feature_values?: Json
          id?: string
          item_id?: string | null
          model_version_id?: string | null
          predicted_demand?: number
        }
        Relationships: [
          {
            foreignKeyName: "prediction_history_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prediction_history_model_version_id_fkey"
            columns: ["model_version_id"]
            isOneToOne: false
            referencedRelation: "model_registry"
            referencedColumns: ["id"]
          },
        ]
      }
      predictions: {
        Row: {
          created_at: string
          estimated_demand: number
          id: string
          inventory_shortfall: number
          item_id: string
          predicted_by: string | null
          replenishment_needs: number
        }
        Insert: {
          created_at?: string
          estimated_demand: number
          id?: string
          inventory_shortfall: number
          item_id: string
          predicted_by?: string | null
          replenishment_needs: number
        }
        Update: {
          created_at?: string
          estimated_demand?: number
          id?: string
          inventory_shortfall?: number
          item_id?: string
          predicted_by?: string | null
          replenishment_needs?: number
        }
        Relationships: [
          {
            foreignKeyName: "predictions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "predictions_predicted_by_fkey"
            columns: ["predicted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "inventory_manager" | "nurse"
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
      app_role: ["admin", "inventory_manager", "nurse"],
    },
  },
} as const
