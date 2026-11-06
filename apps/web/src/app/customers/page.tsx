import type { Metadata } from "next";
import { pageTitle } from "@/lib/nav";
import { CustomersClient } from "@/features/customers/customers-client";

export const metadata: Metadata = { title: pageTitle("/customers") };

export default function CustomersPage() {
  return <CustomersClient />;
}
