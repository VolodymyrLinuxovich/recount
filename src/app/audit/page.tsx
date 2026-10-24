import type { Metadata } from "next";
import { AuditApp } from "@/components/audit/AuditApp";
import "./audit.css";

export const metadata: Metadata = {
  title: "Recount · California hospital policy audit",
  description: "Every California hospital's financial assistance policy, checked against state law.",
};

export default function AuditPage() {
  return <AuditApp />;
}
