import type { Metadata } from "next";
import { PrivacyScreen } from "@/components/privacy/PrivacyScreen";

export const metadata: Metadata = {
  title: "Privacy · Recount",
  description: "What Recount keeps, who sees it, and how to delete it.",
};

export default function PrivacyPage() {
  return <PrivacyScreen />;
}
