// The four Google Drive calls the shared list needs, all inside the hidden app-data folder.
// The token's only permission is that folder, so nothing else in the user's Drive is reachable.
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

export class AuthError extends Error {}

export function createDrive({ token, fetchFn = fetch }) {
  async function call(url, opts = {}) {
    const res = await fetchFn(url, { ...opts, headers: { Authorization: `Bearer ${token}`, ...opts.headers } });
    if (res.status === 401) throw new AuthError('Google sign-in has expired.');
    if (!res.ok) throw new Error(`Google Drive answered ${res.status}.`);
    return res;
  }
  return {
    async email() {
      const res = await call(`${API}/about?fields=user(emailAddress)`);
      return (await res.json()).user?.emailAddress ?? '';
    },
    /** Newest first. Two browsers syncing for the first time at once can each create one. */
    async find(name) {
      const q = encodeURIComponent(`name = '${name.replace(/'/g, "\\'")}' and trashed = false`);
      const res = await call(`${API}/files?spaces=appDataFolder&q=${q}&orderBy=modifiedTime%20desc&fields=files(id,modifiedTime)&pageSize=10`);
      return (await res.json()).files ?? [];
    },
    async read(id) {
      return (await call(`${API}/files/${encodeURIComponent(id)}?alt=media`)).text();
    },
    async create(name, text) {
      const boundary = `b${Math.random().toString(36).slice(2)}`;
      const body =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
        JSON.stringify({ name, parents: ['appDataFolder'], mimeType: 'application/json' }) +
        `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${text}\r\n--${boundary}--`;
      const res = await call(`${UPLOAD}/files?uploadType=multipart&fields=id`, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body,
      });
      return (await res.json()).id;
    },
    async update(id, text) {
      await call(`${UPLOAD}/files/${encodeURIComponent(id)}?uploadType=media&fields=id`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: text,
      });
    },
    async remove(id) {
      await call(`${API}/files/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },
  };
}
