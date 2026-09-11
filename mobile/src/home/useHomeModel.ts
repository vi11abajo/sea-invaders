import { useCallback, useEffect, useState } from 'react';
import { getToday, type TodayInfo } from '../api/daily';
import type { Session } from '../api/session';
import type { HomeModel, RankedInfo } from './model';

/** The on-chain ticket price (spec §4); shown on the card even before tickets exist. */
const TICKET_PRICE_SKR = 10;

function rankedFrom(today: TodayInfo, fetchedAt: number): RankedInfo {
  return {
    seed: today.day,
    attemptsLeft: today.attemptsLeft,
    newSeedAt: fetchedAt + today.secondsToNextDay * 1000,
    todayBest: today.todayBest ?? 0,
    weekTotal: 0,
    weekRank: null,
    poolSkr: 0,
    ticketPriceSkr: TICKET_PRICE_SKR,
  };
}

/** Builds the HomeModel from the session and the server's view of today. Ranked data needs a session. */
export function useHomeModel(session: Session | null): { model: HomeModel; refresh: () => void; error: string | null } {
  const [ranked, setRanked] = useState<RankedInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (session === null) {
      setRanked(null);
      return;
    }
    let alive = true;
    const fetchedAt = Date.now();
    getToday(true)
      .then((today) => {
        if (!alive) return;
        setRanked(rankedFrom(today, fetchedAt));
        setError(null);
      })
      .catch((e: Error) => {
        if (!alive) return;
        setRanked(null);
        setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [session, version]);

  const wallet = session === null ? null : { address: session.walletAddress, seeker: false, skr: 0 };
  return { model: { wallet, ranked, campaign: null }, refresh, error };
}
