export const API = String(import.meta.env?.VITE_API_ORIGIN||'https://m-platform-tan.vercel.app').replace(/\/$/,'');
export class SessionError extends Error {
  constructor(code, status = 0, message = code) { super(message); this.code = code; this.status = status; }
}

// Sole owner of credentials. Views receive verified state, never a separate session.
export function createSession({ storage, fetchImpl = (...args) => fetch(...args), now = Date.now }) {
  let tokens = null, epoch = 0, refreshTask = null, controller = new AbortController();
  let storageQueue = Promise.resolve();
  const listeners = new Set();
  const guard = version => { if (version !== epoch) throw new SessionError('session_changed'); };
  const enqueue = work => {
    const next = storageQueue.catch(() => {}).then(work);
    storageQueue = next;
    return next;
  };
  async function clear(reason = 'logout') {
    epoch++;
    controller.abort(); controller = new AbortController();
    tokens = null; refreshTask = null;
    for (const listener of listeners) listener(reason);
    try { await enqueue(() => storage.remove()); }
    catch { throw new SessionError('storage_failed'); }
  }
  async function save(value, version) {
    guard(version);
    if (!value?.accessToken || !value?.refreshToken) throw new SessionError('invalid_session');
    const next = { accessToken: value.accessToken, refreshToken: value.refreshToken,
      expiresAt: Number(value.expiresAt) || Math.floor(now()/1000) + (Number(value.expiresIn)||3600),
      userId: value.userId || tokens?.userId || null };
    try { await enqueue(async () => { guard(version); await storage.set(next); }); }
    catch (error) { guard(version); throw new SessionError('storage_failed'); }
    guard(version); tokens = next;
  }
  async function send(path, { method = 'GET', body, token } = {}, version = epoch) {
    guard(version);
    const requestController = new AbortController(), signal = controller.signal;
    const cancel = () => requestController.abort();
    signal.addEventListener('abort', cancel, { once: true });
    const timeout = setTimeout(cancel, 30000);
    try {
      const headers = { 'X-M-Client': 'native' };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetchImpl(API + path, { method, headers, credentials: 'omit',
        body: body === undefined ? undefined : JSON.stringify(body), signal: requestController.signal });
      guard(version); return response;
    } catch (error) {
      guard(version);
      if (error instanceof SessionError) throw error;
      throw new SessionError('network');
    } finally { clearTimeout(timeout); signal.removeEventListener('abort', cancel); }
  }
  async function read(response, version) {
    let data;
    try { data = await response.json(); } catch { throw new SessionError('server_error', response.status); }
    guard(version);
    if (!response.ok) throw new SessionError('http', response.status, data.error || `HTTP ${response.status}`);
    return data;
  }
  async function refresh() {
    if (refreshTask) return refreshTask;
    const version = epoch, old = tokens;
    if (!old?.refreshToken) throw new SessionError('session_expired', 401);
    const task = (async () => {
      try {
        const response = await send('/api/v1/auth/refresh', { method:'POST', body:{refreshToken:old.refreshToken} }, version);
        const data = await read(response, version);
        await save({ ...data.tokens, userId:old.userId }, version);
      } catch (error) {
        guard(version);
        if ([400,401,403].includes(error.status) || error.code==='invalid_session') {
          await clear('expired'); throw new SessionError('session_expired', 401);
        }
        throw error;
      }
    })();
    refreshTask = task;
    try { await task; } finally { if (refreshTask === task) refreshTask = null; }
  }
  async function raw(path, { auth = true, ...options } = {}) {
    const version = epoch;
    if (!auth) return send(path, options, version);
    if (!tokens) throw new SessionError('session_expired',401);
    if (tokens.expiresAt*1000 <= now()+30000) await refresh();
    guard(version);
    const used = tokens.accessToken;
    let response = await send(path, {...options,token:used}, version);
    if (response.status === 401) {
      if (tokens?.accessToken === used) await refresh();
      guard(version);
      response = await send(path, {...options,token:tokens.accessToken}, version);
      if (response.status===401) { await clear('expired'); throw new SessionError('session_expired',401); }
    }
    return response;
  }
  async function request(path, options = {}) {
    const version = epoch;
    return read(await raw(path, options), version);
  }
  async function state() {
    const version = epoch;
    let data = await request('/api/v1/state');
    // Older API deployments return public data with HTTP 200 for an expired bearer.
    if (!data.user) { await refresh(); data = await request('/api/v1/state'); }
    guard(version);
    if (!data.user?.id || !['client','supplier','admin'].includes(data.user.role) ||
        (tokens.userId && tokens.userId!==data.user.id)) {
      await clear('expired'); throw new SessionError('session_expired',401);
    }
    if (!tokens.userId) await save({...tokens,userId:data.user.id},version);
    return data;
  }
  async function authenticate(action, body) {
    await clear('account_change');
    const version = epoch;
    const data = await request(`/api/v1/auth/${action}`,{method:'POST',body,auth:false});
    if (action==='register' && data.confirmationRequired) return data;
    try { await save({...data.tokens,userId:data.user?.id},version); }
    catch (error) {
      guard(version); await clear('account_change');
      throw new SessionError(error.code==='invalid_session'?'invalid_session':'storage_failed');
    }
    return data;
  }
  async function restore() {
    const version = epoch;
    let saved;
    try { saved = await enqueue(() => storage.get()); } catch { throw new SessionError('storage_failed'); }
    guard(version);
    if (!saved) return false;
    if (!saved.accessToken || !saved.refreshToken || !Number.isFinite(saved.expiresAt)) { await clear('expired'); return false; }
    tokens = saved;
    return true; // Caller MUST fetch state before showing authenticated content.
  }
  async function logout() {
    const old = tokens;
    await clear('logout');
    if (old?.accessToken) {
      // Logout must never refresh a session that the user has just discarded.
      // Local sign-out must not wait for an unavailable network. A subsequent login
      // aborts this old request along with all other work from the previous epoch.
      void send('/api/v1/auth/logout',{method:'POST',body:{},token:old.accessToken}).catch(()=>{});
    }
  }
  return { raw, request, state, restore, logout, clear,
    login: body => authenticate('login',body), register: body => authenticate('register',body),
    get epoch() { return epoch; }, get active() { return !!tokens; },
    onReset(listener) { listeners.add(listener); return () => listeners.delete(listener); } };
}
