// #187: joining a session the way a phone with JavaScript off does.
//
// The join form is a Server Function form (`src/app/join/actions.ts`), and without JavaScript a
// browser posts it as multipart form data: the visible `code` and `displayName`, plus hidden
// `$ACTION_*` fields React rendered to name the function. So a simulated student fetches the join
// page, copies those hidden fields, fills in the two visible ones and posts. The server answers a
// join with a 303 to `/play/<session id>` and the httpOnly participant cookie; a refusal re-renders
// the form with one of the sentences below.
//
// Nothing here is a second join path. It is the join path, through the same action, the same
// code lookup and the same `join_session`. The parsing is pure so `join.test.ts` can pin it.

const COOKIE_NAME = "learn_participant";

/** The sentences `src/app/join/actions.ts` refuses with, and the code the report counts. */
const REFUSAL_TEXT = [
  ["That code does not match a session that is open.", "unknown_code"],
  ["Too many join attempts from this network.", "rate_limited"],
  ["That session is full.", "full"],
  ["Joining is not working just now.", "unavailable"],
];

const ENTITIES = {
  "&quot;": '"',
  "&#x27;": "'",
  "&#39;": "'",
  "&lt;": "<",
  "&gt;": ">",
  "&amp;": "&",
};

const decode = (text) => text.replace(/&(?:quot|#x27|#39|lt|gt|amp);/g, (m) => ENTITIES[m]);

/** The hidden `$ACTION_*` inputs of the join form, as `[name, value]` pairs in page order. */
export function actionFields(html) {
  const fields = [];
  for (const tag of html.match(/<input\b[^>]*>/g) ?? []) {
    const name = /\bname="([^"]*)"/.exec(tag)?.[1];
    if (!name?.startsWith("$ACTION")) continue;
    fields.push([decode(name), decode(/\bvalue="([^"]*)"/.exec(tag)?.[1] ?? "")]);
  }
  if (fields.length === 0) throw new Error("The page has no join form on it.");
  return fields;
}

function participantCookie(setCookies) {
  for (const header of setCookies) {
    const pair = header.split(";")[0].trim();
    if (pair.startsWith(`${COOKIE_NAME}=`)) return pair;
  }
  return null;
}

/**
 * What a join post came back as: a participant, or the refusal the form showed.
 *
 * The participant and session ids come from the cookie the server set, which is exactly what the
 * phone's own page render trusts (`src/app/play/[sessionId]/page.tsx`).
 */
export function readJoin({ status, location, setCookies, body }) {
  if (status >= 300 && status < 400 && location?.includes("/play/")) {
    const cookie = participantCookie(setCookies);
    if (cookie === null) return { ok: false, refusal: "no_cookie" };
    const [sessionId, participantId] = cookie.slice(COOKIE_NAME.length + 1).split(".");
    return { ok: true, sessionId, participantId, cookie };
  }
  if (status !== 200) return { ok: false, refusal: `http_${status}` };
  const known = REFUSAL_TEXT.find(([text]) => body.includes(text));
  return { ok: false, refusal: known ? known[1] : "join_form_error" };
}
