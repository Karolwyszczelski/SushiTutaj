// src/components/admin/settings/NotificationsForm.tsx
"use client";

import { useEffect, useState } from "react";
import type { Database } from "@/types/supabase";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

interface Notifications {
  sms_enabled: boolean;
  email_enabled: boolean;
  twilio_sid: string;
  twilio_token: string;
  twilio_from: string;
  tpl_reservation_confirm: string;
  tpl_reservation_cancel:   string;
}

type Props = { supabase: ReturnType<typeof createClientComponentClient<Database>> };

export default function NotificationsForm({ supabase }: Props) {
  const [n, setN] = useState<Notifications>({
    sms_enabled: false,
    email_enabled: false,
    twilio_sid:      "",
    twilio_token:    "",
    twilio_from:     "",
    tpl_reservation_confirm: "Twoja rezerwacja na {{date}} o {{time}} została potwierdzona.",
    tpl_reservation_cancel:  "Twoja rezerwacja na {{date}} o {{time}} została anulowana.",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]  = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/settings");
      const data = await res.json();
      if (data.notifications) setN(data.notifications);
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notifications: n }),
    });
    if (!res.ok) alert("Błąd zapisu");
    setSaving(false);
  };

  if (loading) return <p>Ładowanie…</p>;

  return (
    <div className="space-y-4 max-w-xl">
      <div className="flex gap-4">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={n.sms_enabled}
            onChange={e => setN({ ...n, sms_enabled: e.target.checked })}
          />
          <span>SMS</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={n.email_enabled}
            onChange={e => setN({ ...n, email_enabled: e.target.checked })}
          />
          <span>E‑mail</span>
        </label>
      </div>

      <fieldset className="border rounded p-4">
        <legend className="font-semibold">Twilio API</legend>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
          <div>
            <label className="block text-sm">Account SID</label>
            <input
              type="text"
              value={n.twilio_sid}
              onChange={e => setN({ ...n, twilio_sid: e.target.value })}
              className="mt-1 w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm">Auth Token</label>
            <input
              type="text"
              value={n.twilio_token}
              onChange={e => setN({ ...n, twilio_token: e.target.value })}
              className="mt-1 w-full border rounded px-3 py-2"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm">From (numer telefonu)</label>
            <input
              type="text"
              value={n.twilio_from}
              onChange={e => setN({ ...n, twilio_from: e.target.value })}
              className="mt-1 w-full border rounded px-3 py-2"
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="border rounded p-4">
        <legend className="font-semibold">Szablony</legend>
        <div className="space-y-4 mt-2">
          <div>
            <label className="block text-sm">Potwierdzenie rezerwacji</label>
            <textarea
              rows={3}
              value={n.tpl_reservation_confirm}
              onChange={e => setN({ ...n, tpl_reservation_confirm: e.target.value })}
              className="mt-1 w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm">Anulowanie rezerwacji</label>
            <textarea
              rows={3}
              value={n.tpl_reservation_cancel}
              onChange={e => setN({ ...n, tpl_reservation_cancel: e.target.value })}
              className="mt-1 w-full border rounded px-3 py-2"
            />
          </div>
        </div>
      </fieldset>

      <button
        onClick={save}
        disabled={saving}
        className="px-6 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
      >
        {saving ? "Zapisywanie…" : "Zapisz powiadomienia"}
      </button>
    </div>
  );
}
