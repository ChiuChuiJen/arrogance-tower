export const RESPAWN_SEC = {
  "一般": 120,
  "菁英": 600,
  "Mini Boss": 1800,
  "Boss": 1800
};

export function canFight(save, slotKey) {
  const t = save.spawnState[slotKey] ?? 0;
  return Date.now() >= t;
}
export function setCooldown(save, slotKey, rarity) {
  const sec = RESPAWN_SEC[rarity] ?? 120;
  save.spawnState[slotKey] = Date.now() + sec * 1000;
}
export function getRemainingMs(save, slotKey) {
  const t = save.spawnState[slotKey] ?? 0;
  return Math.max(0, t - Date.now());
}
