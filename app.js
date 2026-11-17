const BACKUP_VERSION = '1.3';
const NAV = [
  ['dashboard', '總覽', '⌂'],
  ['inventory', '物資清單', '▦'],
  ['expiry', '效期與汰換', '◷'],
  ['bags', '避難包', '♙'],
  ['plan', '整備計畫', '✓'],
  ['settings', '設定', '⚙']
];
const MOBILE_NAV = NAV;
const CATEGORY_ICONS = {
  '飲水': '滴', '飲水與淨水': '滴', '生活用水': '水', '食物': '食', '烹煮': '火', '烹煮與燃料': '火',
  '電力': '電', '照明': '光', '電力與照明': '電', '醫療': '醫', '醫療與個人用藥': '醫', '衛生': '潔',
  '衛生與停水如廁': '潔', '衣物': '衣', '衣物與保暖': '衣', '文件': '文', '資訊': '訊', '通訊與文件': '訊', '工具': '具'
};
const ITEM_STATUS_LABELS = { not_purchased: '待購', ordered: '待到貨', verified: '已備妥', considering: '考慮中' };
const STATUS_TAG = { verified: 'green', ordered: 'wine', not_purchased: 'gray', considering: 'amber' };
const LEGACY_ITEM_STATUS = new Map([
  ...['verified', '既有', '已持有', '可用', '庫存中', '已備妥', 'owned', 'available', 'in_stock'].map(value => [value, 'verified']),
  ...['ordered', '採購中', '已下單', '待到貨', 'purchasing', 'on_order'].map(value => [value, 'ordered']),
  ...['not_purchased', '待購', '待買', '待採購', 'to_buy'].map(value => [value, 'not_purchased'])
]);
const MILESTONE_NAMES = ['盤點週', '補齊週', '測試週', '驗收週'];
const TASK_PHASE = {
  'water-audit': 0, 'food-audit': 0,
  'no-cook': 1, 'toilet-test': 1, 'conditional': 1,
  bags: 2, 'power-test': 2, 'stove-test': 2,
  school: 3, roles: 3, routes: 3, contacts: 3, drill: 3, schedule: 3
};

const BAG_TEMPLATE = [
  [
    "bag",
    "雙肩背包，靠近出口可取",
    "essential"
  ],
  [
    "water",
    "小瓶飲水，建議起配 1.2 L／人",
    "essential"
  ],
  [
    "food",
    "常溫、拆開即可吃的食物",
    "essential"
  ],
  [
    "lamp",
    "手電筒或頭燈及相容電池",
    "essential"
  ],
  [
    "contact",
    "防水紙本聯絡卡與集合點",
    "essential"
  ],
  [
    "wear",
    "雨衣、保暖層、襪、手套及耐走鞋（鞋可放包旁）",
    "essential"
  ],
  [
    "blanket",
    "鋁毯或輕薄保暖毯",
    "essential"
  ],
  [
    "whistle",
    "哨子",
    "essential"
  ],
  [
    "hygiene",
    "口罩、面紙、濕紙巾、乾洗手及小毛巾",
    "essential"
  ],
  [
    "medical",
    "個人藥品、備用眼鏡或生理用品",
    "if_needed"
  ],
  [
    "docs",
    "防水必要證件影本及少量現金",
    "adult_shared"
  ],
  [
    "power",
    "行動電源與對應線材",
    "adult_shared"
  ],
  [
    "first-aid",
    "基本包紮用品、外傷照護用品及體溫計",
    "adult_shared"
  ],
  [
    "map",
    "紙本與離線地圖、紙筆",
    "adult_shared"
  ],
  [
    "optional",
    "便攜收音機、簡易淨水設備、暖暖包、小睡袋、帽子或防曬用品",
    "if_needed"
  ],
  [
    "comfort",
    "孩子熟悉的輕便小物與可即食點心",
    "if_needed"
  ]
];
const bagMobile = matchMedia('(max-width: 820px)');
const openBagIds = new Set();
let mobileBagId;

