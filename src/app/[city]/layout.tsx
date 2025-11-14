import { notFound } from "next/navigation";
import TenantClientProvider from "@/components/TenantClientProvider";
import { getRestaurantBySlug } from "@/lib/tenant"; // ← poprawny import

export const dynamic = "force-dynamic";

export default async function CityLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  // Next 15: params jest Promise
  params: Promise<{ city: string }>;
}) {
  const { city } = await params;

  const r = await getRestaurantBySlug(city);
  if (!r) return notFound();

  const tenant = {
    id: r.id,
    slug: r.slug,
    name: r.name,
    city: r.city,
    phone: r.phone,
    email: r.email,
    address: r.address,
  };

  return (
    <TenantClientProvider tenant={tenant}>
      {children}
    </TenantClientProvider>
  );
}
