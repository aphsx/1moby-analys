import type { Metadata } from "next";
import { pageTitle } from "@/lib/nav";
import { DashboardView } from "@/features/dashboard/dashboard-view";

export const metadata: Metadata = { title: pageTitle("/") };

export default function DashboardPage() {
  return <DashboardView />;
}
