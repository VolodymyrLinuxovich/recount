import type { Metadata } from "next";
import { AuditApp } from "@/components/audit/AuditApp";
import "./audit.css";

export const metadata: Metadata = {
  title: "Recount · San Francisco hospital policy audit",
  description: "San Francisco hospitals' financial assistance policies, checked against California law.",
};

export default function AuditPage() {
  return <AuditApp />;
}
