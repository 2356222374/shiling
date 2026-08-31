const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const API = "/api";

// ============================================================
//  存储层
// ============================================================
const store = {
  _get(key) { try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; } },
  _set(key, val) { localStorage.setItem(key, JSON.stringify(val)); },
  _getObj(key) { try { return JSON.parse(localStorage.getItem(key)) || null; } catch { return null; } },

  getFavorites() { return this._get("sl_favs"); },
  isFavorite(id) { return this.getFavorites().some((d) => d.id === id); },
  toggleFavorite(dish) {
    let favs = this.getFavorites();
    const idx = favs.findIndex((d) => d.id === dish.id);
    if (idx >= 0) favs.splice(idx, 1); else favs.unshift(dish);
    this._set("sl_favs", favs);
    updateTabCounts();
    return idx < 0;
  },

  getHistory() { return this._get("sl_hist"); },
  addHistory(dish) {
    let hist = this.getHistory().filter((d) => d.id !== dish.id);
    hist.unshift({ ...dish, viewed_at: Date.now() });
    if (hist.length > 50) hist = hist.slice(0, 50);
    this._set("sl_hist", hist);
    updateTabCounts();
  },
  clearHistory() { this._set("sl_hist", []); updateTabCounts(); },

  getProfile() { return this._getObj("sl_profile"); },
  saveProfile(data) { this._set("sl_profile", data); },
};

function updateTabCounts() {
  const fc = $("#fav-count"), hc = $("#hist-count");
  const favLen = store.getFavorites().length;
  const histLen = store.getHistory().length;
  if (fc) fc.textContent = favLen || "";
  if (hc) hc.textContent = histLen || "";
}
updateTabCounts();

// ============================================================
//  全局菜品缓存（收藏/取消收藏时查找用）
// ============================================================
let _dishCache = [];
function cacheDishes(arr) {
  arr.forEach((d) => { if (!_dishCache.find((c) => c.id === d.id)) _dishCache.push(d); });
}

// ============================================================
//  底部导航
// ============================================================
$$(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$(".nav-item").forEach((b) => b.classList.remove("active"));
    $$(".page").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    $(`#page-${btn.dataset.page}`).classList.add("active");
    if (btn.dataset.page === "discover") initDiscover();
    if (btn.dataset.page === "me") initMe();
  });
});

// ============================================================
//  首页 Tab
// ============================================================
$$(".page-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    $$(".page-tab").forEach((t) => t.classList.remove("active"));
    $$(".tab-content").forEach((c) => c.classList.remove("active"));
    tab.classList.add("active");
    $(`#tab-${tab.dataset.tab}`).classList.add("active");
    if (tab.dataset.tab === "favorites") renderFavorites();
    if (tab.dataset.tab === "history") renderHistory();
  });
});

// ============================================================
//  口味滑块
// ============================================================
["spicy", "sweet", "salty", "sour"].forEach((t) => {
  const slider = $(`#taste-${t}`);
  const label = $(`#val-${t}`);
  if (slider && label) slider.addEventListener("input", () => (label.textContent = slider.value));
  const ms = $(`#me-${t}`);
  const ml = $(`#me-val-${t}`);
  if (ms && ml) ms.addEventListener("input", () => (ml.textContent = ms.value));
});

// 口味档案自动加载到 UI
(function loadProfile() {
  const p = store.getProfile();
  if (!p) return;
  ["spicy", "sweet", "salty", "sour"].forEach((t) => {
    const v = p[t] ?? 3;
    const s = $(`#taste-${t}`); if (s) { s.value = v; $(`#val-${t}`).textContent = v; }
    const ms = $(`#me-${t}`); if (ms) { ms.value = v; $(`#me-val-${t}`).textContent = v; }
  });
  if (p.province) {
    const sel = $("#province-select"); if (sel) sel.value = p.province;
    const msel = $("#me-province"); if (msel) msel.value = p.province;
  }
})();

