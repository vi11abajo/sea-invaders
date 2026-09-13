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
});
