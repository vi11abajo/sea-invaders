//! `fund_pool` (spec §5.5) lets anyone top up a week's pool vault directly
//! (no ticket, no attempts bought - just SKR in), and `settle_week`
//! (spec §5.6) is the permissionless payout once a week's grace window has
//! closed: it pays the top-10 list their `payout_bps` share of the vault
//! (creating a winner's ATA when missing), and rolls whatever the empty
//! places would have earned into the next week's pool so nothing is ever
//! burned or lost by a light week.

use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::{create, get_associated_token_address_with_program_id, AssociatedToken, Create},
    token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked},
};

use crate::{errors::SeaError, state::*, time};

/// A single winner's payout share of `balance` at `bps` out of 10 000,
/// rounded down - see global-constraints.md's bps math rule (`u128`
/// intermediate, `checked_*` everywhere). `bps` is always one of
/// `Config::payout_bps`'s ten entries (each `<= 10_000`), so the result
/// never exceeds `balance` and always fits back into a `u64`.
pub fn share_of(balance: u64, bps: u16) -> Result<u64> {
    let share = (balance as u128)
        .checked_mul(bps as u128)
        .ok_or(SeaError::Overflow)?
        .checked_div(10_000)
        .ok_or(SeaError::Overflow)?;
    Ok(share as u64)
}

#[derive(Accounts)]
pub struct FundPool<'info> {
    #[account(mut)]
    pub funder: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump, has_one = skr_mint)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [b"week", week_pool.week.to_le_bytes().as_ref()], bump = week_pool.bump, has_one = vault)]
    pub week_pool: Account<'info, WeekPool>,
    #[account(mut)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = skr_mint, token::authority = funder)]
    pub funder_token: InterfaceAccount<'info, TokenAccount>,
    pub skr_mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
}

/// Anyone can top up the current week's pool - no ticket, no attempts, just
/// SKR moved straight into the vault. `week_pool` is checked against
/// "today"'s week (`time::now`, never `Clock::get()` - see `time.rs`) the
/// same way `buy_ticket` checks it against the day it is called for.
pub fn fund_pool(ctx: Context<FundPool>, amount: u64) -> Result<()> {
    let cfg = &ctx.accounts.config;
    require!(!cfg.paused, SeaError::Paused);
    let now = time::now(cfg)?;
    let week = time::week_of(time::day_of(now));
    require!(ctx.accounts.week_pool.week == week, SeaError::WrongWeekPool);
    let decimals = ctx.accounts.skr_mint.decimals;
    token_interface::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            TransferChecked {
                mint: ctx.accounts.skr_mint.to_account_info(),
                from: ctx.accounts.funder_token.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.funder.to_account_info(),
            },
        ),
        amount,
        decimals,
    )?;
    Ok(())
}

#[derive(Accounts)]
pub struct SettleWeek<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump, has_one = skr_mint)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [b"week", week_pool.week.to_le_bytes().as_ref()], bump = week_pool.bump, has_one = vault)]
    pub week_pool: Account<'info, WeekPool>,
    #[account(mut)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    // Self-referential seed, same reason `week_pool`'s is (this Anchor
    // 1.2.0 fork's IDL builder cannot express a seed that calls a
    // program-defined function like `week + 1` - see `record.rs`); the
    // handler checks `next_week_pool.week == week + 1` explicitly below.
    #[account(seeds = [b"week", next_week_pool.week.to_le_bytes().as_ref()], bump = next_week_pool.bump)]
    pub next_week_pool: Account<'info, WeekPool>,
    // `has_one = vault` above already claims the name `vault` for
    // `week_pool`'s own token account, so `next_week_pool`'s is checked by
    // address instead of a second `has_one`.
    #[account(mut, address = next_week_pool.vault)]
    pub next_vault: InterfaceAccount<'info, TokenAccount>,
    pub skr_mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// Permissionless: anyone can call this once a week's grace window has
