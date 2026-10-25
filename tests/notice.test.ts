import { describe, expect, it } from "vitest";
import { isExpoPushToken, noticeFor, noticeText } from "../convex/lib/notice";

describe("bill notices", () => {
  it("fires only when busy work finishes", () => {
    expect(noticeFor("reading", "needs_household")).toBe("needs_household");
    expect(noticeFor("reading", "confirm_hospital")).toBe("confirm_hospital");
    expect(noticeFor("drafting", "ready")).toBe("ready");
    expect(noticeFor("reading", "error")).toBe("error");
    expect(noticeFor("approved", "ready")).toBeNull(); // unapprove is the patient's own tap
    expect(noticeFor("ready", "ready")).toBeNull();
    expect(noticeFor("reading", undefined)).toBeNull();
    expect(noticeFor("needs_household", "drafting")).toBeNull();
  });

  it("speaks the bill's language", () => {
    expect(noticeText("needs_household", "en", 3).body).toBe("We found 3 things to question. Tap to see them.");
    expect(noticeText("needs_household", "en", 1).body).toBe("We found 1 thing to question. Tap to see it.");
    expect(noticeText("needs_household", "es", 2).body).toBe("Encontramos 2 cosas para preguntar. Toque para verlas.");
    expect(noticeText("ready", "es").title).toBe("Sus cartas están listas");
    expect(noticeText("error", undefined).title).toBe("We couldn't finish your bill");
  });

  it("accepts only Expo push tokens", () => {
    expect(isExpoPushToken("ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]")).toBe(true);
    expect(isExpoPushToken("ExpoPushToken[abcdefghij_-12]")).toBe(true);
    expect(isExpoPushToken("https://evil.example")).toBe(false);
    expect(isExpoPushToken("ExponentPushToken[]")).toBe(false);
  });
});
