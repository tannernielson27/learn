"use client";

import { Search } from "lucide-react";
import { createContext, use, useId, useState, type ReactNode } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { fieldClasses } from "@/components/ui/fieldClasses";
import { Icon } from "@/components/ui/Icon";
import { matchesQuizSearch, quizSearchSummary } from "@/lib/authoring/quizSearch";

interface SearchState {
  query: string;
  setQuery: (query: string) => void;
  names: readonly string[];
  /** The field's id, so clearing the search from the list can hand focus back to it. */
  fieldId: string;
}

const SearchContext = createContext<SearchState>({
  query: "",
  setQuery: () => {},
  names: [],
  fieldId: "",
});

export interface QuizSearchProps {
  /** Every quiz name the open view lists, for the "2 of 6 quizzes match" line. */
  names: readonly string[];
  children: ReactNode;
}

/**
 * The library's search (Library mockup) around the field and the rows it narrows. It filters the
 * quizzes already on the page by name, in the browser: no request, and nothing about what is
 * listed changes until something is typed.
 */
export function QuizSearch({ names, children }: QuizSearchProps) {
  const [query, setQuery] = useState("");
  const fieldId = useId();
  return <SearchContext value={{ query, setQuery, names, fieldId }}>{children}</SearchContext>;
}

/** The search field, with the count of matches read out as it changes. */
export function QuizSearchField({ className = "" }: { className?: string }) {
  const { query, setQuery, names, fieldId: id } = use(SearchContext);
  const shown = names.filter((name) => matchesQuizSearch(name, query)).length;
  // With nothing matching, the list's own no-results line says so (`QuizSearchNoResults`), once.
  const summary = shown === 0 ? null : quizSearchSummary(shown, names.length, query);
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className}`.trim()}>
      <label htmlFor={id} className="sr-only">
        Search quizzes
      </label>
      <div className="relative">
        <Icon
          icon={Search}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-2"
        />
        <input
          id={id}
          type="search"
          placeholder="Search quizzes"
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className={fieldClasses("h-11 pr-3 pl-10 text-base")}
        />
      </div>
      <p role="status" className="text-sm text-ink-2 empty:hidden">
        {summary}
      </p>
    </div>
  );
}

/** One quiz's row, drawn only while it matches what is typed. */
export function QuizSearchRow({ name, children }: { name: string; children: ReactNode }) {
  const { query } = use(SearchContext);
  return matchesQuizSearch(name, query) ? children : null;
}

/**
 * Where the rows were, once a search hides every one of them (#563): the no-results empty state,
 * saying what was typed, and a button that clears it and puts focus back in the field.
 */
export function QuizSearchNoResults() {
  const { query, setQuery, names, fieldId } = use(SearchContext);
  const shown = names.filter((name) => matchesQuizSearch(name, query)).length;
  const summary =
    names.length > 0 && shown === 0 ? quizSearchSummary(0, names.length, query) : null;
  if (!summary) return null;
  return (
    <EmptyState
      variant="no-results"
      heading={summary}
      clearLabel="Clear search"
      onClear={() => {
        setQuery("");
        document.getElementById(fieldId)?.focus();
      }}
    />
  );
}
