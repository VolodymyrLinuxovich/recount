import type { Metadata } from "next";
import { DashboardApp } from "@/components/dashboard/DashboardApp";
import "./dashboard.css";

export const metadata: Metadata = {
  title: "Recount · Agent dashboard",
  description: "Recount's AI agents measured live: success rates, timings and quality checks, plus an MCP server to check them yourself.",
};

export default function DashboardPage() {
  return <DashboardApp />;
}
