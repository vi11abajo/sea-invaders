//! `buy_ticket` (spec §5.3): a player pays a fixed SKR ticket price, split
//! 95/5 between the current week's pool vault and the treasury, and gets
//! `attempts_per_ticket` more attempts for today. Attempts roll over: a
//! ticket bought on a new day resets `attempts_bought` to zero (after
//! remembering the previous day) before granting the new attempts.

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::{errors::SeaError, state::*, time};

#[derive(Accounts)]
pub struct BuyTicket<'info> {
    #[account(mut)]
    pub wallet: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump, has_one = skr_mint, has_one = treasury)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [b"player", wallet.key().as_ref()], bump = player.bump, has_one = wallet)]
    pub player: Account<'info, Player>,
    #[account(mut, seeds = [b"week", week_pool.week.to_le_bytes().as_ref()], bump = week_pool.bump, has_one = vault)]
    pub week_pool: Account<'info, WeekPool>,
    #[account(mut)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub treasury: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = skr_mint, token::authority = wallet)]
    pub wallet_token: InterfaceAccount<'info, TokenAccount>,
    pub skr_mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
}

/// Splits `amount` into a pool share (`pool_bps` out of 10 000, rounded
/// down) and the remainder, which goes to the treasury. Like every bps
/// split in this program, it multiplies in a `u128` intermediate and uses
/// `checked_*` for every step, so no product can overflow before the
/// division.
pub fn split(amount: u64, pool_bps: u16) -> Result<(u64, u64)> {
    let pool = (amount as u128)
        .checked_mul(pool_bps as u128)
        .ok_or(SeaError::Overflow)?
        .checked_div(10_000)
        .ok_or(SeaError::Overflow)?;
    let pool = pool as u64;
    Ok((pool, amount.checked_sub(pool).ok_or(SeaError::Overflow)?))
}

/// Splits `amount` via [`split`] and pays the two shares from `from`
/// (authorized by `authority`) to `vault` (the pool share) and `treasury`
/// (the remainder), skipping any zero-amount leg - the exact sequence
/// `buy_ticket`, `purchase` (shop.rs) and `revive` (tide.rs) each need to
/// move a player's SKR, now shared in one place.
#[allow(clippy::too_many_arguments)]
pub fn pay_split<'info>(
    token_program: &Interface<'info, TokenInterface>,
    mint: &InterfaceAccount<'info, Mint>,
    from: &InterfaceAccount<'info, TokenAccount>,
    authority: &Signer<'info>,
    vault: &InterfaceAccount<'info, TokenAccount>,
    treasury: &InterfaceAccount<'info, TokenAccount>,
    amount: u64,
    pool_bps: u16,
) -> Result<()> {
    let (to_pool, to_treasury) = split(amount, pool_bps)?;
    let decimals = mint.decimals;
    for (to, share) in [(vault, to_pool), (treasury, to_treasury)] {
        if share == 0 {
            continue;
        }
        token_interface::transfer_checked(
            CpiContext::new(
                token_program.key(),
                TransferChecked {
                    mint: mint.to_account_info(),
                    from: from.to_account_info(),
                    to: to.to_account_info(),
                    authority: authority.to_account_info(),
                },
            ),
            share,
            decimals,
        )?;
    }
    Ok(())
}

/// The Tide's current step (spec §1/§2, `revive` in tide.rs): `tide` decays
/// by one step for every full `ebb_seconds` since `tide_at`, floored at 0.
/// `tide_at == 0` (a player who has never revived) always yields `tide`
/// itself, and a `now` at or before `tide_at` (a backward test-clock warp)
/// clamps to zero elapsed steps rather than going negative.
pub fn effective_tide(tide: u8, tide_at: i64, now: i64, ebb_seconds: u32) -> Result<u8> {
    let elapsed_steps: i64 = if tide_at == 0 {
        0
    } else {
        now.checked_sub(tide_at)
            .ok_or(SeaError::Overflow)?
            .checked_div(ebb_seconds as i64)
            .ok_or(SeaError::Overflow)?
    };
    Ok(tide.saturating_sub(elapsed_steps.clamp(0, tide as i64) as u8))
}

