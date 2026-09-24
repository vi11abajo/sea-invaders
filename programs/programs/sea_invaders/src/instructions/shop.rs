//! The `Catalog` PDA and `purchase`: a small admin-managed
//! price list for the one-time cosmetic/gameplay items (Octopi
//! variants and skins), and the instruction that lets a player buy one of
//! them with SKR. Ownership is a bitmask on `Player.inventory` (one bit per
//! catalog item id), so an item can only ever be bought once per player.

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::{
    errors::SeaError,
    instructions::ticket::pay_split,
    state::*,
    time,
};

/// Copies `args.items` into a fixed-size `[CatalogItem; MAX_CATALOG_ITEMS]`
/// plus its live `count`, validating admin input the same way
/// `admin::validate` does for `ConfigArgs` (reusing `InvalidConfig` - this
/// is plain admin-input sanity checking, not one of the player-facing
/// purchase errors). Every `id` must be under 64 (`1u64 << id` in
/// `purchase` below would otherwise panic under this program's
/// `overflow-checks = true` release profile) and unique (otherwise
/// `find_item`'s linear scan would silently shadow a duplicate id with
/// whichever entry comes first).
fn build_items(args: &CatalogArgs) -> Result<([CatalogItem; MAX_CATALOG_ITEMS], u8)> {
    require!(
        args.items.len() <= MAX_CATALOG_ITEMS,
        SeaError::InvalidConfig
    );
    let mut seen_ids: u64 = 0;
    for it in &args.items {
        require!(it.kind <= 1, SeaError::InvalidConfig);
        require!(it.id < 64, SeaError::InvalidConfig);
        let bit = 1u64 << it.id;
        require!(seen_ids & bit == 0, SeaError::InvalidConfig);
        seen_ids |= bit;
    }
    let mut items = [CatalogItem::default(); MAX_CATALOG_ITEMS];
    items[..args.items.len()].copy_from_slice(&args.items);
    Ok((items, args.items.len() as u8))
}

/// Looks up an active-or-not catalog entry by its `id` field (not its slot
/// index - `set_catalog` can reorder or shrink the live `count` between
/// calls) among the first `count` entries.
fn find_item(catalog: &Catalog, item_id: u8) -> Result<CatalogItem> {
    catalog.items[..catalog.count as usize]
        .iter()
        .find(|it| it.id == item_id)
        .copied()
        .ok_or_else(|| error!(SeaError::UnknownItem))
}

#[derive(Accounts)]
pub struct InitCatalog<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump, has_one = admin)]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = admin,
        space = 8 + Catalog::INIT_SPACE,
        seeds = [b"catalog", CATALOG_SEED_VERSION],
        bump
    )]
    pub catalog: Account<'info, Catalog>,
    pub system_program: Program<'info, System>,
}

pub fn init_catalog(ctx: Context<InitCatalog>, args: CatalogArgs) -> Result<()> {
    let (items, count) = build_items(&args)?;
    let catalog = &mut ctx.accounts.catalog;
    catalog.admin = ctx.accounts.admin.key();
    catalog.items = items;
    catalog.count = count;
    catalog.bump = ctx.bumps.catalog;
    Ok(())
}

#[derive(Accounts)]
pub struct SetCatalog<'info> {
    pub admin: Signer<'info>,
    #[account(mut, seeds = [b"catalog", CATALOG_SEED_VERSION], bump = catalog.bump, has_one = admin)]
    pub catalog: Account<'info, Catalog>,
}

pub fn set_catalog(ctx: Context<SetCatalog>, args: CatalogArgs) -> Result<()> {
    let (items, count) = build_items(&args)?;
    let catalog = &mut ctx.accounts.catalog;
    catalog.items = items;
    catalog.count = count;
    Ok(())
}

#[derive(Accounts)]
pub struct Purchase<'info> {
    #[account(mut)]
    pub wallet: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump, has_one = skr_mint, has_one = treasury)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [b"player", wallet.key().as_ref()], bump = player.bump, has_one = wallet)]
    pub player: Account<'info, Player>,
    #[account(seeds = [b"catalog", CATALOG_SEED_VERSION], bump = catalog.bump)]
    pub catalog: Account<'info, Catalog>,
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

