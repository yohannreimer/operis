import confetti from 'canvas-confetti';

const WARM_COLORS = ['#d4a843', '#e07c4a', '#5bb98c', '#e8d4a0', '#f0a070'];

export function fireConfetti() {
  confetti({
    particleCount: 80,
    spread: 60,
    origin: { x: 0.5, y: 0.6 },
    colors: WARM_COLORS,
    ticks: 200,
    gravity: 0.9,
    scalar: 1.1
  });
}

export function fireStreakCelebration(streakCount: number) {
  const intensity = streakCount >= 30 ? 3 : streakCount >= 14 ? 2 : 1;

  for (let i = 0; i < intensity; i++) {
    setTimeout(() => {
      confetti({
        particleCount: 60 + i * 30,
        spread: 70 + i * 10,
        origin: { x: 0.5, y: 0.5 },
        colors: WARM_COLORS,
        ticks: 250,
        gravity: 0.85,
        scalar: 1.2,
        shapes: i === 0 ? ['circle'] : ['circle', 'square']
      });
    }, i * 300);
  }
}

export function fireTaskComplete() {
  confetti({
    particleCount: 40,
    spread: 40,
    origin: { x: 0.5, y: 0.7 },
    colors: WARM_COLORS,
    ticks: 150,
    gravity: 1.2,
    scalar: 0.9,
    startVelocity: 20
  });
}
