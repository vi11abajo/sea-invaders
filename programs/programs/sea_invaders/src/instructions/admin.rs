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
    pub system_program: Program<'info, System>,
}

pub fn init_config(ctx: Context<InitConfig>, args: ConfigArgs) -> Result<()> {
    validate(&args)?;
    let cfg = &mut ctx.accounts.config;
    cfg.admin = ctx.accounts.admin.key();
    cfg.skr_mint = ctx.accounts.skr_mint.key();
    cfg.paused = false;
    cfg.bump = ctx.bumps.config;
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
