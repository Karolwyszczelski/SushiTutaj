// src/components/admin/settings/IntegrationsForm.tsx
"use client";

import React, { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useRouter, useSearchParams } from "next/navigation";

interface IntegrationRecord {
  id: string;
  refresh_token: string;
  cloud_id: string;
}

export default function IntegrationsForm() {
  const supabase = createClientComponentClient();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [cloudId, setCloudId] = useState<string>("");

  // połączenie lub odczyt istniejącego stanu
  useEffect(() => {
    (async () => {
      // 1) Najpierw sprawdź, czy przyszliśmy z callbacka Dotypos
      const token = searchParams.get("token");
      const cloudid = searchParams.get("cloudid");
      if (token && cloudid) {
        // zapisujemy w tabeli `integrations` pod id="dotypos"
        const { error } = await supabase
          .from<IntegrationRecord>("integrations")
          .upsert(
            { id: "dotypos", refresh_token: token, cloud_id: cloudid },
            { onConflict: "id" }
          );
        if (error) {
          console.error("❌ Błąd zapisu integracji Dotypos:", error.message);
        } else {
          setConnected(true);
          setCloudId(cloudid);
        }
        // wyczyść queryparams z URL
        router.replace("/admin/settings");
        setLoading(false);
        return;
      }

      // 2) Jeśli nie z callbacka – ładujemy stan z bazy
      const { data, error } = await supabase
        .from<IntegrationRecord>("integrations")
        .select("refresh_token, cloud_id")
        .eq("id", "dotypos")
        .single();
      if (!error && data?.refresh_token) {
        setConnected(true);
        setCloudId(data.cloud_id);
      }
      setLoading(false);
    })();
  }, [searchParams, supabase, router]);

  // Generujemy URL do łączenia w Dotypos
  const connectorUrl = () => {
    const clientId     = process.env.NEXT_PUBLIC_DOTYPOS_CLIENT_ID;
    const clientSecret = process.env.NEXT_PUBLIC_DOTYPOS_CLIENT_SECRET;
    const redirectUri  = `${window.location.origin}/admin/settings`;
    const state        = Math.random().toString(36).slice(2); // prosty CSRF token

    return (
      `https://admin.dotykacka.pl/client/connect` +
      `?client_id=${encodeURIComponent(clientId!)}` +
      `&client_secret=${encodeURIComponent(clientSecret!)}` +
      `&scope=*` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${encodeURIComponent(state)}`
    );
  };

  const handleDisconnect = async () => {
    await supabase
      .from("integrations")
      .delete()
      .eq("id", "dotypos");
    setConnected(false);
    setCloudId("");
  };

  if (loading) return <p>Ładowanie integracji…</p>;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Integracje</h2>

      {connected ? (
        <div className="space-y-2">
          <p className="text-green-600">
            ✅ Połączono z chmurą: <strong>{cloudId}</strong>
          </p>
          <button
            onClick={handleDisconnect}
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
          >
            Rozłącz
          </button>
        </div>
      ) : (
        <button
          onClick={() => (window.location.href = connectorUrl())}
          className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
        >
          Połącz z Dotypos
        </button>
      )}
    </div>
  );
}
