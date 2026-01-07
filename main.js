import { APP_VERSION } from "./data/version.js";
import { CHANGELOG } from "./data/changelog.js";
import { UserWeapons } from "./data/weapons_user.js";
import { UserArmors } from "./data/armors_user.js";
import { CultivationTable } from "./data/cultivation_user.js";
import { Floors } from "./data/floors.js";
import { Monsters } from "./data/monsters.js";
import { Items } from "./data/items.js";
import { rollDrops } from "./data/drops.js";
import { loadSave, saveGame, newSave, wipeSave } from "./lib/storage.js";
import { fightSim } from "./lib/combat.js";

let S = loadSave();
const $ = (id) => document.getElementById(id);
let PendingBattle = null;

const REALMS = ["凡人","鍛體","通脈","凝元","築基","金丹","元嬰","化神","合道","飛升"];
const TIER_NAMES = ["一重","二重","三重","四重","五重","六重","七重","八重","九重","十重"];
function syncRealmTier(){
  if (!S) return;
  const ri = S.realmIndex ?? 0;
  const tn = S.tierNum ?? 1;
  S.realm = REALMS[Math.max(0, Math.min(REALMS.length-1, ri))];
  S.tier = TIER_NAMES[Math.max(1, Math.min(10, tn)) - 1];
}
function exeNeedFor(ri, tn, floorId=1){
  // 依附件《修為經驗表》：每層提供「升一重需求範圍」
  const t = CultivationTable.find(x => x.id === floorId) || CultivationTable[CultivationTable.length-1];
  const fOver = Math.max(0, floorId - t.id);
  const minNeed = t.needMin ?? 100;
  const maxNeed = t.needMax ?? (minNeed*3);
  const tier = clamp(1, 10, tn ?? 1);
  // 在 1~10 重之間線性插值（第 1 重用 min，第 10 重用 max）
  const base = Math.round(minNeed + (maxNeed - minNeed) * ((tier-1)/9));
  const realmFactor = 1 + (ri ?? 0) * 0.12;     // 境界越高，突破門檻略升
  const floorFactor = Math.pow(1.20, fOver);    // 超出表格樓層後，需求遞增
  return Math.round(base * realmFactor * floorFactor);
}


const SHOP_CONSUMABLES = [
  { id:"pill_hp_s", type:"consumable", name:"小回氣丹", desc:"回復 HP +30", price: 25, use: (S)=>{ S.hp = Math.min((S.maxHp ?? S.hp ?? 120), (S.hp ?? 0) + 30); } },
  { id:"pill_mp_s", type:"consumable", name:"小回靈丹", desc:"回復 MP +20", price: 25, use: (S)=>{ S.mp = Math.min((S.maxMp ?? S.mp ?? 60), (S.mp ?? 0) + 20); } },
  { id:"pill_sta_s", type:"consumable", name:"回體丹", desc:"體力 +1（上限 10）", price: 40, use: (S)=>{ S.stamina = Math.min(10, (S.stamina ?? 0) + 1); } },
];

function isBasicRarity(r){ return r === "一般"; }

function mapWeaponToShop(w){
  const atk = w.stats?.atk ?? 0;
  const price = Math.max(60, Math.round(atk * 1.0)); // 基本武器：價格跟攻擊粗略掛鉤
  return { id: w.id, type:"weapon", name: w.name, desc: `ATK +${atk}（${w.element}）`, price, bonus:{ atk } };
}
function mapArmorToShop(a){
  const def = a.stats?.def ?? 0;
  const price = Math.max(60, Math.round(def * 1.0));
  return { id: a.id, type:"armor", name: a.name, desc: `DEF +${def}（${a.element}）`, price, bonus:{ def } };
}

const BASIC_WEAPONS = UserWeapons.filter(w=>isBasicRarity(w.rarity)).map(mapWeaponToShop);
const BASIC_ARMORS  = UserArmors.filter(a=>isBasicRarity(a.rarity)).map(mapArmorToShop);

const SHOP_ITEMS = [
  ...SHOP_CONSUMABLES,
  ...BASIC_WEAPONS,
  ...BASIC_ARMORS,
];

function getWeaponById(id){ return UserWeapons.find(x=>x.id===id) ?? null; }
function getArmorById(id){ return UserArmors.find(x=>x.id===id) ?? null; }


