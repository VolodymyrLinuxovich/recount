import { describe, expect, it } from "vitest";
import { checkInIcs, daysFromToday } from "../src/components/flow/ics";

describe("check-in calendar file", () => {
  const ics = checkInIcs({
    day: "2026-11-23",
    title: "Check on my hospital bill (Saint Francis, SF)",
    description: "Did the hospital answer?\nIf not, call billing.",
    url: "https://recount-nu.vercel.app/case/abc#t=secret",
    uid: "abc-check-in",
    now: new Date("2026-10-24T16:00:00Z"),
  });

  it("is an all-day event on the chosen day with a morning reminder", () => {
    expect(ics).toContain("DTSTART;VALUE=DATE:20261123\r\n");
    expect(ics).toContain("DTEND;VALUE=DATE:20261124\r\n");
    expect(ics).toContain("DTSTAMP:20261024T160000Z\r\n");
    expect(ics).toContain("TRIGGER:PT9H");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("escapes commas and newlines and folds long lines", () => {
    expect(ics).toContain("SUMMARY:Check on my hospital bill (Saint Francis\\, SF)");
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain("DESCRIPTION:Did the hospital answer?\\nIf not\\, call billing.\\nhttps://recount-nu.vercel.app/case/abc#t=secret");
  });

  it("ends the month and year correctly", () => {
    expect(checkInIcs({ day: "2026-12-31", title: "x", description: "y", uid: "u" })).toContain("DTEND;VALUE=DATE:20270101");
  });

  it("counts days from today in local time", () => {
    expect(daysFromToday(30, new Date(2026, 9, 24, 23, 30))).toBe("2026-11-23");
    expect(daysFromToday(1, new Date(2026, 11, 31, 8))).toBe("2027-01-01");
  });
});
