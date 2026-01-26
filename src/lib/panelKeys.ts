// src/lib/panelKeys.ts
const navKeys = new Set(['PageDown','PageUp','ArrowDown','ArrowUp']);

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return !!target.closest('input, textarea, select, [contenteditable="true"]');
}

export function installPanelKeys(onNav: (dir: 'up'|'down') => void) {
  const handler = (e: KeyboardEvent) => {
    if (isEditable(e.target)) return;       // nie ruszaj inputów
    if (!navKeys.has(e.key)) return;        // tylko klawisze nawigacji
    e.preventDefault();                     // blokuj scroll tylko dla tych klawiszy
    onNav(e.key === 'PageUp' || e.key === 'ArrowUp' ? 'up' : 'down');
  };
  window.addEventListener('keydown', handler, { passive: false }); // bez capture
  return () => window.removeEventListener('keydown', handler);
}