function getEquipBonus(){
  const out = { atk:0, def:0, agi:0, int:0, luk:0, hp:0, mp:0 };
  const w = S.weaponId ? getWeaponById(S.weaponId) : null;
  const a = S.armorId ? getArmorById(S.armorId) : null;
  if (w?.stats?.atk) out.atk += w.stats.atk;
  if (a?.stats?.def) out.def += a.stats.def;
  // 後續若要處理 effects，可在這裡擴充
  return out;
}

function buyItem(itemId){
  const it = SHOP_ITEMS.find(x => x.id === itemId);
  if (!it) return;
  if ((S.gold ?? 0) < it.price) { pushHistory("system", "金幣不足，無法購買。", {}); return; }

  S.gold = (S.gold ?? 0) - it.price;

  if (it.type === "weapon") {
    S.weaponId = it.id;
    pushHistory("system", `你購買並裝備了【${it.name}】。`, { itemId: it.id });
  } else if (it.type === "armor") {
    S.armorId = it.id;
    pushHistory("system", `你購買並裝備了【${it.name}】。`, { itemId: it.id });
  } else {
    S.inventory.push({ id: it.id, qty: 1 });
    pushHistory("system", `你購買了【${it.name}】。`, { itemId: it.id });
  }

  saveGame(S);
  render();
}


function renderShop(){
  const el = document.getElementById("shop");
  const g = document.getElementById("shopGold");
  if (g) g.textContent = String(S?.gold ?? 0);
  if (!el) return;
  if (!S) { el.innerHTML = "<div class='small'>請先建立角色。</div>"; return; }

  const card = (it)=>{
    return `<div class="row" style="justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid #1f2a36;">
      <div>
        <div><b>${escapeHtml(it.name)}</b> <span class="pill mono" style="margin-left:6px;">${it.price}G</span></div>
        <div class="small" style="opacity:.85;">${escapeHtml(it.desc)}</div>
      </div>
      <button onclick="buyItem('${it.id}')" style="min-width:84px;">購買</button>
    </div>`;
  };

  el.innerHTML = SHOP_ITEMS.map(card).join("");
}


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


function setupTabs(){
  const tabs = document.querySelectorAll(".tab");
  const panels = document.querySelectorAll(".panel");
  tabs.forEach(t => {
    t.onclick = () => {
      tabs.forEach(x=>x.classList.remove("active"));
      t.classList.add("active");
      const key = t.dataset.tab;
      panels.forEach(p => {
        p.classList.toggle("hidden", p.dataset.panel !== key);
      });
    };
  });
}

function pct(cur, max){
  if (!max || max <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((cur/max)*100)));
}