let state;
let stateVersion = 0;
let saveInFlight = false;
let currentView = location.hash.replace('#', '') || 'dashboard';
let inventoryFilters = { search: '', category: 'all', status: 'all' };
let toastTimer;
let expiryFilter = 'all';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
const uid = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const todayISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
const dateAtNoon = iso => iso ? new Date(`${iso}T12:00:00+08:00`) : null;
const addDays = (iso, days) => { const d = dateAtNoon(iso); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
const daysBetween = (from, to) => Math.ceil((dateAtNoon(to) - dateAtNoon(from)) / 86400000);
const formatDate = iso => iso ? new Intl.DateTimeFormat('zh-TW', { timeZone:'Asia/Taipei', year:'numeric', month:'short', day:'numeric' }).format(dateAtNoon(iso)) : '待登錄';
const formatActivityTime = iso => iso ? new Intl.DateTimeFormat('zh-TW', { timeZone:'Asia/Taipei', month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' }).format(new Date(iso)) : '剛剛';
const clamp = (num, min, max) => Math.min(max, Math.max(min, num));
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;

async function init() {
  try {
    bindGlobalEvents();
    $('#onboarding-form').addEventListener('submit', startOnboarding);
    $('#onboarding-back').addEventListener('click', () => showOnboardingStep(1));
    const saved = await readHousehold();
    if (!saved) {
      $('#loading').hidden = true;
      $('#onboarding-dialog').addEventListener('cancel',event=>event.preventDefault());
      $('#onboarding-dialog').showModal();
      return;
    }
    showHousehold(saved);
  } catch (error) {
    $('#loading').innerHTML = `<p>無法讀取本機資料：${esc(error.message)}</p>`;
  }
}

function showHousehold(saved) {
  state = migrate(saved.data);
  stateVersion = saved.revision;
  buildNav();
  render();
  $('#loading').hidden = true;
  $('#app').hidden = false;
  setSyncStatus('online','資料儲存在本機','可離線使用');
}

function showOnboardingStep(step) {
  $('#onboarding-counts').hidden = step !== 1;
  const names = $('#onboarding-names');
  names.hidden = step !== 2;
  $$('input',names).forEach(input=>{input.disabled = step !== 2;});
  $('#onboarding-back').hidden = step !== 2;
  $('#onboarding-submit').textContent = step === 1 ? '下一步' : '開始整備';
}

async function startOnboarding(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (saveInFlight) return;
  const counts = [['adult',Number(form.elements.adults.value)],['child',Number(form.elements.children.value)]];
  const days = Number(form.elements.days.value);
  const names = $('#onboarding-names');
  if (names.hidden) {
    if (counts.every(([,count])=>count===0)) { $('#onboarding-error').textContent='至少新增一位成員。'; return; }
    names.innerHTML = counts.flatMap(([type,count])=>Array.from({length:count},(_,index)=>
      `<label>${memberTypeLabel(type)} ${index+1} 姓名<input name="name" data-type="${type}" required maxlength="60"></label>`
    )).join('');
    $('#onboarding-error').textContent='';
    showOnboardingStep(2);
    $('input',names)?.focus();
    return;
  }
  const people = $$('input',names).map(input=>[input.dataset.type,input.value.trim()]);
  if (people.some(([,name])=>!name)) { $('#onboarding-error').textContent='請填寫每位成員的姓名。'; return; }
  const data = makeStarterState(days);
  people.forEach(([type,name])=>addFamilyBag(data,type,name));
  saveInFlight = true;
  try {
    const saved = await writeHousehold(0,migrate(data));
    $('#onboarding-dialog').close();
    showHousehold(saved);
  } catch (error) { $('#onboarding-error').textContent = '無法儲存本機資料，請確認瀏覽器儲存空間。'; }
  finally { saveInFlight = false; }
}

function migrate(raw) {
  const base = structuredClone(raw);
  base.schema_version = BACKUP_VERSION;
  base.updated_on = base.updated_on || todayISO();
  base.settings = {
    ...base.settings,
    prep_start_on: base.settings?.prep_start_on || todayISO(),
    prep_end_on: base.settings?.prep_end_on || addDays(todayISO(),30),
    home_goal_days: base.settings?.home_goal_days || 7,
    expiry_alert_days: base.settings?.expiry_alert_days || [30, 60, 90]
  };
  base.items = (base.items || []).map(item => ({ archived: false, location: null, ...item, status: LEGACY_ITEM_STATUS.get(String(item.status ?? '').trim().toLowerCase()) || 'considering' }));
  base.inventory_batches = (base.inventory_batches || base.batches || []).map(batch => ({
    expiry_precision: batch.expires_on ? 'date' : 'unknown', location: null, archived: false, ...batch
  }));
  base.go_bags = (base.go_bags || []).map(bag => {
    const memberId = bag.memberId || bag.member_id || bag.id;
    const member = base.members.find(entry => entry.id === memberId);
    return {
      carrier_member_id:memberId, archived:false, ...bag, memberId, member_id:memberId,
      user_name:bag.user_name || member?.label || '家庭成員',
      member_type:bag.member_type || (['兒童','孩童','child'].includes(member?.age_group) ? 'child' : 'adult')
    };
  });
  base.settings.water_l_per_person_day = Number(base.settings.water_l_per_person_day) > 0 ? Number(base.settings.water_l_per_person_day) : 3;
  syncFamilyCounts(base);
  base.bag_checklist = (base.bag_checklist || base.go_bag_items || []).map(item => ({ ...item, status: item.status || 'unverified' }));
  base.household_tasks = (base.household_tasks || []).map(task => ({ ...task, phase: TASK_PHASE[task.id] ?? 3 }));
  base.history = base.history || [];
  base.categories = base.categories || [...new Set(base.items.map(item => item.category))];
  return base;
}

async function save(summary = '更新家庭資料') {
  state.updated_on = todayISO();
  saveInFlight = true;
  setSyncStatus('saving','儲存中',summary);
  try {
    const saved = await writeHousehold(stateVersion,state);
    stateVersion = saved.revision;
    if (saved.conflict) {
      state = migrate(saved.data);
      render();
      showToast('另一個分頁已更新資料，請用目前版本重新操作。');
      return false;
    }
    setSyncStatus('online','已儲存','資料保存在此瀏覽器');
    return true;
  } catch (error) {
    setSyncStatus('offline','儲存失敗','請確認瀏覽器儲存空間');
    showToast(`尚未儲存：${error.message}`);
    return false;
  } finally { saveInFlight = false; }
}

function setSyncStatus(status, label, detail) {
  const dot = $('#sync-dot'); const mobileDot = $('#mobile-sync-dot');
  [dot, mobileDot].filter(Boolean).forEach(el => { el.className = `sync-dot ${status}`; });
  if ($('#sync-label')) $('#sync-label').textContent = label;
  if ($('#sync-detail')) $('#sync-detail').textContent = detail;
}

function buildNav() {
  $('#side-nav').innerHTML = NAV.map(navButton).join('');
  $('#bottom-nav').innerHTML = MOBILE_NAV.map(navButton).join('');
}

function navButton([id, label, icon]) {
  return `<button class="nav-btn" data-view="${id}"><span class="nav-icon">${icon}</span><span>${label}</span></button>`;
}

function render() {
  if (!NAV.some(([id]) => id === currentView)) currentView = 'dashboard';
  $$('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.view === currentView));
  const remaining = daysBetween(todayISO(), state.settings.prep_end_on);
  $('#side-days').textContent = remaining >= 0 ? `還有 ${remaining} 天` : `逾期 ${Math.abs(remaining)} 天`;
  $('#side-deadline').textContent = `至 ${formatDate(state.settings.prep_end_on)}`;
  const views = { dashboard: renderDashboard, inventory: renderInventory, expiry: renderExpiry, bags: renderBags, plan: renderPlan, settings: renderSettings };
  $('#main').innerHTML = views[currentView]();
  $('#main').focus({ preventScroll: true });
}

function pageHead(eyebrow, title, text, actions = '') {
  return `<header class="page-head"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p>${text}</p></div><div class="head-actions">${actions}</div></header>`;
}

function activeItems() { return state.items.filter(item => !item.archived); }
function activeBatches() { return state.inventory_batches.filter(batch => !batch.archived && !batch.rotation_pending); }
function itemById(id) { return state.items.find(item => item.id === id); }
function memberById(id) { return state.members.find(member => member.id === id); }
function isReady(item) { return item.status === 'verified'; }
function requiredItems() { return activeItems().filter(item => item.priority !== 'P3'); }
function overallProgress() { const items = requiredItems(); return items.length ? Math.round(items.filter(isReady).length / items.length * 100) : 0; }
function validBatch(batch) { return batch.status === 'verified' && (!batch.expires_on || daysBetween(todayISO(), batch.expires_on) >= 0); }

function waterLiters() {
  const fromBatches = activeBatches().filter(batch => batch.item_id === 'water' && validBatch(batch)).reduce((sum, batch) => sum + number(batch.verified_quantity) * number(batch.package_volume_l || (batch.package_unit === 'L' ? batch.package_value : 0)), 0);
  const item = itemById('water');
  return Math.max(fromBatches, item?.status === 'verified' ? number(item.verified_quantity) : 0);
}

function foodKcal(noCookOnly = false) {
  return activeBatches().filter(batch => {
    const item = itemById(batch.item_id);
    const food = item?.category === '食物';
    const noCook = ['no_cook', 'no_cook_if_label_allows'].includes(item?.prep_type);
    return food && validBatch(batch) && batch.package_unit === 'kcal' && (!noCookOnly || noCook);
  }).reduce((sum, batch) => sum + number(batch.verified_quantity) * number(batch.package_value), 0);
}

function activeBags(base = state) { return base.go_bags.filter(bag => !bag.archived); }

function syncFamilyCounts(base) {
  const bags = activeBags(base);
  base.settings.adults = bags.filter(bag=>bag.member_type === 'adult').length;
  base.settings.children = bags.filter(bag=>bag.member_type === 'child').length;
}

function liters(value) { return Number(value.toFixed(2)).toLocaleString('zh-TW'); }

function waterPlan() {
  const { adults, children, home_goal_days:days, water_l_per_person_day:daily } = state.settings;
  const total = adults + children;
  const recordedByBatch = activeBatches().filter(batch=>batch.item_id==='water').reduce((sum,batch)=>
    sum + number(batch.verified_quantity ?? batch.reported_quantity) * number(batch.package_volume_l ?? (batch.package_unit==='L' ? batch.package_value : 0)),0);
  const item = itemById('water');
  const recorded = recordedByBatch || number(item?.verified_quantity ?? item?.reported_quantity);
  return {adults,children,days,daily,total,suggested:total*daily*days,recorded};
}

function bagCompletion(bag) {
  const essentials = state.bag_checklist.filter(item => item.bag_id === bag.id && item.requirement === 'essential');
  const checked = essentials.filter(item => item.status === 'verified').length;
  const percent = essentials.length ? Math.round(checked / essentials.length * 100) : 0;
  return { checked, total:essentials.length, percent, complete:percent === 100 };
}

function expiryInfo(batch) {
  if (batch.expiry_precision === 'none') return { bucket: 'none', label: '無效期', tone: 'gray', days: Infinity };
  if (!batch.expires_on || batch.expiry_precision === 'unknown') return { bucket: 'unknown', label: '待登錄', tone: 'amber', days: Infinity };
  const days = daysBetween(todayISO(), batch.expires_on);
  if (days < 0) return { bucket: 'expired', label: `已過期 ${Math.abs(days)} 天`, tone: 'red', days };
  if (days === 0) return { bucket: 'today', label: '今天到期', tone: 'red', days };
  if (days <= 7) return { bucket: '7', label: `${days} 天後`, tone: 'amber', days };
  if (days <= 30) return { bucket: '30', label: `${days} 天後`, tone: 'amber', days };
  if (days <= 60) return { bucket: '60', label: `${days} 天後`, tone: 'wine', days };
  if (days <= 90) return { bucket: '90', label: `${days} 天後`, tone: 'gray', days };
  return { bucket: 'later', label: `${days} 天後`, tone: 'green', days };
}

function renderDashboard() {
  const progress = overallProgress();
  const water = waterLiters();
  const plan = waterPlan();
  const waterDays = water / (plan.total * plan.daily || 1);
  const dailyKcal = state.members.reduce((sum, member) => sum + number(member.planning_kcal_per_day), 0);
  const noCookDays = foodKcal(true) / dailyKcal;
  const bags = activeBags().map(bagCompletion);
  const completeBags = bags.filter(bag => bag.complete).length;
  const expiring = activeBatches().map(batch => ({ batch, info: expiryInfo(batch) })).filter(entry => ['expired', 'today', '7', '30'].includes(entry.info.bucket));
  const tasks = state.household_tasks.filter(task => task.status !== 'done').sort((a,b) => a.priority.localeCompare(b.priority)).slice(0, 5);
  return pageHead('FAMILY READINESS', '家庭防災準備工具', `以 ${plan.total} 人、居家 ${plan.days} 天為目標。先完成可驗證的水、免煮食物與每人的避難包。`, `<button class="btn btn-secondary" data-view="plan">看下一步</button><button class="btn btn-primary" data-action="open-item">＋ 新增物資</button>`)
    + `<section class="hero-grid">
      ${metricCard('整體整備', `${progress}%`, `${requiredItems().filter(isReady).length}／${requiredItems().length} 項必要物資已備妥`, progress, true)}
      ${metricCard('居家飲水', water ? `${waterDays.toFixed(1)} 天` : '待複核', `已登錄 ${liters(plan.recorded)} L · ${plan.days} 天建議 ${liters(plan.suggested)} L`, clamp(water / (plan.suggested || 1) * 100, 0, 100))}
      ${metricCard('免煮食物', noCookDays ? `${noCookDays.toFixed(1)} 天` : '待盤點', noCookDays ? `${Math.round(foodKcal(true)).toLocaleString()} kcal 已確認` : '先準備一天份的家庭免煮餐', clamp(noCookDays / 1 * 100, 0, 100))}
      ${metricCard('緊急避難包', `${completeBags}／${bags.length}`, `平均完成 ${Math.round(bags.reduce((s,b)=>s+b.percent,0)/Math.max(1,bags.length))}% · 必要項目`, completeBags / Math.max(1,bags.length) * 100)}
    </section>
    <section class="panel" style="margin-top:18px">
      <div class="panel-head"><div><h2>居家儲備階段</h2><span class="subtle">飲水與食物取較短者；未盤點的部分不計入</span></div><button class="btn btn-ghost btn-small" data-view="inventory">前往盤點</button></div>
      <div class="stage-track">${state.home_stages.slice(0,4).map((stage, i) => {
        const pct = Math.round(clamp(Math.min(waterDays / stage.days, noCookDays / stage.days) * 100, 0, 100));
        return `<div class="stage ${stage.days === state.settings.home_goal_days ? 'active':''}"><strong>${esc(stage.label)}</strong><span>${pct}% · 水 ${liters(plan.total * plan.daily * stage.days)} L</span><div class="progress" style="--p:${pct}%"><i></i></div></div>`;
      }).join('')}</div>
    </section>
    <section class="content-grid">
      <div class="panel"><div class="panel-head"><h2>優先下一步</h2><button class="btn btn-ghost btn-small" data-view="plan">全部任務</button></div><div class="priority-list">
        ${tasks.map(task => `<div class="list-row"><span class="status-dot"></span><div><strong>${esc(task.title)}</strong><small>${esc(task.acceptance)}</small></div><span class="tag ${task.priority === 'P1' ? 'wine':'gray'}">${esc(task.priority)}</span></div>`).join('') || empty('目前沒有待辦')}
      </div></div>
      <div class="panel"><div class="panel-head"><h2>近期到期</h2><button class="btn btn-ghost btn-small" data-view="expiry">管理效期</button></div><div class="expiry-list">
        ${expiring.sort((a,b)=>a.info.days-b.info.days).slice(0,5).map(({batch,info}) => `<div class="list-row"><span class="status-dot"></span><div><strong>${esc(itemById(batch.item_id)?.name || '未知物資')}</strong><small>${esc(batch.location || '位置待登錄')} · ${number(batch.verified_quantity || batch.reported_quantity)} 件</small></div><span class="tag ${info.tone}">${info.label}</span></div>`).join('') || empty('30 天內沒有已登錄的到期批次')}
      </div></div>
    </section>`;
}

function metricCard(label, value, note, pct, feature = false) {
  return `<article class="metric-card ${feature ? 'feature':''}"><div class="metric-top"><span>${label}</span><span class="ring" style="--p:${Math.round(pct)}"></span></div><div class="metric-value">${value}</div><div class="metric-note">${note}</div></article>`;
}

function renderInventory() {
  const categories = [...new Set(activeItems().map(item => item.category))];
  const items = activeItems().filter(item => {
    const term = inventoryFilters.search.toLowerCase();
    return (!term || `${item.name} ${item.note || ''} ${item.location || ''}`.toLowerCase().includes(term))
      && (inventoryFilters.category === 'all' || item.category === inventoryFilters.category)
      && (inventoryFilters.status === 'all' || item.status === inventoryFilters.status);
  });
  return pageHead('INVENTORY', '物資清單', `${activeItems().length} 項物資；用分類、狀態與位置快速完成盤點。`, `<button class="btn btn-secondary" data-action="open-batch">＋ 登錄批次</button><button class="btn btn-primary" data-action="open-item">＋ 新增物資</button>`)
    + `<div class="toolbar"><input id="inventory-search" class="search" value="${esc(inventoryFilters.search)}" placeholder="搜尋名稱、位置或備註"><select id="inventory-category"><option value="all">全部分類</option>${categories.map(c=>`<option ${inventoryFilters.category===c?'selected':''}>${esc(c)}</option>`).join('')}</select><select id="inventory-status"><option value="all">全部狀態</option>${Object.entries(ITEM_STATUS_LABELS).map(([k,v])=>`<option value="${k}" ${inventoryFilters.status===k?'selected':''}>${v}</option>`).join('')}</select><span class="subtle">顯示 ${items.length} 項</span></div>
    <div class="inventory-list">${items.map(inventoryRow).join('') || empty('沒有符合條件的物資')}</div>`;
}

function inventoryRow(item) {
  const qty = item.verified_quantity ?? item.reported_quantity;
  const target = item.target_quantity;
  const batchDates = activeBatches().filter(batch => batch.item_id === item.id && batch.expires_on).map(batch => batch.expires_on).sort();
  return `<article class="inventory-row">
    <div class="inventory-name"><span class="category-icon">${esc(CATEGORY_ICONS[item.category] || '物')}</span><div><strong title="${esc(item.name)}">${esc(item.name)}</strong><small>${esc(item.category)} · ${esc(item.priority)} · ${scopeLabel(item.scope)}</small></div></div>
    <div class="quantity"><span class="cell-label">可用／目標</span><strong>${qty ?? '—'}${target != null ? `／${target}`:''}</strong> <small>${esc(item.unit || '')}</small></div>
    <div class="status-cell"><span class="cell-label">狀態</span><br><span class="tag ${STATUS_TAG[item.status] || 'gray'}">${ITEM_STATUS_LABELS[item.status]}</span></div>
    <div class="location-cell"><span class="cell-label">位置／最近效期</span><br><small>${esc(item.location || '待登錄')} · ${batchDates[0] ? formatDate(batchDates[0]) : '—'}</small>${item.id === 'water' ? `<small class="water-item-goal">居家建議 ${liters(waterPlan().suggested)} L</small>` : ''}</div>
    <div class="row-actions"><button title="${item.status==='verified'?'取消備妥':'標記備妥'}" data-action="toggle-ready" data-id="${esc(item.id)}">${item.status==='verified'?'↶':'✓'}</button><button title="編輯" data-action="edit-item" data-id="${esc(item.id)}">✎</button><button title="封存" data-action="archive-item" data-id="${esc(item.id)}">⌫</button></div>
  </article>`;
}

const EXPIRY_FILTERS = [
  ['all', '全部批次', 'gray'],
  ['expired', '已過期', 'red'],
  ['today', '今天到期', 'red'],
  ['7', '7 天內', 'amber'],
  ['30', '30 天內', 'amber'],
  ['60', '31–60 天', 'wine'],
  ['90', '61–90 天', 'gray'],
  ['within-90', '90 天內', 'gray'],
  ['later', '較晚到期', 'green'],
  ['none', '無效期', 'gray'],
  ['unknown', '待登錄', 'amber']
];

function batchName(batch) { return itemById(batch.item_id)?.name || '未知物資'; }
function batchLabel(batch) { return batch.lot_number || batch.batch_number || batch.lot || batch.id; }
function batchExpiry(batch) {
  if (batch.expiry_precision === 'none') return '無效期';
  if (batch.expiry_precision === 'unknown' || !batch.expires_on) return '待登錄';
  return formatDate(batch.expires_on);
}

function formatRotationTime(iso) {
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
  }).format(new Date(iso));
}

function expiryDetail(label, content) {
  return `<div><dt>${label}</dt><dd>${content}</dd></div>`;
}

function matchesExpiryFilter(info, key) {
  if (key === 'all') return true;
  if (key === '30') return info.days > 0 && info.days <= 30;
  if (key === 'within-90') return info.days > 0 && info.days <= 90;
  return info.bucket === key;
}

function renderExpiry() {
  const rows = activeBatches().map(batch => ({ batch, info: expiryInfo(batch) })).sort((a,b) => a.info.days - b.info.days);
  const selected = EXPIRY_FILTERS.find(([key]) => key === expiryFilter);
  const visible = rows.filter(({info}) => matchesExpiryFilter(info, expiryFilter));
  const pending = state.inventory_batches.filter(batch => batch.rotation_pending);
  const history = [...state.history].sort((a,b) =>
    String(b.completed_at || b.rotated_on || '').localeCompare(String(a.completed_at || a.rotated_on || ''))
  ).slice(0, 20);
  return pageHead('EXPIRY & ROTATION', '效期與汰換', '依效期篩選庫存。標記汰換後，可在同頁取消或完成處理。', '<button class="btn btn-primary" data-action="open-batch">＋ 登錄批次</button>')
    + `<section class="expiry-summary" aria-label="依效期篩選">
      ${EXPIRY_FILTERS.map(([key,label,tone]) => `<button type="button" class="summary-chip expiry-filter" data-action="filter-expiry" data-id="${key}" aria-pressed="${expiryFilter === key}" aria-controls="expiry-results"><strong>${key === 'all' ? rows.length : rows.filter(({info}) => matchesExpiryFilter(info, key)).length}</strong><span class="tag ${tone}">${label}</span></button>`).join('')}
    </section>
    <section class="panel expiry-panel" id="expiry-results" aria-labelledby="expiry-results-title"><div class="panel-head"><h2 id="expiry-results-title">${selected[1]}</h2><span class="subtle" role="status">${visible.length} 批</span></div>
      ${visible.map(renderExpiryBatch).join('') || empty('此分類目前沒有品項')}
    </section>
    <section class="panel expiry-panel" id="rotation-queue" aria-labelledby="rotation-title"><div class="panel-head"><h2 id="rotation-title">汰換區</h2><span class="tag wine">${pending.length} 批待處理</span></div>
      ${pending.map(renderPendingBatch).join('') || empty('目前沒有待處理的批次')}
    </section>
    <section class="panel expiry-panel" aria-labelledby="rotation-history-title"><div class="panel-head"><h2 id="rotation-history-title">近期汰換紀錄</h2><span class="subtle">最近 20 筆</span></div>
      ${history.map(renderRotationRecord).join('') || empty('目前沒有汰換紀錄')}
    </section>`;
}

function renderExpiryBatch({batch, info}) {
  const item = itemById(batch.item_id);
  return `<article class="expiry-entry"><h3>${esc(batchName(batch))}</h3><dl class="expiry-details">
    ${expiryDetail('批次', esc(batchLabel(batch)))}
    ${expiryDetail('效期', esc(batchExpiry(batch)))}
    ${expiryDetail('剩餘／逾期', Number.isFinite(info.days) ? esc(info.label) : '—')}
    ${expiryDetail('數量', `${number(batch.verified_quantity ?? batch.reported_quantity)} ${esc(batch.package_unit || item?.unit || '件')}`)}
    ${expiryDetail('存放位置', esc(batch.location || item?.location || '待登錄'))}
    ${expiryDetail('目前狀態', `<span class="tag ${info.tone}">${esc(info.label)}</span> ${esc(ITEM_STATUS_LABELS[item?.status] || '考慮中')}`)}
    </dl><div class="expiry-actions"><button class="btn btn-secondary btn-small" data-action="edit-batch" data-id="${esc(batch.id)}">編輯批次</button><button class="btn btn-secondary btn-small" data-action="rotate-batch" data-id="${esc(batch.id)}">汰換</button></div></article>`;
}

function renderPendingBatch(batch) {
  const pending = batch.rotation_pending;
  return `<article class="expiry-entry"><h3>${esc(batchName(batch))}</h3><dl class="expiry-details">
    ${expiryDetail('批次', esc(batchLabel(batch)))}
    ${expiryDetail('原效期', esc(batchExpiry(batch)))}
    ${expiryDetail('標記日期', formatRotationTime(pending.marked_at))}
    ${expiryDetail('原因／備註', esc(pending.note || '效期汰換'))}
    ${expiryDetail('標記人', esc(pending.marked_by))}
    </dl><div class="expiry-actions"><button class="btn btn-secondary btn-small" data-action="cancel-rotation" data-id="${esc(batch.id)}">取消汰換</button><button class="btn btn-danger btn-small" data-action="complete-rotation" data-id="${esc(batch.id)}">完成處理並刪除</button></div></article>`;
}

function renderRotationRecord(record) {
  const legacyBatch = state.inventory_batches.find(batch => batch.id === record.batch_id);
  return `<article class="expiry-entry"><h3>${esc(record.item_name || itemById(record.item_id)?.name || '未知物資')}</h3><dl class="expiry-details">
    ${expiryDetail('批次', esc(record.batch_label || (legacyBatch ? batchLabel(legacyBatch) : record.batch_id) || '未記錄'))}
    ${expiryDetail('原效期', esc(record.original_expiry || (legacyBatch ? batchExpiry(legacyBatch) : '未記錄')))}
    ${expiryDetail('完成時間', record.completed_at ? formatRotationTime(record.completed_at) : formatDate(record.rotated_on))}
    ${expiryDetail('處理人', esc(record.completed_by || '未記錄'))}
    ${expiryDetail('備註', esc([record.outcome, record.note || record.reason].filter(Boolean).join(' · ') || '—'))}
    </dl></article>`;
}


function renderBags() {
  const bags = activeBags();
  if (bagMobile.matches && (mobileBagId === undefined || (mobileBagId && !bags.some(bag=>bag.id===mobileBagId)))) {
    mobileBagId = bags[0]?.id;
    if (mobileBagId) openBagIds.add(mobileBagId);
  }
  const { adults, children, days, daily, total, suggested, recorded } = waterPlan();
  const difference = suggested - recorded;
  const gap = difference >= 0 ? `尚差 ${liters(difference)} L` : `已超出 ${liters(-difference)} L`;
  const archived = state.go_bags.filter(bag => bag.archived);
  return pageHead('GO BAGS', `${total} 人避難包`, '展開背包即可盤點物品、記錄試背和編輯個人清單。')
    + `<section class="panel family-panel"><div class="panel-head"><h2>家庭成員設定</h2><button class="btn btn-secondary" data-action="family-settings">調整設定</button></div>
    <p>${adults} 位成人、${children} 位孩童 · 準備 ${days} 天</p>
    <h3>居家飲水建議</h3><p>（${adults} 位成人＋${children} 位孩童）× ${liters(daily)} L／人／日 × ${days} 天 ＝ <strong>${liters(suggested)} L</strong></p>
    <p>目前已登錄 ${liters(recorded)} L · <strong>${gap}</strong> · 已確認可用 ${liters(waterLiters())} L</p></section>
    <section class="bags-grid">${bags.map(renderBagCard).join('')}</section>
    ${archived.length ? `<section class="panel family-panel archived-bags"><h2>已封存的避難包</h2>${archived.map(bag => `<div class="list-row"><div><strong>${esc(bag.user_name)}</strong><small>${memberTypeLabel(bag.member_type)}</small></div><button class="btn btn-secondary btn-small" data-action="restore-bag" data-id="${esc(bag.id)}">還原背包</button></div>`).join('')}</section>` : ''}`;
}

function memberTypeLabel(type) { return type === 'child' ? '孩童' : '成人'; }

function renderBagCard(bag) {
  const completion = bagCompletion(bag);
  const checklist = state.bag_checklist.filter(item => item.bag_id === bag.id);
  const custom = checklist.filter(item => item.requirement === 'custom');
  const open = openBagIds.has(bag.id) && (!bagMobile.matches || mobileBagId === bag.id);
  return `<article class="bag-card"><div class="bag-head"><div class="bag-title"><span class="avatar">${esc(bag.user_name.slice(0,2))}</span><div><h3>${esc(bag.user_name)}</h3><small>${memberTypeLabel(bag.member_type)} · 必要項目 ${completion.checked}／${completion.total}</small></div></div><span class="tag ${completion.complete?'green':'amber'}">${completion.percent}%</span></div>
    <progress class="bag-progress" value="${completion.percent}" max="100" aria-label="必要項目完成率"></progress>
    <div class="bag-meta"><div><small>位置</small><strong>${esc(bag.location || '待確認')}</strong></div><div><small>重量</small><strong>${bag.packed_weight_kg == null ? '待試背' : `${number(bag.packed_weight_kg)} kg`}</strong></div><div><small>最近試背</small><strong>${formatDate(bag.walk_test_on)}</strong></div></div>
    <div class="bag-actions"><button class="btn btn-secondary" data-action="toggle-bag" data-id="${esc(bag.id)}" aria-expanded="${open}" aria-controls="contents-${esc(bag.id)}">${open ? '收合內容' : '展開內容'}</button><button class="btn btn-ghost" data-action="edit-bag" data-id="${esc(bag.id)}">編輯背包</button></div>
    <div id="contents-${esc(bag.id)}" ${open ? '' : 'hidden'}><p class="subtle">實際背負人 ${esc(memberById(bag.carrier_member_id)?.label || '待指定')}</p>${bag.note ? `<p class="subtle">${esc(bag.note)}</p>` : ''}
    <div class="checklist">${checklist.filter(item => item.requirement !== 'custom').map(renderBagItem).join('')}</div>
    <div class="panel-head bag-custom-head"><h4>自訂完成 ${custom.filter(item => item.status === 'verified').length}／${custom.length}</h4><button class="btn btn-secondary btn-small" data-action="add-bag-item" data-id="${esc(bag.id)}">＋ 新增自訂物品</button></div>
    <div class="checklist">${custom.map(renderBagItem).join('') || '<p class="subtle">尚未新增自訂物品</p>'}</div></div></article>`;
}

function renderBagItem(item) {
  const custom = item.requirement === 'custom';
  const checked = item.status === 'verified';
  const label = ({essential:'必要',adult_shared:'成人共用',custom:'個人新增'})[item.requirement] || '視需要';
  return `<div class="bag-item"><label class="check-row ${checked ? 'done' : ''}"><input type="checkbox" data-action="toggle-bag-item" data-id="${esc(item.id)}" ${checked ? 'checked' : ''}><span>${esc(item.label)}${custom ? ` × ${number(item.quantity)}` : ''}${item.template_key === 'water' ? '<small>可依體重、健康與背負能力調整。</small>' : ''}${custom && item.notes ? `<small>${esc(item.notes)}</small>` : ''}</span><small class="tag ${item.requirement === 'essential' ? 'wine' : 'gray'}">${label}</small></label>
  ${custom ? `<div class="bag-actions"><button class="btn btn-ghost btn-small" data-action="edit-bag-item" data-id="${esc(item.id)}">編輯物品</button><button class="btn btn-ghost btn-small" data-action="delete-bag-item" data-id="${esc(item.id)}">刪除物品</button></div>` : ''}</div>`;
}

function renderPlan() {
  const start = state.settings.prep_start_on;
  const offsets = [6, 13, 20, daysBetween(start, state.settings.prep_end_on)];
  const nowOffset = daysBetween(start, todayISO());
  const current = nowOffset <= 6 ? 0 : nowOffset <= 13 ? 1 : nowOffset <= 20 ? 2 : 3;
  const done = state.household_tasks.filter(task => task.status === 'done').length;
  return pageHead('30-DAY PLAN', '一個月整備計畫', `${formatDate(start)} 至 ${formatDate(state.settings.prep_end_on)}，已完成 ${done}／${state.household_tasks.length} 項。`, `<button class="btn btn-secondary" data-view="settings">調整日期</button>`)
    + `<section class="plan-grid">${[0,1,2,3].map(phase => {
      const tasks = state.household_tasks.filter(task => task.phase === phase);
      const phaseDone = tasks.filter(task => task.status === 'done').length;
      return `<div class="week-column ${phase===current?'current':''}"><div class="week-label"><div><p class="eyebrow">WEEK ${phase+1}</p><h3>${MILESTONE_NAMES[phase]}</h3></div><span class="tag ${phaseDone===tasks.length?'green':'gray'}">${phaseDone}／${tasks.length}</span></div><p class="subtle">截止 ${formatDate(addDays(start, offsets[phase]))}</p><div class="progress" style="--p:${tasks.length?phaseDone/tasks.length*100:0}%"><i></i></div>${tasks.map(task => `<article class="task-card ${task.status==='done'?'done':''}"><label><input type="checkbox" data-action="toggle-task" data-id="${esc(task.id)}" ${task.status==='done'?'checked':''}><strong>${esc(task.title)}</strong></label><p>${esc(task.acceptance)}</p></article>`).join('')}</div>`;
    }).join('')}</section>`;
}

function renderSettings() {
  return pageHead('SETTINGS', '設定與備份', '資料保存在目前的瀏覽器，可下載 JSON 備份。')
    + `<section class="settings-grid">
      <div class="panel"><div class="panel-head"><h2>家庭與目標</h2></div>
        <div class="setting-row"><label>整備開始<small>用於四週進度計算</small></label><input type="date" data-setting="prep_start_on" value="${esc(state.settings.prep_start_on)}"></div>
        <div class="setting-row"><label>整備截止<small>逾期任務仍會保留</small></label><input type="date" data-setting="prep_end_on" value="${esc(state.settings.prep_end_on)}"></div>
        <div class="setting-row"><label>居家目標天數<small>總覽儲備目標</small></label><select data-setting="home_goal_days">${[3,7,10,14,30].map(d=>`<option value="${d}" ${number(state.settings.home_goal_days)===d?'selected':''}>${d} 天</option>`).join('')}</select></div>
        <div class="setting-row"><label>近效期提醒<small>預設 30 天</small></label><select data-setting="expiry_primary"><option value="30">30 天</option><option value="60">60 天</option><option value="90">90 天</option></select></div>
      </div>
      <div class="panel"><div class="panel-head"><h2>家庭成員</h2></div><div class="member-list">${state.members.filter(member=>activeBags().some(bag=>bag.memberId===member.id)).map(member => `<div class="member-chip"><span class="avatar">${esc(member.label.slice(0,2))}</span><div><strong>${esc(member.label)}</strong><small>${esc(member.age_group)} · 每日飲水 ${liters(waterPlan().daily)} L</small></div><span class="tag gray">${number(member.planning_kcal_per_day).toLocaleString()} kcal</span></div>`).join('')}</div></div>
      <div class="panel"><div class="panel-head"><h2>備份與還原</h2></div><p class="subtle">備份包含物資、批次、效期、避難包、任務、歷史與設定。匯入會取代此瀏覽器中的資料。</p><div class="head-actions" style="justify-content:flex-start;margin-top:18px"><button class="btn btn-primary" data-action="export">下載 JSON 備份</button><button class="btn btn-secondary" data-action="import">匯入備份</button></div><p class="subtle" style="margin-top:18px">本機版本 ${stateVersion} · 資料格式 ${state.schema_version}</p></div>
      <div class="panel"><div class="panel-head"><h2>封存項目</h2></div><p class="subtle">目前有 ${state.items.filter(item=>item.archived).length} 項封存物資、${state.history.length} 筆汰換紀錄。</p><button class="btn btn-secondary" data-action="restore-archived">復原全部封存</button></div>
    </section>`;
}

function empty(text) { return `<div class="empty">${text}</div>`; }
function scopeLabel(scope) { return ({home:'居家',go_bag:'避難包',shared:'共用'})[scope] || '居家'; }

function bindGlobalEvents() {
  document.addEventListener('click', async event => {
    const view = event.target.closest('[data-view]');
    if (view) { currentView = view.dataset.view; location.hash = currentView; render(); return; }
    const actionEl = event.target.closest('[data-action]');
    if (!actionEl) return;
    const { action, id } = actionEl.dataset;
    if (action === 'filter-expiry') {
      expiryFilter = id;
      render();
      $$('.expiry-filter').find(button => button.dataset.id === id)?.focus({ preventScroll: true });
      return;
    }
    if (saveInFlight && action !== 'export') return;
    if (action === 'open-item') openItemDialog();
    if (action === 'edit-item') openItemDialog(id);
    if (action === 'toggle-ready') toggleReady(id);
    if (action === 'archive-item') archiveItem(id);
    if (action === 'open-batch') openBatchDialog();
    if (action === 'edit-batch') openBatchDialog(id);
    if (action === 'rotate-batch') await rotateBatch(id);
    if (action === 'cancel-rotation') await cancelRotation(id);
    if (action === 'complete-rotation') await completeRotation(id);
    if (action === 'toggle-bag') toggleBag(id);
    if (action === 'family-settings') openFamilySettings();
    if (action === 'restore-bag') await restoreBag(id);
    if (action === 'add-bag-item') openCustomBagItem(id);
    if (action === 'edit-bag-item') openCustomBagItem(null,id);
    if (action === 'delete-bag-item') await deleteCustomBagItem(id);
    if (action === 'edit-bag') openBagDialog(id);
    if (action === 'toggle-task') toggleTask(id);
    if (action === 'export') exportBackup();
    if (action === 'import') $('#import-file').click();
    if (action === 'restore-archived') restoreArchived();
  });
  document.addEventListener('change', event => {
    if (saveInFlight && (event.target.matches('[data-action="toggle-bag-item"]') || event.target.matches('[data-setting]'))) { render(); return; }
    if (event.target.matches('[data-action="toggle-bag-item"]')) toggleBagItem(event.target.dataset.id, event.target.checked);
    if (event.target.matches('[data-setting]')) updateSetting(event.target.dataset.setting, event.target.value);
    if (event.target.id === 'inventory-category') { inventoryFilters.category = event.target.value; render(); }
    if (event.target.id === 'inventory-status') { inventoryFilters.status = event.target.value; render(); }
  });
  document.addEventListener('input', event => {
    if (event.target.id === 'inventory-search') {
      inventoryFilters.search = event.target.value;
      clearTimeout(event.target._timer);
      event.target._timer = setTimeout(render, 180);
    }
  });
  $$('[data-close]').forEach(btn => btn.addEventListener('click', () => $(`#${btn.dataset.close}`).close()));
  $('#item-form').addEventListener('submit', saveItemForm);
  $('#batch-form').addEventListener('submit', saveBatchForm);
  $('#bag-form').addEventListener('submit', saveBagForm);
  $('#custom-bag-form').addEventListener('submit', saveCustomBagItem);
  $('#family-form').addEventListener('submit', saveFamilyForm);
  $('#family-form').addEventListener('input', event => {
    if (['adults','children'].includes(event.target.name)) renderArchiveChoices();
  });
  bagMobile.addEventListener('change', () => { if (state && currentView === 'bags') render(); });
  $('#import-file').addEventListener('change', importBackup);
  window.addEventListener('hashchange', () => { currentView = location.hash.replace('#','') || 'dashboard'; if (state) render(); });
}

function formData(form) { return Object.fromEntries(new FormData(form).entries()); }
function fillForm(form, data) { Object.entries(data || {}).forEach(([key,value]) => { if (form.elements[key]) form.elements[key].value = value ?? ''; }); }

function openItemDialog(id) {
  const form = $('#item-form');
  form.reset();
  $('#item-category').innerHTML = state.categories.map(c => `<option>${esc(c)}</option>`).join('');
  const item = id ? itemById(id) : null;
  $('#item-dialog-title').textContent = item ? '編輯物資' : '新增物資';
  if (item) fillForm(form, item);
  else fillForm(form, { id:'', category:state.categories[0], priority:'P1', scope:'home', status:'considering' });
  if (item) {
    const earliest = activeBatches().filter(batch=>batch.item_id===item.id && batch.expires_on).sort((a,b)=>a.expires_on.localeCompare(b.expires_on))[0];
    form.elements.expires_on.value = earliest?.expires_on || '';
  }
  $('#item-dialog').showModal();
}

function saveItemForm(event) {
  event.preventDefault();
  const data = formData(event.currentTarget);
  const existing = data.id ? itemById(data.id) : null;
  const item = {
    ...(existing || {}), id: existing?.id || uid('item'), name: data.name.trim(), category: data.category, priority: data.priority,
    verified_quantity: data.verified_quantity === '' ? null : number(data.verified_quantity), target_quantity: data.target_quantity === '' ? null : number(data.target_quantity),
    unit: data.unit.trim(), scope: data.scope, status: data.status, location: data.location.trim() || null, note: data.note.trim() || null, checked_on: data.status === 'verified' ? todayISO() : existing?.checked_on || null, archived:false
  };
  if (existing) Object.assign(existing, item); else state.items.push(item);
  if (data.expires_on) {
    let batch = activeBatches().filter(batch => batch.item_id === item.id).sort((a,b)=>(a.expires_on||'9999').localeCompare(b.expires_on||'9999'))[0];
    if (!batch) { batch = { id:uid('batch'), item_id:item.id, verified_quantity:item.verified_quantity || 1, status:item.status==='verified'?'verified':'reported', expiry_precision:'date', archived:false }; state.inventory_batches.push(batch); }
    batch.expires_on = data.expires_on;
  }
  if (!state.categories.includes(item.category)) state.categories.push(item.category);
  save(existing ? `更新物資：${item.name}` : `新增物資：${item.name}`); $('#item-dialog').close(); render(); showToast(existing ? '物資已更新' : '物資已新增');
}

function toggleReady(id) {
  const item = itemById(id);
  if (!item) return;
  if (item.status === 'verified') item.status = 'considering';
  else {
    const qty = item.verified_quantity;
    if (item.target_quantity != null && (qty == null || number(qty) < number(item.target_quantity))) { showToast('可用數量尚未達標，請先補上盤點結果'); openItemDialog(id); return; }
    item.status = 'verified'; item.checked_on = todayISO();
  }
  save(`${item.status === 'verified' ? '備妥' : '取消備妥'}：${item.name}`); render(); showToast(item.status === 'verified' ? '已標記為備妥' : '已取消備妥');
}

function archiveItem(id) {
  const item = itemById(id); if (!item) return;
  item.archived = true; save(`封存物資：${item.name}`); render();
  showToast(`${item.name} 已封存`, '復原', () => { item.archived = false; save(`復原物資：${item.name}`); render(); });
}

function openBatchDialog(id) {
  const form = $('#batch-form'); form.reset();
  $('#batch-item').innerHTML = activeItems().map(item => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('');
  const batch = id ? state.inventory_batches.find(entry => entry.id === id) : null;
  if (batch) fillForm(form, { ...batch, item_select: batch.item_id, package_value: batch.package_value ?? batch.package_volume_l ?? '' });
  else fillForm(form, { id:'', verified_quantity:1, expiry_precision:'date' });
  form.elements.item_select.disabled = Boolean(batch);
  $('#batch-dialog').showModal();
}

function saveBatchForm(event) {
  event.preventDefault(); const data = formData(event.currentTarget);
  const existing = data.id ? state.inventory_batches.find(batch => batch.id === data.id) : null;
  const itemId = existing?.item_id || data.item_select;
  const batch = { ...(existing || {}), id:existing?.id || uid('batch'), item_id:itemId, verified_quantity:number(data.verified_quantity), package_value:data.package_value===''?null:number(data.package_value), package_unit:data.package_unit.trim() || null, expiry_precision:data.expiry_precision, expires_on:['unknown','none'].includes(data.expiry_precision)?null:(data.expires_on||null), location:data.location.trim()||null, note:data.note.trim()||null, checked_on:todayISO(), status:'verified', archived:false };
  if (batch.package_unit === 'L') batch.package_volume_l = batch.package_value;
  if (existing) Object.assign(existing,batch); else state.inventory_batches.push(batch);
  save(`${existing?'更新':'登錄'}批次：${itemById(itemId)?.name || '物資'}`); $('#batch-dialog').close(); render(); showToast(existing?'批次已更新':'批次已登錄');
}

async function rotateBatch(id) {
  const batch = activeBatches().find(entry => entry.id === id);
  if (!batch || saveInFlight) return;
  const form = $('#rotation-form');
  form.reset();
  form.elements.note.value = '效期汰換';
  const confirmed = await rotationDialog('標記批次汰換', batch, false);
  if (!confirmed || saveInFlight) return;
  await saveRotation(`標記汰換：${batchName(batch)}`, '已移至本頁汰換區', () => {
    batch.rotation_pending = {
      marked_at: new Date().toISOString(), marked_by: '本機使用者',
      note: form.elements.note.value.trim() || '效期汰換'
    };
  }, 'rotation-queue');
}

async function cancelRotation(id) {
  const batch = state.inventory_batches.find(entry => entry.id === id && entry.rotation_pending);
  if (!batch || saveInFlight) return;
  await saveRotation(`取消汰換：${batchName(batch)}`, '已取消汰換，批次已回到庫存清單', () => {
    delete batch.rotation_pending;
    expiryFilter = expiryInfo(batch).bucket;
  }, 'expiry-results');
}

async function completeRotation(id) {
  const batch = state.inventory_batches.find(entry => entry.id === id && entry.rotation_pending);
  if (!batch || saveInFlight) return;
  const form = $('#rotation-form');
  form.reset();
  form.elements.note.value = batch.rotation_pending.note || '';
  const confirmed = await rotationDialog('確認完成處理並刪除？', batch, true);
  if (!confirmed || saveInFlight) return;
  await saveRotation(`完成汰換：${batchName(batch)}`, '已移除這個批次，並保留近期汰換紀錄', () => {
    state.history.push({
      id: uid('rotation'), batch_id: batch.id, item_id: batch.item_id,
      item_name: batchName(batch), batch_label: batchLabel(batch), original_expiry: batchExpiry(batch),
      completed_at: new Date().toISOString(), completed_by: '本機使用者',
      quantity: batch.verified_quantity ?? batch.reported_quantity,
      outcome: form.elements.outcome.value, note: form.elements.note.value.trim()
    });
    state.inventory_batches = state.inventory_batches.filter(entry => entry.id !== id);
  }, 'rotation-history-title');
}

function rotationDialog(title, batch, completing) {
  const dialog = $('#rotation-dialog');
  const outcome = $('#rotation-form').elements.outcome;
  $('#rotation-dialog-title').textContent = title;
  $('#rotation-dialog-message').textContent = completing
    ? `將從現行庫存移除「${batchName(batch)}」的批次 ${batchLabel(batch)}，並保留處理紀錄。`
    : `將「${batchName(batch)}」的批次 ${batchLabel(batch)} 移至汰換區。`;
  outcome.closest('label').hidden = !completing;
  outcome.disabled = !completing;
  $('#rotation-submit').textContent = completing ? '確認完成並刪除' : '移至汰換區';
  dialog.returnValue = '';
  return new Promise(resolve => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true });
    dialog.showModal();
  });
}

