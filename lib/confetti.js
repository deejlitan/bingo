'use client';

export async function fireConfetti() {
  if (typeof window === 'undefined') return;
  const { default: confetti } = await import('canvas-confetti');
  const duration = 2500;
  const end = Date.now() + duration;
  const colors = ['#1c1917', '#fbbf24', '#fde68a', '#fffbeb', '#059669'];

  (function frame() {
    confetti({
      particleCount: 5,
      angle: 60,
      spread: 60,
      startVelocity: 55,
      origin: { x: 0, y: 0.7 },
      colors,
    });
    confetti({
      particleCount: 5,
      angle: 120,
      spread: 60,
      startVelocity: 55,
      origin: { x: 1, y: 0.7 },
      colors,
    });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}
