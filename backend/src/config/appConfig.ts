import { getPool } from './db';
import { DEFAULT_PRIORITY_RELEASE_THRESHOLD_PCT } from '../types/domain';

// version2.md §4 — read once per process start and cached in memory; a
// restart is required to pick up a change. If the row is missing, fail
// closed to the default rather than throwing.
let cachedThresholdPct: number | null = null;

export async function getPriorityReleaseThresholdPct(): Promise<number> {
  if (cachedThresholdPct !== null) return cachedThresholdPct;

  const pool = await getPool();
  const result = await pool
    .request()
    .query(
      `SELECT config_value FROM dbo.AppConfig_selvalakshmi WHERE config_key = 'PRIORITY_RELEASE_THRESHOLD_PCT'`
    );

  const raw = result.recordset[0]?.config_value;
  const parsed = raw === undefined ? NaN : Number(raw);

  cachedThresholdPct = Number.isFinite(parsed) ? parsed : DEFAULT_PRIORITY_RELEASE_THRESHOLD_PCT;
  return cachedThresholdPct;
}
