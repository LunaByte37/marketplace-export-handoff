import { describe, expect, it } from "vitest";
import { csvForHandoff, handoffRequest } from "../src/marketplace_handoff.js";

describe("marketplace handoff CSV", () => {
  it("keeps each seller asset on its own row and escapes buyer notes", () => {
    const input = handoffRequest.parse({
      order: { id: "ord_7", placedAt: "2026-09-17T09:30:00.000Z", status: "fulfilled" },
      seller: {
        name: "Studio One",
        assets: [
          { label: "Source files", url: "https://example.com/source.zip" },
          { label: "License", url: "https://example.com/license.pdf" },
        ],
      },
      buyer: {
        email: "buyer@example.com",
        updates: [{ at: "2026-09-17T10:00:00.000Z", note: "Checked, looks good" }],
      },
    });

    const csv = csvForHandoff(input);
    expect(csv.split("\n")).toHaveLength(4);
    expect(csv).toContain('"Checked, looks good"');
    expect(csv).toContain('"License","https://example.com/license.pdf",""');
  });
});
