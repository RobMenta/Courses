/*
  Liste de course (PWA) â€” 100% front (GitHub Pages)
  - Toggle ON/OFF + prix + quantitÃ© => total
  - SÃ©paration en blocs/familles (ordre magasin)
  - RÃ©organisation par glisser-dÃ©poser (touch-friendly) DANS une famille
  - âœ… Changer un produit de bloc via dropdown
  - âœ… Ajouter un produit dans le bloc choisi
  - âœ… IA: apply + fiable + support category sur add_item
  - Sauvegarde localStorage

  âš ï¸ IA: l'app appelle un BACKEND (Worker / Function). Ne jamais mettre une clÃ© OpenAI ici.
*/

const STORAGE_KEY = "shopping_list_v2"; // <- v2 pour ne pas casser ton ancien stockage
const LEGACY_STORAGE_KEY = "shopping_list_v1";
const SETTINGS_KEY = "shopping_settings_v1";

const DEFAULT_SETTINGS = {
  currency: "EUR",
  qtyMax: 10,
  aiEndpoint: "" // ex: https://ton-worker.workers.dev/ai
};

// ------------------ CATALOG (TES BLOCS + TON ORDRE) ------------------
const CATEGORIES = [
  { name: "Divers", items: ["Tupperwear", "Lingette voiture", "Tableaux", "DÃ©bardeur blanc"] },
  {
    name: "Soins",
    items: [
      "Shampoing","AprÃ¨s Shampoing","Laque","Deo","CrÃ¨me hyd","Masque visage","Gel douche",
      "Coton tige","Bain de bouche","Gratte langue","Dentifrice","Brosse Ã  dent","Mouchoir"
    ]
  },
  {
    name: "Entretient 1",
    items: [
      "Pierre d'argile","Eau dÃ©minÃ©ralisÃ©e","Alcool mÃ©nagÃ©","Savon noir","Acide chlorydrique",
      "Bicarbonate de soude","Percarbonate","Acide citrique","Cristaux de soude","Vinaigre mÃ©nagÃ©","Sel d'oseille"
    ]
  },
  {
    name: "Entretient 2",
    items: [
      "Ã‰ponges","Lessive","Destop","Adoucissant","Liquide vaisselle","Pastille lave vaisselle",
      "Sac poubelle carton","Sac poubelles (50L)","Sopalin","PQ"
    ]
  },
  { name: "Boissons 1", items: ["Lait","Soft","Sirop","Jus"] },
  { name: "Boissons 2", items: ["BiÃ¨res","Vin blanc"] },
  { name: "Petit dej 1", items: ["Sucre","PÃ©pite choco","Agar-agar","Farine","Confiture","Miel","Compotes Ã  boire","Cornichon"] },
  { name: "Petit dej 2", items: ["CafÃ©","ThÃ©","Flocon d'avoine","Barre CÃ©rÃ©ale"] },
  { name: "Sucreries", items: ["Bonbons","Pastille menthe","Country","Prince"] },
  {
    name: "Sec 1",
    items: ["Olives","Huile d'olive","Moutardes","Vinaigre balsamique","Gros sel","Herbe de provence","Cub'or","Piment de cayenne"]
  },
  { name: "Boites 1", items: ["MaÃ¯s","Pois chiches"] },
  { name: "Boites 2", items: ["Thon","CroÃ»tons","Riz","Riz/quinoa prÃ© cuit","PurÃ©e","PÃ¢tes"] },
  { name: "Frais 1", items: ["Tranche dinde","Lardon","Carottes","Gnocchi"] },
  { name: "Frais 2", items: ["Yaourt","Skyr Ã  boire","Compotes"] },
  { name: "Frais 3", items: ["Oeufs","Fromage"] },
  {
    name: "Fruits/lÃ©gumes",
    items: ["Endives","Patate douce","Tomates","Avocats","Concombre","Poivrons","Bananes","Fraises","Pommes","Oignons","Saumon","Pomme de terre"]
  },
  { name: "Viandes", items: ["Saucisses","Escalope","Poisson panÃ©","Cordon bleu"] },
  { name: "SurgelÃ©", items: ["Poivron surgelÃ©","Steak","Poisson","nuggets","Poisson panÃ© (surgelÃ©)","Pomme de terre surgelÃ©","Glaces"] }
];

const CATEGORY_NAMES = CATEGORIES.map((c) => c.name);
const CATEGORY_SET = new Set(CATEGORY_NAMES);

