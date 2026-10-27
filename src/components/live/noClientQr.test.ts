// The QR code beside the join code is for the projector, where a late student scans it: a phone
// that is already in the room has no use for one. Nothing a participant loads may reach the
// encoder, directly or through anything it imports. The console gets its QR codes drawn on the
// server and handed over as markup (#297), so the encoder stays out of its bundle too.
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SRC, reachable, shortest } from "../testing/importGraph";

const QR_FILES = [
  path.join(SRC, "lib", "live", "qrCode.ts"),
  path.join(SRC, "components", "live", "SessionQrCode.tsx"),
];

/** Everything a participant's browser runs, and the pages that serve it. */
const PARTICIPANT_ENTRIES = [
  path.join(SRC, "components", "live", "StudentRoom.tsx"),
  path.join(SRC, "components", "live", "StudentPacedRoom.tsx"),
  path.join(SRC, "components", "live", "JoinForm.tsx"),
  path.join(SRC, "app", "join", "JoinScreen.tsx"),
  path.join(SRC, "app", "join", "page.tsx"),
  path.join(SRC, "app", "play", "[sessionId]", "page.tsx"),
];

const offenders = (entry: string) =>
  [...reachable(entry).entries()]
    .filter(([file]) => QR_FILES.includes(file))
    .map(([, chain]) => shortest(chain));

describe("the join QR code stays off the phones and out of the console's bundle", () => {
  it.each(PARTICIPANT_ENTRIES.map((f) => [path.relative(SRC, f), f] as const))(
    "%s never reaches the QR encoder",
    (_name, entry) => {
      expect(reachable(entry).size).toBeGreaterThan(2);
      expect(offenders(entry)).toEqual([]);
    },
  );

  it("the host console never reaches it either: the page draws it on the server", () => {
    expect(offenders(path.join(SRC, "components", "live", "HostLobby.tsx"))).toEqual([]);
  });

  it("would catch it: the live session page does reach it", () => {
    const page = path.join(SRC, "app", "live", "[sessionId]", "page.tsx");
    expect(offenders(page).length).toBeGreaterThan(0);
  });
});