function renderPlayerDetails(){
  const el = document.getElementById("playerDetails");
  if (!el || !S) return;

  const hpPct = pct(S.hp, S.maxHp);
  const mpPct = pct(S.mp, S.maxMp);
  const stPct = pct(S.stamina, S.maxStamina);

  el.innerHTML = `
    <div class="statbox">
      <div class="kv">
        <span class="pill">會員編號：${S.memberId}</span>
        <span class="pill">暱稱：${S.nickname}</span>
      </div>

      <div class="kv">
        <span class="pill">境界：${S.realm}</span>
        <span class="pill">層級：${S.tier}</span>
        <span class="pill">樓層：第 ${S.currentFloor ?? 1} 層</span>
        <span class="pill">金幣：${S.gold}</span>
      </div>

      <div class="kv">
        <span class="label">HP</span>
        <span class="value">${S.hp} / ${S.maxHp}</span>
        <div class="barwrap"><div class="barfill" style="width:${hpPct}%;"></div></div>
      </div>

      <div class="kv">
        <span class="label">MP</span>
        <span class="value">${S.mp} / ${S.maxMp}</span>
        <div class="barwrap"><div class="barfill mp" style="width:${mpPct}%;"></div></div>
      </div>

      <div class="kv">
        <span class="label">修為值(EXE)</span>
        <span class="value">${S.exe ?? 0} / ${S.exeNeed ?? 100}</span>
        <div class="barwrap"><div class="barfill exp" style="width:${pct(S.exe ?? 0, S.exeNeed ?? 100)}%;"></div></div>
        <button id="exeBreakBtn" ${(S.exe ?? 0) >= (S.exeNeed ?? 100) ? "" : "disabled"} style="background:#a855f7;">突破</button>
      </div>

      <div class="kv">
        <span class="label">體力</span>
        <span class="value">${S.stamina} / ${S.maxStamina}</span>
        <div class="barwrap"><div class="barfill sta" style="width:${stPct}%;"></div></div>
      </div>
    </div>
  `;
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
       <span class="pill">體力 ${S.stamina ?? 10}/${S.maxStamina ?? 10}</span>
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
    const fe=document.getElementById("floors"); if(fe) fe.innerHTML="";
    const se=document.getElementById("stela"); if(se) se.innerHTML="";
    const he=document.getElementById("hunt"); if(he) he.innerHTML="";
    const be=document.getElementById("bag"); if(be) be.innerHTML="";
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
  if (S.maxStamina == null) S.maxStamina = 10;
  if (S.maxHp == null) S.maxHp = S.hp ?? 120;
  if (S.maxMp == null) S.maxMp = S.mp ?? 60;
  if (S.realm == null) S.realm = "凡人";
  if (S.tier == null) S.tier = "一重";
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

  // Floor selector (dropdown)
  const sel = document.getElementById("floorSelect");
  const hint = document.getElementById("floorHint");
  if (sel) {
    const unlocked = Floors.filter(f => f.id <= S.unlockedFloor);
    sel.innerHTML = unlocked.map(f => `<option value="${f.id}">${f.name}</option>`).join("");
    sel.value = String(S.currentFloor ?? 1);
    sel.onchange = () => {
      const fid = Number(sel.value);
      S.currentFloor = fid;
      S.exeNeed = exeNeedFor(S.realmIndex ?? 0, S.tierNum ?? 1, fid);
      pushHistory("system", `你進入了 ${Floors.find(x=>x.id===fid)?.name ?? ("第"+fid+"層")}。`, { floorId: fid });
      saveGame(S);
      renderStela();
      renderHunt();
      renderHistory();
      renderPlayerDetails();
      hookExeBreakthrough();
      renderExeInfo();
      hookBreakthrough?.();
    };
    if (hint) hint.textContent = `已解鎖至第 ${S.unlockedFloor} 層。`;
  }

  renderStela();

  renderStela();
  renderHunt();
  renderBag();
  renderHistory();
  renderPlayerDetails();
      hookExeBreakthrough();
  setupTabs();
  renderVersionInfo();
  renderShop();
  setupSettings();
  setupBattleModal();
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

  // 點擊歷練：立刻消耗 1 體力並跳出戰鬥視窗
  S.stamina -= 1;

  const { mid } = pickEncounter(floor);
  const m = Monsters[mid];

  // 在本區顯示本次遭遇（留作紀錄）
  $("encounter").innerHTML = `
    <div class="row">
      <span class="pill">遭遇</span>
      <span class="pill">${m.name}</span>
      <span class="pill">${m.rarity} / ${m.element}</span>
    </div>
    <div class="small">HP ${m.stats.hp}｜ATK ${m.stats.atk}｜DEF ${m.stats.def}｜AGI ${m.stats.agi}｜INT ${m.stats.int}｜LUK ${m.stats.luk}</div>
  `;
  $("battleLog").textContent = "";

  // 設定待戰鬥資料
  PendingBattle = { monsterId: mid, floorId: floor.id };

  // 打開戰鬥視窗
  const modal = document.getElementById("battleModal");
  const body = document.getElementById("battleBody");
  const msg = document.getElementById("battleMsg");
  if (body){
    body.innerHTML = `
      <div class="row">
        <span class="pill">${floor.name}</span>
        <span class="pill">遭遇</span>
        <span class="pill">${m.name}</span>
        <span class="pill">${m.rarity}</span>
      </div>
      <div class="small" style="margin-top:6px;">
        Lv.${m.level}｜屬性 ${m.element}<br/>
        HP ${m.stats.hp}｜ATK ${m.stats.atk}｜DEF ${m.stats.def}｜AGI ${m.stats.agi}｜INT ${m.stats.int}｜LUK ${m.stats.luk}
      </div>
    `;
  }
  if (msg) msg.textContent = "";
  if (modal) modal.classList.remove("hidden");

  saveGame(S);
  renderPlayerDetails();
  renderHistory();
  renderBag();
  renderStela();
  renderHunt();
}

