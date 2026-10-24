import Link from "next/link";
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
      </nav>
    </header>
  );
}
