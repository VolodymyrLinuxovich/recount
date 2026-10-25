import { describe, expect, it } from "vitest";
import { displayAgent } from "../convex/dashboard";

describe("displayAgent", () => {
  it("gives Document Intelligence runs their own row", () => {
    expect(displayAgent({ agent: "column", provider: "azure-docintel" })).toBe("docintel");
  });

  it("keeps the Claude second read and other agents as logged", () => {
    expect(displayAgent({ agent: "column", provider: "anthropic" })).toBe("column");
    expect(displayAgent({ agent: "search", provider: "azure" })).toBe("search");
    expect(displayAgent({ agent: "safety", provider: "azure" })).toBe("safety");
    expect(displayAgent({ agent: "apify", provider: undefined })).toBe("apify");
  });
});