async function saveRotation(summary, message, apply, destination) {
  const previous = structuredClone(state);
  const previousFilter = expiryFilter;
  const version = stateVersion;
  apply();
  if (!await save(summary)) {
    if (stateVersion === version) state = previous;
    expiryFilter = previousFilter;
    render();
    return;
  }
  render();
  document.getElementById(destination)?.scrollIntoView({ block: 'start' });
  showToast(message);
}


function toggleBag(id) {
  if (openBagIds.has(id) && (!bagMobile.matches || mobileBagId === id)) {
    openBagIds.delete(id);
    if (mobileBagId === id) mobileBagId = null;
  } else {
    if (bagMobile.matches) openBagIds.clear();
    openBagIds.add(id);
    mobileBagId = id;
  }
  render();
  $$('[data-action="toggle-bag"]').find(button => button.dataset.id === id)?.focus({preventScroll:true});
}

async function saveBagChange(summary, apply) {
  const previous = structuredClone(state);
  const version = stateVersion;
  apply();
  const saved = await save(summary);
  if (!saved && stateVersion === version) state = previous;
  render();
  if (saved) showToast(summary);
  return saved;
}

function openBagDialog(id) {
  const bag = activeBags().find(entry => entry.id === id);
  if (!bag) return;
  const form = $('#bag-form');
  form.reset();
  const available = state.members.filter(member => activeBags().some(bag => bag.memberId === member.id) || member.id === bag.carrier_member_id);
  $('#bag-carrier').innerHTML = '<option value="">待指定</option>' + available.map(member => `<option value="${esc(member.id)}">${esc(member.label)}</option>`).join('');
  fillForm(form, bag);
  $('#bag-dialog-title').textContent = `更新 ${bag.user_name} 避難包`;
  $('#bag-dialog').showModal();
}

