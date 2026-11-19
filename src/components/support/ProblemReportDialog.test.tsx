import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PROBLEM_COPY, type ProblemReportState } from "@/lib/support/problemReportForm";
import { ProblemReportDialog, type ProblemReportDialogProps } from "./ProblemReportDialog";
import { ProblemReportLink } from "./ProblemReportLink";
import { ProblemReportProvider } from "./ProblemReportProvider";

vi.mock("next/navigation", () => ({ usePathname: () => "/author/items/abc" }));

// jsdom has no `showModal`; vitest.setup.ts stands in for it, as for the Dialog's own tests.

function dialog(props: Partial<ProblemReportDialogProps> = {}) {
  const send = vi.fn<ProblemReportDialogProps["send"]>(async () => ({
    status: "sent",
    replyTo: "ada@example.edu",
  }));
  render(<ProblemReportDialog open onClose={() => {}} access="signed-in" send={send} {...props} />);
  return { send };
}

describe("ProblemReportDialog", () => {
  it("sends the message with the page, the reference and the event id the person never typed", async () => {
    const { send } = dialog({
      reference: "1234567890",
      eventId: "0123456789abcdef0123456789abcdef",
    });
    await userEvent.type(screen.getByRole("textbox", { name: "What happened?" }), "It froze.");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(send).toHaveBeenCalledOnce());
    const data = send.mock.calls[0][1];
    expect(data.get("message")).toBe("It froze.");
    expect(data.get("page")).toBe("/author/items/abc");
    expect(data.get("reference")).toBe("1234567890");
    expect(data.get("eventId")).toBe("0123456789abcdef0123456789abcdef");
    expect(data.get("website")).toBe("");
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Thanks, we got it. If we need more, we will reply to ada@example.edu.",
    );
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
  });

  it("says it will include the reference when opened from an error screen", () => {
    dialog({ reference: "1234567890" });
    expect(screen.getByRole("textbox", { name: "What happened?" })).toHaveAccessibleDescription(
      "We will include the reference 1234567890.",
    );
  });

  it("marks the box invalid with the reason under it", () => {
    dialog({ initialState: { status: "invalid", error: PROBLEM_COPY.messageTooShort } });
    const box = screen.getByRole("textbox", { name: "What happened?" });
    expect(box).toHaveAttribute("aria-invalid", "true");
    expect(box).toHaveAccessibleDescription(PROBLEM_COPY.messageTooShort);
  });

  it.each<[string, ProblemReportState]>([
    ["too many", { status: "rate_limited", error: PROBLEM_COPY.rateLimited }],
    ["did not send", { status: "error", error: PROBLEM_COPY.failed }],
  ])("shows %s as an alert, with the support address in it", (_name, state) => {
    dialog({ initialState: state });
    expect(screen.getByRole("alert")).toHaveTextContent("support@learnursing.app");
    expect(screen.getByRole("textbox", { name: "What happened?" })).toBeInTheDocument();
  });

  it("offers only the support address to someone signed out", () => {
    dialog({ access: "signed-out" });
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("link", { name: "support@learnursing.app" })).toHaveAttribute(
      "href",
      "mailto:support@learnursing.app",
    );
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
  });

  it("says it is checking while a public page asks who is signed in", () => {
    dialog({ access: "checking" });
    expect(screen.getByText("Checking you are signed in…")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});

describe("ProblemReportLink", () => {
  const actions = (signedIn: boolean) => ({
    send: vi.fn(async () => ({ status: "idle" }) as const),
    check: vi.fn(async () => signedIn),
  });

  it("is only the support address outside the provider, as on the global error page", () => {
    render(<ProblemReportLink audience="signed-in" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("link", { name: "support@learnursing.app" })).toBeInTheDocument();
  });

  it("is only the support address for a guest", () => {
    render(
      <ProblemReportProvider actions={actions(true)}>
        <ProblemReportLink audience="nobody" emailLead="Still stuck?" />
      </ProblemReportProvider>,
    );
    expect(screen.queryByRole("button", { name: "Tell us about a problem" })).toBeNull();
    expect(screen.getByText(/Still stuck\?/)).toBeInTheDocument();
  });

  it("on a signed-in page, offers the form and the address, without asking the server", async () => {
    const both = actions(true);
    render(
      <ProblemReportProvider actions={both}>
        <ProblemReportLink audience="signed-in" reference="2861533018" />
      </ProblemReportProvider>,
    );
    expect(screen.getByText("Or email us:")).toBeInTheDocument();
    expect(screen.getByText(/Include the reference below/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Tell us about a problem" }));
    expect(screen.getByRole("textbox", { name: "What happened?" })).toBeInTheDocument();
    expect(both.check).not.toHaveBeenCalled();
  });

  it("on a public page, offers the form once the server says someone is signed in", async () => {
    const both = actions(true);
    render(
      <ProblemReportProvider actions={both}>
        <ProblemReportLink audience="unknown" />
      </ProblemReportProvider>,
    );
    const button = await screen.findByRole("button", { name: "Tell us about a problem" });
    expect(both.check).toHaveBeenCalledOnce();
    await userEvent.click(button);
    expect(screen.getByRole("textbox", { name: "What happened?" })).toBeInTheDocument();
  });

  it("on a public page, offers only the address to someone signed out", async () => {
    const both = actions(false);
    render(
      <ProblemReportProvider actions={both}>
        <ProblemReportLink audience="unknown" />
      </ProblemReportProvider>,
    );
    await waitFor(() => expect(both.check).toHaveBeenCalledOnce());
    expect(screen.queryByRole("button", { name: "Tell us about a problem" })).toBeNull();
    expect(screen.getByText("Email us:")).toBeInTheDocument();
  });

  it("in the account menu, is the button alone", () => {
    render(
      <ProblemReportProvider actions={actions(true)}>
        <ProblemReportLink audience="signed-in" appearance="menu" />
      </ProblemReportProvider>,
    );
    expect(screen.getByRole("button", { name: "Tell us about a problem" })).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
