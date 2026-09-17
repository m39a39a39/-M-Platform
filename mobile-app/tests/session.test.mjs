import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, SessionError } from '../src/session-core.js';

function makeResponse(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async json() { return body; }
  };
}

function memoryStorage(initial = null) {
  let value = initial;
  return {
    async get() { return value; },
    async set(next) { value = next; },
    async remove() { value = null; },
    peek() { return value; }
  };
}

test('restore returns false when no saved session exists', async () => {
  const storage = memoryStorage(null);
  const session = createSession({ storage, fetchImpl: async () => { throw new Error('unexpected fetch'); } });
  assert.equal(await session.restore(), false);
  assert.equal(session.active, false);
});

test('restore accepts a complete saved session', async () => {
  const storage = memoryStorage({ accessToken: 'a', refreshToken: 'r', expiresAt: 9999999999, userId: 'u1' });
  const session = createSession({ storage, fetchImpl: async () => makeResponse(200, { user: { id: 'u1', role: 'client' } }) });
  assert.equal(await session.restore(), true);
  assert.equal(session.active, true);
});

test('restore clears malformed saved session instead of activating it', async () => {
  const storage = memoryStorage({ accessToken: 'a' });
  const session = createSession({ storage, fetchImpl: async () => { throw new Error('unexpected fetch'); } });
  assert.equal(await session.restore(), false);
  assert.equal(storage.peek(), null);
});

test('state verifies restored user identity and role', async () => {
  const storage = memoryStorage({ accessToken: 'a', refreshToken: 'r', expiresAt: 9999999999, userId: 'u1' });
  const session = createSession({ storage, fetchImpl: async () => makeResponse(200, { user: { id: 'u1', role: 'client' } }) });
  await session.restore();
  const state = await session.state();
  assert.equal(state.user.id, 'u1');
});

test('state rejects a restored session for a different user', async () => {
  const storage = memoryStorage({ accessToken: 'a', refreshToken: 'r', expiresAt: 9999999999, userId: 'u1' });
  const session = createSession({ storage, fetchImpl: async () => makeResponse(200, { user: { id: 'u2', role: 'client' } }) });
  await session.restore();
  await assert.rejects(() => session.state(), error => error instanceof SessionError && error.code === 'session_expired');
  assert.equal(storage.peek(), null);
});

test('expired access token refreshes before state request', async () => {
  const now = 2_000_000_000_000;
  const storage = memoryStorage({ accessToken: 'old', refreshToken: 'r1', expiresAt: Math.floor(now / 1000) - 1, userId: 'u1' });
  const calls = [];
  const session = createSession({
    storage,
    now: () => now,
    fetchImpl: async (url, options) => {
      calls.push([url, options]);
      if (url.endsWith('/api/v1/auth/refresh')) return makeResponse(200, { tokens: { accessToken: 'new', refreshToken: 'r2', expiresIn: 3600 } });
      return makeResponse(200, { user: { id: 'u1', role: 'client' } });
    }
  });
  await session.restore();
  const state = await session.state();
  assert.equal(state.user.id, 'u1');
  assert.match(calls[1][1].headers.Authorization, /new/);
});

test('401 refreshes once and retries authenticated request', async () => {
  const storage = memoryStorage({ accessToken: 'old', refreshToken: 'r1', expiresAt: 9999999999, userId: 'u1' });
  let stateCalls = 0;
  const session = createSession({
    storage,
    fetchImpl: async (url, options) => {
      if (url.endsWith('/api/v1/auth/refresh')) return makeResponse(200, { tokens: { accessToken: 'new', refreshToken: 'r2', expiresIn: 3600 } });
      if (url.endsWith('/api/v1/state')) {
        stateCalls++;
        if (stateCalls === 1) return makeResponse(401, { error: 'expired' });
        assert.equal(options.headers.Authorization, 'Bearer new');
        return makeResponse(200, { user: { id: 'u1', role: 'client' } });
      }
      throw new Error('unexpected request');
    }
  });
  await session.restore();
  assert.equal((await session.state()).user.id, 'u1');
  assert.equal(stateCalls, 2);
});

test('invalid refresh clears session', async () => {
  const storage = memoryStorage({ accessToken: 'old', refreshToken: 'r1', expiresAt: 1, userId: 'u1' });
  const session = createSession({
    storage,
    now: () => 100000,
    fetchImpl: async url => url.endsWith('/api/v1/auth/refresh') ? makeResponse(401, { error: 'invalid refresh' }) : makeResponse(500, {})
  });
  await session.restore();
  await assert.rejects(() => session.state(), error => error instanceof SessionError && error.code === 'session_expired');
  assert.equal(storage.peek(), null);
});

test('logout clears local session immediately', async () => {
  const storage = memoryStorage({ accessToken: 'a', refreshToken: 'r', expiresAt: 9999999999, userId: 'u1' });
  const session = createSession({ storage, fetchImpl: async () => makeResponse(200, {}) });
  await session.restore();
  await session.logout();
  assert.equal(session.active, false);
  assert.equal(storage.peek(), null);
});

test('storage failure is surfaced distinctly', async () => {
  const storage = { async get() { throw new Error('keychain unavailable'); }, async set() {}, async remove() {} };
  const session = createSession({ storage, fetchImpl: async () => makeResponse(200, {}) });
  await assert.rejects(() => session.restore(), error => error instanceof SessionError && error.code === 'storage_failed');
});
