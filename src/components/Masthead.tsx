import Link from "next/link";
import { VisionToggle } from "./a11y/VisionToggle";
import { BrandMark } from "./BrandMark";
import { MyBillsLink } from "./bills/MyBillsLink";
import { HelperButton } from "./helper/HelperButton";
import { LanguageToggle } from "./i18n/LanguageToggle";

/** One row at every width: the mark and wordmark on the left, the controls on the right. */
export function Masthead() {
  return (
    <header className="masthead">
      <Link href="/" className="wordmark" aria-label="Recount">
        <BrandMark className="wordmark-mark" />
        <span className="wordmark-text" aria-hidden="true">
          Recount
        </span>
      </Link>
      <nav className="masthead-nav">
        <MyBillsLink />
        <LanguageToggle />
        <VisionToggle />
        <HelperButton />
      </nav>
    </header>
  );
}