async function saveBagForm(event) {
  event.preventDefault();
  if (saveInFlight) return;
  const data = formData(event.currentTarget);
  const bag = activeBags().find(entry => entry.id === data.id);
  const name = data.user_name.trim();
  if (!bag || !name) { showToast('請填寫使用者姓名'); return; }
  $('#bag-dialog').close();
  await saveBagChange(`已更新 ${name} 的避難包`, () => {
    Object.assign(bag, {
      user_name:name, member_type:data.member_type, location:data.location.trim() || null,
      packed_weight_kg:data.packed_weight_kg === '' ? null : number(data.packed_weight_kg),
      walk_test_on:data.walk_test_on || null, carrier_member_id:data.carrier_member_id || null,
      note:data.note.trim() || null, checked_on:todayISO()
    });
    const member = memberById(bag.memberId);
    if (member) Object.assign(member,{label:name, age_group:memberTypeLabel(bag.member_type)});
    syncFamilyCounts(state);
  });
}

function openCustomBagItem(bagId, itemId) {
  const item = itemId ? state.bag_checklist.find(entry => entry.id === itemId && entry.requirement === 'custom') : null;
  const bag = activeBags().find(entry => entry.id === (item?.bag_id || bagId));
  if (!bag) return;
  const form = $('#custom-bag-form');
  form.reset();
  fillForm(form, item || {bag_id:bag.id,quantity:1});
  $('#custom-bag-title').textContent = item ? '編輯自訂物品' : '新增自訂物品';
  $('#custom-bag-dialog').showModal();
}

