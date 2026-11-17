import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIpRisk, checkIpRisk } from '../src/main/core/ipRisk';

test('IP risk requires a valid provider response and keeps unknown distinct from zero', () => {
  const ip = '8.8.8.8';
  assert.deepEqual(parseIpRisk(ip, { status: 'ok', [ip]: { risk: 0, proxy: 'no', type: 'Business' } }), { ip, score: 0, proxy: 'no', type: 'Business' });
  for (const data of [{ status: 'denied' }, { status: 'ok', [ip]: {} }, { status: 'ok', [ip]: { risk: 101 } }, { status: 'ok', [ip]: { risk: '0' } }]) {
    assert.throws(() => parseIpRisk(ip, data));
  }
});

test('IP risk rejects non-IP input before making a request', async () => {
  await assert.rejects(checkIpRisk('proxycheck.io/evil'), /valid exit IP/);
});
