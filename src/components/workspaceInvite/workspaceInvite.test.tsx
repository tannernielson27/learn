import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  INVITE_CLOSED,
  INVITE_CLOSED_HEADING,
  INVITE_NOT_VALID_HEADING,
  INVITE_REFUSED,
  INVITE_REFUSED_HEADING,
  type InviteAccountState,
  type JoinWorkspaceState,
} from "@/lib/workspace/invite";
import {
  AcceptInviteForm,
  INVITE_ACCOUNT_EXISTS,
  type AcceptInviteFormProps,
} from "./AcceptInviteForm";
import { InviteAnswerView } from "./InviteAnswerView";
import { JoinWorkspaceButton, type JoinWorkspaceButtonProps } from "./JoinWorkspaceButton";
import { MoveWorkspaceForm, type MoveWorkspaceFormProps } from "./MoveWorkspaceForm";

const HEADING = "Ada Lovelace invited you to teach in Ada’s workspace";
const SIGN_IN = "/sign-in?next=%2Fw%2FAbC_-0123456789abcdefghijklmnopq";

describe("InviteAnswerView", () => {
  it("shows the one not-valid page, and focuses its heading", () => {
    render(<InviteAnswerView answer={{ status: "invalid" }} />);
    expect(screen.getByRole("heading", { level: 1, name: INVITE_NOT_VALID_HEADING })).toHaveFocus();
  });

  it.each(["expired", "revoked", "accepted"] as const)("says an invitation is %s", (state) => {
    render(<InviteAnswerView answer={{ status: "closed", state }} />);
    expect(screen.getByRole("heading", { level: 1, name: INVITE_CLOSED_HEADING })).toBeVisible();
    expect(screen.getByText(INVITE_CLOSED[state])).toBeVisible();
  });

  it.each([
    "student",
    "already_teaches",
    "already_member",
    "teaches_shared",
    "founder_with_members",
    "students_depend",
    "wrong_address",
    "shared_workspace",
    "members_full",
  ] as const)("says why the account cannot join: %s", (reason) => {
    render(<InviteAnswerView answer={{ status: "refused", reason }} />);
    expect(screen.getByRole("heading", { level: 1, name: INVITE_REFUSED_HEADING })).toBeVisible();
    expect(screen.getByText(INVITE_REFUSED[reason])).toBeVisible();
  });
});

function setupJoin(result: JoinWorkspaceState) {
  const action = vi.fn<JoinWorkspaceButtonProps["action"]>(async () => result);
  render(<JoinWorkspaceButton action={action} heading={HEADING} email="grace@school.edu" />);
  return { action, user: userEvent.setup() };
}

