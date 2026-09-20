import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BankSearchForm } from "@/components/authoring/BankSearchForm";
import { CaseStudyList } from "@/components/authoring/CaseStudyList";
import { CreateBankForm } from "@/components/authoring/CreateBankForm";
import { CreateCaseStudyForm } from "@/components/authoring/CreateCaseStudyForm";
import { DeleteFolderForm } from "@/components/authoring/DeleteFolderForm";
import { FolderBreadcrumbs } from "@/components/authoring/FolderBreadcrumbs";
import { FolderNameForm } from "@/components/authoring/FolderNameForm";
import { FolderTree } from "@/components/authoring/FolderTree";
import { ImportJsonForm } from "@/components/authoring/ImportJsonForm";
import { ItemList } from "@/components/authoring/ItemList";
import { MoveToFolderForm } from "@/components/authoring/MoveToFolderForm";
import { Pager } from "@/components/authoring/Pager";
import { TagFilterBar } from "@/components/authoring/TagFilterBar";
import {
  isSearching,
  parseItemSearch,
  parsePage,
  searchSummary,
  type BankFilter,
} from "@/lib/authoring/bankSearch";
import { listCaseStudies, listItems, listTaggedRows } from "@/lib/authoring/banks";
import { listFolders } from "@/lib/authoring/folderData";
import { folderTrail, MAX_FOLDER_DEPTH, parseFolderView } from "@/lib/authoring/folders";
import { isUuid } from "@/lib/authoring/ids";
import { requireAuthor } from "@/lib/authoring/session";
import { bankViewHref, isFiltering, parseTagFilter, tagFacets } from "@/lib/authoring/tagFilter";
import {
  createCaseStudyInBank,
  createFolderInBank,
  deleteFolderInBank,
  importIntoBank,
  moveToFolderInBank,
  renameBank,
  renameFolderInBank,
} from "../../actions";

export const metadata: Metadata = { title: "Item bank" };

const MOVE_FORM_ID = "move-to-folder";

