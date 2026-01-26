// src/components/admin/NotificationBell.tsx
"use client";

import { useEffect, useState } from "react";
import { Bell, ShoppingBag, AlertTriangle, Info, CalendarDays } from "lucide-react";
import clsx from "clsx";

type NotificationType = "order" | "reservation" | "error" | "system";

type AdminNotification = {
  id: string;
  type: NotificationType;
  title: string;
  message?: string | null;
  created_at: string;
  read?: boolean | null;
};

const POLL_MS = 25000; // co 25s odświeżenie

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AdminNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unreadCount = items.filter((n) => !n.read).length;

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/admin/notifications", {
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("Błąd ładowania powiadomień");
      const json = await res.json();
      setItems(Array.isArray(json.notifications) ? json.notifications : []);
    } catch (e: any) {
      setError(e.message || "Nie udało się pobrać powiadomień");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, []);

  const markAllRead = async () => {
    try {
      const res = await fetch("/api/admin/notifications/read-all", {
        method: "POST",
        credentials: "same-origin",
      });

      if (!res.ok) {
        console.error("Nie udało się oznaczyć powiadomień jako przeczytane");
        return;
      }

      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (e) {
      console.error("Błąd markAllRead:", e);
    }
  };

  const iconForType = (type: NotificationType) => {
    switch (type) {
      case "order":
        return (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
            <ShoppingBag className="h-4 w-4" />
          </div>
        );
        case "reservation":
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/10 text-amber-400">
      <CalendarDays className="h-4 w-4" />
    </div>
  );
      case "error":
        return (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500/10 text-red-400">
            <AlertTriangle className="h-4 w-4" />
          </div>
        );
      default:
        return (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-500/10 text-sky-400">
            <Info className="h-4 w-4" />
          </div>
        );
    }
  };

  const formatTime = (iso: string) => {
    try {
      return new Intl.DateTimeFormat("pl-PL", {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
      }).format(new Date(iso));
    } catch {
      return "";
    }
  };

  return (
    // PODBITY z-index na wrapperze
    <div className="relative z-[9999]">
      {/* przycisk dzwonka w kółku */}
      <button
        type="button"
        aria-label="Powiadomienia"
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          "relative flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white",
          "backdrop-blur hover:bg-black/60 transition-colors"
        )}
      >
        <Bell className="h-5 w-5" />

        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-h-[18px] min-w-[18px] rounded-full bg-red-500 px-1.5 text-[10px] font-semibold leading-[18px] text-white text-center shadow-md">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* dropdown */}
      {open && (
        <div
          className={clsx(
            // fixed do całego viewportu, nie do headera
            "fixed right-4 top-16 w-80 rounded-2xl border border-white/10 bg-[#050509] text-white shadow-xl",
            "z-[99999]"
          )}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-white/50">
                Powiadomienia
              </p>
              <p className="text-sm text-white/80">
                {unreadCount > 0
                  ? `${unreadCount} nieprzeczytane`
                  : "Wszystko przeczytane"}
              </p>
            </div>
            {items.length > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-[11px] text-white/60 hover:text-white"
              >
                Oznacz jako przeczytane
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading && (
              <div className="px-4 py-3 text-xs text-white/60">
                Ładowanie powiadomień…
              </div>
            )}

            {error && !loading && (
              <div className="px-4 py-3 text-xs text-red-400">
                {error}
              </div>
            )}

            {!loading && !error && items.length === 0 && (
              <div className="px-4 py-6 text-xs text-white/50 text-center">
                Brak powiadomień.
              </div>
            )}

            {!loading &&
              !error &&
              items.map((n) => (
                <div
                  key={n.id}
                  className={clsx(
                    "flex gap-3 px-4 py-3 text-sm border-b border-white/5 last:border-b-0",
                    !n.read && "bg-white/5"
                  )}
                >
                  {iconForType(n.type)}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[13px] font-semibold leading-snug">
                        {n.title}
                      </p>
                      <span className="shrink-0 text-[11px] text-white/45">
                        {formatTime(n.created_at)}
                      </span>
                    </div>
                    {n.message && (
                      <p className="mt-0.5 text-[12px] text-white/70 line-clamp-2">
                        {n.message}
                      </p>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
} 
