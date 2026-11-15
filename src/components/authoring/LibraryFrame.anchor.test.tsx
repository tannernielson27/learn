import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "@/components/ui/EmptyState";
import { CreateBankForm } from "./CreateBankForm";
import { NEW_QUIZ_FIELD_ID } from "./LibraryFrame";

describe("the empty library's New quiz link (#563)", () => {
  it("lands on the New quiz name field itself, as a plain anchor the browser follows", () => {
    render(
      <>
        <CreateBankForm
          action={async () => ({ status: "idle" })}
          nameId={NEW_QUIZ_FIELD_ID}
          inline
        />
        <EmptyState
          level={2}
          heading="No quizzes yet"
          action={{ href: `#${NEW_QUIZ_FIELD_ID}`, label: "New quiz" }}
        />
      </>,
    );
    const field = screen.getByRole("textbox", { name: "Quiz name" });
    expect(field).toHaveAttribute("id", NEW_QUIZ_FIELD_ID);
    const link = screen.getByRole("link", { name: "New quiz" });
    expect(link).toHaveAttribute("href", `#${NEW_QUIZ_FIELD_ID}`);
    expect(field).toHaveClass("scroll-mt-24");
  });

  it("follows the router for a link to another page", () => {
    render(
      <EmptyState level={2} heading="No quizzes yet" action={{ href: "/author", label: "Go" }} />,
    );
    expect(screen.getByRole("link", { name: "Go" })).toHaveAttribute("href", "/author");
  });
});
