-- AI import: where each chunk's segment answer is kept, one staged entry per place, and a
-- batch's source matter (#343, #344).
--
-- 1. `ai_import_chunks.segments` holds what the segment pass found in one chunk (#342's
--    `ChunkSegment`): each question's excerpt, number, type and flags, and any answer or
--    rationale sections printed apart from their questions. The extract pass (#343) reads every
--    chunk of a file, merges them, and turns each question into a staged entry. Owner decision,
--    2026-10-15: a column here, not rows in staged entries before extraction.
--
--    It can hold answer keys copied from the document, as `ai_import_entries.draft` does, so it is
--    read the same way: the workspace's authors, through the table's existing grant and policy
--    ("authors read AI import chunks"). Nobody but the server (service role) writes it: an
--    authenticated client has no insert or update privilege on the table at all (#340).
--
--    The shape check keeps it an object with a `questions` and an `answers` array, and the size
--    check keeps one chunk's answer under 256 KB, as `draft` and `item` are. The server parses it
--    again with Zod before trusting it (`src/lib/aiImport/segmentStore.ts`).
--
-- 2. `ai_import_entries (batch_id, position)` becomes unique. The extract step is driven one
--    request at a time by the browser (#345); a request sent twice, from two tabs, must not stage
--    a question twice. Each question's position is fixed by its file and its place in the file,
--    so the second insert of the same question conflicts and is skipped. The table is empty until
--    this story's code runs, so the index builds on nothing.
--
-- 3. `ai_import_batches.source` holds what the documents say about themselves (#344's
--    `assembleImport` source: author, learning objectives, references). It belongs to the batch,
--    never to a question. Read like the batch ("authors read AI import batches"); written by the
--    server only: the teacher's insert and update grants on the table name their columns, and
--    this one is not among them.
--
-- Nothing user-facing reads or writes any of these yet; #345 is the first caller.

alter table public.ai_import_chunks add column segments jsonb;

alter table public.ai_import_chunks
  add constraint ai_import_chunks_segments_shape_check check (
    segments is null or coalesce(
      jsonb_typeof(segments) = 'object'
      and jsonb_typeof(segments -> 'questions') = 'array'
      and jsonb_typeof(segments -> 'answers') = 'array',
      false
    )
  ),
  add constraint ai_import_chunks_segments_size_check
    check (pg_column_size(segments) <= 262144);

comment on column public.ai_import_chunks.segments is
  'The segment pass''s answer for this chunk (#342 ChunkSegment), written by the server only. May hold answer keys copied from the document.';

create unique index ai_import_entries_batch_position_key
  on public.ai_import_entries (batch_id, position);

alter table public.ai_import_batches add column source jsonb;

alter table public.ai_import_batches
  add constraint ai_import_batches_source_shape_check check (
    source is null or coalesce(
      jsonb_typeof(source) = 'object'
      and jsonb_typeof(source -> 'objectives') = 'array'
      and jsonb_typeof(source -> 'references') = 'array',
      false
    )
  ),
  add constraint ai_import_batches_source_size_check check (pg_column_size(source) <= 65536);

comment on column public.ai_import_batches.source is
  'What the documents say about themselves (author, objectives, references), from #344''s assembleImport; written by the server only.';
