export const REGIONS = ['EU', 'NA', 'SA', 'AS', 'OC', 'AF'];
export const QUEUE_TTL = 120;
export const MATCH_TTL = 3600;

export function detectRegion(cf) {
  return REGIONS.includes(cf?.continent) ? cf.continent : null;
}

// D1 batches are transactions: candidate selection, match creation and
// assignment must never be split across separate network round trips.
export async function joinQueue(db, playerKey, region, now) {
  if (!REGIONS.includes(region)) throw new Error('Invalid region');
  const matchId = crypto.randomUUID();
  const candidate = `SELECT player_key FROM queue
    WHERE region = ? AND match_id IS NULL AND expires_at > ?
    ORDER BY joined_at, player_key LIMIT 2`;
  const results = await db.batch([
    db.prepare('DELETE FROM queue WHERE player_key = ? AND expires_at <= ?').bind(playerKey, now),
    db.prepare(`INSERT INTO queue(player_key, region, joined_at, expires_at)
      VALUES (?, ?, ?, ?) ON CONFLICT(player_key) DO UPDATE SET
      expires_at = CASE WHEN queue.match_id IS NULL THEN excluded.expires_at ELSE queue.expires_at END`)
      .bind(playerKey, region, now, now + QUEUE_TTL),
    db.prepare(`INSERT INTO matches(id, region, created_at, expires_at)
      SELECT ?, ?, ?, ? WHERE
      (SELECT COUNT(*) FROM (${candidate})) = 2`)
      .bind(matchId, region, now, now + MATCH_TTL, region, now),
    db.prepare(`UPDATE queue SET match_id = ?, expires_at = ?
      WHERE player_key IN (${candidate}) AND EXISTS (SELECT 1 FROM matches WHERE id = ?)`)
      .bind(matchId, now + MATCH_TTL, region, now, matchId),
    db.prepare('SELECT region, match_id, expires_at FROM queue WHERE player_key = ?').bind(playerKey),
  ]);
  return queueResult(results[4].results[0]);
}

export async function queueStatus(db, playerKey, now) {
  const results = await db.batch([
    db.prepare(`UPDATE queue SET expires_at = ? WHERE player_key = ?
      AND match_id IS NULL AND expires_at > ?`).bind(now + QUEUE_TTL, playerKey, now),
    db.prepare('SELECT region, match_id, expires_at FROM queue WHERE player_key = ? AND expires_at > ?')
      .bind(playerKey, now),
  ]);
  return queueResult(results[1].results[0]);
}

export async function leaveQueue(db, playerKey) {
  // Leaving after an assignment does not silently break the other player's match.
  // Match lifecycle and disconnect handling belong to the game server adapter.
  const results = await db.batch([
    db.prepare('DELETE FROM queue WHERE player_key = ? AND match_id IS NULL').bind(playerKey),
    db.prepare('SELECT match_id FROM queue WHERE player_key = ?').bind(playerKey),
  ]);
  return results[1].results[0]?.match_id ? false : true;
}

export async function cleanup(db, now) {
  await db.batch([
    db.prepare('DELETE FROM queue WHERE expires_at <= ?').bind(now),
    db.prepare('DELETE FROM matches WHERE expires_at <= ?').bind(now),
  ]);
}

function queueResult(row) {
  if (!row) return null;
  return {
    status: row.match_id ? 'matched' : 'waiting',
    region: row.region,
    matchId: row.match_id,
    expiresAt: row.expires_at,
  };
}
