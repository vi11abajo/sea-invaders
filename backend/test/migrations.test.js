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
});
