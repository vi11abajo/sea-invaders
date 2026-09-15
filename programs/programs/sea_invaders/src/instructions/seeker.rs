//! `link_seeker` (design §2): links a Seeker Genesis Token mint to a
//! player's wallet, setting a permanent on-chain badge flag
//! (`Player.seeker`). The badge changes nothing else - no scores, no
//! prices, no attempts. The devnet program cannot read mainnet itself, so
//! the server co-signs to attest that a mainnet read (the backend's job,
//! outside this program) found the token on the wallet; the wallet signs
//! so only the player themselves can link their own `Player` account - the
//! same dual-signature shape as `submit_daily_best` (`record.rs`). One mint
//! can only ever back one `SeekerLink` (the PDA's `init` fails if the mint
//! is already linked to anyone - the chain's own anti-sybil rule) and one
//! player can only ever link once (`SeekerAlreadyLinked`). There is no
//! unlink.

use anchor_lang::prelude::*;

use crate::{errors::SeaError, state::*, time};

#[derive(Accounts)]
#[instruction(sgt_mint: Pubkey)]
pub struct LinkSeeker<'info> {
    #[account(mut)]
    pub wallet: Signer<'info>,
    pub server_authority: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump, has_one = server_authority)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [b"player", wallet.key().as_ref()], bump = player.bump, has_one = wallet)]
    pub player: Account<'info, Player>,
    #[account(
        init,
        payer = wallet,
        space = 8 + SeekerLink::INIT_SPACE,
        seeds = [b"seeker", sgt_mint.as_ref()],
        bump
    )]
    pub seeker_link: Account<'info, SeekerLink>,
    pub system_program: Program<'info, System>,
}

#[event]
pub struct SeekerLinked {
    pub wallet: Pubkey,
    pub sgt_mint: Pubkey,
    pub linked_at: i64,
}

pub fn link_seeker(ctx: Context<LinkSeeker>, sgt_mint: Pubkey) -> Result<()> {
    let cfg = &ctx.accounts.config;
    require!(!cfg.paused, SeaError::Paused);
    require!(
        !ctx.accounts.player.seeker,
        SeaError::SeekerAlreadyLinked
    );
    // Never call `Clock::get()` directly - `time::now` honours the
    // feature-gated test clock (see `src/time.rs`).
    let now = time::now(cfg)?;

    let p = &mut ctx.accounts.player;
    p.seeker = true;
    let wallet = p.wallet;

    let link = &mut ctx.accounts.seeker_link;
    link.sgt_mint = sgt_mint;
    link.player = wallet;
    link.linked_at = now;
    link.bump = ctx.bumps.seeker_link;

    emit!(SeekerLinked { wallet, sgt_mint, linked_at: now });
    Ok(())
}
