"use client";

import { Search } from "lucide-react";
import { createContext, use, useId, useState, type ReactNode } from "react";
import { fieldClasses } from "@/components/ui/fieldClasses";
import { Icon } from "@/components/ui/Icon";
import { matchesQuizSearch, quizSearchSummary } from "@/lib/authoring/quizSearch";

interface SearchState {
  query: string;
  setQuery: (query: string) => void;
  names: readonly string[];
}

const SearchContext = createContext<SearchState>({ query: "", setQuery: () => {}, names: [] });

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
  return <SearchContext value={{ query, setQuery, names }}>{children}</SearchContext>;
}

/** The search field, with the count of matches read out as it changes. */
export function QuizSearchField({ className = "" }: { className?: string }) {
  const { query, setQuery, names } = use(SearchContext);
  const id = useId();
  const shown = names.filter((name) => matchesQuizSearch(name, query)).length;
  const summary = quizSearchSummary(shown, names.length, query);
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
