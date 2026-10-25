"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { VisionToggle } from "./a11y/VisionToggle";
import { AccountButton, AccountLink } from "./account/AccountLink";
import { BrandMark } from "./BrandMark";
import { useMyBills } from "./bills/myBills";
import { HelperButton } from "./helper/HelperButton";
import { useT } from "./i18n/I18nProvider";
import { LanguageToggle } from "./i18n/LanguageToggle";
import "./bills/bills.css";

type Where = "check" | "audit" | "dashboard" | "bills" | null;

function whereOf(path: string | null): Where {
  if (!path) return null;
  if (path === "/") return "check";
  if (path.startsWith("/audit")) return "audit";
  if (path.startsWith("/dashboard")) return "dashboard";
  if (path.startsWith("/bills")) return "bills";
  return null;
}

/** The three site links. Rendered in the row (wide screens) and in the menu sheet (phones). */
function Links({ where, onPick }: { where: Where; onPick?: () => void }) {
  const { t } = useT();
  const n = useMyBills().length;
  const cur = (w: Where) => (where === w ? ("page" as const) : undefined);
  return (
    <>
      <Link href="/" aria-current={cur("check")} onClick={onPick}>
        {t("nav.check")}
      </Link>
      <Link href="/audit" aria-current={cur("audit")} onClick={onPick}>
        {t("nav.audit")}
      </Link>
      <Link href="/dashboard" aria-current={cur("dashboard")} onClick={onPick}>
        {t("nav.dashboard")}
      </Link>
      <Link href="/bills" aria-current={cur("bills")} onClick={onPick} aria-label={t("nav.billsAria", { n })}>
        <span aria-hidden="true">{t("nav.bills")}</span>
        {n > 0 && (
          <span className="nav-count" aria-hidden="true">
            {n}
          </span>
        )}
      </Link>
      {onPick && <AccountLink menu onPick={onPick} />}
    </>
  );
}

function PathLinks({ onPick }: { onPick?: () => void }) {
  return <Links where={whereOf(usePathname())} onPick={onPick} />;
}

/** Suspense keeps usePathname() from blocking prerender; the fallback is the same links, unmarked. */
function SiteLinks({ onPick }: { onPick?: () => void }) {
  return (
    <Suspense fallback={<Links where={null} onPick={onPick} />}>
      <PathLinks onPick={onPick} />
    </Suspense>
  );
}

/**
 * The same masthead on every page, one row at every width.
 * Wide: mark + "Recount" | Check a bill · Hospital audit · My bills | EN ES | Lupa.
 * Narrow (it folds by container width, so Spanish and Large text fold sooner):
 * mark | EN ES | Lupa | Menu, and the menu sheet holds the links plus "Text size and contrast".
 */
export function Masthead() {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const header = useRef<HTMLElement>(null);
  const menuBtn = useRef<HTMLButtonElement>(null);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) menuBtn.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // Escape inside the Display sheet closes only that sheet (VisionToggle handles it).
      if (e.key !== "Escape" || document.querySelector(".masthead-menu .vision-panel")) return;
      setOpen(false);
      menuBtn.current?.focus();
    };
    const onDown = (e: PointerEvent) => {
      if (header.current && !header.current.contains(e.target as Node)) {
        const inside = header.current.contains(document.activeElement);
        setOpen(false);
        if (inside) menuBtn.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <header className="masthead" ref={header} data-open={open || undefined}>
      <div className="masthead-row">
        <Link href="/" className="wordmark" aria-label={t("nav.home")}>
          <BrandMark className="wordmark-mark" />
          <span className="wordmark-text" aria-hidden="true">
            Recount
          </span>
        </Link>
        <nav className="masthead-links" aria-label={t("nav.main")}>
          <SiteLinks />
        </nav>
        <div className="masthead-nav">
          <LanguageToggle />
          <HelperButton />
          <button
            ref={menuBtn}
            type="button"
            className="menu-btn"
            aria-expanded={open}
            aria-controls="site-menu"
            aria-label={open ? t("nav.closeMenu") : t("nav.openMenu")}
            onClick={() => setOpen((o) => !o)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
          <AccountButton />
        </div>
      </div>
      <nav id="site-menu" className="masthead-menu" aria-label={t("nav.menu")} hidden={!open}>
        <SiteLinks onPick={() => close(true)} />
        <VisionToggle variant="menu" />
      </nav>
    </header>
  );
}
