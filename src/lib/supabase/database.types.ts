export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      assignment_attempts: {
        Row: {
          assignment_id: string;
          auto_submitted: boolean;
          id: string;
          max_score: number | null;
          number: number;
          org_id: string;
          revision: number;
          score: number | null;
          started_at: string;
          student_id: string;
          submitted_at: string | null;
        };
        Insert: {
          assignment_id: string;
          auto_submitted?: boolean;
          id?: string;
          max_score?: number | null;
          number: number;
          org_id: string;
          revision?: number;
          score?: number | null;
          started_at?: string;
          student_id: string;
          submitted_at?: string | null;
        };
        Update: {
          assignment_id?: string;
          auto_submitted?: boolean;
          id?: string;
          max_score?: number | null;
          number?: number;
          org_id?: string;
          revision?: number;
          score?: number | null;
          started_at?: string;
          student_id?: string;
          submitted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "assignment_attempts_assignment_org_fkey";
            columns: ["assignment_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "assignments";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "assignment_attempts_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assignment_attempts_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      assignments: {
        Row: {
          bank_id: string | null;
          case_study_id: string | null;
          class_id: string;
          closes_at: string;
          created_at: string;
          created_by: string | null;
          id: string;
          item_set: Json;
          max_attempts: number;
          opens_at: string;
          org_id: string;
          patient_record: Json | null;
          shuffle_options: boolean;
          title: string;
          updated_at: string;
        };
        Insert: {
          bank_id?: string | null;
          case_study_id?: string | null;
          class_id: string;
          closes_at: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          item_set?: Json;
          max_attempts?: number;
          opens_at: string;
          org_id?: string;
          patient_record?: Json | null;
          shuffle_options?: boolean;
          title: string;
          updated_at?: string;
        };
        Update: {
          bank_id?: string | null;
          case_study_id?: string | null;
          class_id?: string;
          closes_at?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          item_set?: Json;
          max_attempts?: number;
          opens_at?: string;
          org_id?: string;
          patient_record?: Json | null;
          shuffle_options?: boolean;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "assignments_bank_org_fkey";
            columns: ["bank_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "item_banks";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "assignments_case_org_fkey";
            columns: ["case_study_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "case_studies";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "assignments_class_org_fkey";
            columns: ["class_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "assignments_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assignments_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
        ];
      };
      attempt_responses: {
        Row: {
          attempt_id: string;
          breakdown: Json | null;
          groups: Json | null;
          item_id: string;
          max_points: number | null;
          model: string | null;
          org_id: string;
          points: number | null;
          response: Json;
          saved_at: string;
        };
        Insert: {
          attempt_id: string;
          breakdown?: Json | null;
          groups?: Json | null;
          item_id: string;
          max_points?: number | null;
          model?: string | null;
          org_id: string;
          points?: number | null;
          response: Json;
          saved_at?: string;
        };
        Update: {
          attempt_id?: string;
          breakdown?: Json | null;
          groups?: Json | null;
          item_id?: string;
          max_points?: number | null;
          model?: string | null;
          org_id?: string;
          points?: number | null;
          response?: Json;
          saved_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attempt_responses_attempt_org_fkey";
            columns: ["attempt_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "assignment_attempts";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
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
      class_members: {
        Row: {
          class_id: string;
          joined_at: string;
          profile_id: string;
        };
        Insert: {
          class_id: string;
          joined_at?: string;
          profile_id: string;
        };
        Update: {
          class_id?: string;
          joined_at?: string;
          profile_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "class_members_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "class_members_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      classes: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          invite_token: string;
          name: string;
          org_id: string;
          time_zone: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          invite_token?: string;
          name: string;
          org_id?: string;
          time_zone?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          invite_token?: string;
          name?: string;
          org_id?: string;
          time_zone?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "classes_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "classes_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
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
      participants: {
        Row: {
          display_name: string;
          id: string;
          joined_at: string;
          last_seen_at: string;
          org_id: string;
          profile_id: string | null;
          rejoin_hash: string;
          session_id: string;
        };
        Insert: {
          display_name: string;
          id?: string;
          joined_at?: string;
          last_seen_at?: string;
          org_id: string;
          profile_id?: string | null;
          rejoin_hash: string;
          session_id: string;
        };
        Update: {
          display_name?: string;
          id?: string;
          joined_at?: string;
          last_seen_at?: string;
          org_id?: string;
          profile_id?: string | null;
          rejoin_hash?: string;
          session_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "participants_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "participants_session_org_fkey";
            columns: ["session_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "sessions";
            referencedColumns: ["id", "org_id"];
          },
        ];
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
          patient_record: Json | null;
          reveal: boolean;
          status: Database["public"]["Enums"]["session_status"];
          timer_remaining_ms: number | null;
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
          patient_record?: Json | null;
          reveal?: boolean;
          status?: Database["public"]["Enums"]["session_status"];
          timer_remaining_ms?: number | null;
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
          patient_record?: Json | null;
          reveal?: boolean;
          status?: Database["public"]["Enums"]["session_status"];
          timer_remaining_ms?: number | null;
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
      assignment_report_rows: {
        Args: { target_assignment: string };
        Returns: {
          attempt_id: string;
          attempt_number: number;
          auto_submitted: boolean;
          display_name: string;
          email: string;
          marks: Json;
          max_score: number;
          membership: string;
          score: number;
          scores_released: boolean;
          started_at: string;
          student_id: string;
          submitted_at: string;
        }[];
      };
      begin_attempt_submission: {
        Args: { target_attempt: string };
        Returns: {
          answers: Json;
          item_set: Json;
          refusal: string;
          revision: number;
        }[];
      };
      begin_session_submission: {
        Args: {
          participant: string;
          requested_position?: number;
          target_session: string;
        };
        Returns: {
          item_id: string;
          item_position: number;
          refusal: string;
        }[];
      };
      begin_session_view: {
        Args: { participant: string; target_session: string };
        Returns: {
          refusal: string;
          server_now: string;
          session_ends_at: string;
          session_items: Json;
          session_mode: Database["public"]["Enums"]["session_mode"];
          session_position: number;
          session_remaining_ms: number;
          session_reveal: boolean;
          session_status: Database["public"]["Enums"]["session_status"];
          session_timer_seconds: number;
        }[];
      };
      claim_assignment_reminders: {
        Args: { lease_seconds?: number; max_rows?: number };
        Returns: {
          assignment_id: string;
          closes_at: string;
          email: string;
          kind: string;
          outbox_id: string;
          student_id: string;
          time_zone: string;
          title: string;
          tries: number;
        }[];
      };
      class_roster: {
        Args: { target_class: string };
        Returns: {
          display_name: string;
          email: string;
          joined_at: string;
          profile_id: string;
          signed_in: boolean;
        }[];
      };
      complete_assignment_reminder: {
        Args: { message_id?: string; target: string };
        Returns: boolean;
      };
      duplicate_case_study: {
        Args: { source_case_study: string };
        Returns: string;
      };
      duplicate_item: { Args: { source_item: string }; Returns: string };
      end_session: { Args: { target: string }; Returns: string };
      enqueue_assignment_reminders: {
        Args: never;
        Returns: {
          closing_soon: number;
          opened: number;
        }[];
      };
      expired_open_attempts: {
        Args: {
          max_rows?: number;
          target_assignment?: string;
          target_student?: string;
        };
        Returns: {
          answers: Json;
          assignment_id: string;
          attempt_id: string;
          item_set: Json;
          revision: number;
          student_id: string;
        }[];
      };
      extend_item_timer: { Args: { target: string }; Returns: undefined };
      fail_assignment_reminder: {
        Args: { error_kind: string; retry_in_seconds?: number; target: string };
        Returns: string;
      };
      hit_rate_limit: {
        Args: {
          bucket_name: string;
          key_digest: string;
          max_hits: number;
          window_seconds: number;
        };
        Returns: boolean;
      };
      import_bank_content: {
        Args: {
          new_case_study: Json;
          new_items: Json;
          target_bank: string;
          target_folder?: string;
        };
        Returns: Json;
      };
      join_class: { Args: { token: string }; Returns: string };
      join_session: {
        Args: { chosen_name: string; target_session: string };
        Returns: {
          participant_id: string;
          rejoin_secret: string;
        }[];
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
      my_assignment_history: {
        Args: never;
        Returns: {
          assignment_id: string;
          attempt_id: string;
          attempt_number: number;
          class_id: string;
          closes_at: string;
          max_attempts: number;
          max_score: number;
          score: number;
          submitted_at: string;
          title: string;
        }[];
      };
      my_assignment_result: {
        Args: { target_assignment: string };
        Returns: {
          assignment_id: string;
          attempt_id: string;
          attempt_number: number;
          auto_submitted: boolean;
          closes_at: string;
          item_set: Json;
          marks: Json;
          max_attempts: number;
          max_score: number;
          patient_record: Json;
          score: number;
          started_at: string;
          submitted_at: string;
          title: string;
        }[];
      };
      my_classes: {
        Args: never;
        Returns: {
          class_id: string;
          class_name: string;
          joined_at: string;
          time_zone: string;
        }[];
      };
      place_case_study_step: {
        Args: { step_item: string; step_position: number; target: string };
        Returns: undefined;
      };
      record_attempt_submission: {
        Args: {
          automatic?: boolean;
          expected_revision: number;
          marks: Json;
          possible: number;
          student: string;
          target_attempt: string;
          total: number;
        };
        Returns: {
          refusal: string;
          submitted_at: string;
        }[];
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
      release_assignment_reminders: {
        Args: { retry_in_seconds?: number; targets: string[] };
        Returns: number;
      };
      reorder_case_study_steps: {
        Args: { item_ids: string[]; target: string };
        Returns: undefined;
      };
      resolve_class_invite: {
        Args: { client_key?: string; token: string };
        Returns: {
          class_id: string;
          class_name: string;
        }[];
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
      resume_participant: {
        Args: {
          presented_secret: string;
          target_participant: string;
          target_session: string;
        };
        Returns: {
          participant_id: string;
          participant_joined_at: string;
          participant_name: string;
          session_mode: Database["public"]["Enums"]["session_mode"];
          session_status: Database["public"]["Enums"]["session_status"];
          session_title: string;
        }[];
      };
      rotate_class_invite: { Args: { target_class: string }; Returns: string };
      save_attempt_response: {
        Args: { answer: Json; target_attempt: string; target_item: string };
        Returns: {
          refusal: string;
          saved_at: string;
        }[];
      };
      server_clock: { Args: never; Returns: string };
      start_assignment_attempt: {
        Args: { target_assignment: string };
        Returns: {
          attempt_id: string;
          refusal: string;
        }[];
      };
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
      stop_item_timer: { Args: { target: string }; Returns: undefined };
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
