import CityPicker from "@/components/CityPicker";
import { listActiveRestaurants } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function Page() {
  const restaurants = await listActiveRestaurants();
  return (
    <main className="wrap py-16">
      <h1 className="font-display text-4xl mb-6">Wybierz restaurację</h1>
      <CityPicker restaurants={restaurants} />
    </main>
  );
}
