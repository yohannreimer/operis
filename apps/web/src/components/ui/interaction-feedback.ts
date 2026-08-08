export function confirmHaptic() {
  if (typeof window === 'undefined') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  if (typeof window.navigator.vibrate === 'function') window.navigator.vibrate(10);
}
