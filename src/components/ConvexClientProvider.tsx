"use client";

import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";
import { AccountSync } from "./account/claim";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/** Convex, plus optional accounts. Signed out, everything works as before (bills open by their private link). */
export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexAuthProvider client={convex}>
      <AccountSync />
      {children}
    </ConvexAuthProvider>
  );
}