// 保存口味
function saveProfileFromUI(source) {
  const prefix = source === "me" ? "me-" : "taste-";
  const profile = {
    spicy: +$(`#${prefix}spicy`).value,
    sweet: +$(`#${prefix}sweet`).value,
    salty: +$(`#${prefix}salty`).value,
    sour: +$(`#${prefix}sour`).value,
    province: source === "me" ? $("#me-province").value : $("#province-select").value,
    saved_at: Date.now(),
  };
  store.saveProfile(profile);
  syncProfileToUI(profile);
  showToast("口味档案已保存");
}

function syncProfileToUI(p) {
  ["spicy", "sweet", "salty", "sour"].forEach((t) => {
    const v = p[t] ?? 3;
    [$(`#taste-${t}`), $(`#me-${t}`)].forEach((s) => { if (s) s.value = v; });
    [$(`#val-${t}`), $(`#me-val-${t}`)].forEach((l) => { if (l) l.textContent = v; });
  });
  if (p.province) {
    const sel = $("#province-select"); if (sel) sel.value = p.province;
    const msel = $("#me-province"); if (msel) msel.value = p.province;
  }
}

$("#btn-save-taste").addEventListener("click", () => saveProfileFromUI("home"));
$("#btn-save-profile").addEventListener("click", () => saveProfileFromUI("me"));

// ============================================================
//  推荐
// ============================================================
let _lastRecommendHtml = "";

async function fetchRecommend(count = 5) {
  const province = $("#province-select").value;
  const params = new URLSearchParams({
    province: province || "", city: province || "全国",
    spicy: $(`#taste-spicy`).value, sweet: $(`#taste-sweet`).value,
    salty: $(`#taste-salty`).value, sour: $(`#taste-sour`).value,
    count,
  });
  showLoading();
  try {
    const res = await fetch(`${API}/recommend?${params}`);
    const json = await res.json();
    cacheDishes(json.data.dishes);
    renderResults(json.data);
    _lastRecommendHtml = $("#dish-list").innerHTML;
  } catch {
    $("#dish-list").innerHTML = `<p class="loading" style="color:#e85d3a">网络错误，请重试</p>`;
  }
}
$("#btn-recommend").addEventListener("click", () => fetchRecommend(5));
$("#btn-random").addEventListener("click", () => fetchRecommend(1));

// ============================================================
//  搜索（修复：清空时恢复推荐结果）
// ============================================================
let searchTimer;
$("#search-input").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  const kw = e.target.value.trim();
  if (!kw) {
    if (_lastRecommendHtml) {
      $("#results-header").style.display = "flex";
      $("#results-meta").textContent = "推荐结果";
      $("#dish-list").innerHTML = _lastRecommendHtml;
    }
    return;
  }
  searchTimer = setTimeout(async () => {
    try {
      const res = await fetch(`${API}/search?keyword=${encodeURIComponent(kw)}`);
      const json = await res.json();
      cacheDishes(json.data.dishes);
      renderSearchResults(json.data.dishes, kw);
    } catch {}
  }, 400);
});

// ============================================================
//  渲染
// ============================================================
function showLoading() {
  $("#results-header").style.display = "none";
  $("#dish-list").innerHTML = `<div class="loading">正在为你挑选...</div>`;
}

const seasonCn = { spring: "春", summer: "夏", autumn: "秋", winter: "冬" };

function renderResults(data) {
  $("#results-header").style.display = "flex";
  $("#results-meta").textContent = `${data.province} · ${data.solar_term} · ${seasonCn[data.season] || data.season}季`;
  renderDishList($("#dish-list"), data.dishes, true);
}

function renderSearchResults(dishes, kw) {
  $("#results-header").style.display = "flex";
  if (dishes.length === 0) {
    $("#results-meta").textContent = `"${kw}" 没有结果`;
    $("#dish-list").innerHTML = `<p class="empty-tip">没找到"${kw}"相关菜品<br>试试其他关键词</p>`;
    return;
  }
  $("#results-meta").textContent = `搜索"${kw}" · ${dishes.length} 道菜`;
  renderDishList($("#dish-list"), dishes, false);
}

function renderFavorites() {
  const favs = store.getFavorites();
  $("#fav-meta").textContent = `${favs.length} 道菜`;
  if (!favs.length) { $("#fav-list").innerHTML = `<p class="empty-tip">还没有收藏<br>点击菜品心形即可收藏</p>`; return; }
  renderDishList($("#fav-list"), favs, false);
}

