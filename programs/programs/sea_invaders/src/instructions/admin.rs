use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;

use crate::{errors::SeaError, state::*};

fn validate(args: &ConfigArgs) -> Result<()> {
    let sum: u32 = args.payout_bps.iter().map(|&b| b as u32).sum();
    require!(sum == 10_000, SeaError::InvalidConfig);
    require!(
        args.ticket_pool_bps <= 10_000 && args.purchase_pool_bps <= 10_000,
        SeaError::InvalidConfig
    );
    require!(
        args.ticket_price > 0 && args.attempts_per_ticket > 0,
        SeaError::InvalidConfig
    );
    require!(
        args.revive_ladder.windows(2).all(|w| w[0] <= w[1]),
        SeaError::InvalidConfig
    );
    Ok(())
}

fn apply(cfg: &mut Config, args: &ConfigArgs) {
    cfg.server_authority = args.server_authority;
    cfg.treasury = args.treasury;
    cfg.ticket_price = args.ticket_price;
    cfg.attempts_per_ticket = args.attempts_per_ticket;
    cfg.ticket_pool_bps = args.ticket_pool_bps;
    cfg.purchase_pool_bps = args.purchase_pool_bps;
    cfg.revive_ladder = args.revive_ladder;
    cfg.ebb_seconds = args.ebb_seconds;
    cfg.grace_seconds = args.grace_seconds;
    cfg.payout_bps = args.payout_bps;
}

#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init,
        payer = admin,
        space = 8 + Config::INIT_SPACE,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,
    pub skr_mint: InterfaceAccount<'info, Mint>,
    /// The program's own account; used only to resolve and pin `program_data` below.
    #[account(constraint = program.programdata_address()? == Some(program_data.key()))]
    pub program: Program<'info, crate::program::SeaInvaders>,
    /// Must belong to `program` and its `upgrade_authority_address` must be `admin` — the
    /// standard Anchor pattern for restricting an instruction to a program's upgrade
    /// authority. This closes the window between `anchor deploy` and running the init
    /// script where anyone could otherwise claim the singleton `config` PDA.
    #[account(constraint = program_data.upgrade_authority_address == Some(admin.key()) @ SeaError::NotUpgradeAuthority)]
    pub program_data: Account<'info, ProgramData>,
    pub system_program: Program<'info, System>,
}

pub fn init_config(ctx: Context<InitConfig>, args: ConfigArgs) -> Result<()> {
    validate(&args)?;
    let cfg = &mut ctx.accounts.config;
    cfg.admin = ctx.accounts.admin.key();
    cfg.skr_mint = ctx.accounts.skr_mint.key();
    cfg.paused = false;
    cfg.bump = ctx.bumps.config;
    cfg.clock_override = 0;
    apply(cfg, &args);
    Ok(())
}

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    pub admin: Signer<'info>,
    #[account(mut, seeds = [b"config"], bump = config.bump, has_one = admin)]
    pub config: Account<'info, Config>,
}

pub fn update_config(ctx: Context<AdminOnly>, args: ConfigArgs) -> Result<()> {
    validate(&args)?;
    apply(&mut ctx.accounts.config, &args);
    Ok(())
}

pub fn set_paused(ctx: Context<AdminOnly>, paused: bool) -> Result<()> {
    ctx.accounts.config.paused = paused;
    Ok(())
}

/// Test-only: lets the admin pin the clock `time::now` reads instead of the
/// real `Clock` sysvar. Compiled only under the `test-clock` feature, so it
/// never ships in a production build.
#[cfg(feature = "test-clock")]
pub fn set_test_clock(ctx: Context<AdminOnly>, unix_ts: i64) -> Result<()> {
    ctx.accounts.config.clock_override = unix_ts;
    Ok(())
}
