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
    // `init_if_needed`, not `init`: the vault's address is fixed by the week
    // number and the mint alone, and the associated token program's plain
    // create needs no signature from the owner, so anyone can create this
    // account before the pool exists. With `init`, that one cheap
    // transaction would make `create_week_pool` fail for that week forever,
    // and every instruction that needs the week (tickets, records, the shop,
    // the Tide, and settling the week before it) would go with it. An
    // account that already exists is still checked against the same mint,
    // authority and associated address, and that address can only ever
    // hold this mint's account for this pool, so a pre-created vault is
    // exactly the one this would have made. (A plain comment rather than a
    // doc comment keeps the IDL unchanged.)
    #[account(
        init_if_needed,
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