function norm(s) {
  return (s || "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function slugify(s) {
  return norm(s)
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function buildInitialItems() {
  const out = [];
  for (const cat of CATEGORIES) {
    for (const name of cat.items) {
      out.push({
        id: `item_${slugify(cat.name)}_${slugify(name)}`,
        name,
        category: cat.name,
        checked: false,
        qty: 1,
        price: ""
      });
    }
  }
  return out;
}

const INITIAL_STATE = { items: buildInitialItems() };

// ------------------ helpers ------------------
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

function parsePrice(s) {
  if (typeof s !== "string") return 0;
  const cleaned = s.trim().replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function formatEUR(n) {
  try {
    return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch {
    return (Math.round(n * 100) / 100).toFixed(2).replace(".", ",");
  }
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const s = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...s };
  } catch { return { ...DEFAULT_SETTINGS }; }
}

function saveSettings(s) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

function sanitizeCategory(cat) {
  const c = (cat || "").toString().trim();
  if (CATEGORY_SET.has(c)) return c;
  return "Divers";
}

function sanitizeItem(it, fallback) {
  const fb = fallback || it || {};
  return {
    id: String(it?.id ?? fb.id),
    name: String(it?.name ?? fb.name ?? "Produit"),
    category: sanitizeCategory(it?.category ?? fb.category ?? "Divers"),
    checked: Boolean(it?.checked),
    qty: clamp(Number(it?.qty ?? 1) || 1, 1, 999),
    price: (it?.price ?? "").toString()
  };
}

/**
 * Migration:
 * - si un Ã©tat v2 existe => on le charge
 * - sinon on regarde lâ€™ancien v1 => on â€œmergeâ€ les champs (checked/qty/price) sur la nouvelle liste canonique
 * - sinon on prend lâ€™Ã©tat initial canonique
 */
function loadState() {
  // v2
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && Array.isArray(s.items)) {
        const fallbackMap = new Map(INITIAL_STATE.items.map((x) => [x.id, x]));
        const items = s.items.map((it) => sanitizeItem(it, fallbackMap.get(it.id) || it));
        return { items };
      }
    }
  } catch {}

  // legacy v1 -> merge by name
  try {
    const rawLegacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (rawLegacy) {
      const legacy = JSON.parse(rawLegacy);
      if (legacy && Array.isArray(legacy.items)) {
        const byName = new Map();
        for (const it of legacy.items) {
          const key = norm(it.name);
          if (!key) continue;
          if (!byName.has(key)) byName.set(key, it);
        }

        const merged = INITIAL_STATE.items.map((base) => {
          const hit = byName.get(norm(base.name));
          if (!hit) return { ...base };
          return {
            ...base,
            checked: Boolean(hit.checked),
            qty: clamp(Number(hit.qty ?? 1) || 1, 1, 999),
            price: (hit.price ?? "").toString()
          };
        });

        const s2 = { items: merged };
        saveState(s2);
        return s2;
      }
    }
  } catch {}

  return structuredClone(INITIAL_STATE);
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ------------------ DOM ------------------
const els = {
  tabs: Array.from(document.querySelectorAll(".tab")),
  panels: {
    list: document.getElementById("tab-list"),
    recipes: document.getElementById("tab-recipes"),
    budget: document.getElementById("tab-budget")
  },

  itemsList: document.getElementById("itemsList"),
  totalValue: document.getElementById("totalValue"),
  totalHint: document.getElementById("totalHint"),

  searchInput: document.getElementById("searchInput"),

  btnUncheckAll: document.getElementById("btnUncheckAll"),
  btnResetPrices: document.getElementById("btnResetPrices"),
  btnResetAll: document.getElementById("btnResetAll"),

  btnAddQuick: document.getElementById("btnAddQuick"),
  addRow: document.getElementById("addRow"),
  addName: document.getElementById("addName"),
  btnAddConfirm: document.getElementById("btnAddConfirm"),
  btnAddCancel: document.getElementById("btnAddCancel"),

  btnSettings: document.getElementById("btnSettings"),
  settingsDialog: document.getElementById("settingsDialog"),
  aiEndpoint: document.getElementById("aiEndpoint"),
  qtyMax: document.getElementById("qtyMax"),
  btnSaveSettings: document.getElementById("btnSaveSettings"),

  aiPromptRecipes: document.getElementById("aiPromptRecipes"),
  aiOutRecipes: document.getElementById("aiOutRecipes"),

  aiOutBudget: document.getElementById("aiOutBudget"),
  budgetValue: document.getElementById("budgetValue"),
  budgetGoal: document.getElementById("budgetGoal"),
  aiPromptBudget: document.getElementById("aiPromptBudget"),

  // Recettes
  btnApplyAi: document.getElementById("btnApplyAi"),
  btnClearAi: document.querySelectorAll("#btnClearAi"),

  // Budget
  btnApplyAiBudget: document.getElementById("btnApplyAiBudget"),
  btnClearAiBudget: document.getElementById("btnClearAiBudget")
};

let settings = loadSettings();
let state = loadState();
let lastAiPayload = null;
let lastAiKind = null;
let filter = "";

// ------------------ Tabs ------------------
function setActiveTab(tabName) {
  els.tabs.forEach((t) => {
    const active = t.dataset.tab === tabName;
    t.classList.toggle("is-active", active);
    t.setAttribute("aria-selected", active ? "true" : "false");
  });

  Object.entries(els.panels).forEach(([k, panel]) => {
    if (!panel) return;
    panel.classList.toggle("is-active", k === tabName);
  });
}
els.tabs.forEach((t) => t.addEventListener("click", () => setActiveTab(t.dataset.tab)));

// ------------------ Total ------------------
function computeTotal() {
  let total = 0;
  let count = 0;

  for (const it of state.items) {
    if (!it.checked) continue;
    const p = parsePrice(it.price);
    const q = Number(it.qty) || 1;
    if (p > 0) total += p * q;
    count += 1;
  }

  if (els.totalValue) els.totalValue.textContent = formatEUR(total);
  if (els.totalHint) {
    els.totalHint.textContent =
      count === 0 ? "Active un produit + saisis un prix pour lâ€™ajouter au total."
                 : `${count} produit(s) activÃ©(s).`;
  }
}

function qtyOptions(max) {
  const out = [];
  for (let i = 1; i <= max; i++) out.push(i);
  return out;
}

