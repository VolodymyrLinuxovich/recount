import type { CaseView } from "../types";

/** What every flow screen gets. */
export interface ScreenProps {
  c: CaseView;
  step: string;
  /** Go to the next screen in order (or nothing if this is the last). */
  next: () => void;
  /** Go to the previous screen, if there is one. */
  back?: () => void;
  /** Jump to a named screen. */
  go: (step: string, replace?: boolean) => void;
}
