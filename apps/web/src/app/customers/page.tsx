import type { Metadata } from "next";
import { pageTitle } from "@/lib/nav";
import { CustomersView } from "@/features/customers/customers-view";

export const metadata: Metadata = { title: pageTitle("/customers") };

export default function CustomersPage() {
  return <CustomersView />;
}