export default async function BankPage({
  params,
  searchParams,
}: PageProps<"/author/banks/[bankId]">) {
  const { bankId } = await params;
  if (!isUuid(bankId)) notFound();
  const query = await searchParams;
  const view = parseFolderView(query.folder);
  const search = parseItemSearch(query);
  const filter: BankFilter = {
    ...parseTagFilter(query.tag, query.step, query.warnings),
    ...search,
  };
  const page = parsePage(query.page);
  const tagFiltered = isFiltering(filter);
  const searching = isSearching(search);

  const { supabase } = await requireAuthor(`/author/banks/${bankId}`);
  const { data: bank } = await supabase
    .from("item_banks")
    .select("id, name")
    .eq("id", bankId)
    .maybeSingle();
  if (!bank) notFound();

  // The filter and search run in the database, under RLS; the tag counts come from the view's
  // items within the search.
  const [folders, itemPage, caseStudies, taggedRows] = await Promise.all([
    listFolders(supabase, bank.id),
    listItems(supabase, bank.id, view, filter, page),
    // Case studies carry no item tags or type, so a tag or type filter lists none of them.
    tagFiltered || search.type
      ? Promise.resolve([])
      : listCaseStudies(supabase, bank.id, view, search),
    listTaggedRows(supabase, bank.id, view, search),
  ]);
  const { items } = itemPage;
  const facets = tagFacets(taggedRows, filter);
  const trail = view.kind === "folder" ? folderTrail(folders, view.id) : [];
  // A folder id that is not one of this bank's folders reads as not found.
  if (view.kind === "folder" && trail.length === 0) notFound();
  const folder = trail.at(-1);
  const heading = folder?.name ?? (view.kind === "unfiled" ? "Unfiled" : bank.name);
  const filtered = view.kind !== "all";
  const hasContent = items.length > 0 || caseStudies.length > 0;

  return (
    <>
      <FolderBreadcrumbs bankId={bank.id} bankName={bank.name} trail={trail} view={view} />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <h1 className="min-w-0 font-read text-3xl break-words text-ink-1">{heading}</h1>
        <Link
          href={`/author/banks/${bank.id}/new`}
          className="tap-target inline-flex items-center rounded-sm border border-accent bg-accent px-4 font-medium text-accent-contrast hover:bg-accent-ink"
        >
          New item
        </Link>
      </div>

      <div className="grid gap-8 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="flex min-w-0 flex-col gap-6">
          <FolderTree bankId={bank.id} folders={folders} view={view} filter={filter} />
          {trail.length < MAX_FOLDER_DEPTH ? (
            <FolderNameForm
              // Keyed by the open folder, so a half-typed name never carries into another folder.
              key={`new-${folder?.id ?? "top"}`}
              action={createFolderInBank.bind(null, bank.id, folder?.id ?? null)}
              label="Folder name"
              hint={folder ? `Creates it inside ${folder.name}.` : undefined}
              submitLabel="Create folder"
            />
          ) : (
            <p className="text-sm text-ink-2">Folders go at most {MAX_FOLDER_DEPTH} levels deep.</p>
          )}
          {folder ? (
            <section
              aria-labelledby="folder-heading"
              className="flex flex-col gap-4 border-t border-line pt-4"
            >
              <h2 id="folder-heading" className="text-sm font-medium text-ink-2">
                This folder
              </h2>
              <FolderNameForm
                key={`rename-${folder.id}`}
                action={renameFolderInBank.bind(null, bank.id, folder.id)}
                label="New name"
                submitLabel="Rename folder"
                initialName={folder.name}
              />
              <DeleteFolderForm
                key={`delete-${folder.id}`}
                action={deleteFolderInBank.bind(null, bank.id, folder.id)}
              />
            </section>
          ) : null}
        </aside>

        <div className="flex min-w-0 flex-col gap-10">
          <section aria-labelledby="items-heading" className="flex flex-col gap-4">
            <h2 id="items-heading" className="font-read text-2xl text-ink-1">
              Items
            </h2>
            <BankSearchForm bankId={bank.id} view={view} filter={filter} />
            <TagFilterBar bankId={bank.id} view={view} filter={filter} facets={facets} />
            {searching ? (
              <p role="status" className="text-ink-1">
                {searchSummary(itemPage.total, search)}
              </p>
            ) : null}
            {hasContent ? (
              <MoveToFolderForm
                key={`move-${folder?.id ?? view.kind}`}
                id={MOVE_FORM_ID}
                folders={folders}
                action={moveToFolderInBank.bind(null, bank.id)}
              />
            ) : null}
            <ItemList
              items={items}
              moveFormId={hasContent ? MOVE_FORM_ID : undefined}
              emptyMessage={
                page > 1
                  ? "No items on this page."
                  : searching
                    ? "No items here match the search."
                    : tagFiltered
                      ? filter.warnings
                        ? "No items here match every chosen filter."
                        : "No items here carry every chosen tag."
                      : filtered
                        ? "No items in this folder."
                        : undefined
              }
            />
            <Pager
              page={page}
              pageCount={itemPage.pageCount}
              hrefFor={(target) => bankViewHref(bank.id, view, filter, target)}
            />
          </section>
          <section aria-labelledby="case-studies-heading" className="flex flex-col gap-4">
            <h2 id="case-studies-heading" className="font-read text-2xl text-ink-1">
              Case studies
            </h2>
            {tagFiltered || search.type ? (
              <p className="text-ink-2">
                {tagFiltered
                  ? "Tag filters list items only. Clear the filters to see case studies."
                  : "A type filter lists items only. Choose Any type to see case studies."}
              </p>
            ) : (
              <CaseStudyList
                caseStudies={caseStudies}
                moveFormId={hasContent ? MOVE_FORM_ID : undefined}
                emptyMessage={
                  search.query
                    ? "No case study titles match the search."
                    : searching
                      ? "No case studies here have that status."
                      : filtered
                        ? "No case studies in this folder."
                        : undefined
                }
              />
            )}
            <CreateCaseStudyForm action={createCaseStudyInBank.bind(null, bank.id)} />
          </section>
          <section aria-labelledby="import-heading" className="flex flex-col gap-4">
            <h2 id="import-heading" className="font-read text-2xl text-ink-1">
              Import JSON
            </h2>
            <ImportJsonForm
              action={importIntoBank.bind(null, bank.id)}
              folders={folders}
              defaultFolderId={folder?.id}
            />
          </section>
          <details className="border-t border-line pt-6">
            <summary className="tap-target flex cursor-pointer items-center text-sm font-medium text-ink-2">
              Rename bank
            </summary>
            <div className="mt-3">
              <CreateBankForm
                action={renameBank.bind(null, bank.id)}
                initialName={bank.name}
                submitLabel="Save name"
              />
            </div>
          </details>
        </div>
      </div>
    </>
  );
}