pub fn buy_ticket(ctx: Context<BuyTicket>) -> Result<()> {
    let cfg = &ctx.accounts.config;
    require!(!cfg.paused, SeaError::Paused);
    // Never call `Clock::get()` directly - `time::now` honours the
    // feature-gated test clock (see `src/time.rs`).
    let now = time::now(cfg)?;
    let day = time::day_of(now);
    require!(
        ctx.accounts.week_pool.week == time::week_of(day),
        SeaError::WrongWeekPool
    );
    pay_split(
        &ctx.accounts.token_program,
        &ctx.accounts.skr_mint,
        &ctx.accounts.wallet_token,
        &ctx.accounts.wallet,
        &ctx.accounts.vault,
        &ctx.accounts.treasury,
        cfg.ticket_price,
        cfg.ticket_pool_bps,
    )?;
    let p = &mut ctx.accounts.player;
    if p.ticket_day != day {
        p.prev_ticket_day = p.ticket_day;
        p.ticket_day = day;
        p.attempts_bought = 0;
    }
    p.attempts_bought = p
        .attempts_bought
        .checked_add(cfg.attempts_per_ticket as u16)
        .ok_or(SeaError::Overflow)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn split_9500_bps_ticket() {
        assert_eq!(split(10_000_000, 9_500).unwrap(), (9_500_000, 500_000));
    }

    #[test]
    fn split_rounds_the_pool_share_down() {
        assert_eq!(split(1, 9_500).unwrap(), (0, 1));
    }

    #[test]
    fn effective_tide_is_unchanged_just_under_one_ebb_window() {
        assert_eq!(effective_tide(5, 1_000, 1_000 + 7_199, 7_200).unwrap(), 5);
    }

    #[test]
    fn effective_tide_ebbs_one_step_at_exactly_one_window() {
        assert_eq!(effective_tide(5, 1_000, 1_000 + 7_200, 7_200).unwrap(), 4);
    }

    #[test]
    fn effective_tide_ebbs_two_steps_at_exactly_two_windows() {
        assert_eq!(effective_tide(5, 1_000, 1_000 + 14_400, 7_200).unwrap(), 3);
    }

    #[test]
    fn effective_tide_floors_at_zero_far_beyond_the_tide_windows() {
        assert_eq!(effective_tide(3, 1_000, 1_000 + 100 * 7_200, 7_200).unwrap(), 0);
    }

    // 256 windows, not just "far beyond" - `elapsed_steps` (256) must be
    // clamped to `tide` (3) *before* the `as u8` cast, or the cast alone
    // wraps 256 to 0 and this would wrongly return `tide` (3) unchanged.
    #[test]
    fn effective_tide_floors_at_zero_beyond_256_windows_without_a_u8_wraparound() {
        assert_eq!(
            effective_tide(3, 1_000, 1_000 + 256 * 7_200, 7_200).unwrap(),
            0
        );
    }

    // A gap of at least one full window, not the 500 s this test used to
    // use: `(-500i64).checked_div(7200) == Some(0)` already truncates to 0
    // steps with plain integer division, so a sub-window gap passes even
    // without the `.clamp(0, ..)` lower bound. Two windows backward forces
    // a genuinely negative `elapsed_steps` (-2) through that clamp.
    #[test]
    fn effective_tide_clamps_a_clock_that_moved_back_a_full_window_or_more() {
        assert_eq!(
            effective_tide(4, 20_000, 20_000 - 14_400, 7_200).unwrap(),
            4
        );
    }

    #[test]
    fn effective_tide_is_the_tide_itself_when_never_revived() {
        // `tide_at == 0` means the player has never revived - elapsed
        // steps is 0 regardless of `now`, per spec.
        assert_eq!(effective_tide(0, 0, 999_999, 7_200).unwrap(), 0);
    }

    // Same `tide_at == 0` branch, but with a nonzero `tide`: with `tide ==
    // 0` (the case above) the branch is indistinguishable from the clamp
    // simply forcing `effective` to 0 regardless, since `tide` is already
    // 0. Only a positive `tide` here proves `now` was ignored.
    #[test]
    fn effective_tide_ignores_now_when_never_revived_even_with_a_positive_tide() {
        assert_eq!(effective_tide(3, 0, 999_999, 7_200).unwrap(), 3);
    }

    #[test]
    fn effective_tide_at_the_cap_with_no_elapsed_time() {
        assert_eq!(effective_tide(7, 1_000, 1_000, 7_200).unwrap(), 7);
    }
}
