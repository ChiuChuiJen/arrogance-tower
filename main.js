import { Floors } from "./data/floors.js";
import { Monsters } from "./data/monsters.js";
import { Items } from "./data/items.js";
import { rollDrops } from "./data/drops.js";
import { loadSave, saveGame, newSave, wipeSave } from "./lib/storage.js";
import { canFight, setCooldown, getRemainingMs } from "./lib/spawn.js";
import { fightSim } from "./lib/combat.js";

let S = loadSave();
const $ = (id) => document.getElementById(id);

function itemName(id){ return Items[id]?.name ?? id; }

function addItems(toBag, items){
  for (const [id, qty] of Object.entries(items)){
    toBag[id] = (toBag[id] ?? 0) + qty;
  }
}

function render() {
  $("playerQuick").innerHTML = S
    ? `<span class="pill">會員：${S.memberId}</span>
       <span class="pill">暱稱：${S.nickname}</span>
       <span class="pill">Lv.${S.level}</span>
       <span class="pill">HP ${S.hp}</span>
       <span class="pill">MP ${S.mp}</span>
       <span class="pill">金幣 ${S.gold}</span>`
    : `<span class="small">尚未建立角色</span>`;

  // Auth
  if (!S) {
    $("auth").innerHTML = `
      <div class="row">
        <input id="nick" placeholder="輸入暱稱" />
        <button id="create">建立角色</button>
        <button id="reset" style="background:#334155;">清除存檔</button>
      </div>
      <div class="small">存檔在本機 localStorage（GitHub Pages 可用）</div>
    `;
    $("floors").innerHTML = "";
    $("stela").innerHTML = "";
    $("hunt").innerHTML = "";
    $("bag").innerHTML = "";
    setTimeout(() => {
      $("create").onclick = () => {
        const nick = $("nick").value.trim() || "無名修士";
        S = newSave(nick);
        saveGame(S);
        render();
      };
      $("reset").onclick = () => { wipeSave(); S = null; render(); };
    }, 0);
    return;
  }

  $("auth").innerHTML = `
    <div class="small">
      玩家欄位（Canon）：會員編號、暱稱、等級、體力/魔力/屬性、裝備/技能/道具。<br/>
      MVP 目前：等級、HP/MP、屬性、金幣、背包、樓層解鎖、重生計時。
    </div>
    <div class="row" style="margin-top:8px;">
      <button id="reset2" style="background:#334155;">清除存檔</button>
    </div>
  `;
  setTimeout(()=> $("reset2").onclick = () => { wipeSave(); S = null; render(); }, 0);

  // Badge
  $("badge").checked = !!S.badgeOn;
  $("badge").onchange = (e) => {
    S.badgeOn = e.target.checked;
    saveGame(S);
    render();
  };

  // Floors list
  $("floors").innerHTML = Floors.map(f => {
    const locked = f.id > S.unlockedFloor;
    const active = f.id === (S.currentFloor ?? 1);
    return `<div class="row" style="margin:6px 0;">
      <span class="pill">${active ? "▶" : ""}${f.name}</span>
      <span class="pill">屬性：${f.element}</span>
      <button ${locked ? "disabled" : ""} data-floor="${f.id}">進入</button>
    </div>`;
  }).join("");

  [...$("floors").querySelectorAll("button[data-floor]")].forEach(btn => {
    btn.onclick = () => {
      const fid = Number(btn.dataset.floor);
      S.currentFloor = fid;
      saveGame(S);
      renderHunt();
      renderStela();
    };
  });

  renderStela();
  renderHunt();
  renderBag();
}

function tokenIdForNext(floorId){
  const nextFloor = floorId + 1;
  if (nextFloor > 10) return null;
  if (floorId >= 1 && floorId <= 5) return "token_tier1";
  return `token_f${nextFloor}`;
}

function hasToken(id){
  return (S.bag?.[id] ?? 0) > 0;
}

function consumeToken(id){
  S.bag[id] -= 1;
  if (S.bag[id] <= 0) delete S.bag[id];
}

function renderStela(){
  const fid = S.currentFloor ?? 1;
  const next = fid + 1;
  if (next > 10) {
    $("stela").innerHTML = `<div class="small">通天碑：你已抵達目前 MVP 的最高層（第10層）。</div>`;
    return;
  }
  const need = tokenIdForNext(fid);
  const ok = need && hasToken(need);
  $("stela").innerHTML = `
    <div class="row">
      <span class="pill">靈浩通天碑</span>
      <span class="small">前往下一層需要：<span class="mono">${itemName(need)}</span></span>
    </div>
    <div class="row" style="margin-top:6px;">
      <button id="ascend" ${ok ? "" : "disabled"}>消耗令牌 → 解鎖第 ${next} 層</button>
    </div>
  `;
  setTimeout(() => {
    const btn = $("ascend");
    if (!btn) return;
    btn.onclick = () => {
      consumeToken(need);
      S.unlockedFloor = Math.max(S.unlockedFloor, next);
      S.currentFloor = next;
      saveGame(S);
      render();
    };
  }, 0);
}