// ------------------ Render (sections) ------------------
function itemsByCategory() {
  const map = new Map();
  for (const cat of CATEGORIES) map.set(cat.name, []);
  for (const it of state.items) {
    const c = sanitizeCategory(it.category);
    if (!map.has(c)) map.set(c, []);
    map.get(c).push(it);
  }
  return map;
}

function makeCategorySelect(current, onChange) {
  const sel = document.createElement("select");
  sel.className = "select";
  sel.title = "Changer de bloc";
  sel.setAttribute("aria-label", "CatÃ©gorie");
  sel.style.width = "120px";
  sel.style.maxWidth = "34vw";

  for (const c of CATEGORY_NAMES) {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    if (c === current) opt.selected = true;
    sel.appendChild(opt);
  }

  sel.addEventListener("change", () => onChange(sel.value));
  return sel;
}

function render() {
  if (!els.itemsList) return;
  els.itemsList.innerHTML = "";

  const qmax = Number(loadSettings().qtyMax) || 10;
  const qopts = qtyOptions(qmax);

  const f = filter.trim().toLowerCase();
  const catMap = itemsByCategory();

  for (const cat of CATEGORIES) {
    let items = catMap.get(cat.name) || [];

    if (f) {
      items = items.filter((it) => it.name.toLowerCase().includes(f));
      if (items.length === 0) continue;
    }

    const sectionLi = document.createElement("li");
    sectionLi.className = "section";
    sectionLi.dataset.category = cat.name;

    const header = document.createElement("div");
    header.className = "section__header";

    const title = document.createElement("div");
    title.className = "section__title";
    title.textContent = cat.name;

    const count = document.createElement("div");
    count.className = "section__count";
    const done = items.filter((x) => x.checked).length;
    count.textContent = `${done}/${items.length}`;

    header.appendChild(title);
    header.appendChild(count);

    const inner = document.createElement("ul");
    inner.className = "section__items";

    sectionLi.appendChild(header);
    sectionLi.appendChild(inner);
    els.itemsList.appendChild(sectionLi);

    for (const it of items) {
      const li = document.createElement("li");
      li.className = "item" + (it.checked ? " is-checked" : "");
      li.dataset.id = it.id;
      li.dataset.category = cat.name;

      const handle = document.createElement("div");
      handle.className = "handle";
      handle.textContent = "â˜°";
      handle.title = f ? "RÃ©ordonnancement dÃ©sactivÃ© pendant la recherche" : "Glisser pour rÃ©ordonner";
      handle.setAttribute("role", "button");
      handle.setAttribute("aria-label", "RÃ©ordonner");
      handle.tabIndex = 0;

      const toggle = document.createElement("button");
      toggle.className = "toggle" + (it.checked ? " is-on" : "");
      toggle.type = "button";
      toggle.setAttribute("aria-pressed", it.checked ? "true" : "false");
      toggle.title = "Valider / annuler";
      toggle.innerHTML = `<span class="toggle__thumb" aria-hidden="true"></span>`;

      const name = document.createElement("div");
      name.className = "name";

      const nameTitle = document.createElement("div");
      nameTitle.className = "name__title";
      nameTitle.textContent = it.name;

      const sub = document.createElement("div");
      sub.className = "name__sub";
      sub.textContent = "Prix unitaire Ã— quantitÃ© (activÃ© = total)";

      name.appendChild(nameTitle);
      name.appendChild(sub);

      const controls = document.createElement("div");
      controls.className = "controls";

      const price = document.createElement("input");
      price.className = "input price";
      price.inputMode = "decimal";
      price.placeholder = "0,00";
      price.value = it.price ?? "";

      const qty = document.createElement("select");
      qty.className = "select qty";
      for (const v of qopts) {
        const opt = document.createElement("option");
        opt.value = String(v);
        opt.textContent = "Ã—" + String(v);
        if (Number(it.qty) === v) opt.selected = true;
        qty.appendChild(opt);
      }

      const catSel = makeCategorySelect(it.category || "Divers", (newCat) => {
        it.category = sanitizeCategory(newCat);
        saveState(state);
        render();
        computeTotal();
      });

      const del = document.createElement("button");
      del.className = "delete";
      del.textContent = "ðŸ—‘ï¸";
      del.title = "Supprimer";

      controls.appendChild(price);
      controls.appendChild(qty);
      controls.appendChild(catSel);
      controls.appendChild(del);

      li.appendChild(handle);
      li.appendChild(toggle);
      li.appendChild(name);
      li.appendChild(controls);
      inner.appendChild(li);

      toggle.addEventListener("click", () => {
        it.checked = !it.checked;
        saveState(state);
        render();
        computeTotal();
      });

      price.addEventListener("input", () => {
        it.price = price.value;
        saveState(state);
        computeTotal();
      });

      qty.addEventListener("change", () => {
        it.qty = Number(qty.value) || 1;
        saveState(state);
        computeTotal();
      });

      del.addEventListener("click", () => {
        if (!confirm(`Supprimer â€œ${it.name}â€ ?`)) return;
        state.items = state.items.filter((x) => x.id !== it.id);
        saveState(state);
        render();
        computeTotal();
      });

      setupDrag(handle, li, inner, cat.name, () => filter.trim() !== "");
    }
  }

  computeTotal();
}

// ------------------ Drag & drop inside a category ------------------
let dragState = null;

