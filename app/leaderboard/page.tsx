"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";

interface LeaderboardEntry {
  rank: number;
  player: string;
  score: number;
  level: number;
  date: string;
  avatar?: string;
  username?: string;
}

interface UserPosition {
  rank: number | null;
  best_score: number;
  message?: string;
}

type TimeFilter = 'all' | 'monthly';

export default function LeaderboardPage() {
  const router = useRouter();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [userPosition, setUserPosition] = useState<UserPosition | null>(null);
  const [isLoadingPosition, setIsLoadingPosition] = useState(false);
  const ITEMS_PER_PAGE = 50; // Show the top 50

  useEffect(() => {
    fetchLeaderboard();
    fetchUserPosition();
  }, [timeFilter, page]);

  const fetchUserPosition = async () => {
    setIsLoadingPosition(true);
    try {
      const token = localStorage.getItem('authToken');
      if (!token) {
        setUserPosition(null);
        return;
      }

      const response = await fetch('/api/leaderboard/my-rank', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setUserPosition(data);
      } else {
        setUserPosition(null);
      }
    } catch (error) {
      console.error('Failed to fetch user position:', error);
      setUserPosition(null);
    } finally {
      setIsLoadingPosition(false);
    }
  };

  const fetchLeaderboard = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/leaderboard?filter=${timeFilter}&page=${page}&limit=${ITEMS_PER_PAGE}`);
      const data = await response.json();
      setLeaderboard(data.entries || []);
    } catch (error) {
      console.error('Failed to fetch leaderboard:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredLeaderboard = searchQuery
    ? leaderboard.filter(entry =>
        entry.player.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : leaderboard;

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
        <h1 className={styles.title}>Leaderboard</h1>
      </header>

      <div className={styles.controls}>
        <div className={styles.filters}>
          <button
            className={`${styles.filterButton} ${timeFilter === 'all' ? styles.active : ''}`}
            onClick={() => setTimeFilter('all')}
          >
            All Time
          </button>
          <button
            className={`${styles.filterButton} ${timeFilter === 'monthly' ? styles.active : ''}`}
            onClick={() => setTimeFilter('monthly')}
          >
            Monthly
          </button>
        </div>

        <input
          type="text"
          className={styles.searchInput}
          placeholder="Searching for player..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {userPosition && userPosition.rank && userPosition.best_score > 0 && (
        <div className={styles.userPosition}>
          <span className={styles.positionLabel}>Your position:</span>
          <span className={styles.positionRank}>#{userPosition.rank}</span>
          <span className={styles.positionScore}>{userPosition.best_score?.toLocaleString() || 0} points</span>
        </div>
      )}

      <h2 className={styles.tableTitle}>TOP 50</h2>

      <div className={styles.tableWrapper}>
        {isLoading ? (
          <div className={styles.loading}>Loading...</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Player</th>
                <th>Points</th>
                <th>Level</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeaderboard.map((entry) => (
                <tr key={`${entry.rank}-${entry.player}`} className={entry.rank <= 3 ? styles.topThree : ''}>
                  <td className={styles.rank}>
                    {entry.rank === 1 && '🥇'}
                    {entry.rank === 2 && '🥈'}
                    {entry.rank === 3 && '🥉'}
                    {entry.rank > 3 && `#${entry.rank}`}
                  </td>
                  <td className={styles.player}>
                    <div className={styles.playerInfo}>
                      {entry.avatar && (
                        <img
                          src={entry.avatar}
                          alt={entry.username || entry.player}
                          className={styles.avatar}
                        />
                      )}
                      <span>{entry.player}</span>
                    </div>
                  </td>
                  <td className={styles.score}>{entry.score.toLocaleString()}</td>
                  <td className={styles.level}>{entry.level}</td>
                  <td className={styles.date}>{entry.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {!searchQuery && filteredLeaderboard.length === ITEMS_PER_PAGE && (
        <div className={styles.pagination}>
          <button
            className={styles.pageButton}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Previous
          </button>
          <span className={styles.pageInfo}>Page {page}</span>
          <button
            className={styles.pageButton}
            onClick={() => setPage(p => p + 1)}
            disabled={filteredLeaderboard.length < ITEMS_PER_PAGE}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
