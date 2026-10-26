import type { Metadata } from "next";
import { pageTitle } from "@/lib/nav";
import { DashboardClient } from "@/features/dashboard/dashboard-client";

export const metadata: Metadata = { title: pageTitle("/") };

export default function DashboardPage() {
  return <DashboardClient />;
}
