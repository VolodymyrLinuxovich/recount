import { describe, expect, it } from "vitest";
import { MAX_IMAGE_BYTES, MAX_PDF_BYTES, attachMessage, attachProblem, attachType, cleanFileName } from "../convex/lib/attach";
import { redact } from "../convex/chat";

describe("chat attachments", () => {
  it("accepts photos and PDFs by the stored type", () => {
    expect(attachType("image/jpeg")).toBe("image/jpeg");
    expect(attachType("image/JPG")).toBe("image/jpeg");
    expect(attachType("image/png")).toBe("image/png");
    expect(attachType("image/webp")).toBe("image/webp");
    expect(attachType("application/pdf; charset=binary")).toBe("application/pdf");
  });

  it("uses the app's type only when storage has none", () => {
    expect(attachType(undefined, "application/pdf")).toBe("application/pdf");
    expect(attachType("text/html", "image/png")).toBeNull();
  });

  it("refuses other types, including HEIC the apps should convert first", () => {
    for (const t of ["image/heic", "image/gif", "text/html", "application/zip", "image/svg+xml", "", null]) expect(attachType(t)).toBeNull();
    expect(attachProblem({ contentType: "text/html", size: 100 })).toBe("type");
  });

  it("checks size per type", () => {
    expect(attachProblem({ contentType: "image/jpeg", size: MAX_IMAGE_BYTES })).toBeNull();
    expect(attachProblem({ contentType: "image/jpeg", size: MAX_IMAGE_BYTES + 1 })).toBe("size");
    expect(attachProblem({ contentType: "application/pdf", size: MAX_PDF_BYTES })).toBeNull();
    expect(attachProblem({ contentType: "application/pdf", size: MAX_PDF_BYTES + 1 })).toBe("size");
    expect(attachProblem({ contentType: "application/pdf", size: 0 })).toBe("missing");
    expect(attachProblem(null)).toBe("missing");
  });

  it("explains each problem in English and Spanish", () => {
    for (const p of ["type", "size", "missing"] as const) {
      expect(attachMessage(p, "en")).toMatch(/[a-z]/);
      expect(attachMessage(p, "es")).not.toBe(attachMessage(p, "en"));
    }
    expect(attachMessage("size", "es")).toContain("10 MB");
  });

  it("keeps file names short and plain", () => {
    expect(cleanFileName("C:\\Users\\ana\\bill.pdf")).toBe("bill.pdf");
    expect(cleanFileName("/tmp/x/<script>.png")).toBe("script.png");
    expect(cleanFileName("a".repeat(300))?.length).toBe(120);
    expect(cleanFileName("")).toBeUndefined();
    expect(cleanFileName("   ")).toBeUndefined();
    // Account numbers in a name are removed like in messages.
    expect(cleanFileName("statement_123456789012.pdf")).toBe("statement_#.pdf");
    expect(cleanFileName("ssn 123-45-6789.png")).toBe("ssn #.png");
    expect(cleanFileName("bill 2026.pdf")).toBe("bill 2026.pdf");
    expect(redact("eob 123456789.pdf")).not.toContain("123456789");
  });
});
