import { useCallback, useEffect, useState } from 'react';
import { getToday, type TodayInfo } from '../api/daily';
import type { Session } from '../api/session';
import type { HomeModel, RankedInfo } from './model';

/** The on-chain ticket price (spec §4); shown on the card even before tickets exist. */
const TICKET_PRICE_SKR = 10;
/** Attempts per ticket (spec §4); used until the server reports the on-chain value. */
const ATTEMPTS_PER_TICKET = 3;

function rankedFrom(today: TodayInfo, fetchedAt: number): RankedInfo {
  return {
    seed: today.day,
    attemptsLeft: today.attemptsLeft,
    attemptsPerTicket: today.attemptsPerTicket ?? ATTEMPTS_PER_TICKET,
    ticketsToday: Math.ceil(today.attemptsBought / (today.attemptsPerTicket ?? ATTEMPTS_PER_TICKET)),
    newSeedAt: fetchedAt + today.secondsToNextDay * 1000,
    todayBest: today.todayBest ?? 0,
    recordedBest: today.recordedBest,
    weekTotal: today.weekTotal,
    weekRank: today.weekRank,
    poolSkr: today.poolSkr,
    ticketPriceSkr: today.ticketPriceSkr ?? TICKET_PRICE_SKR,
    cluster: today.cluster,
  };
}

/** Builds the HomeModel from the session and the server's view of today. Ranked data needs a session. */
export function useHomeModel(session: Session | null): { model: HomeModel; refresh: () => void; error: string | null } {
  const [ranked, setRanked] = useState<RankedInfo | null>(null);
  const [skrBalance, setSkrBalance] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (session === null) {
      setRanked(null);
      setSkrBalance(0);
      return;
    }
    let alive = true;
    const fetchedAt = Date.now();
    getToday(true)
      .then((today) => {
        if (!alive) return;
        setRanked(rankedFrom(today, fetchedAt));
        setSkrBalance(today.skrBalance);
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

  const wallet = session === null ? null : { address: session.walletAddress, seeker: false, skr: skrBalance };
  return { model: { wallet, ranked, campaign: null }, refresh, error };
}
