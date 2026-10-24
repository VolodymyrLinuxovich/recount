import type { Metadata } from "next";
import { MyBillsScreen } from "@/components/bills/MyBillsScreen";

export const metadata: Metadata = { title: "Your bills · Recount" };

export default function BillsPage() {
  return <MyBillsScreen />;
}
