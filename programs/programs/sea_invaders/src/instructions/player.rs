use anchor_lang::prelude::*;

use crate::state::*;

#[derive(Accounts)]
pub struct CreatePlayer<'info> {
    #[account(mut)]
    pub wallet: Signer<'info>,
    #[account(
        init,
        payer = wallet,
        space = 8 + Player::INIT_SPACE,
        seeds = [b"player", wallet.key().as_ref()],
        bump
    )]
    pub player: Account<'info, Player>,
    pub system_program: Program<'info, System>,
}

pub fn create_player(ctx: Context<CreatePlayer>) -> Result<()> {
    let p = &mut ctx.accounts.player;
    p.wallet = ctx.accounts.wallet.key();
    p.bump = ctx.bumps.player;
    Ok(())
}
