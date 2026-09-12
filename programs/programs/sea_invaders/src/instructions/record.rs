//! `submit_daily_best` (spec §5.1/§5.4): a dual-signed daily score record.
//! The server co-signs to attest the score came from a verified replay; the
//! wallet signs so only the player themselves can record for their own
//! `Player` account. Records only within the day's grace window, only for a
//! day the player holds a ticket for (today's, or the immediately previous
//! ticket day across a rollover), and only when the week matches the
//! player's stored week or has just advanced past it - see `time.rs` for
//! the day/week arithmetic this all rests on.

use anchor_lang::prelude::*;

use crate::{errors::SeaError, state::*, time};

// The brief's original seeds constraint - `time::week_of(day).to_le_bytes()`
// on `week_pool`, gated by `#[instruction(day: u32)]` - does not compile
// under this Anchor 1.2.0 fork's IDL builder: a seed expression that calls
// a program-defined function (rather than a bare instruction arg, account
// field, or constant) falls through `anchor-syn`'s `parse_seed` to a
// fallback branch that splices the raw seed expression into generated IDL
// code with no `day` binding in scope, so `anchor build`'s IDL step fails
// with "cannot find value `day` in this scope" even though the on-chain
// build itself is fine. `buy_ticket.rs` already sidesteps this the same
// way `create_week_pool`'s callers rely on: the seeds read the account's
// own `week` field (a plain account-field seed, which the IDL builder does
// support) and the handler checks that field against the value computed
// from the instruction argument - `WrongWeekPool` below reuses the same
// error `buy_ticket.rs` uses for this exact check.
#[derive(Accounts)]
pub struct SubmitDailyBest<'info> {
    pub wallet: Signer<'info>,
    pub server_authority: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump, has_one = server_authority)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [b"player", wallet.key().as_ref()], bump = player.bump, has_one = wallet)]
    pub player: Account<'info, Player>,
    #[account(mut, seeds = [b"week", week_pool.week.to_le_bytes().as_ref()], bump = week_pool.bump)]
    pub week_pool: Account<'info, WeekPool>,
}

pub fn submit_daily_best(
    ctx: Context<SubmitDailyBest>,
    day: u32,
    score: u32,
    replay_hash: [u8; 32],
) -> Result<()> {
    let cfg = &ctx.accounts.config;
    require!(!cfg.paused, SeaError::Paused);
    // Never call `Clock::get()` directly - `time::now` honours the
    // feature-gated test clock (see `src/time.rs`).
    let now = time::now(cfg)?;
    require!(
        time::is_day_open(day, now, cfg.grace_seconds),
        SeaError::DayClosed
    );
    let p = &mut ctx.accounts.player;
    require!(
        p.ticket_day == day || p.prev_ticket_day == day,
        SeaError::NoTicketForDay
    );
    let week = time::week_of(day);
    require!(
        ctx.accounts.week_pool.week == week,
        SeaError::WrongWeekPool
    );
    if week > p.week {
        // A fresh player has `week == 0`, and real weeks are always > 0
        // (see `time.rs`'s `week_of`), so the very first record for any
        // player always takes this branch too.
        p.week = week;
        p.day_bests = [0; 7];
    } else {
        require!(week == p.week, SeaError::StaleWeek);
    }
    let wd = time::weekday_of(day) as usize;
    require!(score > p.day_bests[wd], SeaError::NotAnImprovement);
    p.day_bests[wd] = score;
    p.week_updated_at = now;
    p.last_replay_hash = replay_hash;
    let total = p.week_total();
    let wallet = p.wallet;
    ctx.accounts.week_pool.upsert_top(wallet, total, now);
    Ok(())
}
