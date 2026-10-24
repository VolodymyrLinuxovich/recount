import type { Metadata } from "next";
import { HowScreen } from "@/components/how/HowScreen";

export const metadata: Metadata = {
  title: "How Recount decides · Recount",
  description: "Which steps are fixed rules, which use AI, and which are yours.",
};

export default function HowPage() {
  return <HowScreen />;
}