#[event]
pub struct ItemPurchased {
    pub wallet: Pubkey,
    pub item: u8,
    pub price: u64,
    pub week: u32,
}

/// Buys catalog item `item_id` for at most `max_price` base units (the
/// client's quoted price - `PriceChanged` if the admin has since raised it
/// past that ceiling). Splits the paid price `cfg.purchase_pool_bps` to the
/// current week's pool vault and the remainder to the treasury, exactly
/// like `buy_ticket`, then sets the item's bit in `player.inventory`.
pub fn purchase(ctx: Context<Purchase>, item_id: u8, max_price: u64) -> Result<()> {
    let cfg = &ctx.accounts.config;
    require!(!cfg.paused, SeaError::Paused);
    // Never call `Clock::get()` directly - `time::now` honours the
    // feature-gated test clock (see `src/time.rs`).
    let now = time::now(cfg)?;
    let week = time::week_of(time::day_of(now));
    require!(ctx.accounts.week_pool.week == week, SeaError::WrongWeekPool);

    let item = find_item(&ctx.accounts.catalog, item_id)?;
    require!(item.active, SeaError::ItemInactive);
    require!(item.price <= max_price, SeaError::PriceChanged);
    let bit = 1u64 << item.id;
    require!(
        ctx.accounts.player.inventory & bit == 0,
        SeaError::AlreadyOwned
    );

    pay_split(
        &ctx.accounts.token_program,
        &ctx.accounts.skr_mint,
        &ctx.accounts.wallet_token,
        &ctx.accounts.wallet,
        &ctx.accounts.vault,
        &ctx.accounts.treasury,
        item.price,
        cfg.purchase_pool_bps,
    )?;

    let p = &mut ctx.accounts.player;
    p.inventory |= bit;

    emit!(ItemPurchased {
        wallet: p.wallet,
        item: item.id,
        price: item.price,
        week,
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(id: u8, kind: u8) -> CatalogItem {
        CatalogItem { id, kind, price: 1, active: true }
    }

    fn args(items: Vec<CatalogItem>) -> CatalogArgs {
        CatalogArgs { items }
    }

    // The 65th item has id 64, so the id rule alone rejects this list: it
    // proves any 65-item list is refused, not that the length check is what
    // refuses it (with ids 0..63 all taken, a 65th must repeat an id or go
    // past 63).
    #[test]
    fn build_items_rejects_any_65_item_list() {
        let items: Vec<CatalogItem> = (0u8..(MAX_CATALOG_ITEMS as u8 + 1))
            .map(|id| item(id, 0))
            .collect();
        assert!(build_items(&args(items)).is_err());
    }

    #[test]
    fn build_items_rejects_an_unknown_kind() {
        assert!(build_items(&args(vec![item(0, 2)])).is_err());
    }

    #[test]
    fn build_items_rejects_an_id_of_64_or_more() {
        assert!(build_items(&args(vec![item(64, 0)])).is_err());
    }

    #[test]
    fn build_items_rejects_duplicate_ids() {
        assert!(build_items(&args(vec![item(3, 0), item(3, 1)])).is_err());
    }

    #[test]
    fn build_items_accepts_a_valid_list_and_reports_its_count() {
        let (arr, count) = build_items(&args(vec![item(5, 1), item(0, 0)])).unwrap();
        assert_eq!(count, 2);
        assert_eq!(arr[0].id, 5);
        assert_eq!(arr[1].id, 0);
    }

    #[test]
    fn find_item_looks_up_by_id_not_by_slot_index() {
        let (items, count) = build_items(&args(vec![item(5, 1), item(0, 0)])).unwrap();
        let catalog = Catalog { admin: Pubkey::default(), items, count, bump: 0 };
        // id 0 sits at slot 1, id 5 sits at slot 0 - `find_item` must
        // follow `id`, not array position.
        assert_eq!(find_item(&catalog, 0).unwrap().id, 0);
        assert_eq!(find_item(&catalog, 5).unwrap().id, 5);
        assert!(find_item(&catalog, 1).is_err());
    }
}
