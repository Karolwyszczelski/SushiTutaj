// mobile/src/utils/alarmSound.ts
// =============================================================================
// LOOPING ALARM SOUND — jak Glovo, Pyszne.pl, Uber Eats Merchant
// =============================================================================
//
// Profesjonalne apki restauracyjne ZAPĘTLAJĄ dźwięk zamówienia dopóki
// pracownik nie potwierdzi odbioru. Pojedynczy dźwięk powiadomienia
// jest łatwy do przeoczenia w hałaśliwej kuchni.
//
// Ten moduł:
// 1. Odtwarza new_order.mp3 W PĘTLI (jak Glovo)
// 2. Używa expo-av Audio (niezależne od notification channel!)
//    → działa nawet jeśli głośność powiadomień = 0
// 3. Auto-stop po 2 minutach (safety timeout)
// 4. Singleton: wiele zamówień naraz = jeden ciągły alarm
// 5. Idempotent: wielokrotne startAlarm() = nic złego
// =============================================================================

import { Audio } from "expo-av";

let alarmInstance: Audio.Sound | null = null;
let isPlaying = false;
let autoStopTimer: ReturnType<typeof setTimeout> | null = null;
let pendingStop = false;   // CRITICAL: chroni przed race condition start/stop

// Alarm gra max 2 minuty — jeśli nikt nie reaguje, cisza
// (zapobiega nieskończonemu dzwonieniu np. w nocy)
const AUTO_STOP_MS = 2 * 60 * 1000;

/**
 * Uruchom zapętlony dźwięk alarmu nowego zamówienia.
 *
 * - Jeśli alarm już gra → nic nie rób (idempotent)
 * - Dźwięk gra przez Audio API (expo-av), NIE przez notification channel
 *   → działa niezależnie od ustawień głośności powiadomień
 * - Na tablecie kiosk (ekran zawsze włączony) gra natychmiast
 * - Auto-stop po 2 minutach (safety)
 *
 * Tak robią Glovo, Pyszne.pl, Wolt, Uber Eats Merchant, DoorDash.
 */
export async function startAlarm(): Promise<void> {
  if (isPlaying) return; // Już gra — nie startuj drugiego

  pendingStop = false;   // Reset flagi przy nowym starcie

  try {
    // Konfiguracja audio:
    // - staysActiveInBackground: dźwięk nie przestaje gdy app schodzi do tła
    // - shouldDuckAndroid: false → nie ściszaj innych źródeł audio
    // - playsInSilentModeIOS: ignoruj przełącznik cichy (Android: brak efektu)
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: false,
    });

    // CRITICAL: Sprawdź czy stopAlarm() została wywołana w trakcie await
    if (pendingStop) {
      pendingStop = false;
      return;
    }

    const { sound } = await Audio.Sound.createAsync(
      require("../../assets/new_order.mp3"),
      {
        isLooping: true,   // 🔁 KLUCZOWE: zapętl dźwięk!
        volume: 1.0,       // Pełna głośność
        shouldPlay: true,  // Od razu graj
      }
    );

    alarmInstance = sound;
    isPlaying = true;

    // CRITICAL: Jeśli stopAlarm() była wywołana podczas ładowania dźwięku,
    // zatrzymaj natychmiast — nie zostawiaj osieroconego sound instance
    if (pendingStop) {
      pendingStop = false;
      void stopAlarm();
      return;
    }

    console.log("[Alarm] 🔔 Alarm STARTED (looping new_order.mp3)");

    // Safety timeout: zatrzymaj po 2 minutach
    if (autoStopTimer) clearTimeout(autoStopTimer);
    autoStopTimer = setTimeout(() => {
      console.log("[Alarm] ⏰ Auto-stop po 2 minutach (nikt nie reaguje)");
      void stopAlarm();
    }, AUTO_STOP_MS);
  } catch (err: any) {
    console.error("[Alarm] ❌ Failed to start:", err?.message || err);
    isPlaying = false;
  }
}

/**
 * Zatrzymaj alarm. Bezpieczne do wielokrotnego wywoływania (idempotent).
 * Wywoływane gdy:
 * - Użytkownik kliknie powiadomienie (→ nawigacja do zamówienia)
 * - Użytkownik ręcznie wejdzie na stronę zamówień w WebView
 * - Auto-timeout 2 minuty
 */
export async function stopAlarm(): Promise<void> {
  // CRITICAL: Ustaw flagę NATYCHMIAST — jeśli startAlarm() jest w trakcie
  // await, sprawdzi tę flagę po wznowieniu i zatrzyma się
  pendingStop = true;

  if (autoStopTimer) {
    clearTimeout(autoStopTimer);
    autoStopTimer = null;
  }

  if (!alarmInstance) {
    isPlaying = false;
    return;
  }

  try {
    await alarmInstance.stopAsync();
    await alarmInstance.unloadAsync();
    console.log("[Alarm] 🔕 Alarm STOPPED");
  } catch {
    // Sound might already be unloaded — ignoruj
  } finally {
    alarmInstance = null;
    isPlaying = false;
  }
}

/**
 * Czy alarm aktualnie gra?
 */
export function isAlarmPlaying(): boolean {
  return isPlaying;
}