function reorderWithinCategory(category, orderedIds) {
  const keep = [];
  const moved = new Map();

  for (const it of state.items) {
    if (sanitizeCategory(it.category) === category) moved.set(it.id, it);
    else keep.push(it);
  }

  const newCat = [];
  for (const id of orderedIds) {
    const it = moved.get(id);
    if (it) newCat.push(it);
  }
  for (const it of moved.values()) if (!newCat.includes(it)) newCat.push(it);

  const byCat = new Map();
  for (const it of [...keep, ...newCat]) {
    const c = sanitizeCategory(it.category);
    if (!byCat.has(c)) byCat.set(c, []);
    byCat.get(c).push(it);
  }

  const rebuilt = [];
  for (const cat of CATEGORIES) {
    const arr = byCat.get(cat.name) || [];
    for (const it of arr) rebuilt.push(it);
  }
  for (const [c, arr] of byCat.entries()) {
    if (!CATEGORIES.some((x) => x.name === c)) rebuilt.push(...arr);
  }

  state.items = rebuilt;
  saveState(state);
}

function setupDrag(handleEl, itemEl, listEl, category, isSearchActive) {
  handleEl.addEventListener("pointerdown", (e) => {
    if (isSearchActive()) return;
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();

    const rect = itemEl.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;

    const placeholder = document.createElement("li");
    placeholder.className = "item";
    placeholder.style.borderStyle = "dashed";
    placeholder.style.opacity = "0.35";
    placeholder.style.height = rect.height + "px";

    itemEl.classList.add("is-dragging");
    itemEl.style.width = rect.width + "px";
    itemEl.style.position = "fixed";
    itemEl.style.left = rect.left + "px";
    itemEl.style.top = rect.top + "px";
    itemEl.style.zIndex = "999";
    itemEl.style.pointerEvents = "none";
    itemEl.style.boxShadow = "0 14px 40px rgba(0,0,0,.5)";

    listEl.insertBefore(placeholder, itemEl.nextSibling);

    dragState = { itemEl, placeholder, offsetY, listEl, category };
    handleEl.setPointerCapture(e.pointerId);
  });

  handleEl.addEventListener("pointermove", (e) => {
    if (!dragState) return;
    e.preventDefault();

    const { itemEl, offsetY, placeholder, listEl } = dragState;

    const listRect = listEl.getBoundingClientRect();
    const y = e.clientY - offsetY;
    itemEl.style.left = listRect.left + "px";
    itemEl.style.top = y + "px";

    const margin = 80;
    const vh = window.innerHeight;
    if (e.clientY < margin) window.scrollBy({ top: -14, left: 0, behavior: "auto" });
    else if (e.clientY > vh - margin) window.scrollBy({ top: 14, left: 0, behavior: "auto" });

    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el) return;

    const targetItem = el.closest("li.item");
    if (!targetItem || targetItem === itemEl || targetItem === placeholder) return;
    if (targetItem.parentElement !== listEl) return;

    const targetRect = targetItem.getBoundingClientRect();
    const before = e.clientY < targetRect.top + targetRect.height / 2;

    if (before) listEl.insertBefore(placeholder, targetItem);
    else listEl.insertBefore(placeholder, targetItem.nextSibling);
  });

  function endDrag(e) {
    if (!dragState) return;
    e.preventDefault();

    const { itemEl, placeholder, listEl, category } = dragState;

    itemEl.classList.remove("is-dragging");
    itemEl.style.position = "";
    itemEl.style.left = "";
    itemEl.style.top = "";
    itemEl.style.width = "";
    itemEl.style.zIndex = "";
    itemEl.style.pointerEvents = "";
    itemEl.style.boxShadow = "";

    listEl.insertBefore(itemEl, placeholder);
    placeholder.remove();
    dragState = null;

    const domIds = Array.from(listEl.querySelectorAll("li.item"))
      .map((li) => li.dataset.id)
      .filter(Boolean);

    reorderWithinCategory(category, domIds);
    render();
  }

  handleEl.addEventListener("pointerup", endDrag);
  handleEl.addEventListener("pointercancel", endDrag);

  handleEl.addEventListener("keydown", (e) => {
    if (isSearchActive()) return;
    if (e.key !== "Enter") return;
    e.preventDefault();

    const id = itemEl.dataset.id;
    const catItems = state.items.filter((it) => sanitizeCategory(it.category) === category);
    const idx = catItems.findIndex((it) => it.id === id);
    if (idx < 0) return;

    const dir = e.shiftKey ? 1 : -1;
    const j = idx + dir;
    if (j < 0 || j >= catItems.length) return;

    const ordered = catItems.map((x) => x.id);
    const tmp = ordered[idx];
    ordered[idx] = ordered[j];
    ordered[j] = tmp;

    reorderWithinCategory(category, ordered);
    render();
  });
}

// ------------------ Search ------------------
if (els.searchInput) {
  els.searchInput.addEventListener("input", () => {
    filter = els.searchInput.value || "";
    render();
  });
}

// ------------------ Add item (âœ… avec catÃ©gorie) ------------------
function ensureAddCategorySelect() {
  if (!els.addRow) return null;

  let sel = document.getElementById("addCategory");
  if (sel) return sel;

  sel = document.createElement("select");
  sel.id = "addCategory";
  sel.className = "select";
  sel.title = "Bloc";
  sel.setAttribute("aria-label", "Bloc");
  sel.style.minWidth = "160px";

  for (const c of CATEGORY_NAMES) {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    sel.appendChild(opt);
  }
  sel.value = "Divers";

  const addNameEl = els.addName;
  if (addNameEl && addNameEl.parentElement) {
    addNameEl.insertAdjacentElement("afterend", sel);
  } else {
    els.addRow.appendChild(sel);
  }
  return sel;
}