function renderHistory() {
  const hist = store.getHistory();
  if (!hist.length) { $("#history-list").innerHTML = `<p class="empty-tip">还没有浏览记录</p>`; return; }
  renderDishList($("#history-list"), hist, false);
}

$("#btn-clear-history").addEventListener("click", () => { store.clearHistory(); renderHistory(); });

function renderDishList(container, dishes, showScore) {
  if (!dishes.length) { container.innerHTML = `<p class="empty-tip">没找到相关菜品</p>`; return; }
  container.innerHTML = dishes.map((d) => {
    const tasteLabels = { spicy: "辣", sweet: "甜", salty: "咸", sour: "酸", umami: "鲜" };
    const tasteHtml = Object.entries(d.taste || {}).filter(([, v]) => v > 0)
      .map(([k, v]) => `<span class="taste-bar-item">${tasteLabels[k] || k}<span class="taste-bar"><span class="taste-bar-fill" style="width:${v * 20}%"></span></span></span>`).join("");
    const isFav = store.isFavorite(d.id);
    return `
    <div class="dish-card" onclick='showDetail(${JSON.stringify(d).replace(/'/g, "&#39;")})'>
      <div class="dish-card-top">
        <span class="dish-name">${d.name}</span>
        <div class="dish-card-actions">
          ${showScore && d.match_score ? `<span class="dish-score">匹配 ${d.match_score}</span>` : ""}
          <span class="fav-icon ${isFav ? "active" : ""}" onclick="event.stopPropagation();toggleFavCard(${d.id},this)">${isFav ? "&#9829;" : "&#9825;"}</span>
        </div>
      </div>
      <div class="dish-meta">
        <span class="dish-tag cuisine">${d.cuisine}</span>
        <span class="dish-tag">${d.province}</span>
        ${(d.tags || []).slice(0, 2).map((t) => `<span class="dish-tag">${t}</span>`).join("")}
      </div>
      <div class="dish-info">
        <span>${["简单", "简单", "中等", "中等", "较难", "很难"][d.difficulty] || "中等"}</span>
        <span>${d.cook_time}分钟</span>
        <span>${d.calories || "?"}kcal</span>
      </div>
      <div class="taste-bar-group">${tasteHtml}</div>
    </div>`;
  }).join("");
}

function toggleFavCard(id, el) {
  const dish = _dishCache.find((d) => d.id === id);
  if (!dish) { showToast("请重新加载菜品"); return; }
  const added = store.toggleFavorite(dish);
  el.innerHTML = added ? "&#9829;" : "&#9825;";
  el.classList.toggle("active", added);
  showToast(added ? "已收藏" : "已取消收藏");
}

// ============================================================
//  详情弹窗
// ============================================================
function showDetail(dish) {
  store.addHistory(dish);
  cacheDishes([dish]);
  const isFav = store.isFavorite(dish.id);
  const ingredientsHtml = (dish.ingredients || []).map((i) => `<span class="modal-ing-tag">${i}</span>`).join("");
  const stepsHtml = (dish.steps || []).map((s, i) => `<li><span class="step-num">${i + 1}</span><span>${s}</span></li>`).join("");
  const tagsHtml = (dish.tags || []).map((t) => `<span class="modal-tag-item">${t}</span>`).join("");

  $("#modal-content").innerHTML = `
    <div class="modal-top-bar">
      <button class="modal-fav-btn ${isFav ? "active" : ""}" id="modal-fav-btn" onclick="toggleModalFav()">${isFav ? "&#9829; 已收藏" : "&#9825; 收藏"}</button>
      <button class="modal-close" onclick="closeDetail()">&#10005;</button>
    </div>
    <div class="modal-title">${dish.name}</div>
    <div class="modal-cuisine">${dish.cuisine} · ${dish.province}</div>
    <div class="modal-stats">
      <div class="modal-stat"><div class="modal-stat-value">${dish.cook_time}</div><div class="modal-stat-label">分钟</div></div>
      <div class="modal-stat"><div class="modal-stat-value">${["简单", "简单", "中等", "中等", "较难", "很难"][dish.difficulty] || "-"}</div><div class="modal-stat-label">难度</div></div>
      <div class="modal-stat"><div class="modal-stat-value">${dish.calories || "?"}</div><div class="modal-stat-label">千卡</div></div>
      <div class="modal-stat"><div class="modal-stat-value">${dish.serving_size || 2}</div><div class="modal-stat-label">人份</div></div>
    </div>
    <div class="modal-section-title">食材清单</div>
    <div class="modal-ingredients">${ingredientsHtml}</div>
    <div class="modal-section-title">做法步骤</div>
    <ul class="modal-steps">${stepsHtml}</ul>
    ${dish.tip ? `<div class="modal-section-title">大厨提示</div><div class="modal-tip">${dish.tip}</div>` : ""}
    <div class="modal-section-title">标签</div>
    <div class="modal-tags">${tagsHtml}</div>`;

  window._currentDetailDish = dish;
  $("#modal-overlay").style.display = "flex";
  document.body.style.overflow = "hidden";
}