async function saveCustomBagItem(event) {
  event.preventDefault();
  if (saveInFlight) return;
  const data = formData(event.currentTarget);
  const name = data.label.trim();
  if (!name || !activeBags().some(bag => bag.id === data.bag_id)) return;
  const item = state.bag_checklist.find(entry => entry.id === data.id && entry.requirement === 'custom');
  if (data.id && (!item || item.bag_id !== data.bag_id)) return;
  $('#custom-bag-dialog').close();
  await saveBagChange(`已${item ? '更新' : '新增'}自訂物品：${name}`, () => {
    const fields = {label:name,quantity:number(data.quantity),notes:data.notes.trim()};
    if (item) Object.assign(item,fields);
    else state.bag_checklist.push({id:uid('custom'),bag_id:data.bag_id,requirement:'custom',status:'unverified',...fields});
  });
}

async function deleteCustomBagItem(id) {
  const item = state.bag_checklist.find(entry => entry.id === id && entry.requirement === 'custom');
  if (!item || !await confirmAction('刪除自訂物品？',item.label,'確認刪除') || saveInFlight) return;
  await saveBagChange(`已刪除自訂物品：${item.label}`, () => {
    state.bag_checklist = state.bag_checklist.filter(entry => entry.id !== id);
  });
}

async function toggleBagItem(id, checked) {
  const item = state.bag_checklist.find(entry => entry.id === id);
  if (!item || !activeBags().some(bag => bag.id === item.bag_id)) return;
  await saveBagChange(`${checked ? '已完成' : '已取消'}配包：${item.label}`, () => {
    item.status = checked ? 'verified' : 'unverified';
    item.checked_on = checked ? todayISO() : null;
  });
}