function openAdd() {
  if (!els.addRow) return;
  els.addRow.hidden = false;
  ensureAddCategorySelect();
  if (els.addName) { els.addName.value = ""; els.addName.focus(); }
}
function closeAdd() {
  if (!els.addRow) return;
  els.addRow.hidden = true;
}

els.btnAddQuick?.addEventListener("click", () => {
  if (!els.addRow) return;
  if (els.addRow.hidden) openAdd();
  else closeAdd();
});

els.btnAddCancel?.addEventListener("click", (e) => {
  e.preventDefault();
  closeAdd();
});

function findItemBest(name) {
  const q = (name || "").toString().trim();
  if (!q) return null;

  const qn = norm(q);
  let hit = state.items.find((it) => norm(it.name) === qn);
  if (hit) return hit;

  hit = state.items.find((it) => {
    const n = norm(it.name);
    return n.includes(qn) || qn.includes(n);
  });
  if (hit) return hit;

  const qt = norm(q).replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  if (!qt.length) return null;

  let best = null;
  for (const it of state.items) {
    const itTokens = norm(it.name).replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
    if (!itTokens.length) continue;
    let inter = 0;
    const set = new Set(itTokens);
    for (const t of qt) if (set.has(t)) inter++;
    const score = inter / Math.max(1, new Set([...qt, ...itTokens]).size);
    if (!best || score > best.score) best = { it, score };
  }
  if (best && best.score >= 0.55) return best.it;
  return null;
}

function insertItemInCategoryOrder(newItem) {
  const cat = sanitizeCategory(newItem.category);

  const byCat = new Map();
  for (const c of CATEGORY_NAMES) byCat.set(c, []);
  const unknown = [];

  for (const it of state.items) {
    const c = sanitizeCategory(it.category);
    if (byCat.has(c)) byCat.get(c).push(it);
    else unknown.push(it);
  }

  byCat.get(cat).push(newItem);

  const rebuilt = [];
  for (const c of CATEGORY_NAMES) rebuilt.push(...(byCat.get(c) || []));
  rebuilt.push(...unknown);

  state.items = rebuilt;
}

els.btnAddConfirm?.addEventListener("click", (e) => {
  e.preventDefault();
  const name = (els.addName?.value || "").trim();
  if (!name) return;

  const catSel = ensureAddCategorySelect();
  const category = sanitizeCategory(catSel?.value || "Divers");

  const exists = findItemBest(name);
  if (exists) {
    exists.checked = true;
    if (category && sanitizeCategory(exists.category) !== category) exists.category = category;
    saveState(state);
    closeAdd();
    render();
    computeTotal();
    return;
  }

  const id = `item_${slugify(category)}_${Date.now().toString(36)}_${slugify(name)}`;
  const item = { id, name, category, checked: true, qty: 1, price: "" };

  insertItemInCategoryOrder(item);

  saveState(state);
  closeAdd();
  render();
  computeTotal();
});

if (els.addRow) {
  els.addRow.addEventListener("submit", (e) => {
    e.preventDefault();
    els.btnAddConfirm?.click();
  });
}

// ------------------ Bulk actions ------------------
els.btnUncheckAll?.addEventListener("click", () => {
  for (const it of state.items) it.checked = false;
  saveState(state);
  render();
});

els.btnResetPrices?.addEventListener("click", () => {
  if (!confirm("Vider tous les prix ?")) return;
  for (const it of state.items) it.price = "";
  saveState(state);
  render();
  computeTotal();
});

els.btnResetAll?.addEventListener("click", () => {
  if (!confirm("Reset complet (ordre, activations, prix, quantitÃ©s) ?")) return;
  localStorage.removeItem(STORAGE_KEY);
  state = structuredClone(INITIAL_STATE);
  saveState(state);

  filter = "";
  if (els.searchInput) els.searchInput.value = "";
  render();
});

// ------------------ Settings ------------------
els.btnSettings?.addEventListener("click", () => {
  settings = loadSettings();
  if (els.aiEndpoint) els.aiEndpoint.value = settings.aiEndpoint || "";
  if (els.qtyMax) els.qtyMax.value = String(settings.qtyMax || 10);
  els.settingsDialog?.showModal();
});

els.btnSaveSettings?.addEventListener("click", () => {
  settings.aiEndpoint = (els.aiEndpoint?.value || "").trim();
  settings.qtyMax = Number(els.qtyMax?.value) || 10;
  saveSettings(settings);
  render();
});

// ------------------ AI helpers ------------------
function getCheckedSummary() {
  const checked = state.items.filter((it) => it.checked).map((it) => ({
    name: it.name,
    qty: Number(it.qty) || 1,
    price: parsePrice(it.price)
  }));

  const all = state.items.map((it) => ({
    name: it.name,
    checked: !!it.checked,
    qty: Number(it.qty) || 1,
    price: parsePrice(it.price),
    category: sanitizeCategory(it.category)
  }));

  return { checked, all };
}

