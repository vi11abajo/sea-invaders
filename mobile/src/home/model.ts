import type { Cluster } from '../api/config';

/** What Home shows. Every part is null until the service behind it exists. */
export interface HomeModel {
  wallet: WalletInfo | null;
  /** Null while ranked play (Daily Run, weekly pool) is not available. */
  ranked: RankedInfo | null;
  campaign: CampaignInfo | null;
}

export interface WalletInfo {
  address: string;
  seeker: boolean;
  skr: number;
}

export interface RankedInfo {
  seed: number;
  attemptsLeft: number;
  /** Attempts one ticket buys; the card counts attempts within the current ticket ("2 of 3"). */
  attemptsPerTicket: number;
  /** Tickets bought on-chain today. */
  ticketsToday: number;
  /** Start of the next daily seed, epoch milliseconds. */
  newSeedAt: number;
  todayBest: number;
  /** The on-chain best recorded for today's weekday, 0 until a record transaction lands. */
  recordedBest: number;
  weekTotal: number;
  weekRank: number | null;
  poolSkr: number;
  ticketPriceSkr: number;
  cluster: Cluster;
}

export interface CampaignInfo {
  level: number;
  total: number;
}

/** Home as it is today: no wallet, no ranked services, no campaign yet. */
export const OFFLINE_HOME: HomeModel = { wallet: null, ranked: null, campaign: null };

/** Sample values from the design prototype. Only the design gallery uses them. */
export function demoHomeModel(now: number): HomeModel {
  return {
    wallet: { address: '7xKpQm9vLrT2hW8sNc4yBd6fGj1eZa5uXo3fQ', seeker: true, skr: 42 },
    ranked: {
      seed: 214,
      attemptsLeft: 2,
      attemptsPerTicket: 3,
      ticketsToday: 1,
      newSeedAt: now + 18764 * 1000,
      todayBest: 18920,
      recordedBest: 15200,
      weekTotal: 41300,
      weekRank: 37,
      poolSkr: 12480,
      ticketPriceSkr: 10,
      cluster: 'devnet',
    },
    campaign: { level: 9, total: 30 },
  };
}
