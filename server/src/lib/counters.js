'use strict';
/** Gap-free document numbers. Must be called inside a transaction (row lock on the counter). */
async function nextNumber(client, name) {
  const r = await client.query(
    'UPDATE counters SET next_value = next_value + 1 WHERE name = $1 RETURNING prefix, pad, next_value - 1 AS v',
    [name]);
  if (!r.rowCount) throw new Error(`Counter ${name} missing`);
  const { prefix, pad, v } = r.rows[0];
  return `${prefix}${String(v).padStart(pad, '0')}`;
}
module.exports = { nextNumber };
