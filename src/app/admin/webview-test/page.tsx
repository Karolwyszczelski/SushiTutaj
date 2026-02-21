// src/app/admin/webview-test/page.tsx
// Strona diagnostyczna - minimalna, zero zależności, zero Supabase
// Służy do weryfikacji czy WebView renderuje React
"use client";

import { useState, useEffect } from "react";

export default function WebViewTest() {
  const [info, setInfo] = useState<string[]>(["⏳ Ładowanie..."]);

  useEffect(() => {
    const lines: string[] = [];
    lines.push("✅ React hydration OK");
    lines.push(`📱 UA: ${navigator.userAgent.slice(0, 60)}...`);
    lines.push(`🌐 URL: ${window.location.href}`);
    lines.push(`📐 Screen: ${window.innerWidth}x${window.innerHeight}`);
    lines.push(`🍪 Cookies: ${document.cookie.length} chars`);

    // Sprawdź Service Worker
    if ("serviceWorker" in navigator) {
      lines.push("✅ Service Worker API dostępne");
    } else {
      lines.push("❌ Service Worker API NIEDOSTĘPNE");
    }

    // Sprawdź czy __NATIVE_APP__ jest ustawione (z injected JS)
    lines.push(
      `📲 Native app: ${(window as any).__NATIVE_APP__ ? "TAK" : "NIE"}`
    );
    lines.push(
      `📲 Native FCM: ${(window as any).__NATIVE_FCM__ ? "TAK" : "NIE"}`
    );

    setInfo(lines);
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        padding: 32,
        fontFamily: "monospace",
        fontSize: 14,
      }}
    >
      <h1 style={{ fontSize: 24, fontWeight: "bold", marginBottom: 16, color: "#000" }}>
        🍣 WebView Test
      </h1>
      <div
        style={{
          background: "#fff",
          border: "2px solid #22c55e",
          borderRadius: 12,
          padding: 20,
        }}
      >
        {info.map((line, i) => (
          <p key={i} style={{ margin: "8px 0", color: "#000" }}>
            {line}
          </p>
        ))}
      </div>
      <button
        onClick={() => alert("JS works! 🎉")}
        style={{
          marginTop: 20,
          padding: "12px 24px",
          background: "#f97316",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          fontSize: 16,
          fontWeight: "bold",
        }}
      >
        Test Alert
      </button>
    </div>
  );
}
