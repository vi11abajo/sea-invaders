"use client";

import styles from "./GameUI.module.css";

interface GameUIProps {
  score: number;
  lives: number;
  level: number;
}

export function GameUI({ score, lives, level }: GameUIProps) {
  // Ensure valid numbers with safe fallback
  const displayScore = typeof score === 'number' ? score : 0;
  const displayLives = typeof lives === 'number' ? Math.max(0, lives) : 0;
  const displayLevel = typeof level === 'number' ? Math.max(1, level) : 1;

  // Format lives display
  const formatLives = (livesCount: number): string => {
    if (livesCount <= 5) {
      // Show exact number of hearts for 5 or fewer
      return '❤️'.repeat(livesCount);
    } else {
      // Show count + "x" + single heart for 6 or more
      return `${livesCount}x❤️`;
    }
  };

  return (
    <div className={styles.gameUI}>
      <div className={styles.stat}>
        <span className={styles.label}>SCORE</span>
        <span className={styles.value}>{displayScore.toLocaleString()}</span>
      </div>

      <div className={styles.stat}>
        <span className={styles.label}>LEVEL</span>
        <span className={styles.value}>{displayLevel}</span>
      </div>

      <div className={styles.stat}>
        <span className={styles.label}>LIVES</span>
        <span className={styles.value}>
          {formatLives(displayLives)}
        </span>
      </div>
    </div>
  );
}
