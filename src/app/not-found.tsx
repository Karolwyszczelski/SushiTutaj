// app/not-found.tsx
export default function NotFound() {
  return (
    <main className="min-h-[60vh] flex items-center justify-center text-center p-8">
      <div>
        <h1 className="text-3xl font-extrabold mb-2">404 — Nie znaleziono</h1>
        <p className="text-sm text-gray-600">Adres jest nieaktualny lub został usunięty.</p>
      </div>
    </main>
  );
}