function openFamilySettings() {
  const form = $('#family-form');
  const plan = waterPlan();
  $('#family-days').innerHTML = [...new Set([3,7,10,14,30,plan.days])].sort((a,b)=>a-b).map(days=>`<option value="${days}">${days} 天</option>`).join('');
  fillForm(form,plan);
  renderArchiveChoices();
  $('#family-dialog').showModal();
}

function renderArchiveChoices() {
  const form = $('#family-form');
  const plan = waterPlan();
  const selected = new Set($$('input[name="archive"]:checked',form).map(input=>input.value));
  $('#archive-choices').innerHTML = [['adult','adults'],['child','children']].map(([type,key]) => {
    const count = plan[key] - number(form.elements[key].value);
    if (count <= 0 || form.elements[key].value === '') return '';
    return `<fieldset><legend>選擇要封存的${memberTypeLabel(type)}背包（${count} 包）</legend>${activeBags().filter(bag=>bag.member_type===type).map(bag=>`<label><input type="checkbox" name="archive" value="${esc(bag.id)}" ${selected.has(bag.id) ? 'checked' : ''}> ${esc(bag.user_name)}</label>`).join('')}</fieldset>`;
  }).join('');
  $('#family-error').textContent = '';
}

function addFamilyBag(base, type, name) {
  const memberId = uid('member');
  const bagId = 'bag-' + memberId;
  const label = name || `${memberTypeLabel(type)} ${base.go_bags.filter(bag=>bag.member_type===type).length + 1}`;
  base.members.push({id:memberId,label,age_group:memberTypeLabel(type),planning_kcal_per_day:2000});
  base.go_bags.push({id:bagId,member_id:memberId,memberId,user_name:label,member_type:type,archived:false,carrier_member_id:null});
  for (const [key,label,requirement] of BAG_TEMPLATE) {
    if (type === 'child' && requirement === 'adult_shared') continue;
    base.bag_checklist.push({id:`${bagId}-${key}`,bag_id:bagId,template_key:key,label,requirement,status:'unverified'});
  }
}

