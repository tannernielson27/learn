import { describe, expect, it } from "vitest";
import { actionFields, readJoin } from "./join.mjs";

// #187: a simulated student joins the way a phone with JavaScript off does — by posting the join
// form, hidden Server Function fields and all, and following nothing but the answer.

const FORM = `
<form class="flex" action="" encType="multipart/form-data" method="POST">
<input type="hidden" name="$ACTION_REF_1"/>
<input type="hidden" name="$ACTION_1:0" value="{&quot;id&quot;:&quot;60ee54&quot;,&quot;bound&quot;:&quot;$@1&quot;}"/>
<input type="hidden" name="$ACTION_1:1" value="[{&quot;status&quot;:&quot;idle&quot;}]"/>
<input type="hidden" name="$ACTION_KEY" value="k0081"/>
<input id="x-code" type="text" name="code" value=""/>
<input id="x-name" type="text" name="displayName"/>
</form>`;

const SESSION = "11111111-1111-4111-8111-111111111111";
const PARTICIPANT = "22222222-2222-4222-8222-222222222222";
const SECRET = "ab".repeat(24);

describe("actionFields", () => {
  it("reads the hidden Server Function fields, decoded, and leaves the visible ones", () => {
    expect(actionFields(FORM)).toEqual([
      ["$ACTION_REF_1", ""],
      ["$ACTION_1:0", '{"id":"60ee54","bound":"$@1"}'],
      ["$ACTION_1:1", '[{"status":"idle"}]'],
      ["$ACTION_KEY", "k0081"],
    ]);
  });

  it("throws when the page has no join form on it", () => {
    expect(() => actionFields("<html></html>")).toThrow(/join form/);
  });
});

describe("readJoin", () => {
  it("reads a redirect to the room and the participant cookie as a join", () => {
    const joined = readJoin({
      status: 303,
      location: `/play/${SESSION}`,
      setCookies: [
        "other=1; Path=/",
        `learn_participant=${SESSION}.${PARTICIPANT}.${SECRET}; Path=/; HttpOnly; SameSite=lax`,
      ],
      body: "",
    });
    expect(joined).toEqual({
      ok: true,
      sessionId: SESSION,
      participantId: PARTICIPANT,
      cookie: `learn_participant=${SESSION}.${PARTICIPANT}.${SECRET}`,
    });
  });

  it("reads each refusal the join form can show", () => {
    const cases = [
      ["That code does not match a session that is open. Check it and try again.", "unknown_code"],
      [
        "Too many join attempts from this network. Wait a few minutes, then try again.",
        "rate_limited",
      ],
      ["That session is full.", "full"],
      ["Joining is not working just now. Try again in a moment.", "unavailable"],
    ] as const;
    for (const [text, refusal] of cases) {
      expect(
        readJoin({ status: 200, location: null, setCookies: [], body: `<p>${text}</p>` }),
      ).toEqual({ ok: false, refusal });
    }
  });

  it("calls anything else a failed join, with the status", () => {
    expect(readJoin({ status: 500, location: null, setCookies: [], body: "" })).toEqual({
      ok: false,
      refusal: "http_500",
    });
    expect(readJoin({ status: 200, location: null, setCookies: [], body: "<p>?</p>" })).toEqual({
      ok: false,
      refusal: "join_form_error",
    });
    // A redirect with no cookie is not a participant.
    expect(
      readJoin({ status: 303, location: `/play/${SESSION}`, setCookies: [], body: "" }),
    ).toEqual({
      ok: false,
      refusal: "no_cookie",
    });
  });
});
