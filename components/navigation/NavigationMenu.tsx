"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import styles from "./NavigationMenu.module.css";

export function NavigationMenu() {
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  const closeMenu = () => {
    setIsOpen(false);
  };

  const handleNavigation = (section: string) => {
    closeMenu();

    switch(section) {
      case 'game':
        router.push('/');
        break;
      case 'leaderboard':
        router.push('/leaderboard');
        break;
      case 'wiki':
        router.push('/wiki');
        break;
      default:
        console.warn(`Unknown navigation section: ${section}`);
    }
  };

  return (
    <div className={styles.navigationMenu}>
      <button
        className={styles.menuButton}
        onClick={toggleMenu}
        aria-label="Navigation menu"
        aria-expanded={isOpen}
      >
        <span className={styles.menuIcon}>☰</span>
        <span className={styles.menuText}>Menu</span>
        <svg
          className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ""}`}
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
        >
          <path
            d="M4 6L8 10L12 6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {isOpen && (
        <>
          <div className={styles.backdrop} onClick={closeMenu} />
          <div className={styles.dropdown}>
            <button
              className={styles.menuItem}
              onClick={() => handleNavigation("game")}
            >
              <span className={styles.menuIcon}>🎮</span>
              <span>Game</span>
            </button>
            <button
              className={styles.menuItem}
              onClick={() => handleNavigation("leaderboard")}
            >
              <span className={styles.menuIcon}>🏆</span>
              <span>Leaderboard</span>
            </button>
            <button
              className={styles.menuItem}
              onClick={() => handleNavigation("wiki")}
            >
              <span className={styles.menuIcon}>📖</span>
              <span>Wiki</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
