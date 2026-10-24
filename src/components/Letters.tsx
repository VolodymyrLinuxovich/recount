"use client";

import { useMutation } from "convex/react";
import { useLayoutEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { CaseView, Letter } from "./types";

function asText(l: Letter) {
  return `Subject: ${l.subject}\n\n${l.body}\n`;
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A textarea that grows to show all of its text. */
function GrowingText(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight + 2}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [props.value]);
  return <textarea ref={ref} rows={1} {...props} />;
}

function LetterSheet({
  letter,
  onChange,
  readOnly,
}: {
  letter: Letter;
  onChange: (l: Letter) => void;
  readOnly: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const slug = letter.kind === "assistance" ? "financial-assistance-request" : "billing-questions";
  return (
    <article className="letter">
      <h3 className="letter-title">{letter.title}</h3>
      <label className="letter-field">
        <span>Subject</span>
        <GrowingText
          className="letter-subject"
          value={letter.subject}
          readOnly={readOnly}
          onChange={(e) => onChange({ ...letter, subject: e.target.value.replace(/\n/g, " ") })}
        />
      </label>
      <GrowingText
        className="letter-body"
        value={letter.body}
        readOnly={readOnly}
        aria-label={`${letter.title} text`}
        onChange={(e) => onChange({ ...letter, body: e.target.value })}
      />
      <div className="row">
        <button
          className="btn btn-quiet"
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(asText(letter));
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <button className="btn btn-quiet" type="button" onClick={() => download(`${slug}.txt`, asText(letter))}>
          Download .txt
        </button>
      </div>
    </article>
  );
}

export function Letters({ c }: { c: CaseView }) {
  const approve = useMutation(api.cases.approve);
  const [edits, setEdits] = useState<Letter[] | null>(null);
  const [busy, setBusy] = useState(false);
  const letters = edits ?? c.letters ?? null;
  const approved = c.status === "approved";
  const phone = c.bill?.billingPhone ?? c.hospital?.fap?.phone ?? null;

  if (!letters) {
    return (
      <section className="letters">
        <h2 className="h-section">Your letters</h2>
        <p className="quiet pulse">Writing your letters…</p>
      </section>
    );
  }

  const update = (i: number, l: Letter) => setEdits(letters.map((x, j) => (j === i ? l : x)));
  const mailto = (l: Letter) => `mailto:?subject=${encodeURIComponent(l.subject)}&body=${encodeURIComponent(l.body)}`;

  return (
    <section className="letters" aria-labelledby="letters-h">
      <div className="section-head">
        <h2 id="letters-h" className="h-section">
          {approved ? "Ready to send" : "Your letters"}
        </h2>
        <span className="label">{c.lettersSource === "claude" ? "written by Claude" : "standard template"}</span>
      </div>

      {approved ? (
        <div className="send">
          <p>
            You approved these. Recount hasn&rsquo;t sent anything. Send them yourself, by mail, email, or the
            hospital&rsquo;s patient portal, and keep a copy.
          </p>
          {phone && (
            <p>
              Call billing first and ask for their mailing address or email for financial assistance:{" "}
              <a href={`tel:${phone.replace(/[^0-9+]/g, "")}`} className="phone">
                {phone}
              </a>
            </p>
          )}
          <div className="row">
            {letters.map((l) => (
              <a key={l.kind} href={mailto(l)} className="btn btn-primary">
                Email the {l.kind === "assistance" ? "assistance request" : "billing questions"}
              </a>
            ))}
          </div>
        </div>
      ) : (
        <p className="lede">Read them. Change anything that&rsquo;s wrong, and fill in the [brackets]. Nothing goes out until you send it.</p>
      )}

      {letters.map((l, i) => (
        <LetterSheet key={l.kind + i} letter={l} onChange={(nl) => update(i, nl)} readOnly={approved} />
      ))}

      {!approved && (
        <button
          className="btn btn-primary btn-big"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await approve({ id: c._id as Id<"cases">, letters });
              requestAnimationFrame(() => document.getElementById("letters-h")?.scrollIntoView({ behavior: "smooth", block: "start" }));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Saving…" : "These look right. Approve"}
        </button>
      )}
    </section>
  );
}
