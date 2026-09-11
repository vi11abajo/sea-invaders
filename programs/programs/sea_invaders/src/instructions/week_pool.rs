use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{Mint, TokenAccount, TokenInterface},
};

use crate::state::*;

#[derive(Accounts)]
#[instruction(week: u32)]
pub struct CreateWeekPool<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump, has_one = skr_mint)]
    pub config: Account<'info, Config>,
    pub skr_mint: InterfaceAccount<'info, Mint>,
    #[account(
        init,
        payer = payer,
        space = 8 + WeekPool::INIT_SPACE,
        seeds = [b"week", week.to_le_bytes().as_ref()],
        bump
    )]
    pub week_pool: Account<'info, WeekPool>,
    #[account(
        init,
        payer = payer,
        associated_token::mint = skr_mint,
        associated_token::authority = week_pool
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn create_week_pool(ctx: Context<CreateWeekPool>, week: u32) -> Result<()> {
    let pool = &mut ctx.accounts.week_pool;
    pool.week = week;
    pool.vault = ctx.accounts.vault.key();
    pool.top = [TopEntry::default(); 10];
    pool.top_len = 0;
    pool.settled = false;
    pool.bump = ctx.bumps.week_pool;
    Ok(())
}
