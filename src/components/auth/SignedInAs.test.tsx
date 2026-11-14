import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SignedInAs } from "./SignedInAs";

describe("SignedInAs", () => {
  it("shows the account's name, with the email address under it", () => {
    render(<SignedInAs displayName="Ana Reyes" email="ana@school.edu" />);
    expect(screen.getByTestId("signed-in-name")).toHaveTextContent("Ana Reyes");
    expect(screen.getByTestId("signed-in-address")).toHaveTextContent("ana@school.edu");
    expect(screen.queryByTestId("signed-in-email")).not.toBeInTheDocument();
  });

  it("shows the email address alone otherwise", () => {
    render(<SignedInAs displayName={null} email="ana@school.edu" />);
    expect(screen.getByTestId("signed-in-email")).toHaveTextContent("ana@school.edu");
    expect(screen.getAllByText("ana@school.edu")).toHaveLength(1);
  });

  it("shows a name as text, never as markup", () => {
    render(<SignedInAs displayName="<b>Ana</b>" email="ana@school.edu" />);
    expect(screen.getByTestId("signed-in-name")).toHaveTextContent("<b>Ana</b>");
    expect(document.querySelector("b")).toBeNull();
  });
});
