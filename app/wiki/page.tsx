"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./page.module.css";

export default function WikiPage() {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<string>('rules');

  const scrollToSection = (id: string) => {
    setActiveSection(id);
    const element = document.getElementById(id);
    element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button
          className={styles.backButton}
          onClick={() => router.push('/')}
          aria-label="Back to game"
        >
          ← Back
        </button>
        <h1 className={styles.title}>Wiki & Guide</h1>
      </header>

      <nav className={styles.nav}>
        <button
          className={`${styles.navLink} ${activeSection === 'rules' ? styles.active : ''}`}
          onClick={() => scrollToSection('rules')}
        >
          Game Rules
        </button>
        <button
          className={`${styles.navLink} ${activeSection === 'controls' ? styles.active : ''}`}
          onClick={() => scrollToSection('controls')}
        >
          Controls
        </button>
        <button
          className={`${styles.navLink} ${activeSection === 'boosts' ? styles.active : ''}`}
          onClick={() => scrollToSection('boosts')}
        >
          Boosts Guide
        </button>
        <button
          className={`${styles.navLink} ${activeSection === 'enemies' ? styles.active : ''}`}
          onClick={() => scrollToSection('enemies')}
        >
          Enemies
        </button>
        <button
          className={`${styles.navLink} ${activeSection === 'bosses' ? styles.active : ''}`}
          onClick={() => scrollToSection('bosses')}
        >
          Boss Strategy
        </button>
        <button
          className={`${styles.navLink} ${activeSection === 'scoring' ? styles.active : ''}`}
          onClick={() => scrollToSection('scoring')}
        >
          Scoring System
        </button>
      </nav>

      <div className={styles.content}>
        <section id="rules" className={styles.section}>
          <h2 className={styles.sectionTitle}>🎮 Game Rules</h2>
          <div className={styles.card}>
            <p><strong>Objective:</strong> Destroy all alien invaders before they reach your ship!</p>
            <ul>
              <li>Move your ship left and right to dodge enemy fire</li>
              <li>Shoot lasers to destroy enemies and collect power-ups</li>
              <li>Survive waves of increasingly difficult enemies</li>
              <li>Every 5 levels, face a powerful boss</li>
              <li>The game ends when you lose all lives</li>
            </ul>
          </div>
        </section>

        <section id="controls" className={styles.section}>
          <h2 className={styles.sectionTitle}>🕹️ Controls</h2>
          <div className={styles.card}>
            <div className={styles.controlGrid}>
              <div className={styles.controlItem}>
                <div className={styles.key}>← →</div>
                <span>Move left/right</span>
              </div>
              <div className={styles.controlItem}>
                <div className={styles.key}>SPACE</div>
                <span>Fire laser</span>
              </div>
              <div className={styles.controlItem}>
                <div className={styles.key}>P</div>
                <span>Pause game</span>
              </div>
            </div>
          </div>
        </section>

        <section id="boosts" className={styles.section}>
          <h2 className={styles.sectionTitle}>⚡ Boost System</h2>
          <div className={styles.card}>
            <h3>System Overview</h3>
            <p>The boost system in sea invaders provides players with temporary or permanent upgrades that can dramatically change the course of the game. Boosts drop when destroying any enemy with a small probability.</p>

            <p><strong>How to Collect:</strong> To collect a boost, touch it with Octopi. After collection, the boost is instantly activated (for instant effects) or starts its action (for temporary effects).</p>

            <h3>Rarity Categories</h3>
            <p>All boosts are divided into four rarity categories:</p>

            <div className={styles.raritySection}>
              <div className={styles.rarityCard}>
                <div className={styles.rarityBadge} style={{background: 'linear-gradient(135deg, #a8d8ea, #4fb3d9)'}}>⚪ COMMON</div>
                <p>Basic effects with high drop chance, suitable for beginners</p>
              </div>
              <div className={styles.rarityCard}>
                <div className={styles.rarityBadge} style={{background: 'linear-gradient(135deg, #4fb3d9, #0C6AE3)'}}>🔷 RARE</div>
                <p>Powerful balanced effects with medium drop chance</p>
              </div>
              <div className={styles.rarityCard}>
                <div className={styles.rarityBadge} style={{background: 'linear-gradient(135deg, #6c5ce7, #a29bfe)'}}>🔮 EPIC</div>
                <p>Game-changing effects with low drop chance</p>
              </div>
              <div className={styles.rarityCard}>
                <div className={styles.rarityBadge} style={{background: 'linear-gradient(135deg, #fdcb6e, #e17055)'}}>👑 LEGENDARY</div>
                <p>Unique effects with special mechanics and extremely low drop chance</p>
              </div>
            </div>

            <h3>Common Boosts</h3>
            <div className={styles.boostGrid}>
              <div className={styles.boostItem}>
                <span className={styles.boostIcon}>⚡</span>
                <div>
                  <strong>Rapid Fire</strong>
                  <p>Significantly increases firing rate, creating a dense barrage of fire</p>
                </div>
              </div>
              <div className={styles.boostItem}>
                <span className={styles.boostIcon}>🛡️</span>
                <div>
                  <strong>Shield Barrier</strong>
                  <p>Creates a protective barrier that can absorb several hits</p>
                </div>
              </div>
              <div className={styles.boostItem}>
                <span className={styles.boostIcon}>💰</span>
                <div>
                  <strong>Score Multiplier</strong>
                  <p>Doubles all points earned for destroying enemies</p>
                </div>
              </div>
              <div className={styles.boostItem}>
                <span className={styles.boostIcon}>❄️</span>
                <div>
                  <strong>Points Freeze</strong>
                  <p>Freezes natural point decay, preventing loss over time</p>
                </div>
              </div>
            </div>

            <h3>Rare Boosts</h3>
            <div className={styles.boostGrid}>
              <div className={styles.boostItem}>
                <span className={styles.boostIcon}>💫</span>
                <div>
                  <strong>Multi Shot</strong>
                  <p>Each shot fires three bullets: straight, left, and right</p>
                </div>
              </div>
              <div className={styles.boostItem}>
                <span className={styles.boostIcon}>❤️</span>
                <div>
                  <strong>Health Boost</strong>
                  <p>Instantly restores one health unit</p>
                </div>
              </div>
              <div className={styles.boostItem}>
                <span className={styles.boostIcon}>🔫</span>
                <div>
                  <strong>Piercing Bullets</strong>
                  <p>Bullets pass through enemies, hitting everyone in their path</p>
                </div>
              </div>
              <div className={styles.boostItem}>
                <span className={styles.boostIcon}>⭐</span>
                <div>
                  <strong>Invincibility</strong>
                  <p>Complete invulnerability, allowing safe maneuvering</p>
                </div>
              </div>
            </div>

            <h3>Epic Boosts</h3>
            <div className={styles.boostGrid}>
              <div className={styles.boostItem}>
                <span className={styles.boostIcon}>🌀</span>
                <div>
                  <strong>Gravity Well</strong>
                  <p>Creates gravitational field that distorts enemy projectiles</p>
                </div>
              </div>
              <div className={styles.boostItem}>
                <span className={styles.boostIcon}>🔄</span>
                <div>
                  <strong>Ricochet</strong>
                  <p>Enemy bullets bounce off shield and damage enemies</p>
                </div>
              </div>
              <div className={styles.boostItem}>
                <span className={styles.boostIcon}>🎯</span>
                <div>
                  <strong>Auto Target</strong>
                  <p>Bullets automatically target nearest enemies</p>
                </div>
              </div>
              <div className={styles.boostItem}>
                <span className={styles.boostIcon}>🧊</span>
                <div>
                  <strong>Ice Freeze</strong>
                  <p>Significantly slows down all enemies</p>
                </div>
              </div>
            </div>

            <h3>Legendary Boosts</h3>
            <div className={styles.boostGrid}>
              <div className={styles.boostItem}>
                <span className={styles.boostIcon}>🎲</span>
                <div>
                  <strong>Random Chaos</strong>
                  <p>Activates random effects creating unpredictable gameplay</p>
                </div>
              </div>
              <div className={styles.boostItem}>
                <span className={styles.boostIcon}>💸</span>
                <div>
                  <strong>Coin Shower</strong>
                  <p>Instantly awards significant points based on current score</p>
                </div>
              </div>
              <div className={styles.boostItem}>
                <span className={styles.boostIcon}>🌊</span>
                <div>
                  <strong>Wave Blast</strong>
                  <p>Creates energy wave that instantly destroys bottom row enemies</p>
                </div>
              </div>
              <div className={styles.boostItem}>
                <span className={styles.boostIcon}>🐢</span>
                <div>
                  <strong>Speed Tamer</strong>
                  <p>Permanently reduces enemy speed (effect stacks)</p>
                </div>
              </div>
            </div>

            <div className={styles.tipBox}>
              <strong>🎁 Boss Reward:</strong> Every boss defeated guarantees a Random Chaos boost drop with 100% probability at the boss location!
            </div>
          </div>
        </section>

        <section id="enemies" className={styles.section}>
          <h2 className={styles.sectionTitle}>👾 Enemy Types</h2>
          <div className={styles.card}>
            <table className={styles.enemyTable}>
              <thead>
                <tr>
                  <th>Enemy</th>
                  <th>Points</th>
                  <th>Behavior</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Basic Invader</td>
                  <td>10</td>
                  <td>Moves in formation, fires occasionally</td>
                </tr>
                <tr>
                  <td>Fast Invader</td>
                  <td>20</td>
                  <td>Moves faster, aggressive firing</td>
                </tr>
                <tr>
                  <td>Armored Invader</td>
                  <td>30</td>
                  <td>Takes multiple hits to destroy</td>
                </tr>
                <tr>
                  <td>Elite Invader</td>
                  <td>50</td>
                  <td>Fast movement, high fire rate</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section id="bosses" className={styles.section}>
          <h2 className={styles.sectionTitle}>👹 Boss Strategy</h2>
          <div className={styles.card}>
            <p><strong>Boss battles occur every 5 levels!</strong></p>
            <ul>
              <li><strong>Pattern Recognition:</strong> Learn the boss's attack patterns</li>
              <li><strong>Weak Points:</strong> Focus fire on glowing areas for maximum damage</li>
              <li><strong>Dodge First:</strong> Survival is more important than dealing damage</li>
              <li><strong>Use Power-ups:</strong> Save shields and rapid fire for bosses</li>
              <li><strong>Stay Mobile:</strong> Keep moving to avoid concentrated fire</li>
            </ul>
            <div className={styles.tipBox}>
              <strong>💡 Pro Tip:</strong> Bosses have 3 phases - the final phase is always the most dangerous!
            </div>
          </div>
        </section>

        <section id="scoring" className={styles.section}>
          <h2 className={styles.sectionTitle}>🏆 Scoring System</h2>
          <div className={styles.card}>
            <h3>Points per Enemy</h3>
            <ul>
              <li>Basic Enemy: 10 points</li>
              <li>Fast Enemy: 20 points</li>
              <li>Armored Enemy: 30 points</li>
              <li>Elite Enemy: 50 points</li>
              <li>Boss Defeat: 500 points</li>
            </ul>
            <h3>Multipliers</h3>
            <ul>
              <li><strong>Combo Kills:</strong> +10% per consecutive kill (max 5x)</li>
              <li><strong>No Damage:</strong> +50% bonus if you clear a level without taking damage</li>
              <li><strong>Speed Clear:</strong> +25% bonus for fast level completion</li>
              <li><strong>Score Boost Power-up:</strong> 2x multiplier for 30 seconds</li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
