import Link from "next/link";
import { VisionToggle } from "./a11y/VisionToggle";
import { MyBillsLink } from "./bills/MyBillsLink";
import { LanguageToggle } from "./i18n/LanguageToggle";

export function Masthead() {
  return (
    <header className="masthead">
      <Link href="/" className="wordmark">
        Recount
      </Link>
      <nav className="masthead-nav">
        <MyBillsLink />
        <LanguageToggle />
        <VisionToggle />
      </nav>
    </header>
  );
}
