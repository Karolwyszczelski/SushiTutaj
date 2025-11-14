export const dynamic = "force-static";

export default function ConfirmedPage() {
  return (
    <main className="min-h-[60vh] grid place-items-center p-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold mb-2">Konto potwierdzone 🎉</h1>
        <p className="text-slate-600">
          Dziękujemy! Możesz już się zalogować i składać zamówienia.
        </p>
        <a
          href="/"
          className="mt-6 inline-block rounded bg-black px-4 py-2 text-white"
        >
          Wróć na stronę główną
        </a>
      </div>
    </main>
  );
}
