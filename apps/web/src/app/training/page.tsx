import type { Metadata } from "next";
import { pageTitle } from "@/lib/nav";
import { TrainingView } from "@/features/training/training-view";

export const metadata: Metadata = { title: pageTitle("/training") };

export default function TrainingPage() {
  return <TrainingView />;
}
