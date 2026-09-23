import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const runner = readFileSync(new URL('../migrations/run.js', import.meta.url), 'utf8');

describe('migration list', () => {
  it('runs 005 after 004', () => {
    const order = [...runner.matchAll(/'(\d{3}_[a-z_]+\.sql)'/g)].map((m) => m[1]);
    expect(order.indexOf('005_solana_ranked_runs.sql')).toBe(order.indexOf('004_farcaster_migration.sql') + 1);
  });

  it('005 creates ranked_runs and widens wallet_address', () => {
    const sql = readFileSync(new URL('../migrations/005_solana_ranked_runs.sql', import.meta.url), 'utf8');
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS ranked_runs/);
    expect(sql).toMatch(/ALTER COLUMN wallet_address TYPE VARCHAR\(64\)/);
    expect(sql).toMatch(/ALTER COLUMN discord_id DROP NOT NULL/);
  });

  it('runs 006 after 005', () => {
    const order = [...runner.matchAll(/'(\d{3}_[a-z_]+\.sql)'/g)].map((m) => m[1]);
    expect(order.indexOf('006_chain_records.sql')).toBe(order.indexOf('005_solana_ranked_runs.sql') + 1);
  });

  it('006 creates ranked_records', () => {
    const sql = readFileSync(new URL('../migrations/006_chain_records.sql', import.meta.url), 'utf8');
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS ranked_records/);
    expect(sql).toMatch(/PRIMARY KEY \(user_id, day\)/);
  });

  it('runs 007 after 006', () => {
    const order = [...runner.matchAll(/'(\d{3}_[a-z_]+\.sql)'/g)].map((m) => m[1]);
    expect(order.indexOf('007_campaign_progress.sql')).toBe(order.indexOf('006_chain_records.sql') + 1);
  });

  it('007 creates campaign_progress', () => {
    const sql = readFileSync(new URL('../migrations/007_campaign_progress.sql', import.meta.url), 'utf8');
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS campaign_progress/);
    expect(sql).toMatch(/user_id INTEGER PRIMARY KEY REFERENCES users\(id\)/);
  });

  it('runs 008 after 007', () => {
    const order = [...runner.matchAll(/'(\d{3}_[a-z_]+\.sql)'/g)].map((m) => m[1]);
    expect(order.indexOf('008_loadout.sql')).toBe(order.indexOf('007_campaign_progress.sql') + 1);
  });

  it('008 creates player_loadout', () => {
    const sql = readFileSync(new URL('../migrations/008_loadout.sql', import.meta.url), 'utf8');
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS player_loadout/);
    expect(sql).toMatch(/wallet_address VARCHAR\(64\) PRIMARY KEY/);
  });

  it('runs 009 after 008', () => {
    const order = [...runner.matchAll(/'(\d{3}_[a-z_]+\.sql)'/g)].map((m) => m[1]);
    expect(order.indexOf('009_run_skin.sql')).toBe(order.indexOf('008_loadout.sql') + 1);
  });

  it('009 adds a skin column to ranked_runs, defaulting to 0 and constrained to the loadout skin scale', () => {
    const sql = readFileSync(new URL('../migrations/009_run_skin.sql', import.meta.url), 'utf8');
    expect(sql).toMatch(/ALTER TABLE ranked_runs ADD COLUMN IF NOT EXISTS skin SMALLINT NOT NULL DEFAULT 0/);
    expect(sql).toMatch(/CHECK \(skin BETWEEN 0 AND 4\)/);
  });

  it('runs 010 after 009', () => {
    const order = [...runner.matchAll(/'(\d{3}_[a-z_]+\.sql)'/g)].map((m) => m[1]);
    expect(order.indexOf('010_seeker.sql')).toBe(order.indexOf('009_run_skin.sql') + 1);
  });

  it('runs 011 after 010', () => {
    const order = [...runner.matchAll(/'(\d{3}_[a-z_]+\.sql)'/g)].map((m) => m[1]);
    expect(order.indexOf('011_run_update_required.sql')).toBe(order.indexOf('010_seeker.sql') + 1);
  });

  it('011 lets a ranked run carry the update_required status', () => {
    const sql = readFileSync(new URL('../migrations/011_run_update_required.sql', import.meta.url), 'utf8');
    expect(sql).toMatch(/CHECK \(status IN \('started', 'verified', 'rejected', 'update_required'\)\)/);
    // 005 declared the status CHECK inline, so Postgres named it: the migration drops it by lookup.
    expect(sql).toMatch(/FROM pg_constraint/);
    expect(sql).not.toMatch(/DROP CONSTRAINT ranked_runs_status_check/);
  });

  it('010 mirrors the Seeker link on users: a nullable, unique mint and the time it was linked', () => {
    const sql = readFileSync(new URL('../migrations/010_seeker.sql', import.meta.url), 'utf8');
    expect(sql).toMatch(/ALTER TABLE users ADD COLUMN IF NOT EXISTS seeker_mint VARCHAR\(64\)/);
    expect(sql).toMatch(/ALTER TABLE users ADD COLUMN IF NOT EXISTS seeker_linked_at TIMESTAMPTZ/);
    // One token, one player: the chain enforces it via the SeekerLink PDA, the mirror via this index.
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS .*seeker_mint/);
    // Additive on a live table: both columns stay nullable, so the migration needs no backfill.
    expect(sql).not.toMatch(/ADD COLUMN[^;]*NOT NULL/);
  });

  it('runs 012 after 011', () => {
    const order = [...runner.matchAll(/'(\d{3}_[a-z_]+\.sql)'/g)].map((m) => m[1]);
    expect(order.indexOf('012_run_skin_range.sql')).toBe(order.indexOf('011_run_update_required.sql') + 1);
  });

  it('012 widens ranked_runs.skin to the 18-code scale', () => {
    const sql = readFileSync(new URL('../migrations/012_run_skin_range.sql', import.meta.url), 'utf8');
    expect(sql).toMatch(/ADD CONSTRAINT ranked_runs_skin_check CHECK \(skin BETWEEN 0 AND 17\)/);
    // 009 declared the 0..4 CHECK inline, so Postgres named it: like 011, the migration drops the old
    // ranked_runs_skin_check by lookup, matching only the CHECK that names the skin column.
    expect(sql).toMatch(/FROM pg_constraint/);
    expect(sql).toMatch(/ILIKE '%skin%'/);
  });
});