async function saveFamilyForm(event) {
  event.preventDefault();
  if (saveInFlight) return;
  const fields = new FormData(event.currentTarget);
  const adults = Number(fields.get('adults'));
  const children = Number(fields.get('children'));
  const selected = new Set(fields.getAll('archive'));
  const plan = waterPlan();
  const active = activeBags();
  const change = [['adult',adults-plan.adults],['child',children-plan.children]];
  const valid = adults + children > 0 && change.every(([type,delta]) =>
    active.filter(bag=>bag.member_type===type && selected.has(bag.id)).length === Math.max(0,-delta));
  if (!valid) {
    $('#family-error').textContent = '至少保留一位成員，並依各類別選足要封存的背包。';
    return;
  }
  $('#family-dialog').close();
  await saveBagChange('已更新家庭成員設定', () => {
    active.filter(bag=>selected.has(bag.id)).forEach(bag=>{bag.archived = true;});
    change.forEach(([type,delta])=>{for (let i=0;i<delta;i++) addFamilyBag(state,type);});
    state.settings.home_goal_days = Number(fields.get('days'));
    state.settings.water_l_per_person_day = Number(fields.get('daily'));
    syncFamilyCounts(state);
  });
}

async function restoreBag(id) {
  const bag = state.go_bags.find(entry=>entry.id===id && entry.archived);
  if (!bag) return;
  await saveBagChange(`已還原 ${bag.user_name} 的避難包`, () => {
    bag.archived = false;
    syncFamilyCounts(state);
  });
}

