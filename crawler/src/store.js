// The crawler's tables in D1 (crawler/schema.sql) and its files in R2. Both the crawler and the explorer's Worker use these functions.

export const now = () => new Date().toISOString();
const minutes = (m) => m * 60_000;

/** Every setting as an object of strings. */
export async function settings(db) {
  const { results } = await db.prepare("SELECT key, value FROM settings").all();
  return Object.fromEntries(results.map((r) => [r.key, r.value]));
}

/** Sets one setting. */
export const setSetting = (db, key, value) =>
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(key, String(value)).run();

/** One address with its scan state, or null. */
export const address = (db, id) =>
  db.prepare("SELECT a.*, s.status, s.finished_at, s.next_due_at, s.source, s.head, s.error, s.needs_ai, s.queued_at, s.started_at FROM addresses a LEFT JOIN scans s ON s.address_id = a.id WHERE a.id = ?").bind(id).first();

/** Every address with its scan state, newest first. */
export async function addresses(db) {
  const { results } = await db.prepare("SELECT a.*, s.status, s.finished_at, s.next_due_at, s.source, s.head, s.error, s.needs_ai FROM addresses a LEFT JOIN scans s ON s.address_id = a.id ORDER BY a.added_at DESC").all();
  return results;
}

/** Adds an address unless it is there, and gives it a scan row. Returns whether it was new. */
export async function addAddress(db, { id, url, kind, label = null, enabled = 1, by = null, foundVia = null, intervalMinutes = null, maxStaleMinutes = null }) {
  const r = await db.prepare("INSERT OR IGNORE INTO addresses (id, url, kind, label, enabled, interval_minutes, max_stale_minutes, added_at, added_by, found_via) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, url, kind, label, enabled ? 1 : 0, intervalMinutes, maxStaleMinutes, now(), by, foundVia).run();
  await db.prepare("INSERT OR IGNORE INTO scans (address_id) VALUES (?)").bind(id).run();
  return (r.meta?.changes ?? 0) > 0;
}

/** Changes an address's label, schedule or whether it is crawled. */
export async function updateAddress(db, id, { label, enabled, intervalMinutes, maxStaleMinutes }) {
  const sets = [], vals = [];
  if (label !== undefined) { sets.push("label = ?"); vals.push(label); }
  if (enabled !== undefined) { sets.push("enabled = ?"); vals.push(enabled ? 1 : 0); }
  if (intervalMinutes !== undefined) { sets.push("interval_minutes = ?"); vals.push(intervalMinutes); }
  if (maxStaleMinutes !== undefined) { sets.push("max_stale_minutes = ?"); vals.push(maxStaleMinutes); }
  if (!sets.length) return;
  await db.prepare(`UPDATE addresses SET ${sets.join(", ")} WHERE id = ?`).bind(...vals, id).run();
  if (intervalMinutes !== undefined) await db.prepare("UPDATE scans SET next_due_at = NULL WHERE address_id = ?").bind(id).run();
}

/** Removes an address and its scan state; its files in R2 go too. */
export async function removeAddress(db, bucket, id) {
  await db.prepare("DELETE FROM scans WHERE address_id = ?").bind(id).run();
  await db.prepare("DELETE FROM addresses WHERE id = ?").bind(id).run();
  await deletePrefix(bucket, `space/${id}/`);
}

/** The addresses the schedule should scan now: enabled, due, and not already waiting or running (a scan stuck for an hour counts as not running). */
export async function dueAddresses(db, at = new Date(), limit = 50) {
  const stuck = new Date(at.getTime() - minutes(60)).toISOString();
  const { results } = await db.prepare(
    `SELECT a.id FROM addresses a JOIN scans s ON s.address_id = a.id
     WHERE a.enabled = 1 AND (s.next_due_at IS NULL OR s.next_due_at <= ?)
       AND (s.status NOT IN ('queued', 'scanning') OR COALESCE(s.started_at, s.queued_at) < ?)
     ORDER BY s.next_due_at IS NOT NULL, s.next_due_at LIMIT ?`).bind(at.toISOString(), stuck, limit).all();
  return results.map((r) => r.id);
}

/** Whether an address's data is older than allowed, so a player approaching it should trigger a rescan. */
export function isStale(row, settingsMap, at = new Date()) {
  if (!row?.finished_at) return true;
  const max = row.max_stale_minutes ?? Number(settingsMap.default_max_stale_minutes ?? 10080);
  return Date.parse(row.finished_at) + minutes(max) < at.getTime();
}

/** Marks an address queued for `reason` and sends it to the scan queue, unless it is queued or scanning already. Returns whether it was sent. */
export async function requestScan(db, queue, id, reason, at = new Date()) {
  const stuck = new Date(at.getTime() - minutes(60)).toISOString();
  const r = await db.prepare(
    `UPDATE scans SET status = 'queued', queued_at = ?, reason = ?
     WHERE address_id = ? AND (status NOT IN ('queued', 'scanning') OR COALESCE(started_at, queued_at) < ?)`).bind(at.toISOString(), reason, id, stuck).run();
  if ((r.meta?.changes ?? 0) === 0) return false;
  await queue.send({ id, reason });
  return true;
}

/** Records the start of a scan. */
export const scanStarted = (db, id) => db.prepare("UPDATE scans SET status = 'scanning', started_at = ?, error = NULL WHERE address_id = ?").bind(now(), id).run();

/** Records a finished scan and when the schedule should come back. */
export async function scanFinished(db, id, { source, head = null, changed = 0, needsAi = 0, intervalMinutes }) {
  const t = new Date();
  await db.prepare("UPDATE scans SET status = 'done', finished_at = ?, next_due_at = ?, source = ?, head = COALESCE(?, head), changed = ?, needs_ai = ?, error = NULL WHERE address_id = ?")
    .bind(t.toISOString(), new Date(t.getTime() + minutes(intervalMinutes)).toISOString(), source, head, changed, needsAi, id).run();
}

/** Records a failed scan; the schedule tries again after a quarter of the interval. */
export async function scanFailed(db, id, error, intervalMinutes) {
  const t = new Date();
  await db.prepare("UPDATE scans SET status = 'failed', error = ?, next_due_at = ? WHERE address_id = ?")
    .bind(String(error).slice(0, 500), new Date(t.getTime() + minutes(Math.max(15, intervalMinutes / 4))).toISOString(), id).run();
}

/** Writes JSON to R2. */
export const putJson = (bucket, key, value) => bucket.put(key, JSON.stringify(value), { httpMetadata: { contentType: "application/json" } });

/** Reads JSON from R2, or null. */
export async function getJson(bucket, key) {
  const o = await bucket.get(key);
  return o ? JSON.parse(await o.text()) : null;
}

/** Deletes every R2 object under a prefix. */
export async function deletePrefix(bucket, prefix) {
  let cursor;
  do {
    const page = await bucket.list({ prefix, cursor });
    if (page.objects.length) await bucket.delete(page.objects.map((o) => o.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}
