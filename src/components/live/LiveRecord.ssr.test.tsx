// @vitest-environment node
// A case study's first paint is the server's: the panel is a lazy chunk on the client, but the
// server render waits for it, so the HTML a phone first paints carries the record as it did.
import { renderToPipeableStream } from "react-dom/server";
import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { recordAtStep } from "@/lib/ngn/chartReveal";
import { sampleEhr } from "@/lib/ngn/fixtures";
import { LiveRecordLayout } from "./LiveRecord";

function html(node: React.ReactNode): Promise<string> {
  return new Promise((resolve, reject) => {
    let out = "";
    const sink = new Writable({
      write(chunk, _encoding, done) {
        out += chunk.toString();
        done();
      },
    });
    sink.on("finish", () => resolve(out));
    const stream = renderToPipeableStream(node, {
      onAllReady: () => stream.pipe(sink),
      onError: reject,
    });
  });
}

describe("LiveRecordLayout's server render", () => {
  it("paints the patient record with the room", async () => {
    const page = await html(
      <LiveRecordLayout initial={recordAtStep(sampleEhr, 1)}>
        <p>room</p>
      </LiveRecordLayout>,
    );
    expect(page).toContain('aria-label="Patient record"');
    expect(page).toContain("Orthopedic unit");
    expect(page).toContain("room");
  });
});
