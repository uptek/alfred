/**
 * Convert an array of key-value entries to a Record, trimming keys.
 * Entries with empty keys are omitted.
 *
 * @param entries - Array of `{ key, value }` pairs from KeyValueEditor
 * @returns Record with trimmed keys mapped to their values
 */
export function entriesToRecord(entries: Array<{ key: string; value: string }>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const { key, value } of entries) {
    if (key.trim()) result[key.trim()] = value;
  }
  return result;
}

/**
 * Convert a Record to an array of key-value entries.
 *
 * @param record - A string Record (e.g. line item properties, cart attributes), or null
 * @returns Array of `{ key, value }` pairs for use with KeyValueEditor
 */
export function recordToEntries(record: Record<string, string> | null): Array<{ key: string; value: string }> {
  if (!record) return [];
  return Object.entries(record).map(([key, value]) => ({ key, value }));
}
