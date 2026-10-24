"use client";

// The patient's changes to the letters, kept for this tab while they move between letter screens.
// sessionStorage, per bill; tied to the drafted letters so a new draft starts clean.
import { useState } from "react";
import { fillLetter, type Details } from "../letterFill";
import type { CaseView, Letter } from "../types";

const key = (id: string) => `recount.edits.${id}`;

/** A short fingerprint of the drafted letters the edits were made on. */
const basis = (letters: Letter[]) => letters.map((l) => `${l.kind}:${l.subject.length}:${l.body.length}`).join("|");

function read(c: CaseView): Letter[] | null {
  if (typeof window === "undefined" || !c.letters?.length) return null;
  try {
    const raw = window.sessionStorage.getItem(key(c._id));
    if (!raw) return null;
    const data = JSON.parse(raw) as { basis?: string; letters?: Letter[] };
    if (data.basis !== basis(c.letters) || !Array.isArray(data.letters) || data.letters.length !== c.letters.length) return null;
    return data.letters;
  } catch {
    return null;
  }
}

function write(c: CaseView, letters: Letter[] | null) {
  try {
    if (!letters || !c.letters) window.sessionStorage.removeItem(key(c._id));
    else window.sessionStorage.setItem(key(c._id), JSON.stringify({ basis: basis(c.letters), letters }));
  } catch {
    // Storage blocked: the edits stay on this screen only.
  }
}

/**
 * The letters as they will be sent: the draft, the patient's changes, and their details in the [brackets].
 * Approved letters are what was approved; changes don't apply to them.
 */
export function useLetters(c: CaseView, details: Details) {
  const [edits, setEdits] = useState<Letter[] | null>(() => read(c));
  const approved = c.status === "approved";
  const raw = (approved ? null : edits) ?? c.letters ?? [];
  const letters = raw.map((l) => fillLetter(l, details));
  const update = (i: number, l: Letter) => {
    const next = letters.map((x, j) => (j === i ? l : x));
    setEdits(next);
    write(c, next);
  };
  const clear = () => {
    setEdits(null);
    write(c, null);
  };
  return { letters, update, clear };
}

/** Only the fields the approve mutation accepts. */
export function forApproval(letters: Letter[]) {
  return letters.map(({ kind, title, subject, body, subjectPatient, bodyPatient }) => ({
    kind,
    title,
    subject,
    body,
    ...(subjectPatient != null ? { subjectPatient } : {}),
    ...(bodyPatient != null ? { bodyPatient } : {}),
  }));
}
