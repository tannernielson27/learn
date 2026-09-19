-- Item tags (#104): the bank page filters a bank's items by tag, with `tags @> array[...]`, under
-- the items RLS already in place. Tags hold the NCLEX client needs categories in their fixed
-- spelling and lower-case topic tags; the app normalizes them (src/lib/ngn/tags.ts). The CJMM step
-- stays in cjmm_step and is filtered within one bank, where items_bank_folder_idx narrows first.

-- GIN serves contains (@>). The planner combines it with the bank index when both help.
create index items_tags_idx on public.items using gin (tags);

-- The app's limit is 20 tags of at most 50 characters. The count is checked here too; not valid,
-- so a row saved under the earlier draft limit of 30 is kept until it is next written.
alter table public.items
  add constraint items_tags_count_check check (cardinality(tags) <= 20) not valid;
