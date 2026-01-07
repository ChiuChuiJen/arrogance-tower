export function fightSim(player, monster) {
  // 簡化：最多 6 回合；依 STR/AGI/INT 調整傷害與閃避
  let mHP = monster.stats.hp;
  let pHP = player.hp;

  const pAtk = 10 + player.stats.str * 2 + Math.floor(player.stats.int / 3);
  const pDef = 4 + Math.floor(player.stats.agi / 2);

  const mAtk = monster.stats.atk + Math.floor(monster.stats.str / 2);
  const mDef = monster.stats.def + Math.floor(monster.stats.agi / 4);

  const pCrit = Math.min(0.30, 0.05 + player.stats.luk * 0.005);
  const mCrit = Math.min(0.25, 0.04 + monster.stats.luk * 0.004);

  let log = [];
  for (let i=1;i<=6;i++){
    // player hit
    let dmg = Math.max(1, pAtk - mDef);
    if (Math.random() < pCrit) dmg = Math.floor(dmg * 1.6);
    mHP -= dmg;
    log.push(`回合${i}：你造成 ${dmg} 傷害（怪物HP=${Math.max(0,mHP)}）`);
    if (mHP <= 0) return { win:true, playerHp: pHP, log };

    // monster hit with small dodge chance
    const dodge = Math.min(0.22, player.stats.agi * 0.006);
    if (Math.random() < dodge) {
      log.push(`回合${i}：你閃避了攻擊`);
      continue;
    }
    let back = Math.max(1, mAtk - pDef);
    if (Math.random() < mCrit) back = Math.floor(back * 1.5);
    pHP -= back;
    log.push(`回合${i}：你受到 ${back} 傷害（HP=${Math.max(0,pHP)}）`);
    if (pHP <= 0) return { win:false, playerHp: 0, log };
  }
  // timeout: compare remaining HP
  return { win: pHP >= mHP, playerHp: Math.max(0,pHP), log };
}