function doFight(monsterId) {
  const m = Monsters[monsterId];

  const sim = fightSim(S, m);
  $("battleLog").textContent = sim.log.slice(-6).join("\n");

  S.hp = sim.playerHp;

  if (!sim.win) {
    // 醫務室：瀕死自動傳送，回到第一層重新爬塔
    pushHistory("combat", `你敗給了「${m.name}」，瀕死傳送至醫務室，恢復至 50 HP，並回到第 1 層。`, { monsterId });
    S.hp = 50;
    S.currentFloor = 1;
    S.exeNeed = exeNeedFor(S.realmIndex ?? 0, S.tierNum ?? 1, 1);
    saveGame(S);
    render();
    return;
  }

  // 勝利：修為值(EXE)（依境界/樓層/怪物難度動態）
  const floorId = S.currentFloor ?? 1;
  const t = CultivationTable.find(x => x.id === floorId) || CultivationTable[CultivationTable.length-1];
  const baseExe = (t.exp?.[m.rarity] ?? 6);
  const diffBonus = 1 + Math.max(0, (m.level ?? 1) - (S.level ?? 1)) * 0.03; // 打更強怪略多
  const exeGain = Math.max(1, Math.round(baseExe * diffBonus));
  S.exe = (S.exe ?? 0) + exeGain;
  S.exeNeed = exeNeedFor(S.realmIndex ?? 0, S.tierNum ?? 1, floorId);
  
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

  pushHistory("combat", `你擊敗了「${m.name}」。修為值(EXE) +${exeGain}；${dropMsg}`, { monsterId, gold: drop.gold, items: drop.items });

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


function encodeB64(obj){
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  bytes.forEach(b => bin += String.fromCharCode(b));
  return btoa(bin);
}
function decodeB64(b64){
  const bin = atob(b64.trim());
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  const json = new TextDecoder().decode(bytes);
  return JSON.parse(json);
}
function downloadText(filename, text){
  const blob = new Blob([text], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 500);
}
function renderVersionInfo(){
  const el = document.getElementById("versionInfo");
  if (!el) return;
  const items = (CHANGELOG ?? []).slice().reverse(); // oldest -> newest
  const newest = items.slice(-3).reverse();          // newest 3
  const older = items.slice(0, Math.max(0, items.length-3)).reverse(); // remaining newest-first

  const block = (x) => {
    const lines = (x.changes ?? []).map(c => `• ${escapeHtml(c)}`).join("<br/>");
    return `<div style="margin:8px 0;">
      <div class="mono" style="opacity:.9;">${escapeHtml(x.version)} <span style="opacity:.7;">(${escapeHtml(x.date)})</span></div>
      <div>${lines}</div>
    </div>`;
  };

  const newestHtml = newest.map(block).join("");
  const iconHtml = (older.length > 0)
    ? `<span id="updatesBtn" class="updateIcon" title="查看完整更新">🛈</span>`
    : "";

  el.innerHTML =
    `<div class="row" style="align-items:center; justify-content:space-between;">
       <div class="mono">版本：${escapeHtml(APP_VERSION)}</div>
       <div>${iconHtml}</div>
     </div>` +
    `<div style="margin-top:6px;">更動內容（最新 3 筆）：</div>` +
    (newestHtml || "<div class='small'>（無）</div>");

  // Modal wiring for older items
  const m = document.getElementById("updatesModal");
  const close = document.getElementById("updatesClose");
  const body = document.getElementById("updatesBody");
  const btn = document.getElementById("updatesBtn");

  const open = () => { if (!m) return; m.classList.remove("hidden"); };
  const shut = () => { if (!m) return; m.classList.add("hidden"); };

  if (btn && body) {
    body.innerHTML = `<div style="margin-bottom:6px;">完整更新（含較舊版本）：</div>` + older.map(block).join("");
    btn.onclick = open;
  }
  if (close) close.onclick = shut;
  if (m) m.onclick = (e) => { if (e.target === m) shut(); };
}
function setupSettings(){
  const modal = document.getElementById("settingsModal");
  const btn = document.getElementById("settingsBtn");
  const close = document.getElementById("settingsClose");
  const msg = document.getElementById("settingsMsg");
  const ta = document.getElementById("saveCode");
  const btnExport = document.getElementById("btnExport");
  const btnCopy = document.getElementById("btnCopy");
  const btnImport = document.getElementById("btnImport");
  const btnDownload = document.getElementById("btnDownloadJson");
  const fileJson = document.getElementById("fileJson");

  if (!modal || !btn || !close) return;

  const open = () => { modal.classList.remove("hidden"); msg.textContent = ""; };
  const shut = () => { modal.classList.add("hidden"); msg.textContent = ""; };

  btn.onclick = open;
  close.onclick = shut;
  modal.onclick = (e) => { if (e.target === modal) shut(); };
  document.addEventListener("keydown", (e)=>{ if(e.key==="Escape") shut(); });

  if (btnExport) btnExport.onclick = () => {
    if (!S) { msg.textContent = "目前尚未建立角色，無可匯出存檔。"; return; }
    ta.value = encodeB64(S);
    msg.textContent = "已產生 Base64 代碼。";
  };

  if (btnCopy) btnCopy.onclick = async () => {
    try{
      await navigator.clipboard.writeText(ta.value || "");
      msg.textContent = "已複製到剪貼簿。";
    } catch {
      msg.textContent = "複製失敗（瀏覽器限制）。你可以手動全選複製。";
    }
  };

  if (btnImport) btnImport.onclick = () => {
    try{
      const obj = decodeB64(ta.value || "");
      if (!obj || !obj.memberId || !obj.nickname) throw new Error("bad");
      saveGame(obj);
      S = obj;
      msg.textContent = "匯入成功，已套用存檔。";
      render();
    } catch {
      msg.textContent = "匯入失敗：Base64 或 JSON 格式不正確。";
    }
  };

  if (btnDownload) btnDownload.onclick = () => {
    if (!S) { msg.textContent = "目前尚未建立角色，無可下載存檔。"; return; }
    downloadText(`AT_SAVE_${APP_VERSION}.json`, JSON.stringify(S, null, 2));
    msg.textContent = "已開始下載 JSON。";
  };

  if (fileJson) fileJson.onchange = async () => {
    const f = fileJson.files?.[0];
    if (!f) return;
    try{
      const text = await f.text();
      const obj = JSON.parse(text);
      if (!obj || !obj.memberId || !obj.nickname) throw new Error("bad");
      saveGame(obj);
      S = obj;
      ta.value = encodeB64(obj);
      msg.textContent = "上傳並匯入成功，已套用存檔。";
      render();
    } catch {
      msg.textContent = "上傳失敗：JSON 格式不正確。";
    } finally {
      fileJson.value = "";
    }
  };
}


function hookExeBreakthrough(){
  const btn = document.getElementById("exeBreakBtn");
  if (!btn) return;
  btn.onclick = () => {
    if (!S) return;
    const need = exeNeedFor(S.realmIndex ?? 0, S.tierNum ?? 1, S.currentFloor ?? 1);
    if ((S.exe ?? 0) < need) return;

    S.exe -= need;

    if ((S.tierNum ?? 1) < 10) {
      S.tierNum += 1;
      syncRealmTier();
      pushHistory("system", `你突破成功：境界維持「${S.realm}」，層級提升至「${S.tier}」。`, { realm: S.realm, tier: S.tier });
    } else {
      S.tierNum = 1;
      S.realmIndex = Math.min((S.realmIndex ?? 0) + 1, REALMS.length - 1);
      syncRealmTier();
      pushHistory("system", `你突破大境界：提升至「${S.realm}」，層級重置為「${S.tier}」。`, { realm: S.realm, tier: S.tier });
      S.maxHp = (S.maxHp ?? S.hp ?? 120) + 15;
      S.maxMp = (S.maxMp ?? S.mp ?? 60) + 8;
      S.hp = S.maxHp;
      S.mp = S.maxMp;
    }

    S.exeNeed = exeNeedFor(S.realmIndex, S.tierNum, S.currentFloor ?? 1);
    saveGame(S);
    render();
  };
}
function renderExeInfo(){
  // placeholder for future expansions; kept for dropdown onchange calls
}


function setupBattleModal(){
  const modal = document.getElementById("battleModal");
  const close = document.getElementById("battleClose");
  const body = document.getElementById("battleBody");
  const msg = document.getElementById("battleMsg");
  const btnFight = document.getElementById("battleFight");
  const btnFlee = document.getElementById("battleFlee");

  if (!modal || !close || !body || !btnFight || !btnFlee) return;

  const shut = () => {
    modal.classList.add("hidden");
    if (msg) msg.textContent = "";
  };

  close.onclick = shut;
  modal.onclick = (e) => { if (e.target === modal) shut(); };
  document.addEventListener("keydown", (e)=>{ if(e.key==="Escape") shut(); });

  btnFlee.onclick = () => {
    PendingBattle = null;
    if (msg) msg.textContent = "你選擇撤退，本次未獲得任何收益。";
    setTimeout(shut, 250);
  };

  btnFight.onclick = () => {
    if (!S || !PendingBattle) { shut(); return; }
    const { monsterId } = PendingBattle;
    PendingBattle = null;
    try{
      doFight(monsterId);
      setTimeout(shut, 250);
    } catch {
      if (msg) msg.textContent = "戰鬥發生錯誤。";
    }
  };
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