function toggleModalFav() {
  const dish = window._currentDetailDish; if (!dish) return;
  const added = store.toggleFavorite(dish);
  const btn = $("#modal-fav-btn");
  btn.innerHTML = added ? "&#9829; 已收藏" : "&#9825; 收藏";
  btn.classList.toggle("active", added);
  showToast(added ? "已收藏" : "已取消收藏");
}

function closeDetail() { $("#modal-overlay").style.display = "none"; document.body.style.overflow = ""; }
$("#modal-overlay").addEventListener("click", (e) => { if (e.target === e.currentTarget) closeDetail(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDetail(); });

// ============================================================
//  发现页
// ============================================================
let _discoverInited = false;
async function initDiscover() {
  if (_discoverInited) return;
  _discoverInited = true;
  try {
    const res = await fetch(`${API}/solar-terms`);
    const json = await res.json();
    renderSolarGrid(json.data);
  } catch {}
  renderProvinceMap();
}

$$(".discover-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    $$(".discover-tab").forEach((t) => t.classList.remove("active"));
    $$(".discover-content").forEach((c) => c.classList.remove("active"));
    tab.classList.add("active");
    $(`#dtab-${tab.dataset.dtab}`).classList.add("active");
  });
});

const seasonColors = { spring: "#4caf50", summer: "#ff9800", autumn: "#e85d3a", winter: "#2196f3" };
function renderSolarGrid(terms) {
  const grid = $("#solar-grid");
  grid.innerHTML = terms.map((t) => `
    <div class="solar-card ${t.is_current ? "current" : ""}" onclick="loadSeasonDishes('${t.season}','${t.name}')" style="border-left:3px solid ${seasonColors[t.season] || "#ccc"}">
      <div class="solar-name">${t.name}</div>
      <div class="solar-season">${t.season_cn}季 · ${t.month}月</div>
      <div class="solar-desc">${t.desc}</div>
    </div>
  `).join("");
}

async function loadSeasonDishes(season, termName) {
  const section = $("#season-dishes-section");
  section.style.display = "block";
  $("#season-dishes-title").textContent = `${termName} · ${seasonCn[season]}季推荐`;
  $("#season-dishes-list").innerHTML = `<div class="loading">加载中...</div>`;
  try {
    const res = await fetch(`${API}/season/${season}?count=10`);
    const json = await res.json();
    cacheDishes(json.data.dishes);
    $("#season-dishes-meta").textContent = `${json.data.dishes.length} 道菜`;
    renderDishList($("#season-dishes-list"), json.data.dishes, false);
    section.scrollIntoView({ behavior: "smooth" });
  } catch {}
}

