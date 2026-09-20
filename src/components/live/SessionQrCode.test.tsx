import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { encodeQr, QR_QUIET_ZONE } from "@/lib/live/qrCode";
import { SessionQrCode } from "./SessionQrCode";

const URL = "https://learn.example/join/7KQ2MZ";
const LABEL = "QR code that opens the join page for this session";

describe("SessionQrCode", () => {
  it("draws one image with a name a screen reader can use", () => {
    render(<SessionQrCode url={URL} label={LABEL} />);
    expect(screen.getByRole("img", { name: LABEL })).toBeInTheDocument();
  });

  it("does not read the whole address out, which is what the text beside it is for", () => {
    render(<SessionQrCode url={URL} label={LABEL} />);
    expect(screen.getByRole("img", { name: LABEL })).not.toHaveAccessibleName(
      expect.stringContaining("https://"),
    );
  });

  it("carries the quiet zone the standard requires on every side", () => {
    const { container } = render(<SessionQrCode url={URL} label={LABEL} />);
    const svg = container.querySelector("svg");
    const matrix = encodeQr(URL);
    expect(svg).toHaveAttribute(
      "viewBox",
      `0 0 ${matrix!.size + QR_QUIET_ZONE * 2} ${matrix!.size + QR_QUIET_ZONE * 2}`,
    );
  });

  it("stays dark on light in both themes, because a reversed code will not scan", () => {
    const { container } = render(<SessionQrCode url={URL} label={LABEL} />);
    expect(container.querySelector("rect")).toHaveAttribute("fill", "var(--qr-light)");
    expect(container.querySelector("path")).toHaveAttribute("fill", "var(--qr-dark)");
  });

  it("takes the class the page gives it, so the page owns its size", () => {
    const { container } = render(<SessionQrCode url={URL} label={LABEL} className="w-40" />);
    expect(container.querySelector("svg")).toHaveClass("w-40");
  });

  it("draws nothing rather than failing when the address cannot be encoded", () => {
    const { container } = render(
      <SessionQrCode url={`https://learn.example/${"x".repeat(400)}`} label={LABEL} />,
    );
    expect(container.querySelector("svg")).toBeNull();
  });
});
