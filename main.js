import { APP_VERSION } from "./data/version.js";
import { Floors } from "./data/floors.js";
import { Monsters } from "./data/monsters.js";
import { Items } from "./data/items.js";
import { rollDrops } from "./data/drops.js";
import { loadSave, saveGame, newSave, wipeSave } from "./lib/storage.js";
import { fightSim } from "./lib/combat.js";

let S = loadSave();
const $ = (id) => document.getElementById(id);

function itemName(id){ return Items[id]?.name ?? id; }

function addItems(toBag, items){
  for (const [id, qty] of Object.entries(items)){
    toBag[id] = (toBag[id] ?? 0) + qty;
  }
}

function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }

function ensureHistory(){
  S.history = S.history ?? [];
}

function pushHistory(type, message, meta = {}){
  ensureHistory();
  const entry = {
    ts: Date.now(),
    type,
    message,
    meta
  };
  S.history.unshift(entry);
  // keep last 120 entries
  if (S.history.length > 120) S.history.length = 120;
}

function fmtTime(ts){
  const d = new Date(ts);
  const pad = (n)=> String(n).padStart(2,"0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function render() {
  const vEl = document.getElementById("versionTag");
  if (vEl) vEl.textContent = APP_VERSION;
  $("playerQuick").innerHTML = S
    ? `<span class="pill">會員：${S.memberId}</span>
       <span class="pill">暱稱：${S.nickname}</span>
       <span class="pill">Lv.${S.level}</span>
       <span class="pill">HP ${S.hp}</span>
       <span class="pill">MP ${S.mp}</span>
       <span class="pill">體力 ${S.stamina ?? 10}</span>
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
        // 新機制：移除怪物重生，改為歷練遇怪；加入體力與歷程
        S.stamina = 10;
        S.history = [];
        pushHistory("system", "角色建立完成，獲得百納袋胸章（會員註冊強制購買）。");
        saveGame(S);
        render();
      };
      $("reset").onclick = () => { wipeSave(); S = null; render(); };
    }, 0);
    return;
  }

  // Backfill for existing saves
  if (S.stamina == null) S.stamina = 10;
  ensureHistory();

  $("auth").innerHTML = `
    <div class="small">
      機制已改為「點擊歷練 → 隨機遇怪」。<br/>
      已取消怪物重生時間與倒數顯示。<br/>
      每次歷練消耗 1 點體力；勝利後可能獲得金幣/食物/藥水/令牌，並寫入「歷程」。
    </div>
    <div class="row" style="margin-top:8px;">
      <button id="reset2" style="background:#334155;">清除存檔</button>
      <button id="rest" style="background:#0ea5e9;">休息 +5 體力</button>
    </div>
  `;
  setTimeout(()=>{
    $("reset2").onclick = () => { wipeSave(); S = null; render(); };
    $("rest").onclick = () => {
      S.stamina = clamp((S.stamina ?? 0) + 5, 0, 50);
      pushHistory("system", "你休息片刻，體力恢復 +5。", { stamina: S.stamina });
      saveGame(S);
      render();
    };
  }, 0);

  // Badge
  $("badge").checked = !!S.badgeOn;
  $("badge").onchange = (e) => {
    S.badgeOn = e.target.checked;
    pushHistory("system", S.badgeOn ? "你配戴了百納袋胸章。" : "你取下了百納袋胸章。");
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
      pushHistory("system", `你進入了 ${Floors.find(x=>x.id===fid)?.name ?? ("第"+fid+"層")}。`, { floorId: fid });
      saveGame(S);
      renderHunt();
      renderStela();
      renderHistory();
    };
  });

  renderStela();
  renderHunt();
  renderBag();
  renderHistory();
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
      pushHistory("system", `你啟動通天碑，消耗令牌並解鎖第 ${next} 層。`, { unlockedFloor: next });
      saveGame(S);
      render();
    };
  }, 0);
}

function pickEncounter(floor){
  // 權重：一般 70%｜菁英 18%｜Mini 9%｜Boss 3%
  const r = Math.random();
  let pool = floor.pools.normal;
  let label = "一般";
  if (r >= 0.70 && r < 0.88) { pool = floor.pools.elite; label="菁英"; }
  else if (r >= 0.88 && r < 0.97) { pool = floor.pools.mini; label="Mini Boss"; }
  else if (r >= 0.97) { pool = floor.pools.boss; label="Boss"; }

  const mid = pool[Math.floor(Math.random()*pool.length)];
  return { mid, label };
}

function renderHunt() {
  const fid = S.currentFloor ?? 1;
  const f = Floors.find(x => x.id === fid) ?? Floors[0];

  $("hunt").innerHTML = `
    <div class="row">
      <span class="pill">${f.name}</span>
      <span class="pill">屬性：${f.element}</span>
    </div>

    <div class="row" style="margin-top:8px;">
      <button id="explore" ${((S.stamina ?? 0) >= 1) ? "" : "disabled"}>歷練（消耗 1 體力）</button>
      <button id="clearLog" style="background:#334155;">清空本區訊息</button>
    </div>

    <div class="small" style="margin-top:6px;">
      遇怪機率：一般 70%｜菁英 18%｜Mini Boss 9%｜Boss 3%（可再調整）
    </div>

    <hr/>
    <div id="encounter"></div>
    <div class="small mono" id="battleLog"></div>
  `;

  const enc = $("encounter");
  enc.innerHTML = `<div class="small">尚未歷練。</div>`;

  $("clearLog").onclick = () => {
    $("battleLog").textContent = "";
    enc.innerHTML = `<div class="small">尚未歷練。</div>`;
  };

  $("explore").onclick = () => doExplore(f);
}

function doExplore(floor){
  if ((S.stamina ?? 0) < 1) return;

  S.stamina -= 1;

  const { mid } = pickEncounter(floor);
  const m = Monsters[mid];

  $("encounter").innerHTML = `
    <div class="row">
      <span class="pill">遭遇</span>
      <span class="pill">${m.name}</span>
      <span class="pill">${m.rarity} / ${m.element}</span>
    </div>
    <div class="small">HP ${m.stats.hp}｜ATK ${m.stats.atk}｜DEF ${m.stats.def}｜STR ${m.stats.str}｜AGI ${m.stats.agi}｜INT ${m.stats.int}｜LUK ${m.stats.luk}</div>
    <div class="row" style="margin-top:6px;">
      <button id="fightNow" style="background:#f97316;">開戰</button>
      <button id="retreat" style="background:#334155;">撤退（不消耗體力）</button>
    </div>
  `;

  pushHistory("explore", `你在 ${floor.name} 展開歷練（-1 體力），遭遇「${m.name}」。`, { floorId: floor.id, monsterId: mid, rarity: m.rarity });
  saveGame(S);
  renderHistory();
  renderBag();
  renderStela();

  $("retreat").onclick = () => {
    // 退回體力（因為 UI 已先扣）
    S.stamina += 1;
    pushHistory("explore", `你選擇撤退，沒有進入戰鬥（體力返還 +1）。`, { floorId: floor.id });
    saveGame(S);
    render();
  };

  $("fightNow").onclick = () => doFight(mid);
}

function doFight(monsterId) {
  const m = Monsters[monsterId];

  const sim = fightSim(S, m);
  $("battleLog").textContent = sim.log.slice(-6).join("\n");

  S.hp = sim.playerHp;

  if (!sim.win) {
    // 醫務室（簡化）：瀕死自動傳送，救回 50HP
    pushHistory("combat", `你敗給了「${m.name}」，瀕死傳送至醫務室，恢復至 50 HP。`, { monsterId });
    S.hp = 50;
    saveGame(S);
    render();
    return;
  }

  // 勝利：掉落
  const drop = rollDrops({ floorId: S.currentFloor, rarity: m.rarity, badgeOn: S.badgeOn });
  S.gold += drop.gold;
  addItems(S.bag, drop.items);

  // MVP 等級成長示範
  if (Math.random() < 0.12) {
    S.level += 1;
    S.hp += 8;
    S.mp += 4;
    pushHistory("system", `你突破了一點境界：等級提升至 Lv.${S.level}。`, { level: S.level });
  }

  const gotItems = Object.entries(drop.items).map(([id,q])=>`${itemName(id)}×${q}`).join("、");
  const dropMsg = S.badgeOn
    ? `獲得 金幣+${drop.gold}` + (gotItems ? `；掉落：${gotItems}` : "")
    : "未配戴百納袋胸章，因此未獲得任何掉落。";

  pushHistory("combat", `你擊敗了「${m.name}」。${dropMsg}`, { monsterId, gold: drop.gold, items: drop.items });

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
    pushHistory("item", `你意念使用「${itemName(id)}」。`, { itemId: id });
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

function renderHistory(){
  const el = $("history");
  if (!el) return;
  const items = (S.history ?? []).slice(0, 40).map(h => {
    const tag = {
      system:"系統",
      explore:"歷練",
      combat:"戰鬥",
      item:"道具",
    }[h.type] ?? h.type;
    return `<div style="margin:6px 0;">
      <div class="row">
        <span class="pill">${tag}</span>
        <span class="small mono">${fmtTime(h.ts)}</span>
      </div>
      <div class="small">${escapeHtml(h.message)}</div>
    </div>`;
  }).join("");
  el.innerHTML = items || `<div class="small">尚無歷程。</div>`;
}

function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

render();