async function callAI(kind, prompt, extra = {}) {
  const endpoint = (loadSettings().aiEndpoint || "").trim();
  if (!endpoint) {
    alert("Configure d'abord l'URL backend IA dans âš™ï¸ RÃ©glages.");
    return null;
  }

  const payload = {
    kind,
    prompt: prompt || "",
    budget: extra.budget ?? null,
    goal: extra.goal ?? null,
    state: getCheckedSummary(),
    locale: "fr-FR",
    categories: CATEGORY_NAMES
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Backend IA error: ${res.status} ${txt}`);
  }

  return await res.json();
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function pickArray(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (Array.isArray(v)) return v;
  }
  return null;
}

function uniqStrings(arr) {
  const out = [];
  const seen = new Set();
  for (const x of arr || []) {
    const s = (x ?? "").toString().trim();
    if (!s) continue;
    const key = norm(s);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

// ------------------ AI render: Recettes ------------------
function renderAiRecipes(out) {
  if (!els.aiOutRecipes) return;

  if (!out) {
    els.aiOutRecipes.innerHTML = `<div class="ai-render__empty">â€”</div>`;
    return;
  }

  const recipes = pickArray(out, ["recipes", "suggestions", "ideas"]) || [];
  const globalMissing = pickArray(out, ["missing_items", "missing", "to_buy", "buy", "shopping_list"]) || [];
  const message = (out.message || out.summary || out.note || out.text || "").toString().trim();

  let html = "";

  if (message) {
    html += `
      <div class="ai-callout">
        <div class="ai-callout__title">ðŸ§  RÃ©sumÃ©</div>
        <div class="ai-callout__text">${escapeHtml(message)}</div>
      </div>
    `;
  }

  const cards = [];

  for (const r of recipes) {
    if (!r || typeof r !== "object") continue;

    const title = (r.title || r.name || r.recipe || "").toString().trim() || "Recette";
    const time = (r.time_min ?? r.time ?? r.duration ?? r.minutes ?? "").toString().trim();
    const difficulty = (r.difficulty || r.level || r.niveau || "").toString().trim();
    const why = (r.why || r.reason || r.pitch || r.description || "").toString().trim();

    const ingredients = pickArray(r, ["ingredients", "items", "list"]) || [];
    const steps = pickArray(r, ["steps", "instructions"]) || [];
    const missing = pickArray(r, ["missing_items", "missing", "to_buy"]) || [];

    const tags = [];
    if (time) tags.push(`â±ï¸ ${time}`);
    if (difficulty) tags.push(`ðŸ˜Œ ${difficulty}`);

    const ingLines = [];
    for (const x of ingredients) {
      if (typeof x === "string") { ingLines.push(x); continue; }
      if (!x || typeof x !== "object") continue;
      const n = (x.name ?? x.item ?? "").toString().trim();
      if (!n) continue;
      const q = (x.qty ?? x.quantity ?? "").toString().trim();
      const u = (x.unit ?? x.note ?? "").toString().trim();
      const line = [q ? `${q}` : "", u ? `${u}` : "", n].filter(Boolean).join(" ");
      ingLines.push(line);
    }

    const stepsClean = uniqStrings(steps.map((x) => (typeof x === "string" ? x : (x?.text ?? ""))));

    const missingLines = [];
    for (const x of missing) {
      if (typeof x === "string") { missingLines.push(x); continue; }
      if (!x || typeof x !== "object") continue;
      const n = (x.name ?? x.item ?? "").toString().trim();
      if (!n) continue;
      const q = (x.qty ?? x.quantity ?? "").toString().trim();
      const u = (x.unit ?? x.note ?? "").toString().trim();
      const line = [q ? `${q}` : "", u ? `${u}` : "", n].filter(Boolean).join(" ");
      missingLines.push(line);
    }

    const ingClean = uniqStrings(ingLines);
    const missingClean = uniqStrings(missingLines);

    let card = `<div class="ai-card">`;
    card += `<div class="ai-card__title">ðŸ³ ${escapeHtml(title)}</div>`;

    if (tags.length) {
      card += `<div class="ai-tags">`;
      for (const t of tags) card += `<span class="ai-tag">${escapeHtml(t)}</span>`;
      card += `</div>`;
    }

    if (ingClean.length) {
      card += `<div class="ai-subtitle">ðŸ§¾ IngrÃ©dients</div>`;
      card += `<ul class="ai-list">${ingClean.map((it) => `<li>${escapeHtml(it)}</li>`).join("")}</ul>`;
    }

    if (missingClean.length) {
      card += `<div class="ai-subtitle">ðŸ›ï¸ Ã€ acheter (manquants)</div>`;
      card += `<ul class="ai-list">${missingClean.map((it) => `<li>${escapeHtml(it)}</li>`).join("")}</ul>`;
    }

    if (stepsClean.length) {
      card += `<div class="ai-subtitle">ðŸ‘¨â€ðŸ³ Ã‰tapes</div>`;
      card += `<ul class="ai-list">${stepsClean.map((st) => `<li>${escapeHtml(st)}</li>`).join("")}</ul>`;
    }

    if (why) card += `<div class="ai-card__why">${escapeHtml(why)}</div>`;
    card += `</div>`;

    cards.push(card);
  }

  if (cards.length) html += cards.join("");
  else html += `<div class="ai-render__empty">Aucune recette lisible trouvÃ©e. (Le bouton â€œAppliquerâ€ peut quand mÃªme fonctionner si des actions existent.)</div>`;

  const globalMissingLines = [];
  for (const x of globalMissing) {
    if (typeof x === "string") { globalMissingLines.push(x); continue; }
    if (!x || typeof x !== "object") continue;
    const n = (x.name ?? x.item ?? "").toString().trim();
    if (!n) continue;
    const q = (x.qty ?? x.quantity ?? "").toString().trim();
    const u = (x.unit ?? x.note ?? "").toString().trim();
    globalMissingLines.push([q ? `${q}` : "", u ? `${u}` : "", n].filter(Boolean).join(" "));
  }
  const globalMissingClean = uniqStrings(globalMissingLines);

  if (globalMissingClean.length) {
    html += `
      <div class="ai-card">
        <div class="ai-card__title">ðŸ›’ Achats proposÃ©s</div>
        <div class="ai-subtitle">Liste globale</div>
        <ul class="ai-list">
          ${globalMissingClean.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}
        </ul>
      </div>
    `;
  }

  els.aiOutRecipes.innerHTML = html || `<div class="ai-render__empty">â€”</div>`;
}

// ------------------ AI render: Budget ------------------
function renderAiBudget(out) {
  if (!els.aiOutBudget) return;

  if (!out) {
    els.aiOutBudget.innerHTML = `<div class="ai-render__empty">â€”</div>`;
    return;
  }

  const message = (out.message || out.summary || out.note || out.text || "").toString().trim();
  const meals = pickArray(out, ["meals", "plan", "menu", "week", "week_plan"]) || [];
  const shopping = pickArray(out, ["shopping_list", "groceries", "to_buy", "items", "missing_items"]) || [];
  const tips = pickArray(out, ["tips", "notes", "advices"]) || [];
  const est = out.estimated_total ?? out.estimated_cost ?? out.total ?? null;

  let html = "";

  if (message) {
    html += `
      <div class="ai-callout">
        <div class="ai-callout__title">ðŸ“Œ RÃ©sumÃ©</div>
        <div class="ai-callout__text">${escapeHtml(message)}</div>
      </div>
    `;
  }

  if (est !== null && est !== undefined && String(est).trim() !== "") {
    html += `
      <div class="ai-card">
        <div class="ai-card__title">ðŸ§¾ Estimation</div>
        <div class="ai-card__why">${escapeHtml(String(est))}</div>
      </div>
    `;
  }

  if (meals.length) {
    const cardParts = [];
    for (const m of meals) {
      if (!m) continue;
      if (typeof m === "string") { cardParts.push(`<li>${escapeHtml(m)}</li>`); continue; }
      const day = (m.day || m.jour || m.date || "").toString().trim();
      const title = (m.title || m.name || m.meal || m.repas || "").toString().trim();
      const lines = [];
      const breakfast = (m.breakfast || m.petit_dej || m.petitdej || "").toString().trim();
      const lunch = (m.lunch || m.dejeuner || m.midi || "").toString().trim();
      const dinner = (m.dinner || m.diner || m.soir || "").toString().trim();
      if (breakfast) lines.push(`ðŸ¥£ ${breakfast}`);
      if (lunch) lines.push(`ðŸ½ï¸ ${lunch}`);
      if (dinner) lines.push(`ðŸŒ™ ${dinner}`);
      const head = [day, title].filter(Boolean).join(" â€” ");
      if (head) cardParts.push(`<li><strong>${escapeHtml(head)}</strong>${lines.length ? `<br>${escapeHtml(lines.join(" â€¢ "))}` : ""}</li>`);
      else if (lines.length) cardParts.push(`<li>${escapeHtml(lines.join(" â€¢ "))}</li>`);
    }

    if (cardParts.length) {
      html += `
        <div class="ai-card">
          <div class="ai-card__title">ðŸ“… Menu semaine</div>
          <ul class="ai-list">
            ${cardParts.join("")}
          </ul>
        </div>
      `;
    }
  }

  const shopLines = [];
  for (const x of shopping) {
    if (typeof x === "string") { shopLines.push(x); continue; }
    if (!x || typeof x !== "object") continue;
    const n = (x.name ?? x.item ?? "").toString().trim();
    if (!n) continue;
    const q = (x.qty ?? x.quantity ?? "").toString().trim();
    const u = (x.unit ?? x.note ?? "").toString().trim();
    shopLines.push([q ? `${q}` : "", u ? `${u}` : "", n].filter(Boolean).join(" "));
  }
  const shopClean = uniqStrings(shopLines);

  if (shopClean.length) {
    html += `
      <div class="ai-card">
        <div class="ai-card__title">ðŸ›’ Liste de courses</div>
        <div class="ai-subtitle">Tu peux cliquer â€œAppliquerâ€ pour cocher/ajouter automatiquement</div>
        <ul class="ai-list">
          ${shopClean.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}
        </ul>
      </div>
    `;
  }

  const tipsClean = uniqStrings(tips.map((x) => (typeof x === "string" ? x : (x?.text ?? x?.tip ?? ""))));
  if (tipsClean.length) {
    html += `
      <div class="ai-card">
        <div class="ai-card__title">ðŸ’¡ Conseils</div>
        <ul class="ai-list">
          ${tipsClean.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}
        </ul>
      </div>
    `;
  }

  if (!html) {
    html = `
      <div class="ai-card">
        <div class="ai-card__title">ðŸ“Œ RÃ©sultat</div>
        <div class="ai-card__why">Format inattendu cÃ´tÃ© IA â€” voici la donnÃ©e brute :</div>
        <pre class="pre">${escapeHtml(JSON.stringify(out, null, 2))}</pre>
      </div>
    `;
  }

  els.aiOutBudget.innerHTML = html;
}

// ------------------ AI actions handlers ------------------
async function runAi(kind, prompt, extra = {}) {
  const out = await callAI(kind, prompt, extra);
  if (!out) return null;
  lastAiPayload = out;
  lastAiKind = kind;
  return out;
}

document.querySelectorAll("[data-ai]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const kind = btn.getAttribute("data-ai");
    btn.disabled = true;

    try {
      if (kind === "plan_recipe") {
        const prompt = els.aiPromptRecipes?.value || "";
        const out = await runAi(kind, prompt);
        if (!out) return;

        renderAiRecipes(out);
        if (els.btnApplyAi) els.btnApplyAi.disabled = !out?.actions;
        setActiveTab("recipes");
      } else if (kind === "weekly_plan") {
        const budget = parsePrice(els.budgetValue?.value || "");
        const goal = els.budgetGoal?.value || "equilibre";
        const prompt = els.aiPromptBudget?.value || "";

        const out = await runAi(kind, prompt, { budget, goal });
        if (!out) return;

        renderAiBudget(out);
        if (els.btnApplyAiBudget) els.btnApplyAiBudget.disabled = !out?.actions;
        setActiveTab("budget");
      } else {
        const out = await runAi(kind, "");
        if (!out) return;

        renderAiRecipes(out);
        if (els.btnApplyAi) els.btnApplyAi.disabled = !out?.actions;
        setActiveTab("recipes");
      }
    } catch (err) {
      alert(err.message || String(err));
    } finally {
      btn.disabled = false;
    }
  });
});

// Clear recipes
els.btnClearAi.forEach((b) => {
  b.addEventListener("click", () => {
    lastAiPayload = null;
    lastAiKind = null;
    if (els.aiOutRecipes) els.aiOutRecipes.innerHTML = `<div class="ai-render__empty">â€”</div>`;
    if (els.btnApplyAi) els.btnApplyAi.disabled = true;
  });
});

// Clear budget
els.btnClearAiBudget?.addEventListener("click", () => {
  lastAiPayload = null;
  lastAiKind = null;
  if (els.aiOutBudget) els.aiOutBudget.innerHTML = `<div class="ai-render__empty">â€”</div>`;
  if (els.btnApplyAiBudget) els.btnApplyAiBudget.disabled = true;
});

// âœ… Appliquer actions (mutualisÃ©)
function applyAiActions(out) {
  if (!out || !Array.isArray(out.actions)) return false;

  let changed = false;

  for (const a of out.actions) {
    if (!a || typeof a !== "object") continue;

    const type = String(a.type || "").trim();
    const rawName = (a.name || "").toString().trim();
    if (!type || !rawName) continue;

    const it = findItemBest(rawName);

    // catÃ©gorie seulement si fournie explicitement par l'IA (utile uniquement pour les nouveaux items)
    const hasExplicitCategory =
      Object.prototype.hasOwnProperty.call(a, "category") &&
      String(a.category || "").trim() !== "";
    const explicitCategory = hasExplicitCategory ? sanitizeCategory(a.category) : null;

    if (type === "check") {
      if (it) {
        it.checked = a.checked !== false;
        changed = true;
      }
    } else if (type === "set_qty") {
      if (it) {
        it.qty = clamp(Number(a.qty) || 1, 1, 999);
        changed = true;
      }
    } else if (type === "add_item") {
      if (it) {
        // âœ… FIX: existe dÃ©jÃ  => on coche + qty, MAIS on ne change JAMAIS sa catÃ©gorie
        it.checked = true;
        const q = clamp(Number(a.qty) || 1, 1, 999);
        if (q > 1) it.qty = q;

        // âŒ Important: ne pas dÃ©placer lâ€™item existant (sinon Ã§a "bouge toute la liste")
        changed = true;
      } else {
        const name = rawName;
        const category = explicitCategory || "Divers";
        const id = `item_${slugify(category)}_${Date.now().toString(36)}_${slugify(name)}`;
        const newItem = {
          id,
          name,
          category,
          checked: true,
          qty: clamp(Number(a.qty) || 1, 1, 999),
          price: ""
        };
        insertItemInCategoryOrder(newItem);
        changed = true;
      }
    }
  }

  if (changed) {
    saveState(state);
    render();
    computeTotal();
  }
  return changed;
}

// Apply recipes actions
els.btnApplyAi?.addEventListener("click", () => {
  const ok = applyAiActions(lastAiPayload);
  if (ok) {
    alert("OK â€” actions appliquÃ©es âœ…");
    setActiveTab("list");
  } else {
    alert("Rien Ã  appliquer (actions non reconnues ou produits introuvables).");
  }
});

// Apply budget actions
els.btnApplyAiBudget?.addEventListener("click", () => {
  const ok = applyAiActions(lastAiPayload);
  if (ok) {
    alert("OK â€” actions appliquÃ©es âœ…");
    setActiveTab("list");
  } else {
    alert("Rien Ã  appliquer (actions non reconnues ou produits introuvables).");
  }
});

// ------------------ SW ------------------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

// init
setActiveTab("list");
render();

if (els.aiOutRecipes && !els.aiOutRecipes.innerHTML.trim()) {
  els.aiOutRecipes.innerHTML = `<div class="ai-render__empty">â€”</div>`;
}
if (els.aiOutBudget && !els.aiOutBudget.innerHTML.trim()) {
  els.aiOutBudget.innerHTML = `<div class="ai-render__empty">â€”</div>`;
}
