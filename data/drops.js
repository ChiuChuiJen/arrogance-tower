export function rollDrops({ floorId, rarity, badgeOn }) {
  // Canon：未配戴百納袋胸章者無法獲得掉落
  if (!badgeOn) return { gold: 0, items: {} };

  // 基礎金幣（依稀有度）
  const goldBase = { "一般": 6, "菁英": 20, "Mini Boss": 45, "Boss": 90 }[rarity] ?? 6;
  const gold = goldBase + Math.floor(Math.random()*goldBase);

  const items = {};

  // 食物/藥水：小機率
  const roll = Math.random();
  if (roll < 0.20) items["food_ration"] = (items["food_ration"] ?? 0) + 1;
  else if (roll < 0.34) items["potion_hp_s"] = (items["potion_hp_s"] ?? 0) + 1;
  else if (roll < 0.42) items["potion_mp_s"] = (items["potion_mp_s"] ?? 0) + 1;

  // 樓層令牌：每層怪只掉「下一層令牌」
  // 機率（Boss 保底）：一般20% / 菁英40% / Mini 70% / Boss 100%
  const p = { "一般": 0.20, "菁英": 0.40, "Mini Boss": 0.70, "Boss": 1.00 }[rarity] ?? 0.20;

  const nextFloor = floorId + 1;
  if (nextFloor <= 10 && Math.random() < p) {
    if (floorId >= 1 && floorId <= 5) {
      items["token_tier1"] = (items["token_tier1"] ?? 0) + 1;
    } else {
      items[`token_f${nextFloor}`] = (items[`token_f${nextFloor}`] ?? 0) + 1;
    }
  }

  return { gold, items };
}
