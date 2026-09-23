// Exercises the real SQL modules behind the concurrency guards against a mocked `pg` pool (the
// in-memory stand-ins other tests use cannot show which statements run, or in what order): the
// locked count-and-insert that starts a ranked run, the finish that only closes a started run, and
// the first sign-in that survives a second insert of the same wallet.
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Every statement sent, in order, with `client` marking the ones sent on a checked-out connection. */
const statements = [];
/** Scripted answers: the first matcher whose pattern a statement contains supplies the result. */
let answers = [];
let released = 0;

function answer(sql, params, client) {
  statements.push({ sql: sql.replace(/\s+/g, ' ').trim(), params, client });
  const match = answers.find(([pattern]) => sql.includes(pattern));
  if (!match) return { rows: [], rowCount: 0 };
  const result = match[1];
  if (result instanceof Error) throw result;
  return result;
}

vi.mock('../src/config/database.js', () => ({
  default: {
    query: async (sql, params) => answer(sql, params, false),
    connect: async () => ({
      query: async (sql, params) => answer(sql, params, true),
      release: () => {
        released += 1;
      },
    }),
  },
}));

const runs = await import('../src/db/rankedRuns.js');
const users = await import('../src/db/users.js');

const RUN = { id: 'run-1', userId: 7, day: 20700, seed: 'seed', coreVersion: 13, startedAt: 1_788_000_000, skin: 2 };
const sqlOf = () => statements.map((s) => s.sql);

beforeEach(() => {
  statements.length = 0;
  answers = [];
  released = 0;
});

describe('db/rankedRuns.js insertRunWithinAttempts', () => {
  it('counts and inserts inside one transaction, under the user\'s advisory lock', async () => {
    answers = [['COUNT(*)', { rows: [{ n: 1 }] }]];
    await expect(runs.insertRunWithinAttempts(RUN, 3)).resolves.toEqual({ inserted: true, used: 1 });
    const sql = sqlOf();
    expect(sql[0]).toBe('BEGIN');
    expect(sql[1]).toBe('SELECT pg_advisory_xact_lock(hashtext($1))');
    expect(statements[1].params).toEqual(['ranked_runs:7']);
    expect(sql[2]).toContain('SELECT COUNT(*)::int AS n FROM ranked_runs');
    expect(sql[3]).toContain('INSERT INTO ranked_runs');
    expect(statements[3].params).toEqual(['run-1', 7, 20700, 'seed', 13, new Date(RUN.startedAt * 1000).toISOString(), 2]);
    expect(sql[4]).toBe('COMMIT');
    expect(statements.every((s) => s.client)).toBe(true);
    expect(released).toBe(1);
  });

  it('inserts nothing and rolls back once the day\'s attempts are spent', async () => {
    answers = [['COUNT(*)', { rows: [{ n: 3 }] }]];
    await expect(runs.insertRunWithinAttempts(RUN, 3)).resolves.toEqual({ inserted: false, used: 3 });
    expect(sqlOf()).toEqual(['BEGIN', 'SELECT pg_advisory_xact_lock(hashtext($1))', expect.stringContaining('COUNT(*)'), 'ROLLBACK']);
    expect(released).toBe(1);
  });

  it('rolls back, releases the connection and rethrows when a statement fails', async () => {
    answers = [['COUNT(*)', { rows: [{ n: 0 }] }], ['INSERT INTO', new Error('insert failed')]];
    await expect(runs.insertRunWithinAttempts(RUN, 3)).rejects.toThrow('insert failed');
    expect(sqlOf().at(-1)).toBe('ROLLBACK');
    expect(released).toBe(1);
  });
});

describe('db/rankedRuns.js finishRun', () => {
  it('only closes a run that is still started, and says whether it did', async () => {
    answers = [['UPDATE ranked_runs', { rows: [], rowCount: 1 }]];
    await expect(runs.finishRun('run-1', { finishedAt: 1_788_000_100, status: 'verified', score: 10 })).resolves.toBe(true);
    expect(sqlOf()[0]).toContain("WHERE id = $1 AND status = 'started'");

    answers = [['UPDATE ranked_runs', { rows: [], rowCount: 0 }]];
    await expect(runs.finishRun('run-1', { finishedAt: 1_788_000_101, status: 'rejected' })).resolves.toBe(false);
  });
});

describe('db/users.js findOrCreateWalletUser', () => {
  const WALLET = 'Ab12xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxCd34';
  const ROW = { id: 7, wallet_address: WALLET, username: 'Ab12...Cd34' };

  it('returns the existing user without inserting', async () => {
    answers = [['SELECT id, wallet_address, username FROM users', { rows: [ROW] }]];
    await expect(users.findOrCreateWalletUser(WALLET)).resolves.toEqual(ROW);
    expect(statements).toHaveLength(1);
  });

  it('inserts a first-time wallet without failing on the unique index', async () => {
    answers = [['INSERT INTO users', { rows: [ROW] }]];
    await expect(users.findOrCreateWalletUser(WALLET)).resolves.toEqual(ROW);
    expect(sqlOf()[1]).toContain('ON CONFLICT (wallet_address) WHERE wallet_address IS NOT NULL DO NOTHING');
    expect(statements[1].params).toEqual([WALLET, 'Ab12...Cd34']);
  });

  it('reads the row a concurrent first sign-in inserted when its own insert does nothing', async () => {
    let selects = 0;
    answers = [
      ['INSERT INTO users', { rows: [] }],
      ['SELECT id, wallet_address, username FROM users', {
        get rows() {
          selects += 1;
          return selects === 1 ? [] : [ROW];
        },
      }],
    ];
    await expect(users.findOrCreateWalletUser(WALLET)).resolves.toEqual(ROW);
    expect(sqlOf().map((sql) => sql.split(' ')[0])).toEqual(['SELECT', 'INSERT', 'SELECT']);
  });
});
