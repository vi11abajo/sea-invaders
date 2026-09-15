import { expect } from "chai";
import { Keypair } from "@solana/web3.js";
import { airdrop, Ctx, setup } from "./helpers";
import {
  createPlayer,
  fetchPlayer,
  fetchSeekerLink,
  getEvent,
  initConfig,
  linkSeeker,
  linkSeekerIx,
} from "./fixtures";

const LAMPORTS_PER_SOL = 1_000_000_000;

// A fresh, funded player with its own on-chain `Player` account - used
// instead of `ctx.alice`/`ctx.bob` so every test case below gets an
// independent wallet (a player can only ever link once, and a mint can
// only ever be linked once, so reusing wallets/mints across cases would
// couple them together).
async function freshPlayer(ctx: Ctx): Promise<Keypair> {
  const kp = Keypair.generate();
  await airdrop(ctx.connection, kp.publicKey, 10 * LAMPORTS_PER_SOL);
  await createPlayer(ctx, kp);
  return kp;
}

describe("link_seeker", () => {
  let ctx: Ctx;

  before(async () => {
    ctx = await setup();
    await initConfig(ctx);
  });

  it("links a Seeker Genesis Token, sets player.seeker, fills SeekerLink, and emits SeekerLinked", async () => {
    const who = await freshPlayer(ctx);
    const sgtMint = Keypair.generate().publicKey;

    const now = await ctx.now();
    const sig = await linkSeeker(ctx, who, sgtMint);

    const p = await fetchPlayer(ctx, who);
    expect(p.seeker).to.be.true;

    const link = await fetchSeekerLink(ctx, sgtMint);
    expect(link.sgtMint.equals(sgtMint)).to.be.true;
    expect(link.player.equals(who.publicKey)).to.be.true;
    expect(link.linkedAt.toNumber()).to.equal(now);

    const event = await getEvent(ctx, sig, "seekerLinked");
    expect(event.wallet.equals(who.publicKey)).to.be.true;
    expect(event.sgtMint.equals(sgtMint)).to.be.true;
    expect(event.linkedAt.toNumber()).to.equal(now);
  });

  it("a second player linking an already-linked mint fails at init, and their own seeker flag stays false", async () => {
    const holder = await freshPlayer(ctx);
    const impostor = await freshPlayer(ctx);
    const sgtMint = Keypair.generate().publicKey;

    await linkSeeker(ctx, holder, sgtMint);

    let err = "";
    try {
      await linkSeeker(ctx, impostor, sgtMint);
    } catch (e: any) {
      err = e.message;
    }
    expect(err).to.not.equal("");

    const p = await fetchPlayer(ctx, impostor);
    expect(p.seeker).to.be.false;
  });

  it("a player already linked fails with SeekerAlreadyLinked when linking a different mint", async () => {
    const who = await freshPlayer(ctx);
    await linkSeeker(ctx, who, Keypair.generate().publicKey);

    let err = "";
    try {
      await linkSeeker(ctx, who, Keypair.generate().publicKey);
    } catch (e: any) {
      err = e.message;
    }
    expect(err).to.contain("SeekerAlreadyLinked");
  });

  it("fails without the server authority's signature", async () => {
    const who = await freshPlayer(ctx);
    const sgtMint = Keypair.generate().publicKey;
    const ix = await linkSeekerIx(ctx, who, sgtMint);

    let err = "";
    try {
      await ctx.send([ix], [who]); // no ctx.server co-signer
    } catch (e: any) {
      err = e.message;
    }
    expect(err).to.not.equal("");
  });

  it("fails with Paused while the program is paused", async () => {
    const who = await freshPlayer(ctx);
    const sgtMint = Keypair.generate().publicKey;

    // `config` is a singleton shared with every other test file/case on
    // this validator, so it must be un-paused again no matter how the
    // assertion below turns out.
    let err = "";
    try {
      await ctx.send(
        [
          await ctx.program.methods
            .setPaused(true)
            .accounts({ admin: ctx.admin.publicKey })
            .instruction(),
        ],
        [ctx.admin]
      );
      try {
        await linkSeeker(ctx, who, sgtMint);
      } catch (e: any) {
        err = e.message;
      }
    } finally {
      await ctx.send(
        [
          await ctx.program.methods
            .setPaused(false)
            .accounts({ admin: ctx.admin.publicKey })
            .instruction(),
        ],
        [ctx.admin]
      );
    }
    expect(err).to.contain("Paused");
  });
});
