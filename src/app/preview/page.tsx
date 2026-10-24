import { notFound } from "next/navigation";
import { Preview } from "@/components/Preview";

// Design preview with made-up data. Only available in development.
export default function PreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Preview />;
}
