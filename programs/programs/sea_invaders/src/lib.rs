pub mod errors;
pub mod instructions;
pub mod state;
pub mod time;

use anchor_lang::prelude::*;

use instructions::*;
use state::ConfigArgs;

declare_id!("CHioj4MAKzwE5G8D79QyV7DLVAywAzekHntaD3p5e1WL");

#[program]
pub mod sea_invaders {
    use super::*;

    pub fn init_config(ctx: Context<InitConfig>, args: ConfigArgs) -> Result<()> {
        instructions::admin::init_config(ctx, args)
    }

    pub fn update_config(ctx: Context<AdminOnly>, args: ConfigArgs) -> Result<()> {
        instructions::admin::update_config(ctx, args)
    }

    pub fn set_paused(ctx: Context<AdminOnly>, paused: bool) -> Result<()> {
        instructions::admin::set_paused(ctx, paused)
    }

    #[cfg(feature = "test-clock")]
    pub fn set_test_clock(ctx: Context<AdminOnly>, unix_ts: i64) -> Result<()> {
        instructions::admin::set_test_clock(ctx, unix_ts)
    }

    pub fn create_player(ctx: Context<CreatePlayer>) -> Result<()> {
        instructions::player::create_player(ctx)
    }

    pub fn create_week_pool(ctx: Context<CreateWeekPool>, week: u32) -> Result<()> {
        instructions::week_pool::create_week_pool(ctx, week)
    }

    pub fn buy_ticket(ctx: Context<BuyTicket>) -> Result<()> {
        instructions::ticket::buy_ticket(ctx)
    }

    pub fn submit_daily_best(
        ctx: Context<SubmitDailyBest>,
        day: u32,
        score: u32,
        replay_hash: [u8; 32],
    ) -> Result<()> {
        instructions::record::submit_daily_best(ctx, day, score, replay_hash)
    }

    pub fn fund_pool(ctx: Context<FundPool>, amount: u64) -> Result<()> {
        instructions::settle::fund_pool(ctx, amount)
    }

    pub fn settle_week<'info>(
        ctx: Context<'info, SettleWeek<'info>>,
        week: u32,
    ) -> Result<()> {
        instructions::settle::settle_week(ctx, week)
    }
}
