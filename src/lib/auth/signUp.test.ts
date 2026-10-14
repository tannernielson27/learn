import { afterEach, describe, expect, it, vi } from "vitest";
import { EMAIL_UNCONFIRMED_KEY } from "./emailConfirmation";
import {
  afterSignUpPath,
  carriedClassCode,
  parseSignUpRole,
  signUp,
  workspaceName,
  type SignUpDeps,
  type SignUpInput,
} from "./signUp";

const USER_ID = "00000000-0000-4000-8000-0000000000a1";
const TEACHER: SignUpInput = {
  email: "ada@school.edu",
  password: "correct horse battery",
  displayName: "Ada Lovelace",
  role: "teacher",
};
const STUDENT: SignUpInput = { ...TEACHER, role: "student" };

function deps(overrides: Partial<SignUpDeps> = {}): SignUpDeps & {
  calls: string[];
} {
  const calls: string[] = [];
  return {
    calls,
    createUser: vi.fn(async () => {
      calls.push("createUser");
      return { data: { user: { id: USER_ID } }, error: null };
    }),
    saveName: vi.fn(async () => {
      calls.push("saveName");
      return { error: null };
    }),
    registerInstructor: vi.fn(async () => {
      calls.push("registerInstructor");
      return { error: null };
    }),
    signIn: vi.fn(async () => {
      calls.push("signIn");
      return { error: null };
    }),
    ...overrides,
  };
}

afterEach(() => vi.restoreAllMocks());

describe("parseSignUpRole (#361)", () => {
  it("reads the two roles and nothing else", () => {
    expect(parseSignUpRole("teacher")).toBe("teacher");
    expect(parseSignUpRole("student")).toBe("student");
    for (const value of ["admin", "instructor", "Teacher", "", null, undefined, 1, ["teacher"]]) {
      expect(parseSignUpRole(value)).toBeNull();
    }
  });
});

describe("workspaceName (#361)", () => {
  it("names the workspace after the teacher", () => {
    expect(workspaceName("Ada Lovelace")).toBe("Ada Lovelace’s workspace");
  });

  it("never passes register_instructor's 80 characters, cutting the name and not the word", () => {
    const long = workspaceName("A".repeat(80));
    expect([...long]).toHaveLength(80);
    expect(long.endsWith("’s workspace")).toBe(true);
  });

  it("gives an account with no name a plain one", () => {
    expect(workspaceName(null)).toBe("My workspace");
    expect(workspaceName("   ")).toBe("My workspace");
  });

  it("counts characters as Postgres does, not UTF-16 units", () => {
    const long = workspaceName("😀".repeat(80));
    expect([...long]).toHaveLength(80);
    // No half of a surrogate pair is left at the cut.
    expect(long.isWellFormed()).toBe(true);
  });
});

describe("carriedClassCode (#361)", () => {
  it("keeps a code-shaped value and drops anything else", () => {
    expect(carriedClassCode("ABCD2345")).toBe("ABCD2345");
    expect(carriedClassCode(" abcd-2345 ")).toBe("abcd-2345");
    for (const value of ["", "a", "x".repeat(33), "abc/def", "a b", "<script>", null, undefined]) {
      expect(carriedClassCode(value)).toBeNull();
    }
  });
});

describe("afterSignUpPath (#361)", () => {
  it("sends a teacher with a workspace to authoring", () => {
    expect(afterSignUpPath({ home: "teacher", workspaceFailed: false }, null)).toBe("/author");
  });

  it("sends a student to the welcome page, carrying a class code", () => {
    expect(afterSignUpPath({ home: "no_role", workspaceFailed: false }, null)).toBe("/welcome");
    expect(afterSignUpPath({ home: "no_role", workspaceFailed: false }, "ABCD2345")).toBe(
      "/welcome?code=ABCD2345",
    );
  });

  it("sends a teacher whose workspace failed to the welcome page, to try again", () => {
    expect(afterSignUpPath({ home: "no_role", workspaceFailed: true }, null)).toBe(
      "/welcome?teach=1",
    );
  });
});

