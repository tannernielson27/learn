export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      case_studies: {
        Row: {
          bank_id: string;
          created_at: string;
          created_by: string | null;
          ehr: Json;
          id: string;
          org_id: string;
          status: Database["public"]["Enums"]["content_status"];
          tags: string[];
          title: string;
          updated_at: string;
        };
        Insert: {
          bank_id: string;
          created_at?: string;
          created_by?: string | null;
          ehr: Json;
          id?: string;
          org_id: string;
          status?: Database["public"]["Enums"]["content_status"];
          tags?: string[];
          title: string;
          updated_at?: string;
        };
        Update: {
          bank_id?: string;
          created_at?: string;
          created_by?: string | null;
          ehr?: Json;
          id?: string;
          org_id?: string;
          status?: Database["public"]["Enums"]["content_status"];
          tags?: string[];
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "case_studies_bank_org_fkey";
            columns: ["bank_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "item_banks";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "case_studies_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      case_study_items: {
        Row: {
          bank_id: string;
          case_study_id: string;
          item_id: string;
          org_id: string;
          position: number;
        };
        Insert: {
          bank_id: string;
          case_study_id: string;
          item_id: string;
          org_id: string;
          position: number;
        };
        Update: {
          bank_id?: string;
          case_study_id?: string;
          item_id?: string;
          org_id?: string;
          position?: number;
        };
        Relationships: [
          {
            foreignKeyName: "case_study_items_case_bank_fkey";
            columns: ["case_study_id", "bank_id"];
            isOneToOne: false;
            referencedRelation: "case_studies";
            referencedColumns: ["id", "bank_id"];
          },
          {
            foreignKeyName: "case_study_items_case_org_fkey";
            columns: ["case_study_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "case_studies";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "case_study_items_item_bank_fkey";
            columns: ["item_id", "bank_id"];
            isOneToOne: false;
            referencedRelation: "items";
            referencedColumns: ["id", "bank_id"];
          },
          {
            foreignKeyName: "case_study_items_item_org_fkey";
            columns: ["item_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "items";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      item_banks: {
        Row: {
          created_at: string;
          created_by: string | null;
          folder_path: string;
          id: string;
          name: string;
          org_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          folder_path?: string;
          id?: string;
          name: string;
          org_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          folder_path?: string;
          id?: string;
          name?: string;
          org_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "item_banks_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "item_banks_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
        ];
      };
      item_versions: {
        Row: {
          created_at: string;
          item_id: string;
          org_id: string;
          snapshot: Json;
          version: number;
        };
        Insert: {
          created_at?: string;
          item_id: string;
          org_id: string;
          snapshot: Json;
          version: number;
        };
        Update: {
          created_at?: string;
          item_id?: string;
          org_id?: string;
          snapshot?: Json;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "item_versions_item_org_fkey";
            columns: ["item_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "items";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "item_versions_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
        ];
      };
      items: {
        Row: {
          answer_key: Json;
          bank_id: string;
          cjmm_step: number | null;
          content: Json;
          created_at: string;
          created_by: string | null;
          id: string;
          org_id: string;
          rationale: Json;
          scoring: Json;
          status: Database["public"]["Enums"]["content_status"];
          tags: string[];
          type: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          answer_key: Json;
          bank_id: string;
          cjmm_step?: number | null;
          content: Json;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          org_id: string;
          rationale?: Json;
          scoring: Json;
          status?: Database["public"]["Enums"]["content_status"];
          tags?: string[];
          type: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          answer_key?: Json;
          bank_id?: string;
          cjmm_step?: number | null;
          content?: Json;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          org_id?: string;
          rationale?: Json;
          scoring?: Json;
          status?: Database["public"]["Enums"]["content_status"];
          tags?: string[];
          type?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "items_bank_org_fkey";
            columns: ["bank_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "item_banks";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "items_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      orgs: {
        Row: {
          created_at: string;
          id: string;
          name: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string | null;
          id: string;
          org_id: string | null;
          role: Database["public"]["Enums"]["org_role"] | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          display_name?: string | null;
          id: string;
          org_id?: string | null;
          role?: Database["public"]["Enums"]["org_role"] | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          display_name?: string | null;
          id?: string;
          org_id?: string | null;
          role?: Database["public"]["Enums"]["org_role"] | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      import_bank_content: {
        Args: { new_case_study: Json; new_items: Json; target_bank: string };
        Returns: Json;
      };
      place_case_study_step: {
        Args: { step_item: string; step_position: number; target: string };
        Returns: undefined;
      };
      reorder_case_study_steps: {
        Args: { item_ids: string[]; target: string };
        Returns: undefined;
      };
    };
    Enums: {
      content_status: "draft" | "published" | "archived";
      org_role: "instructor" | "student" | "admin";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      content_status: ["draft", "published", "archived"],
      org_role: ["instructor", "student", "admin"],
    },
  },
} as const;
