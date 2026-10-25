"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useT } from "./i18n/I18nProvider";
import { MAX_PAGES } from "./pageList";

export interface BillPage {
  /** A key for React and for keeping focus on a page after it moves. */
  id: string;
  blob: Blob;
  type: string;
  /** An object URL of the photo, for the thumbnail. */
  url: string;
}

/**
 * The pages of a paper bill before it's sent: a thumbnail per photo, move up or down, remove,
 * "Add another page" (up to MAX_PAGES), then "Check my bill".
 */
export function BillPages({
  pages,
  adding,
  error,
  onAddCamera,
  onAddLibrary,
  onMove,
  onRemove,
  onCheck,
  onStartOver,
}: {
  pages: BillPage[];
  adding: boolean;
  error: ReactNode;
  onAddCamera: () => void;
  onAddLibrary: () => void;
  onMove: (i: number, dir: -1 | 1) => void;
  onRemove: (i: number) => void;
  onCheck: () => void;
  onStartOver: () => void;
}) {
  const { t } = useT();
  const title = useRef<HTMLHeadingElement>(null);
  // Where focus should land after a move or a removal re-renders the list.
  const focusNext = useRef<string | null>(null);
  const full = pages.length >= MAX_PAGES;

  useEffect(() => {
    window.scrollTo(0, 0);
    title.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const sel = focusNext.current;
    focusNext.current = null;
    if (!sel) return;
    const el = document.querySelector<HTMLElement>(sel);
    if (el && !(el as HTMLButtonElement).disabled) el.focus();
    else document.querySelector<HTMLElement>(".bp-add")?.focus();
  }, [pages]);

  function move(i: number, dir: -1 | 1) {
    focusNext.current = `[data-page="${pages[i].id}"][data-act="${dir < 0 ? "up" : "down"}"]`;
    onMove(i, dir);
  }
  function remove(i: number) {
    const next = pages[i + 1] ?? pages[i - 1];
    focusNext.current = next ? `[data-page="${next.id}"][data-act="remove"]` : ".bp-add";
    onRemove(i);
  }

  return (
    <section className="bill-pages start">
      <h1 className="start-title bp-h" ref={title} tabIndex={-1}>
        {t("pages.h")}
      </h1>
      <p className="bp-body">{t("pages.body")}</p>
      <p className="bp-count" role="status">
        {t("pages.count", { n: pages.length })}
      </p>
      <ol className="bp-list">
        {pages.map((p, i) => (
          <li key={p.id} className="bp-item">
            {/* An object URL of the patient's own photo: next/image can't optimize it. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt={t("pages.pageAlt", { n: i + 1, total: pages.length })} className="bp-thumb" />
            <div className="bp-side">
              <p className="bp-label">{t("pages.page", { n: i + 1 })}</p>
              <div className="bp-tools">
                <button type="button" className="btn btn-quiet bp-tool" data-page={p.id} data-act="up" disabled={i === 0} aria-label={t("pages.up", { n: i + 1 })} onClick={() => move(i, -1)}>
                  <span aria-hidden="true">↑</span> {t("pages.upShort")}
                </button>
                <button type="button" className="btn btn-quiet bp-tool" data-page={p.id} data-act="down" disabled={i === pages.length - 1} aria-label={t("pages.down", { n: i + 1 })} onClick={() => move(i, 1)}>
                  <span aria-hidden="true">↓</span> {t("pages.downShort")}
                </button>
                <button type="button" className="btn btn-quiet bp-tool" data-page={p.id} data-act="remove" aria-label={t("pages.remove", { n: i + 1 })} onClick={() => remove(i)}>
                  <span aria-hidden="true">×</span> {t("pages.removeShort")}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ol>
      {full ? (
        <p className="bp-max">{t("pages.max", { max: MAX_PAGES })}</p>
      ) : (
        <div className="bp-adds">
          <button type="button" className="btn btn-big bp-add" onClick={onAddCamera} disabled={adding}>
            {adding ? t("pages.adding") : t("pages.add")}
          </button>
          <button type="button" className="btn btn-quiet bp-lib" onClick={onAddLibrary} disabled={adding}>
            {t("pages.addLibrary")}
          </button>
        </div>
      )}
      {error}
      <button type="button" className="btn btn-primary btn-big bp-check" onClick={onCheck} disabled={adding || pages.length === 0}>
        {t("pages.check")}
      </button>
      <button type="button" className="btn btn-quiet bp-over" onClick={onStartOver}>
        {t("pages.startOver")}
      </button>
    </section>
  );
}
