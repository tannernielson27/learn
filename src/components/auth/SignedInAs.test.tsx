import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SignedInAs } from "./SignedInAs";

describe("SignedInAs", () => {
  it("shows the account's name when it has one", () => {
    render(<SignedInAs displayName="Ana Reyes" email="ana@school.edu" />);
    expect(screen.getByTestId("signed-in-name")).toHaveTextContent("Ana Reyes");
    expect(screen.queryByText("ana@school.edu")).not.toBeInTheDocument();
  });

  it("shows the email address otherwise", () => {
    render(<SignedInAs displayName={null} email="ana@school.edu" />);
    expect(screen.getByTestId("signed-in-email")).toHaveTextContent("ana@school.edu");
  });

  it("shows a name as text, never as markup", () => {
    render(<SignedInAs displayName="<b>Ana</b>" email="ana@school.edu" />);
    expect(screen.getByTestId("signed-in-name")).toHaveTextContent("<b>Ana</b>");
    expect(document.querySelector("b")).toBeNull();
  });
});
