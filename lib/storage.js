const KEY = "AT_SAVE_V2";

export function loadSave() {
  try { return JSON.parse(localStorage.getItem(KEY)) ?? null; }
  catch { return null; }
}
export function saveGame(s) {
  localStorage.setItem(KEY, JSON.stringify(s));
}
export function wipeSave() {
  localStorage.removeItem(KEY);
}
export function newSave(nickname) {
  return {
    memberId: "MB-" + Math.random().toString(16).slice(2, 10).toUpperCase(),
    nickname,
    level: 1,
    hp: 120, mp: 60,
    stats: { str: 6, agi: 6, int: 6, luk: 4 },
    badgeOn: true,
    gold: 0,
    bag: { "badge_bainadai": 1 }, // 會員註冊強制購買百納袋胸章（Canon）
    unlockedFloor: 1,
    currentFloor: 1,
    history: [],
    stamina: 10,
  };
}
