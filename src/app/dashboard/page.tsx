import type { Metadata } from "next";
import { preload } from "react-dom";
import { DashboardApp } from "@/components/dashboard/DashboardApp";
import "./dashboard.css";

export const metadata: Metadata = {
  title: "Recount · Agent dashboard",
  description: "Recount's AI agents measured live: success rates, timings and quality checks, plus an MCP server to check them yourself.",
};

export default function DashboardPage() {
  // The screencast posters load with the page, before the live numbers arrive.
  for (const name of ["vector-search", "agents", "convex"]) preload(`/dashboard/${name}.png`, { as: "image", fetchPriority: "high" });
  return <DashboardApp />;
}
