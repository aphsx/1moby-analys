import type { Metadata } from "next";
import { pageTitle } from "@/lib/nav";
import { RunsView } from "@/features/runs/runs-view";

export const metadata: Metadata = { title: pageTitle("/runs") };

export default function RunsPage() {
  return <RunsView />;
}
