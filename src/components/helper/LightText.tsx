import { Fragment, type ReactNode } from "react";

// A tiny, safe subset of markdown for helper replies: **bold**, numbered and bulleted
// lists, paragraphs and line breaks. Everything else stays plain text. No HTML is parsed,
// so nothing in a reply can become markup.

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  parts.forEach((p, i) => {
    if (!p) return;
    if (p.startsWith("**") && p.endsWith("**") && p.length > 4) out.push(<strong key={`${key}-${i}`}>{p.slice(2, -2)}</strong>);
    else out.push(<Fragment key={`${key}-${i}`}>{p.replace(/\*\*/g, "")}</Fragment>);
  });
  return out;
}

function lines(text: string, key: string): ReactNode[] {
  const ls = text.split("\n");
  return ls.flatMap((l, i) => (i === 0 ? inline(l, `${key}-${i}`) : [<br key={`${key}-br${i}`} />, ...inline(l, `${key}-${i}`)]));
}

type Block = { kind: "p"; text: string } | { kind: "ol" | "ul"; items: string[]; start: number };

function blocks(src: string): Block[] {
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ kind: "p", text: para.join("\n") });
    para = [];
  };
  for (const raw of src.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    const ol = line.match(/^\s*(\d{1,2})[.)]\s+(.*)$/);
    const ul = line.match(/^\s*[-*•]\s+(.*)$/);
    if (ol || ul) flush();
    const last = out[out.length - 1];
    if (ol) {
      if (last?.kind === "ol") last.items.push(ol[2]);
      else out.push({ kind: "ol", items: [ol[2]], start: Number(ol[1]) || 1 });
    } else if (ul) {
      if (last?.kind === "ul") last.items.push(ul[1]);
      else out.push({ kind: "ul", items: [ul[1]], start: 1 });
    } else if (!line.trim()) {
      flush();
    } else {
      para.push(line.replace(/^#{1,6}\s+/, ""));
    }
  }
  flush();
  return out;
}

export function LightText({ text }: { text: string }) {
  return (
    <>
      {blocks(text).map((b, i) =>
        b.kind === "p" ? (
          <p key={i}>{lines(b.text, `p${i}`)}</p>
        ) : b.kind === "ol" ? (
          <ol key={i} start={b.start}>
            {b.items.map((it, j) => (
              <li key={j}>{inline(it, `o${i}-${j}`)}</li>
            ))}
          </ol>
        ) : (
          <ul key={i}>
            {b.items.map((it, j) => (
              <li key={j}>{inline(it, `u${i}-${j}`)}</li>
            ))}
          </ul>
        ),
      )}
    </>
  );
}