const PROVINCES_DATA = [
  { name: "广东", emoji: "\u{1F372}", cuisine: "粤菜" },
  { name: "四川", emoji: "\u{1F336}\uFE0F", cuisine: "川菜" },
  { name: "湖南", emoji: "\u{1F525}", cuisine: "湘菜" },
  { name: "山东", emoji: "\u{1F41F}", cuisine: "鲁菜" },
  { name: "浙江", emoji: "\u{1F990}", cuisine: "浙菜" },
  { name: "江苏", emoji: "\u{1F980}", cuisine: "苏菜" },
  { name: "福建", emoji: "\u{1FAD5}", cuisine: "闽菜" },
  { name: "安徽", emoji: "\u{26F0}\uFE0F", cuisine: "徽菜" },
  { name: "北京", emoji: "\u{1F986}", cuisine: "京菜" },
  { name: "新疆", emoji: "\u{1F356}", cuisine: "西北菜" },
  { name: "陕西", emoji: "\u{1F35C}", cuisine: "西北菜" },
  { name: "甘肃", emoji: "\u{1F961}", cuisine: "西北菜" },
  { name: "云南", emoji: "\u{1F344}", cuisine: "云贵菜" },
  { name: "贵州", emoji: "\u{1FAD9}", cuisine: "云贵菜" },
  { name: "黑龙江", emoji: "\u{1F95F}", cuisine: "东北菜" },
  { name: "吉林", emoji: "\u{1F372}", cuisine: "东北菜" },
  { name: "辽宁", emoji: "\u{1F372}", cuisine: "东北菜" },
  { name: "广西", emoji: "\u{1F35D}", cuisine: "地方小吃" },
  { name: "湖北", emoji: "\u{1F962}", cuisine: "地方小吃" },
  { name: "河南", emoji: "\u{1F967}", cuisine: "地方小吃" },
  { name: "海南", emoji: "\u{1F414}", cuisine: "地方小吃" },
  { name: "重庆", emoji: "\u{1F336}\uFE0F", cuisine: "川菜" },
];

function renderProvinceMap() {
  const grid = $("#map-province-grid");
  grid.innerHTML = PROVINCES_DATA.map((p) => `
    <div class="province-card" onclick="loadProvinceDishes('${p.name}')">
      <div class="province-emoji">${p.emoji}</div>
      <div class="province-name">${p.name}</div>
      <div class="province-cuisine">${p.cuisine}</div>
    </div>
  `).join("");
}

async function loadProvinceDishes(province) {
  const section = $("#map-dishes-section");
  section.style.display = "block";
  $("#map-dishes-title").textContent = `${province}特色菜`;
  $("#map-dishes-list").innerHTML = `<div class="loading">加载中...</div>`;
  try {
    const res = await fetch(`${API}/province/${encodeURIComponent(province)}?limit=20`);
    const json = await res.json();
    cacheDishes(json.data.dishes);
    $("#map-dishes-meta").textContent = `${json.data.total} 道菜`;
    renderDishList($("#map-dishes-list"), json.data.dishes, false);
    section.scrollIntoView({ behavior: "smooth" });
  } catch {}
}

// ============================================================
//  我的页
// ============================================================
function initMe() {
  const p = store.getProfile();
  const favs = store.getFavorites();
  const hist = store.getHistory();

  $("#stat-fav").textContent = favs.length;
  $("#stat-hist").textContent = hist.length;
  $("#stat-province").textContent = p?.province || "-";

  if (p) {
    const tasteLabels = { spicy: "辣", sweet: "甜", salty: "咸", sour: "酸" };
    const bars = ["spicy", "sweet", "salty", "sour"].map((t) => {
      const v = p[t] ?? 3;
      return `<div class="profile-taste-row"><span class="profile-taste-label">${tasteLabels[t]}</span><div class="profile-taste-bar"><div class="profile-taste-fill" style="width:${v * 20}%"></div></div><span class="profile-taste-val">${v}</span></div>`;
    }).join("");
    $("#taste-profile").innerHTML = bars;
    $("#profile-desc").textContent = `${p.province || "全国"} · 辣${p.spicy} 甜${p.sweet} 咸${p.salty} 酸${p.sour}`;

    ["spicy", "sweet", "salty", "sour"].forEach((t) => {
      const v = p[t] ?? 3;
      const ms = $(`#me-${t}`); if (ms) { ms.value = v; $(`#me-val-${t}`).textContent = v; }
    });
    if (p.province) { const msel = $("#me-province"); if (msel) msel.value = p.province; }
  }
}

// ============================================================
//  Toast
// ============================================================
function showToast(msg) {
  let t = document.getElementById("toast-msg");
  if (!t) { t = document.createElement("div"); t.id = "toast-msg"; t.className = "toast"; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 1800);
}

// ============================================================
//  初始化
// ============================================================
fetchRecommend(5);
