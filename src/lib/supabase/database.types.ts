export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      bank_folders: {
        Row: {
          bank_id: string;
          created_at: string;
          created_by: string | null;
          depth: number;
          id: string;
          name: string;
          org_id: string;
          parent_id: string | null;
        };
        Insert: {
          bank_id: string;
          created_at?: string;
          created_by?: string | null;
          depth?: number;
          id?: string;
          name: string;
          org_id: string;
          parent_id?: string | null;
        };
        Update: {
          bank_id?: string;
          created_at?: string;
          created_by?: string | null;
          depth?: number;
          id?: string;
          name?: string;
          org_id?: string;
          parent_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "bank_folders_bank_org_fkey";
            columns: ["bank_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "item_banks";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "bank_folders_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bank_folders_parent_fkey";
            columns: ["parent_id", "bank_id"];
            isOneToOne: false;
            referencedRelation: "bank_folders";
            referencedColumns: ["id", "bank_id"];
          },
        ];
      };
      case_studies: {
        Row: {
          archived_from: Database["public"]["Enums"]["content_status"] | null;
          bank_id: string;
          created_at: string;
          created_by: string | null;
          ehr: Json;
          folder_id: string | null;
          id: string;
          org_id: string;
          status: Database["public"]["Enums"]["content_status"];
          tags: string[];
          title: string;
          updated_at: string;
        };
        Insert: {
          archived_from?: Database["public"]["Enums"]["content_status"] | null;
          bank_id: string;
          created_at?: string;
          created_by?: string | null;
          ehr: Json;
          folder_id?: string | null;
          id?: string;
          org_id: string;
          status?: Database["public"]["Enums"]["content_status"];
          tags?: string[];
          title: string;
          updated_at?: string;
        };
        Update: {
          archived_from?: Database["public"]["Enums"]["content_status"] | null;
          bank_id?: string;
          created_at?: string;
          created_by?: string | null;
          ehr?: Json;
          folder_id?: string | null;
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
          {
            foreignKeyName: "case_studies_folder_bank_fkey";
            columns: ["folder_id", "bank_id"];
            isOneToOne: false;
            referencedRelation: "bank_folders";
            referencedColumns: ["id", "bank_id"];
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
          archived_from: Database["public"]["Enums"]["content_status"] | null;
          bank_id: string;
          cjmm_step: number | null;
          content: Json;
          created_at: string;
          created_by: string | null;
          folder_id: string | null;
          id: string;
          org_id: string;
          rationale: Json;
          scoring: Json;
          search_vector: unknown;
          status: Database["public"]["Enums"]["content_status"];
          tags: string[];
          type: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          answer_key: Json;
          archived_from?: Database["public"]["Enums"]["content_status"] | null;
          bank_id: string;
          cjmm_step?: number | null;
          content: Json;
          created_at?: string;
          created_by?: string | null;
          folder_id?: string | null;
          id?: string;
          org_id: string;
          rationale?: Json;
          scoring: Json;
          search_vector?: unknown;
          status?: Database["public"]["Enums"]["content_status"];
          tags?: string[];
          type: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          answer_key?: Json;
          archived_from?: Database["public"]["Enums"]["content_status"] | null;
          bank_id?: string;
          cjmm_step?: number | null;
          content?: Json;
          created_at?: string;
          created_by?: string | null;
          folder_id?: string | null;
          id?: string;
          org_id?: string;
          rationale?: Json;
          scoring?: Json;
          search_vector?: unknown;
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
          {
            foreignKeyName: "items_folder_bank_fkey";
            columns: ["folder_id", "bank_id"];
            isOneToOne: false;
            referencedRelation: "bank_folders";
            referencedColumns: ["id", "bank_id"];
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
      session_item_aggregates: {
        Row: {
          computed_at: string;
          full_marks: number;
          item_id: string;
          item_position: number;
          item_ref: string;
          max_points: number;
          mean_points: number;
          no_marks: number;
          org_id: string;
          partial_marks: number;
          responded: number;
          session_id: string;
        };
        Insert: {
          computed_at?: string;
          full_marks?: number;
          item_id: string;
          item_position: number;
          item_ref: string;
          max_points?: number;
          mean_points?: number;
          no_marks?: number;
          org_id: string;
          partial_marks?: number;
          responded?: number;
          session_id: string;
        };
        Update: {
          computed_at?: string;
          full_marks?: number;
          item_id?: string;
          item_position?: number;
          item_ref?: string;
          max_points?: number;
          mean_points?: number;
          no_marks?: number;
          org_id?: string;
          partial_marks?: number;
          responded?: number;
          session_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "session_item_aggregates_session_org_fkey";
            columns: ["session_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "sessions";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      session_public_state: {
        Row: {
          item_count: number;
          item_ends_at: string | null;
          item_position: number | null;
          reveal: boolean;
          session_id: string;
          status: Database["public"]["Enums"]["session_status"];
          updated_at: string;
        };
        Insert: {
          item_count?: number;
          item_ends_at?: string | null;
          item_position?: number | null;
          reveal?: boolean;
          session_id: string;
          status: Database["public"]["Enums"]["session_status"];
          updated_at?: string;
        };
        Update: {
          item_count?: number;
          item_ends_at?: string | null;
          item_position?: number | null;
          reveal?: boolean;
          session_id?: string;
          status?: Database["public"]["Enums"]["session_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "session_public_state_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: true;
            referencedRelation: "sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      session_responses: {
        Row: {
          breakdown: Json;
          groups: Json | null;
          id: string;
          item_id: string;
          item_position: number;
          max_points: number;
          model: string;
          org_id: string;
          participant_id: string;
          points: number;
          response: Json;
          session_id: string;
          submitted_at: string;
        };
        Insert: {
          breakdown?: Json;
          groups?: Json | null;
          id?: string;
          item_id: string;
          item_position: number;
          max_points: number;
          model: string;
          org_id: string;
          participant_id: string;
          points: number;
          response: Json;
          session_id: string;
          submitted_at?: string;
        };
        Update: {
          breakdown?: Json;
          groups?: Json | null;
          id?: string;
          item_id?: string;
          item_position?: number;
          max_points?: number;
          model?: string;
          org_id?: string;
          participant_id?: string;
          points?: number;
          response?: Json;
          session_id?: string;
          submitted_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "session_responses_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "session_responses_session_org_fkey";
            columns: ["session_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "sessions";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      sessions: {
        Row: {
          bank_id: string | null;
          case_study_id: string | null;
          closed_at: string | null;
          code: string;
          created_at: string;
          current_position: number | null;
          host_id: string;
          id: string;
          item_ends_at: string | null;
          item_set: Json;
          mode: Database["public"]["Enums"]["session_mode"];
          opened_at: string;
          org_id: string;
          reveal: boolean;
          status: Database["public"]["Enums"]["session_status"];
          timer_seconds: number | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          bank_id?: string | null;
          case_study_id?: string | null;
          closed_at?: string | null;
          code: string;
          created_at?: string;
          current_position?: number | null;
          host_id: string;
          id?: string;
          item_ends_at?: string | null;
          item_set?: Json;
          mode?: Database["public"]["Enums"]["session_mode"];
          opened_at?: string;
          org_id: string;
          reveal?: boolean;
          status?: Database["public"]["Enums"]["session_status"];
          timer_seconds?: number | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          bank_id?: string | null;
          case_study_id?: string | null;
          closed_at?: string | null;
          code?: string;
          created_at?: string;
          current_position?: number | null;
          host_id?: string;
          id?: string;
          item_ends_at?: string | null;
          item_set?: Json;
          mode?: Database["public"]["Enums"]["session_mode"];
          opened_at?: string;
          org_id?: string;
          reveal?: boolean;
          status?: Database["public"]["Enums"]["session_status"];
          timer_seconds?: number | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sessions_bank_org_fkey";
            columns: ["bank_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "item_banks";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "sessions_case_org_fkey";
            columns: ["case_study_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "case_studies";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "sessions_host_id_fkey";
            columns: ["host_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sessions_org_id_fkey";
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
      archive_case_study: { Args: { target: string }; Returns: undefined };
      archive_item: { Args: { target: string }; Returns: undefined };
      begin_session_submission: {
        Args: { participant: string; target_session: string };
        Returns: {
          item_id: string;
          item_position: number;
          refusal: string;
        }[];
      };
      duplicate_case_study: {
        Args: { source_case_study: string };
        Returns: string;
      };
      duplicate_item: { Args: { source_item: string }; Returns: string };
      end_session: { Args: { target: string }; Returns: string };
      import_bank_content: {
        Args: {
          new_case_study: Json;
          new_items: Json;
          target_bank: string;
          target_folder?: string;
        };
        Returns: Json;
      };
      list_bank_items: {
        Args: {
          in_folder?: string;
          item_status?: Database["public"]["Enums"]["content_status"];
          item_type?: string;
          page_offset?: number;
          page_size?: number;
          search?: string;
          target_bank: string;
          unfiled_only?: boolean;
          with_step?: number;
          with_tags?: string[];
        };
        Returns: {
          cjmm_step: number;
          id: string;
          max_points: Json;
          rationale_match: boolean;
          status: Database["public"]["Enums"]["content_status"];
          stem: Json;
          stem_match: string;
          tags: string[];
          text_match: string;
          total_count: number;
          type: string;
          updated_at: string;
        }[];
      };
      move_to_folder: {
        Args: {
          case_study_ids: string[];
          item_ids: string[];
          target_bank: string;
          target_folder?: string;
        };
        Returns: Json;
      };
      place_case_study_step: {
        Args: { step_item: string; step_position: number; target: string };
        Returns: undefined;
      };
      record_session_response: {
        Args: {
          answer: Json;
          at_position: number;
          earned: number;
          marks: Json;
          participant: string;
          possible: number;
          row_groups?: Json;
          scoring_model: string;
          target_item: string;
          target_session: string;
        };
        Returns: {
          refusal: string;
          submitted_at: string;
        }[];
      };
      reorder_case_study_steps: {
        Args: { item_ids: string[]; target: string };
        Returns: undefined;
      };
      resolve_session_code: {
        Args: { client_key?: string; session_code: string };
        Returns: {
          session_id: string;
          session_mode: Database["public"]["Enums"]["session_mode"];
          session_status: Database["public"]["Enums"]["session_status"];
          session_title: string;
        }[];
      };
      restore_case_study: { Args: { target: string }; Returns: undefined };
      restore_item: { Args: { target: string }; Returns: undefined };
      start_case_study_step: {
        Args: { step_position: number; step_type: string; target: string };
        Returns: string;
      };
      start_session: {
        Args: {
          item_timer_seconds?: number;
          paced?: Database["public"]["Enums"]["session_mode"];
          source_bank?: string;
          source_case_study?: string;
        };
        Returns: string;
      };
      take_rate_limit: { Args: { action_name: string }; Returns: boolean };
    };
    Enums: {
      content_status: "draft" | "published" | "archived";
      org_role: "instructor" | "student" | "admin";
      session_mode: "instructor_paced" | "student_paced";
      session_status: "lobby" | "running" | "paused" | "ended";
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
      session_mode: ["instructor_paced", "student_paced"],
      session_status: ["lobby", "running", "paused", "ended"],
    },
  },
} as const;