function toggleTask(id) { const task=state.household_tasks.find(entry=>entry.id===id); if(!task)return; task.status=task.status==='done'?'todo':'done'; task.verified_on=task.status==='done'?todayISO():null; save(`${task.status==='done'?'完成':'重新開啟'}任務：${task.title}`); render(); }

function updateSetting(key, value) {
  if (key === 'expiry_primary') state.settings.expiry_alert_days = [number(value),60,90].filter((v,i,a)=>a.indexOf(v)===i).sort((a,b)=>a-b);
  else state.settings[key] = key === 'home_goal_days' ? number(value) : value;
  save('更新家庭整備設定'); render(); showToast('設定已儲存');
}

function exportBackup() {
  const blob = new Blob([JSON.stringify({format:'family-emergency-preparedness',version:1,data:state}, null, 2)], { type:'application/json' });
  const url = URL.createObjectURL(blob); const link=document.createElement('a'); link.href=url; link.download=`家庭防災備份_${todayISO()}.json`; link.click(); URL.revokeObjectURL(url); showToast('備份已下載');
}

async function importBackup(event) {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file || saveInFlight) return;
  try {
    if (file.size > 20_000_000) throw new Error('備份超過 20 MB');
    const backup = JSON.parse(await file.text());
    if (!validateBackup(backup)) throw new Error('備份格式或資料內容不正確');
    const incoming = migrate(backup.data);
    const message = `備份含 ${incoming.items.length} 項物資、${incoming.inventory_batches.length} 批庫存及 ${incoming.go_bags.length} 個避難包。還原會取代此瀏覽器的現有資料。`;
    if (!await confirmAction('確定還原 JSON 備份？',message,'確認還原') || saveInFlight) return;
    await saveBagChange('備份已還原',()=>{state=incoming;});
  } catch (error) { showToast(`匯入失敗：${error.message}`); }
}

function restoreArchived() { const archived=state.items.filter(item=>item.archived); archived.forEach(item=>item.archived=false); save(`復原 ${archived.length} 項封存物資`); render(); showToast(`已復原 ${archived.length} 項物資`); }

function confirmAction(title,message,button='確認') {
  const dialog=$('#confirm-dialog'); $('#confirm-title').textContent=title; $('#confirm-message').textContent=message; $('#confirm-ok').textContent=button;
  dialog.returnValue = '';
  return new Promise(resolve => { const handler=()=>{ dialog.removeEventListener('close',handler); resolve(dialog.returnValue==='ok'); }; dialog.addEventListener('close',handler); dialog.showModal(); });
}

function showToast(message, actionLabel, action) {
  const toast=$('#toast'); clearTimeout(toastTimer); toast.innerHTML=`<span>${esc(message)}</span>${actionLabel?`<button>${esc(actionLabel)}</button>`:''}`; toast.classList.add('show');
  if(actionLabel) $('button',toast).onclick=()=>{ toast.classList.remove('show'); action?.(); };
  toastTimer=setTimeout(()=>toast.classList.remove('show'),5000);
}

init();
