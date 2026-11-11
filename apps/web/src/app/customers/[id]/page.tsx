import type { Metadata } from "next";
import { pageTitle } from "@/lib/nav";
import { type CustomerDetailSearchParams, customersHrefFromParams, firstParam } from "@/features/customers/customers-filters";
import { CustomerDetailView } from "@/features/customers/customer-detail-view";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: pageTitle(`/customers/${id}`) };
}

export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<CustomerDetailSearchParams>;
}) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const run = firstParam(resolvedSearchParams.run);
  return (
    <CustomerDetailView
      accId={id}
      requestedRunId={run}
      customersHref={customersHrefFromParams(resolvedSearchParams)}
    />
  );
}
