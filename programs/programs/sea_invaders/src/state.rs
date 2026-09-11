use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
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
