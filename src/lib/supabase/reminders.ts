import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReminderKind } from "@/lib/reminders/reminderEmail";
import type { FailOutcome, ReminderRow, ReminderStore } from "@/lib/reminders/sendReminders";
import type { Database } from "./database.types";

/**
 * The reminder outbox (#212), against the database. Service role only: every function here is
 * granted to `service_role` and to nobody else, and the claim returns students' addresses.
 *
 * Errors name the function and the Postgres code and nothing else, so the route can log them.
 */

type Client = SupabaseClient<Database>;

const LEASE_SECONDS = 300;
const KINDS: ReadonlySet<string> = new Set<ReminderKind>(["opened", "closing_soon"]);
const FAIL_OUTCOMES: ReadonlySet<string> = new Set<FailOutcome>([
  "retrying",
  "failed",
  "not_found",
]);

function failure(fn: string, error: { code?: string }): Error {
  return new Error(`${fn}: ${error.code ?? "unknown"}`);
}

export function createReminderStore(service: Client): ReminderStore {
  return {
    async enqueue() {
      const { data, error } = await service.rpc("enqueue_assignment_reminders");
      if (error) throw failure("enqueue_assignment_reminders", error);
      const counts = data?.[0];
      return { opened: counts?.opened ?? 0, closingSoon: counts?.closing_soon ?? 0 };
    },

    async claim(limit) {
      const { data, error } = await service.rpc("claim_assignment_reminders", {
        max_rows: limit,
        lease_seconds: LEASE_SECONDS,
      });
      if (error) throw failure("claim_assignment_reminders", error);
      return (data ?? [])
        .filter((row) => KINDS.has(row.kind))
        .map((row): ReminderRow => ({
          outboxId: row.outbox_id,
          assignmentId: row.assignment_id,
          studentId: row.student_id,
          kind: row.kind as ReminderKind,
          email: row.email,
          title: row.title,
          closesAt: row.closes_at,
          timeZone: row.time_zone,
          tries: row.tries,
        }));
    },

    async complete(outboxId, providerId) {
      const { error } = await service.rpc("complete_assignment_reminder", {
        target: outboxId,
        message_id: providerId,
      });
      if (error) throw failure("complete_assignment_reminder", error);
    },

    async fail(outboxId, errorKind, retryInSeconds) {
      const { data, error } = await service.rpc("fail_assignment_reminder", {
        target: outboxId,
        error_kind: errorKind,
        ...(retryInSeconds === null ? {} : { retry_in_seconds: retryInSeconds }),
      });
      if (error) throw failure("fail_assignment_reminder", error);
      return typeof data === "string" && FAIL_OUTCOMES.has(data)
        ? (data as FailOutcome)
        : "not_found";
    },

    async release(outboxIds, retryInSeconds) {
      if (outboxIds.length === 0) return;
      const { error } = await service.rpc("release_assignment_reminders", {
        targets: [...outboxIds],
        retry_in_seconds: retryInSeconds,
      });
      if (error) throw failure("release_assignment_reminders", error);
    },
  };
}