/// passed. Pays each of the (at most 10) top entries its configured share
/// of the vault, creating the winner's ATA first when it does not already
/// exist, and rolls whatever is left over (the shares of any unfilled
/// ranks, plus rounding dust) into next week's vault. `remaining_accounts`
/// carries `top_len` `(wallet, ata)` pairs in the pool's own `top` order -
/// wrong order, a wrong wallet or a foreign ATA all fail `WinnerMismatch`.
pub fn settle_week<'info>(
    ctx: Context<'info, SettleWeek<'info>>,
    week: u32,
) -> Result<()> {
    let cfg = &ctx.accounts.config;
    require!(!cfg.paused, SeaError::Paused);
    // Never call `Clock::get()` directly - `time::now` honours the
    // feature-gated test clock (see `src/time.rs`).
    let now = time::now(cfg)?;
    require!(
        now >= time::week_end(week) + cfg.grace_seconds as i64,
        SeaError::WeekNotFinished
    );
    require!(ctx.accounts.week_pool.week == week, SeaError::WrongWeekPool);
    require!(
        ctx.accounts.next_week_pool.week == week + 1,
        SeaError::WrongWeekPool
    );

    let pool = &ctx.accounts.week_pool;
    require!(!pool.settled, SeaError::AlreadySettled);
    let n = pool.top_len as usize;
    require!(
        ctx.remaining_accounts.len() == n * 2,
        SeaError::WinnerMismatch
    );

    let balance = ctx.accounts.vault.amount;
    let seeds: &[&[u8]] = &[b"week", &week.to_le_bytes(), &[pool.bump]];
    let decimals = ctx.accounts.skr_mint.decimals;
    let mint_key = cfg.skr_mint;
    let token_program_key = ctx.accounts.token_program.key();

    let mut paid: u64 = 0;
    for i in 0..n {
        let entry = pool.top[i];
        let wallet_ai = &ctx.remaining_accounts[i * 2];
        let ata_ai = &ctx.remaining_accounts[i * 2 + 1];
        require!(wallet_ai.key() == entry.player, SeaError::WinnerMismatch);
        let expected = get_associated_token_address_with_program_id(
            &entry.player,
            &mint_key,
            &token_program_key,
        );
        require!(ata_ai.key() == expected, SeaError::WinnerMismatch);

        if ata_ai.data_is_empty() {
            create(CpiContext::new(
                ctx.accounts.associated_token_program.key(),
                Create {
                    payer: ctx.accounts.caller.to_account_info(),
                    associated_token: ata_ai.clone(),
                    authority: wallet_ai.clone(),
                    mint: ctx.accounts.skr_mint.to_account_info(),
                    system_program: ctx.accounts.system_program.to_account_info(),
                    token_program: ctx.accounts.token_program.to_account_info(),
                },
            ))?;
        }

        let share = share_of(balance, cfg.payout_bps[i])?;
        if share > 0 {
            token_interface::transfer_checked(
                CpiContext::new_with_signer(
                    token_program_key,
                    TransferChecked {
                        mint: ctx.accounts.skr_mint.to_account_info(),
                        from: ctx.accounts.vault.to_account_info(),
                        to: ata_ai.clone(),
                        authority: ctx.accounts.week_pool.to_account_info(),
                    },
                    &[seeds],
                ),
                share,
                decimals,
            )?;
            paid = paid.checked_add(share).ok_or(SeaError::Overflow)?;
        }
    }

    let rest = balance.checked_sub(paid).ok_or(SeaError::Overflow)?;
    if rest > 0 {
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                token_program_key,
                TransferChecked {
                    mint: ctx.accounts.skr_mint.to_account_info(),
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.next_vault.to_account_info(),
                    authority: ctx.accounts.week_pool.to_account_info(),
                },
                &[seeds],
            ),
            rest,
            decimals,
        )?;
    }

    ctx.accounts.week_pool.settled = true;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn share_of_30_percent_of_a_round_balance() {
        assert_eq!(share_of(30_000_000, 3_000).unwrap(), 9_000_000);
    }

    #[test]
    fn share_of_matches_the_brief_rounding_example() {
        // 1_000_001 at 3000 bps (30 %) floors to 300_000, leaving 700_001
        // to roll over - the exact values from the Task 5 brief's rounding
        // test. Unreachable as a full on-chain integration test: the
        // smallest possible non-zero contribution to any week's vault is
        // one ticket's pool share (9_500_000, from the shared config's
        // fixed `ticket_price`/`ticket_pool_bps`), already bigger than
        // this whole balance - see settle.test.ts's own rounding test for
        // the on-chain equivalent at an achievable balance.
        let share = share_of(1_000_001, 3_000).unwrap();
        assert_eq!(share, 300_000);
        assert_eq!(1_000_001 - share, 700_001);
    }

    #[test]
    fn share_of_zero_bps_is_zero() {
        assert_eq!(share_of(30_000_000, 0).unwrap(), 0);
    }
}
