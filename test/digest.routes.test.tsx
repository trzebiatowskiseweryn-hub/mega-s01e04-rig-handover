import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

const line = (job: string, status: string, at: string, extra: object = {}) =>
  JSON.stringify({ at, job, status, owner: 'ola', ...extra });

const NORMAL = '2026-01-10';
const EMPTY = '2026-01-11';
const BAD = '2026-01-12';
const MISSING = '2026-01-13';

let dir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  writeFileSync(
    join(dir, `${NORMAL}.jsonl`),
    [
      line('zeta-sync', 'ok', '2026-01-10T02:00:00+01:00'),
      line('alpha-backup', 'retry', '2026-01-10T02:05:00+01:00', { error: 'timeout' }),
      line('alpha-backup', 'ok', '2026-01-10T02:10:00+01:00'),
      line('mid-report', 'fail', '2026-01-10T03:00:00+01:00', { error: 'boom' }),
    ].join('\n') + '\n',
  );
  writeFileSync(join(dir, `${EMPTY}.jsonl`), '');
  writeFileSync(
    join(dir, `${BAD}.jsonl`),
    [
      line('b-job', 'ok', '2026-01-12T02:00:00+01:00'),
      'not json at all',
      line('a-job', 'ok', '2026-01-12T02:01:00+01:00'),
    ].join('\n') + '\n',
  );
  app = createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: dir });
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

// Position of each job in the page; ascending positions mean the page lists them in that order.
const positions = (html: string, jobs: string[]) => jobs.map((j) => html.indexOf(j));
const inOrder = (at: number[]) => at.every((i) => i >= 0) && at.every((v, i) => i === 0 || v > at[i - 1]!);

describe('GET /digest/:night', () => {
  it('renders one table with rows sorted by job', async () => {
    const res = await app.request(`/digest/${NORMAL}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html.match(/<table/g)).toHaveLength(1);
    expect(inOrder(positions(html, ['alpha-backup', 'mid-report', 'zeta-sync']))).toBe(true);
  });

  it('404 for a night with no file', async () => {
    expect((await app.request(`/digest/${MISSING}`)).status).toBe(404);
  });

  it('says "nothing ran" for an empty file', async () => {
    const res = await app.request(`/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('still renders the good rows when a line is bad', async () => {
    const res = await app.request(`/digest/${BAD}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('a-job');
    expect(html).toContain('b-job');
  });
});

describe('GET /api/digest/:night', () => {
  it('returns the Night object', async () => {
    const res = await app.request(`/api/digest/${NORMAL}`);
    const body = (await res.json()) as Night;
    expect(res.status).toBe(200);
    expect(body.night).toBe(NORMAL);
    expect(body.rows.map((r) => r.job)).toEqual(['alpha-backup', 'mid-report', 'zeta-sync']);
    expect(body.badLines).toBe(0);
    expect(body.counts).toEqual({ ok: 2, retry: 1, fail: 1 });
  });

  it('404 with a JSON error for a night with no file', async () => {
    const res = await app.request(`/api/digest/${MISSING}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toHaveProperty('error');
  });

  it('empty file gives no rows', async () => {
    const res = await app.request(`/api/digest/${EMPTY}`);
    const body = (await res.json()) as Night;
    expect(res.status).toBe(200);
    expect(body.rows).toEqual([]);
  });

  it('counts a bad line and keeps the good rows', async () => {
    const body = (await (await app.request(`/api/digest/${BAD}`)).json()) as Night;
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['a-job', 'b-job']);
  });
});

describe('page and JSON agree', () => {
  it('list the same jobs in the same order', async () => {
    const html = await (await app.request(`/digest/${NORMAL}`)).text();
    const body = (await (await app.request(`/api/digest/${NORMAL}`)).json()) as Night;
    expect(inOrder(positions(html, body.rows.map((r) => r.job)))).toBe(true);
  });
});
