"use client";

import { useState, useCallback } from "react";
import { GameCanvas } from "@/components/game/GameCanvas";
import { GameUI } from "@/components/game/GameUI";
import { NavigationMenu } from "@/components/navigation/NavigationMenu";
import styles from "./page.module.css";

export default function Home() {
  const [gameState, setGameState] = useState<"idle" | "playing" | "gameOver">("idle");
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(5);
  const [level, setLevel] = useState(1);
  const [showHowToPlay, setShowHowToPlay] = useState(false);

  // Memoize callbacks to prevent GameCanvas re-mounting
  const handleScoreUpdate = useCallback((newScore: number) => {
    setScore(newScore);
  }, []);
  const handleLivesUpdate = useCallback((newLives: number) => {
    setLives(newLives);
  }, []);
  const handleLevelUpdate = useCallback((newLevel: number) => {
    setLevel(newLevel);
  }, []);
  const handleGameOver = useCallback(() => setGameState("gameOver"), []);

  const handleStartClick = () => {
    setGameState("playing");
  };

  const handleRestart = () => {
    setGameState("idle");
    setScore(0);
    setLives(5);
    setLevel(1);
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <NavigationMenu />
      </header>

      {/* Game UI (score, lives, level) */}
      <GameUI score={score} lives={lives} level={level} />

      {/* Game Canvas */}
      <div className={styles.gameWrapper}>
        {/* How to Play Button */}
        <button
          className={`${styles.howToPlayButton} ${gameState === "playing" ? styles.howToPlayButtonCompact : ""}`}
          onClick={() => setShowHowToPlay(true)}
          aria-label="How to play"
        >
          <span className={styles.howToPlayIcon}>❓</span>
          <span className={styles.howToPlayText}>How to Play</span>
        </button>

        {/* How to Play Popup */}
        {showHowToPlay && (
          <div className={styles.popupOverlay} onClick={() => setShowHowToPlay(false)}>
            <div className={styles.popupContent} onClick={(e) => e.stopPropagation()}>
              <button
                className={styles.popupClose}
                onClick={() => setShowHowToPlay(false)}
                aria-label="Close"
              >
                ×
              </button>
              <h2 className={styles.popupTitle}>How to Play?</h2>
              <div className={styles.popupInstructions}>
                <div className={styles.popupItem}>
                  <span className={styles.popupNumber}>1</span>
                  <p>Tap and drag Octopi across the screen to shoot and dodge bullets</p>
                </div>
                <div className={styles.popupItem}>
                  <span className={styles.popupNumber}>2</span>
                  <p>Destroy waves of enemies, defeat bosses, and earn points</p>
                </div>
                <div className={styles.popupItem}>
                  <span className={styles.popupNumber}>3</span>
                  <p>Use boosts to improve your results</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {gameState === "idle" && (
          <div className={styles.startScreen}>
            <h1 className={styles.title}>
              <span className={styles.titleSquare}>⬜</span>sea<br/><span className={styles.titleBottom}>invaders</span>
            </h1>
            <p className={styles.subtitle}>
              Defend against the crabs invasion!
            </p>

            {/* Onboarding instructions */}
            <div className={styles.onboarding}>
              <div className={styles.onboardingItem}>
                <span className={styles.onboardingIcon}>🚀</span>
                <div className={styles.onboardingText}>
                  <strong>Epic Space Battles</strong>
                  <p>Destroy alien waves, defeat bosses, and compete on the global leaderboard!</p>
                </div>
              </div>
              <div className={styles.onboardingItem}>
                <span className={styles.onboardingIcon}>⚡</span>
                <div className={styles.onboardingText}>
                  <strong>Free to Play</strong>
                  <p>Jump straight in — no sign-up needed.</p>
                </div>
              </div>
              <div className={styles.onboardingItem}>
                <span className={styles.onboardingIcon}>🏆</span>
                <div className={styles.onboardingText}>
                  <strong>Compete Globally</strong>
                  <p>Start your journey to the top!</p>
                </div>
              </div>
            </div>

            <button onClick={handleStartClick} className={styles.startButton}>
              START GAME
            </button>
          </div>
        )}

        {gameState === "playing" && (
          <GameCanvas
            onScoreUpdate={handleScoreUpdate}
            onLivesUpdate={handleLivesUpdate}
            onLevelUpdate={handleLevelUpdate}
            onGameOver={handleGameOver}
          />
        )}

        {gameState === "gameOver" && (
          <div className={styles.gameOverScreen}>
            <h2 className={styles.gameOverTitle}>GAME OVER</h2>
            <div className={styles.finalStats}>
              <p>Score: {score}</p>
              <p>Level: {level}</p>
            </div>
            <button onClick={handleRestart} className={styles.restartButton}>
              PLAY AGAIN
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
