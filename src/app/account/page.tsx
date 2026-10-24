import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountScreen } from "@/components/account/AccountScreen";

export const metadata: Metadata = { title: "Your account · Recount" };

export default function AccountPage() {
  return (
    <Suspense fallback={null}>
      <AccountScreen />
    </Suspense>
  );
}
