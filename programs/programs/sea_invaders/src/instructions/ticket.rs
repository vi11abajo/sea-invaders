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
/// down) and the remainder, which goes to the treasury - see
/// global-constraints.md's bps math rule (`u128` intermediate,
/// `checked_*` everywhere).
pub fn split(amount: u64, pool_bps: u16) -> Result<(u64, u64)> {
    let pool = (amount as u128)
        .checked_mul(pool_bps as u128)
        .ok_or(SeaError::Overflow)?
        .checked_div(10_000)
        .ok_or(SeaError::Overflow)?;
    let pool = pool as u64;
    Ok((pool, amount.checked_sub(pool).ok_or(SeaError::Overflow)?))
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
    let (to_pool, to_treasury) = split(cfg.ticket_price, cfg.ticket_pool_bps)?;
    let decimals = ctx.accounts.skr_mint.decimals;
    for (to, amount) in [
        (&ctx.accounts.vault, to_pool),
        (&ctx.accounts.treasury, to_treasury),
    ] {
        if amount == 0 {
            continue;
        }
        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                TransferChecked {
                    mint: ctx.accounts.skr_mint.to_account_info(),
                    from: ctx.accounts.wallet_token.to_account_info(),
                    to: to.to_account_info(),
                    authority: ctx.accounts.wallet.to_account_info(),
                },
            ),
            amount,
            decimals,
        )?;
    }
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
}
