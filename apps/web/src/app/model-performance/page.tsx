import type { Metadata } from "next";
import { pageTitle } from "@/lib/nav";
import { ModelPerformanceView } from "@/features/model-performance/model-performance-view";

export const metadata: Metadata = { title: pageTitle("/model-performance") };

export default function ModelPerformancePage() {
  return <ModelPerformanceView />;
}