function renderHunt() {
  const fid = S.currentFloor ?? 1;
  const f = Floors.find(x => x.id === fid) ?? Floors[0];

  const slots = [
    { key:`F${fid}_N`, label:"一般", pool: f.pools.normal },
    { key:`F${fid}_E`, label:"菁英", pool: f.pools.elite },
    { key:`F${fid}_M`, label:"Mini Boss", pool: f.pools.mini },
    { key:`F${fid}_B`, label:"Boss", pool: f.pools.boss },
  ];

  $("hunt").innerHTML = `
    <div class="row">
      <span class="pill">${f.name}</span>
      <span class="pill">屬性：${f.element}</span>
    </div>
    <div class="small">重生：一般2分鐘｜菁英10分鐘｜Boss30分鐘（MVP：Mini Boss 視同30分鐘）</div>
    <hr/>
    ${slots.map(slt => {
      const mid = pickOne(slt.pool);
      const m = Monsters[mid];
      const ready = canFight(S, slt.key);
      const rem = getRemainingMs(S, slt.key);
      const cdText = ready ? "可狩獵" : `重生倒數 ${Math.ceil(rem/1000)} 秒`;
      return `
        <div style="margin:10px 0;">
          <div class="row">
            <span class="pill">${slt.label}</span>
            <span class="pill">${m.name}</span>
            <span class="pill">${m.rarity} / ${m.element}</span>
            <span class="small">${cdText}</span>
          </div>
          <div class="small">HP ${m.stats.hp}｜ATK ${m.stats.atk}｜DEF ${m.stats.def}｜STR ${m.stats.str}｜AGI ${m.stats.agi}｜INT ${m.stats.int}｜LUK ${m.stats.luk}</div>
          <div class="row" style="margin-top:6px;">
            <button ${ready ? "" : "disabled"} data-fight="${slt.key}" data-mid="${mid}">戰鬥</button>
          </div>
          <div class="small mono" id="log_${slt.key}"></div>
        </div>
      `;
    }).join("")}
  `;

  [...$("hunt").querySelectorAll("button[data-fight]")].forEach(btn => {
    btn.onclick = () => doFight(btn.dataset.fight, btn.dataset.mid);
  });
}

function doFight(slotKey, monsterId) {
  const m = Monsters[monsterId];

  const sim = fightSim(S, m);
  const logEl = document.getElementById(`log_${slotKey}`);
  if (logEl) logEl.textContent = sim.log.slice(-4).join("\n");

  S.hp = sim.playerHp;

  if (!sim.win) {
    // 醫務室（簡化）：瀕死自動傳送，救回 50HP（後續可接白語/扣費）
    S.hp = 50;
    saveGame(S);
    render();
    return;
  }

  // 勝利：進入重生 CD
  setCooldown(S, slotKey, m.rarity);

  // 掉落
  const drop = rollDrops({ floorId: S.currentFloor, rarity: m.rarity, badgeOn: S.badgeOn });
  S.gold += drop.gold;
  addItems(S.bag, drop.items);

  // MVP 獎勵：小概率加經驗等級（示範）
  if (Math.random() < 0.10) {
    S.level += 1;
    S.hp += 8;
    S.mp += 4;
  }

  saveGame(S);
  render();
}

function useItem(id){
  const it = Items[id];
  if (!it) return;

  if (it.type === "potion" || it.type === "food") {
    if (it.hp) S.hp = Math.min(9999, S.hp + it.hp);
    if (it.mp) S.mp = Math.min(9999, S.mp + it.mp);
    // consume
    S.bag[id] -= 1;
    if (S.bag[id] <= 0) delete S.bag[id];
    saveGame(S);
    render();
  }
}

function renderBag() {
  const entries = Object.entries(S.bag ?? {}).sort((a,b)=>a[0].localeCompare(b[0]));
  $("bag").innerHTML = entries.length
    ? entries.map(([id,qty]) => {
        const it = Items[id];
        const canUse = it && (it.type === "potion" || it.type === "food");
        return `<div style="margin:6px 0;">
          <div class="row">
            <span class="pill">${itemName(id)}</span>
            <span class="pill">x${qty}</span>
            ${canUse ? `<button data-use="${id}" style="background:#16a34a;">意念使用</button>` : ""}
          </div>
          ${it?.desc ? `<div class="small">${it.desc}</div>` : ""}
        </div>`;
      }).join("")
    : `<div class="small">目前空</div>`;

  [...$("bag").querySelectorAll("button[data-use]")].forEach(btn => {
    btn.onclick = () => useItem(btn.dataset.use);
  });
}

function pickOne(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

// 每秒刷新倒數
setInterval(() => { if (S) renderHunt(); }, 1000);

render();