describe("JoinWorkspaceButton", () => {
  it("offers one button, in a form that posts, as the signed-in account", async () => {
    const { action, user } = setupJoin({ status: "idle" });
    expect(screen.getByRole("heading", { level: 1, name: HEADING })).toBeVisible();
    expect(screen.getByText(/grace@school\.edu/)).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Join workspace" });
    expect(button).toHaveAttribute("type", "submit");
    expect(button.closest("form")).not.toBeNull();
    // Nothing is accepted until the button is pressed.
    expect(action).not.toHaveBeenCalled();
    await user.click(button);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("says why an account cannot join", async () => {
    const { user } = setupJoin({ status: "refused", reason: "student" });
    await user.click(screen.getByRole("button", { name: "Join workspace" }));
    expect(await screen.findByText(INVITE_REFUSED.student)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Join workspace" })).toBeNull();
  });

  it("answers a token that stopped working with the one not-valid page", async () => {
    const { user } = setupJoin({ status: "invalid" });
    await user.click(screen.getByRole("button", { name: "Join workspace" }));
    expect(await screen.findByRole("heading", { name: INVITE_NOT_VALID_HEADING })).toBeVisible();
  });

  it("announces an error and keeps the button", async () => {
    const { user } = setupJoin({ status: "error", error: "Try again in a moment." });
    await user.click(screen.getByRole("button", { name: "Join workspace" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Try again in a moment.");
    expect(screen.getByRole("button", { name: "Join workspace" })).toBeVisible();
  });

  it("renders a heading made of someone else's words as text", () => {
    const action = vi.fn<JoinWorkspaceButtonProps["action"]>(async () => ({ status: "idle" }));
    const { container } = render(
      <JoinWorkspaceButton
        action={action}
        heading={"<script>alert(1)</script> invited you to teach in <b>x</b>"}
        email="grace@school.edu"
      />,
    );
    expect(container.querySelector("script, b")).toBeNull();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "<script>alert(1)</script>",
    );
  });
});

function setupForm(result: InviteAccountState) {
  const action = vi.fn<AcceptInviteFormProps["action"]>(async () => result);
  render(
    <AcceptInviteForm
      action={action}
      heading={HEADING}
      invitedEmail="grace@school.edu"
      signInHref={SIGN_IN}
    />,
  );
  return { action, user: userEvent.setup() };
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Your name"), "Grace Hopper");
  await user.type(screen.getByLabelText("Password"), "correct horse battery staple");
  await user.click(screen.getByRole("button", { name: "Create account and join" }));
}

describe("AcceptInviteForm", () => {
  it("posts a name and a password, and never the address", async () => {
    const { action, user } = setupForm({ status: "idle" });
    const email = screen.getByLabelText("Email address");
    expect(email).toHaveValue("grace@school.edu");
    expect(email).toHaveAttribute("readonly");
    await user.type(email, "mallory@evil.example");
    expect(email).toHaveValue("grace@school.edu");

    await fillAndSubmit(user);
    expect(action).toHaveBeenCalledTimes(1);
    const posted = action.mock.calls[0]![1];
    expect(posted.get("displayName")).toBe("Grace Hopper");
    expect(posted.get("password")).toBe("correct horse battery staple");
    expect(posted.has("email")).toBe(false);
  });

  it("sends someone whose address already has an account to sign in and come back", async () => {
    const { user } = setupForm({ status: "exists" });
    await fillAndSubmit(user);
    expect(
      await screen.findByRole("heading", { level: 1, name: "You already have an account" }),
    ).toHaveFocus();
    expect(screen.getByText(INVITE_ACCOUNT_EXISTS)).toBeVisible();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", SIGN_IN);
  });

  it("says the account is ready when the browser could not be signed in", async () => {
    const { user } = setupForm({ status: "created_signed_out" });
    await fillAndSubmit(user);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Your account is ready" }),
    ).toHaveFocus();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/sign-in?next=%2Fauthor",
    );
  });

  it("puts an error on the field it is about, and keeps the name typed", async () => {
    const { user } = setupForm({
      status: "error",
      error: "Choose a longer password.",
      field: "password",
    });
    await fillAndSubmit(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose a longer password.");
    expect(screen.getByLabelText("Password")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Password")).toHaveFocus();
    expect(screen.getByLabelText("Your name")).toHaveValue("Grace Hopper");
  });

  it("shows what the database answered when the invitation closed meanwhile", async () => {
    const { user } = setupForm({ status: "refused", reason: "members_full" });
    await fillAndSubmit(user);
    expect(await screen.findByText(INVITE_REFUSED.members_full)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Create account and join" })).toBeNull();
  });
});

const PREVIEW = { leavingWorkspace: "Grace’s workspace", bankCount: 2, classCount: 0 };
const MOVE_BOX =
  "I understand that I will leave Grace’s workspace and lose access to everything in it.";

function setupMove(result: JoinWorkspaceState) {
  const action = vi.fn<MoveWorkspaceFormProps["action"]>(async () => result);
  render(
    <MoveWorkspaceForm
      action={action}
      heading={HEADING}
      email="grace@school.edu"
      preview={PREVIEW}
    />,
  );
  return { action, user: userEvent.setup() };
}

describe("MoveWorkspaceForm", () => {
  it("names the workspace left, counts what is lost, and says who is signed in", () => {
    setupMove({ status: "idle" });
    expect(screen.getByRole("heading", { level: 1, name: HEADING })).toBeVisible();
    expect(
      screen.getByRole("heading", { level: 2, name: "Joining means leaving your workspace" }),
    ).toBeVisible();
    expect(screen.getByText(/You are signed in as grace@school\.edu\./)).toBeVisible();
    expect(screen.getByText(/You teach in Grace’s workspace now\./)).toBeVisible();
    expect(screen.getByText(/its 2 item banks and 0 classes/)).toBeVisible();
    expect(screen.getByText(/Nothing is deleted, and nothing comes with you\./)).toBeVisible();
  });

  it("starts with the box unticked, and it is required", () => {
    setupMove({ status: "idle" });
    const box = screen.getByRole("checkbox", { name: MOVE_BOX });
    expect(box).not.toBeChecked();
    expect(box).toBeRequired();
  });

  it("posts the ticked box under the name the action reads", async () => {
    const { action, user } = setupMove({ status: "idle" });
    await user.click(screen.getByRole("checkbox", { name: MOVE_BOX }));
    await user.click(screen.getByRole("button", { name: "Leave and join workspace" }));
    expect(action).toHaveBeenCalledOnce();
    const form = action.mock.calls[0]![1];
    expect(form.get("confirmMove")).toBe("on");
  });

  it("shows the server's sentence beside the box, and keeps the form", async () => {
    const { user } = setupMove({ status: "error", error: "Tick the box to confirm." });
    await user.click(screen.getByRole("checkbox", { name: MOVE_BOX }));
    await user.click(screen.getByRole("button", { name: "Leave and join workspace" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Tick the box to confirm.");
    expect(screen.getByRole("checkbox", { name: MOVE_BOX })).toBeVisible();
  });

  it("gives way to the refusal when the server will not move the account", async () => {
    const { user } = setupMove({ status: "refused", reason: "students_depend" });
    await user.click(screen.getByRole("checkbox", { name: MOVE_BOX }));
    await user.click(screen.getByRole("button", { name: "Leave and join workspace" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: INVITE_REFUSED_HEADING }),
    ).toBeVisible();
    expect(screen.getByText(INVITE_REFUSED.students_depend)).toBeVisible();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("draws the workspace's name as text", () => {
    const action = vi.fn<MoveWorkspaceFormProps["action"]>(async () => ({ status: "idle" }));
    const { container } = render(
      <MoveWorkspaceForm
        action={action}
        heading={HEADING}
        email="grace@school.edu"
        preview={{ ...PREVIEW, leavingWorkspace: "<b>Mine</b><script>x</script>" }}
      />,
    );
    expect(container.textContent).toContain("<b>Mine</b><script>x</script>");
    expect(container.querySelector("b, script")).toBeNull();
  });
});
