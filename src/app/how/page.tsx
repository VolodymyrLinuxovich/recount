import { redirect } from "next/navigation";

// The /how page was removed. Old links go to the home page.
export default function HowPage() {
  redirect("/");
}
