// A calendar file for the check-in reminder. Opens in any calendar app; no server, no email.

/** YYYY-MM-DD for a date in the patient's own time zone. */
export function isoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Today plus n days, as YYYY-MM-DD. */
export function daysFromToday(n: number, from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + n, 12);
  return isoDay(d);
}

// RFC 5545: escape \ ; , and newlines in text, and fold lines longer than 75 octets.
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let size = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (size + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
      size = 0;
    }
    cur += ch;
    size += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

/** An all-day event on `day` (YYYY-MM-DD) with a reminder that morning. */
export function checkInIcs({ day, title, description, url, uid, now = new Date() }: { day: string; title: string; description: string; url?: string; uid: string; now?: Date }): string {
  const d = day.replace(/-/g, "");
  const next = new Date(`${day}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const end = next.toISOString().slice(0, 10).replace(/-/g, "");
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Recount//Check-in//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}@recount`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${d}`,
    `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:${esc(title)}`,
    `DESCRIPTION:${esc(url ? `${description}\n${url}` : description)}`,
    ...(url ? [`URL:${url}`] : []),
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(title)}`,
    // 9 AM on the day (all-day events start at midnight).
    "TRIGGER:PT9H",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** Hand the file to the browser; on phones this offers "Add to calendar". */
export function downloadIcs(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/calendar;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
