use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace, Default)]
pub struct Config {
    pub admin: Pubkey,
    pub server_authority: Pubkey,
    pub skr_mint: Pubkey,
    pub treasury: Pubkey,        // token account for the treasury share
    pub ticket_price: u64,       // base units, 10_000_000
    pub attempts_per_ticket: u8, // 3
    pub ticket_pool_bps: u16,    // 9_500
    pub purchase_pool_bps: u16,  // 2_000
    pub revive_ladder: [u64; 8], // 25,30,40,50,60,75,95,120 SKR in base units
    pub ebb_seconds: u32,        // 7_200
    pub grace_seconds: u32,      // 900
    pub payout_bps: [u16; 10],   // 3000,2000,1200,800,600,480×5
    pub paused: bool,
    pub bump: u8,
    /// Test-only clock override (0 = off). Read only via `time::now`, and
    /// only takes effect when the program is built with the `test-clock`
    /// feature - see `time.rs`.
    pub clock_override: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct ConfigArgs {
    pub server_authority: Pubkey,
    pub treasury: Pubkey,
    pub ticket_price: u64,
    pub attempts_per_ticket: u8,
    pub ticket_pool_bps: u16,
    pub purchase_pool_bps: u16,
    pub revive_ladder: [u64; 8],
    pub ebb_seconds: u32,
    pub grace_seconds: u32,
    pub payout_bps: [u16; 10],
}

#[account]
#[derive(InitSpace)]
pub struct Player {
    pub wallet: Pubkey,
    pub week: u32,
    pub day_bests: [u32; 7],
    pub week_updated_at: i64,
    pub ticket_day: u32,
    pub prev_ticket_day: u32,
    pub attempts_bought: u16,
    pub tide: u8,
    pub tide_at: i64,
    pub inventory: u64,
    pub seeker: bool,
    pub last_replay_hash: [u8; 32],
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, InitSpace, PartialEq, Eq, Debug)]
pub struct TopEntry {
    pub player: Pubkey,
    pub total: u64,
    pub updated_at: i64,
}

#[account]
#[derive(InitSpace)]
pub struct WeekPool {
    pub week: u32,
    pub vault: Pubkey, // ATA of this PDA for skr_mint
    pub top: [TopEntry; 10],
    pub top_len: u8,
    pub settled: bool,
    pub bump: u8,
}

impl Player {
    pub fn week_total(&self) -> u64 {
        self.day_bests.iter().map(|&s| s as u64).sum()
    }
}

impl WeekPool {
    /// Removes the player's old entry (if any), inserts the new one in
    /// order (total desc, updated_at asc as the tie-break), keeps the top
    /// 10. Called once per `submit_daily_best` with the player's new
    /// week total, so each player ever holds at most one slot.
    pub fn upsert_top(&mut self, player: Pubkey, total: u64, now: i64) {
        let mut list: Vec<TopEntry> = self.top[..self.top_len as usize]
            .iter()
            .copied()
            .filter(|e| e.player != player)
            .collect();
        list.push(TopEntry { player, total, updated_at: now });
        list.sort_by(|a, b| b.total.cmp(&a.total).then(a.updated_at.cmp(&b.updated_at)));
        list.truncate(10);
        self.top = [TopEntry::default(); 10];
        for (i, e) in list.iter().enumerate() {
            self.top[i] = *e;
        }
        self.top_len = list.len() as u8;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(player: Pubkey, total: u64, updated_at: i64) -> TopEntry {
        TopEntry { player, total, updated_at }
    }

    #[test]
    fn orders_by_total_descending() {
        let mut pool = WeekPool {
            week: 1,
            vault: Pubkey::default(),
            top: [TopEntry::default(); 10],
            top_len: 0,
            settled: false,
            bump: 0,
        };
        let a = Pubkey::new_unique();
        let b = Pubkey::new_unique();
        let c = Pubkey::new_unique();
        pool.upsert_top(a, 50, 100);
        pool.upsert_top(b, 90, 200);
        pool.upsert_top(c, 70, 300);
        assert_eq!(pool.top_len, 3);
        assert_eq!(pool.top[0], entry(b, 90, 200));
        assert_eq!(pool.top[1], entry(c, 70, 300));
        assert_eq!(pool.top[2], entry(a, 50, 100));
    }

    #[test]
    fn tie_break_favours_the_earlier_updated_at() {
        let mut pool = WeekPool {
            week: 1,
            vault: Pubkey::default(),
            top: [TopEntry::default(); 10],
            top_len: 0,
            settled: false,
            bump: 0,
        };
        let earlier = Pubkey::new_unique();
        let later = Pubkey::new_unique();
        // `later` is inserted first but recorded its equal score after
        // `earlier` (higher `updated_at`), so `earlier` must still rank
        // first once both are in the list.
        pool.upsert_top(later, 100, 500);
        pool.upsert_top(earlier, 100, 200);
        assert_eq!(pool.top_len, 2);
        assert_eq!(pool.top[0], entry(earlier, 100, 200));
        assert_eq!(pool.top[1], entry(later, 100, 500));
    }

    #[test]
    fn truncates_to_ten_and_drops_the_lowest() {
        let mut pool = WeekPool {
            week: 1,
            vault: Pubkey::default(),
            top: [TopEntry::default(); 10],
            top_len: 0,
            settled: false,
            bump: 0,
        };
        let players: Vec<Pubkey> = (0..11).map(|_| Pubkey::new_unique()).collect();
        for (i, p) in players.iter().enumerate() {
            // Descending totals: players[0] scores highest, players[10] lowest.
            pool.upsert_top(*p, 100 - i as u64, 1_000 + i as i64);
        }
        assert_eq!(pool.top_len, 10);
        assert!(pool.top[..10].iter().all(|e| e.player != players[10]));
        assert_eq!(pool.top[0].player, players[0]);
        assert_eq!(pool.top[9].player, players[9]);
    }

    #[test]
    fn replacing_own_entry_updates_it_in_place_without_duplicating() {
        let mut pool = WeekPool {
            week: 1,
            vault: Pubkey::default(),
            top: [TopEntry::default(); 10],
            top_len: 0,
            settled: false,
            bump: 0,
        };
        let a = Pubkey::new_unique();
        let b = Pubkey::new_unique();
        pool.upsert_top(a, 50, 100);
        pool.upsert_top(b, 60, 200);
        pool.upsert_top(a, 200, 300);
        assert_eq!(pool.top_len, 2);
        assert_eq!(pool.top[0], entry(a, 200, 300));
        assert_eq!(pool.top[1], entry(b, 60, 200));
    }
}
