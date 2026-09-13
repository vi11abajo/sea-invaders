//! `revive` (spec §1/§2, "the Tide"): a player who has just run out of
//! lives can pay to continue mid-level. The price rises one step on the
//! `Config.revive_ladder` each time it is used and ebbs back down by one
//! step for every full `cfg.ebb_seconds` that passes without a revive -
//! see the design doc's `effective`/`price` formulas, mirrored exactly
//! below.

use anchor_lang::prelude::*;

use crate::{
    errors::SeaError,
    instructions::ticket::{effective_tide, pay_split, BuyTicket},
    time,
};

#[event]
pub struct Revived {
    pub wallet: Pubkey,
    pub price: u64,
    pub tide: u8,
    pub tide_at: i64,
}

/// Reuses `BuyTicket`'s account set verbatim - the design doc says as much
/// ("accounts like `BuyTicket` (no catalog)") and this program already
/// reuses one `Accounts` struct across several instructions the same way
/// (`AdminOnly` backs `update_config`, `set_paused` and `set_test_clock`).
pub fn revive(ctx: Context<BuyTicket>) -> Result<()> {
    let cfg = &ctx.accounts.config;
    require!(!cfg.paused, SeaError::Paused);
    // Never call `Clock::get()` directly - `time::now` honours the
    // feature-gated test clock (see `src/time.rs`).
    let now = time::now(cfg)?;
    let week = time::week_of(time::day_of(now));
    require!(ctx.accounts.week_pool.week == week, SeaError::WrongWeekPool);

    let tide = ctx.accounts.player.tide;
    let tide_at = ctx.accounts.player.tide_at;
    let effective = effective_tide(tide, tide_at, now, cfg.ebb_seconds)?;
    let price = cfg.revive_ladder[effective as usize];

    pay_split(
        &ctx.accounts.token_program,
        &ctx.accounts.skr_mint,
        &ctx.accounts.wallet_token,
        &ctx.accounts.wallet,
        &ctx.accounts.vault,
        &ctx.accounts.treasury,
        price,
        cfg.purchase_pool_bps,
    )?;

    let p = &mut ctx.accounts.player;
    p.tide = effective.saturating_add(1).min(7);
    p.tide_at = now;

    emit!(Revived {
        wallet: p.wallet,
        price,
        tide: p.tide,
        tide_at: p.tide_at,
    });
    Ok(())
}
