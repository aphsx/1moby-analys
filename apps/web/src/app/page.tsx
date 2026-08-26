import type { Metadata } from "next";
import { DashboardClient } from "@/features/dashboard/dashboard-client";

export const metadata: Metadata = { title: "Dashboard · 1Moby Intelligence" };


//test auto CI
export default function DashboardPage() {
  return <DashboardClient />;
}