describe("signUp (#361)", () => {
  it("makes a teacher: the account, the name, the workspace, then the session", async () => {
    const d = deps();
    expect(await signUp(TEACHER, d)).toEqual({
      status: "created",
      signedIn: true,
      home: "teacher",
      workspaceFailed: false,
    });
    expect(d.calls).toEqual(["createUser", "saveName", "registerInstructor", "signIn"]);
    expect(d.saveName).toHaveBeenCalledWith(USER_ID, "Ada Lovelace");
    expect(d.registerInstructor).toHaveBeenCalledWith(USER_ID, "Ada Lovelace’s workspace");
    expect(d.signIn).toHaveBeenCalledWith({ email: TEACHER.email, password: TEACHER.password });
  });

  it("creates the account confirmed, marked unconfirmed, and with no role anywhere in it", async () => {
    const d = deps();
    await signUp(TEACHER, d);
    expect(d.createUser).toHaveBeenCalledWith({
      email: TEACHER.email,
      password: TEACHER.password,
      email_confirm: true,
      app_metadata: { [EMAIL_UNCONFIRMED_KEY]: true },
    });
    // The role is the server's own call to register_instructor, never metadata on the account.
    expect(JSON.stringify(vi.mocked(d.createUser).mock.calls)).not.toMatch(
      /teacher|instructor|role|user_metadata/,
    );
  });

  it("makes a student an account with no role: joining a class is what makes a student", async () => {
    const d = deps();
    expect(await signUp(STUDENT, d)).toEqual({
      status: "created",
      signedIn: true,
      home: "no_role",
      workspaceFailed: false,
    });
    expect(d.calls).toEqual(["createUser", "saveName", "signIn"]);
    expect(d.registerInstructor).not.toHaveBeenCalled();
  });

  it("leaves a usable account with no role when the workspace cannot be made", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const d = deps({ registerInstructor: vi.fn(async () => ({ error: { code: "XX000" } })) });
    expect(await signUp(TEACHER, d)).toEqual({
      status: "created",
      signedIn: true,
      home: "no_role",
      workspaceFailed: true,
    });
    expect(d.signIn).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("treats a thrown workspace call, or a missing account id, the same way", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const thrown = deps({
      registerInstructor: vi.fn(async () => {
        throw new Error("network");
      }),
    });
    expect(await signUp(TEACHER, thrown)).toMatchObject({ home: "no_role", workspaceFailed: true });

    const noId = deps({ createUser: vi.fn(async () => ({ data: { user: null }, error: null })) });
    expect(await signUp(TEACHER, noId)).toMatchObject({ home: "no_role", workspaceFailed: true });
    expect(noId.registerInstructor).not.toHaveBeenCalled();
    expect(noId.saveName).not.toHaveBeenCalled();
  });

  it("goes on when the name cannot be saved: it can be added on /account", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const d = deps({ saveName: vi.fn(async () => ({ error: { code: "23514" } })) });
    expect(await signUp(TEACHER, d)).toMatchObject({ status: "created", home: "teacher" });
  });

  it("says the address has an account, and tries nothing with the password typed", async () => {
    const d = deps({
      createUser: vi.fn(async () => ({ data: null, error: { code: "email_exists" } })),
    });
    expect(await signUp(TEACHER, d)).toEqual({ status: "exists" });
    expect(d.signIn).not.toHaveBeenCalled();
    expect(d.registerInstructor).not.toHaveBeenCalled();
    expect(d.saveName).not.toHaveBeenCalled();
  });

  it("passes on Supabase's own refusal of a weak password", async () => {
    const d = deps({
      createUser: vi.fn(async () => ({ data: null, error: { code: "weak_password" } })),
    });
    expect(await signUp(TEACHER, d)).toEqual({ status: "weak" });
  });

  it("fails on any other refusal or a thrown call, logging no address", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const refused = deps({
      createUser: vi.fn(async () => ({ data: null, error: { code: "unexpected_failure" } })),
    });
    expect(await signUp(TEACHER, refused)).toEqual({ status: "failed" });
    const thrown = deps({
      createUser: vi.fn(async () => {
        throw new Error(`could not reach ${TEACHER.email}`);
      }),
    });
    expect(await signUp(TEACHER, thrown)).toEqual({ status: "failed" });
    expect(JSON.stringify(error.mock.calls)).not.toContain(TEACHER.email);
    expect(JSON.stringify(error.mock.calls)).not.toContain("Ada");
  });

  it("reports an account that was made but could not be signed in here", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const d = deps({ signIn: vi.fn(async () => ({ error: { status: 500 } })) });
    expect(await signUp(TEACHER, d)).toEqual({
      status: "created",
      signedIn: false,
      home: "teacher",
      workspaceFailed: false,
    });
  });
});
