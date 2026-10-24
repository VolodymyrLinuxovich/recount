import type { Metadata } from "next";
import { AuditApp } from "@/components/audit/AuditApp";
import "./audit.css";

export const metadata: Metadata = {
  title: "Recount · Hospital policy audit",
  description: "California hospitals' financial assistance policies, checked against state law.",
};

export default function AuditPage() {
  return <AuditApp />;
}
