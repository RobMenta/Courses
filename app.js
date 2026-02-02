/*
  Liste de course (PWA) — 100% front (GitHub Pages)
  - Coche + prix + quantité => total
  - Réorganisation par glisser-déposer (touch-friendly) via Pointer Events (pas de lib)
  - Sauvegarde localStorage

  ⚠️ IA: l'app appelle un BACKEND (Worker / Function). Ne jamais mettre une clé OpenAI ici.
*/

const STORAGE_KEY = "shopping_list_v1";
const SETTINGS_KEY = "shopping_settings_v1";

const DEFAULT_SETTINGS = {
  currency: "EUR",
  qtyMax: 10,
  aiEndpoint: "" // ex: https://ton-worker.workers.dev/ai
};

const INITIAL_STATE = {
  items: [
    { "id": "item_0_tupperwear", "name": "Tupperwear", "checked": false, "qty": 1, "price": "" },
    { "id": "item_1_lingette-voiture", "name": "Lingette voiture", "checked": false, "qty": 1, "price": "" },
    { "id": "item_2_tableaux", "name": "Tableaux", "checked": false, "qty": 1, "price": "" },
    { "id": "item_3_shampoing", "name": "Shampoing", "checked": false, "qty": 1, "price": "" },
    { "id": "item_4_après-shampoing", "name": "Après Shampoing", "checked": false, "qty": 1, "price": "" },
    { "id": "item_5_laque", "name": "Laque", "checked": false, "qty": 1, "price": "" },
    { "id": "item_6_deo", "name": "Deo", "checked": false, "qty": 1, "price": "" },
    { "id": "item_7_crème-hyd", "name": "Crème hyd", "checked": false, "qty": 1, "price": "" },
    { "id": "item_8_masque-visage", "name": "Masque visage", "checked": false, "qty": 1, "price": "" },
    { "id": "item_9_gel-douche", "name": "Gel douche", "checked": false, "qty": 1, "price": "" },
    { "id": "item_10_coton-tige", "name": "Coton tige", "checked": false, "qty": 1, "price": "" },
    { "id": "item_11_bain-de-bouche", "name": "Bain de bouche", "checked": false, "qty": 1, "price": "" },
    { "id": "item_12_gratte-langue", "name": "Gratte langue", "checked": false, "qty": 1, "price": "" },
    { "id": "item_13_dentifrice", "name": "Dentifrice", "checked": false, "qty": 1, "price": "" },
    { "id": "item_14_brosse-à-dent", "name": "Brosse à dent", "checked": false, "qty": 1, "price": "" },
    { "id": "item_15_mouchoir", "name": "Mouchoir", "checked": false, "qty": 1, "price": "" },
    { "id": "item_16_débardeur-blanc", "name": "Débardeur blanc", "checked": false, "qty": 1, "price": "" },

    { "id": "item_17_pierre-d'argile", "name": "Pierre d'argile", "checked": false, "qty": 1, "price": "" },
    { "id": "item_18_eau-déminéralisée", "name": "Eau déminéralisée", "checked": false, "qty": 1, "price": "" },
    { "id": "item_19_alcool-ménagé", "name": "Alcool ménagé", "checked": false, "qty": 1, "price": "" },
    { "id": "item_20_savon-noir", "name": "Savon noir", "checked": false, "qty": 1, "price": "" },
    { "id": "item_21_acide-chlorydrique", "name": "Acide chlorydrique", "checked": false, "qty": 1, "price": "" },
    { "id": "item_22_bicarbonate-de-soude", "name": "Bicarbonate de soude", "checked": false, "qty": 1, "price": "" },
    { "id": "item_23_percarbonate", "name": "Percarbonate", "checked": false, "qty": 1, "price": "" },
    { "id": "item_24_acide-citrique", "name": "Acide citrique", "checked": false, "qty": 1, "price": "" },
    { "id": "item_25_cristaux-de-soude", "name": "Cristaux de soude", "checked": false, "qty": 1, "price": "" },
    { "id": "item_26_vinaigre-ménagé", "name": "Vinaigre ménagé", "checked": false, "qty": 1, "price": "" },
    { "id": "item_27_sel-d'oseille", "name": "Sel d'oseille", "checked": false, "qty": 1, "price": "" },

    { "id": "item_28_éponges", "name": "Éponges", "checked": false, "qty": 1, "price": "" },
    { "id": "item_29_lessive", "name": "Lessive", "checked": false, "qty": 1, "price": "" },
    { "id": "item_30_destop", "name": "Destop", "checked": false, "qty": 1, "price": "" },
    { "id": "item_31_adoucissant", "name": "Adoucissant", "checked": false, "qty": 1, "price": "" },
    { "id": "item_32_liquide-vaisselle", "name": "Liquide vaisselle", "checked": false, "qty": 1, "price": "" },
    { "id": "item_33_pastille-lave-vaisselle", "name": "Pastille lave vaisselle", "checked": false, "qty": 1, "price": "" },
    { "id": "item_34_sac-poubelle-carton", "name": "Sac poubelle carton", "checked": false, "qty": 1, "price": "" },
    { "id": "item_35_sac-poubelles-(50l)", "name": "Sac poubelles (50L)", "checked": false, "qty": 1, "price": "" },
    { "id": "item_36_sopalin", "name": "Sopalin", "checked": false, "qty": 1, "price": "" },
    { "id": "item_37_pq", "name": "PQ", "checked": false, "qty": 1, "price": "" },

    { "id": "item_38_sucre", "name": "Sucre", "checked": false, "qty": 1, "price": "" },
    { "id": "item_39_pépite-choco", "name": "Pépite choco", "checked": false, "qty": 1, "price": "" },
    { "id": "item_40_agar-agar", "name": "Agar-agar", "checked": false, "qty": 1, "price": "" },
    { "id": "item_41_farine", "name": "Farine", "checked": false, "qty": 1, "price": "" },
    { "id": "item_42_confiture", "name": "Confiture", "checked": false, "qty": 1, "price": "" },
    { "id": "item_43_miel", "name": "Miel", "checked": false, "qty": 1, "price": "" },
    { "id": "item_44_compotes-à-boire", "name": "Compotes à boire", "checked": false, "qty": 1, "price": "" },

    { "id": "item_45_cornichon", "name": "Cornichon", "checked": false, "qty": 1, "price": "" },
    { "id": "item_46_olives", "name": "Olives", "checked": false, "qty": 1, "price": "" },
    { "id": "item_47_huile-d'olive", "name": "Huile d'olive", "checked": false, "qty": 1, "price": "" },
    { "id": "item_48_moutardes", "name": "Moutardes", "checked": false, "qty": 1, "price": "" },
    { "id": "item_49_vinaigre-balsamique", "name": "Vinaigre balsamique", "checked": false, "qty": 1, "price": "" },
    { "id": "item_50_gros-sel", "name": "Gros sel", "checked": false, "qty": 1, "price": "" },
    { "id": "item_51_herbe-de-provence", "name": "Herbe de provence", "checked": false, "qty": 1, "price": "" },
    { "id": "item_52_cub'or", "name": "Cub'or", "checked": false, "qty": 1, "price": "" },
    { "id": "item_53_piment-de-cayenne", "name": "Piment de cayenne", "checked": false, "qty": 1, "price": "" },

    { "id": "item_54_maïs", "name": "Maïs", "checked": false, "qty": 1, "price": "" },
    { "id": "item_55_pois-chiches", "name": "Pois chiches", "checked": false, "qty": 1, "price": "" },

    { "id": "item_56_thon", "name": "Thon", "checked": false, "qty": 1, "price": "" },
    { "id": "item_57_croûtons", "name": "Croûtons", "checked": false, "qty": 1, "price": "" },
    { "id": "item_58_riz", "name": "Riz", "checked": false, "qty": 1, "price": "" },
    { "id": "item_59_riz/quinoa-pré-cuit", "name": "Riz/quinoa pré cuit", "checked": false, "qty": 1, "price": "" },
    { "id": "item_60_purée", "name": "Purée", "checked": false, "qty": 1, "price": "" },

    { "id": "item_61_bonbons", "name": "Bonbons", "checked": false, "qty": 1, "price": "" },
    { "id": "item_62_pastille-menthe", "name": "Pastille menthe", "checked": false, "qty": 1, "price": "" },
    { "id": "item_63_country", "name": "Country", "checked": false, "qty": 1, "price": "" },

    { "id": "item_64_lait", "name": "Lait", "checked": false, "qty": 1, "price": "" },
    { "id": "item_65_soft", "name": "Soft", "checked": false, "qty": 1, "price": "" },
    { "id": "item_66_sirop", "name": "Sirop", "checked": false, "qty": 1, "price": "" },
    { "id": "item_67_jus", "name": "Jus", "checked": false, "qty": 1, "price": "" },

    { "id": "item_68_café", "name": "Café", "checked": false, "qty": 1, "price": "" },
    { "id": "item_69_thé", "name": "Thé", "checked": false, "qty": 1, "price": "" },
    { "id": "item_70_flocon-d'avoine", "name": "Flocon d'avoine", "checked": false, "qty": 1, "price": "" },
    { "id": "item_71_barre-céréale", "name": "Barre Céréale", "checked": false, "qty": 1, "price": "" },

    { "id": "item_72_pâtes", "name": "Pâtes", "checked": false, "qty": 1, "price": "" },

    { "id": "item_73_pain-de-mie", "name": "Pain de mie", "checked": false, "qty": 1, "price": "" },
    { "id": "item_74_prince", "name": "Prince", "checked": false, "qty": 1, "price": "" },

    { "id": "item_75_bières", "name": "Bières", "checked": false, "qty": 1, "price": "" },
    { "id": "item_76_vin-blanc", "name": "Vin blanc", "checked": false, "qty": 1, "price": "" },

    { "id": "item_77_tranche-dinde", "name": "Tranche dinde", "checked": false, "qty": 1, "price": "" },
    { "id": "item_78_lardon", "name": "Lardon", "checked": false, "qty": 1, "price": "" },
    { "id": "item_79_carottes", "name": "Carottes", "checked": false, "qty": 1, "price": "" },
    { "id": "item_80_gnocchi", "name": "Gnocchi", "checked": false, "qty": 1, "price": "" },

    { "id": "item_81_yaourt", "name": "Yaourt", "checked": false, "qty": 1, "price": "" },
    { "id": "item_82_skyr-à-boire", "name": "Skyr à boire", "checked": false, "qty": 1, "price": "" },
    { "id": "item_83_compotes", "name": "Compotes", "checked": false, "qty": 1, "price": "" },

    { "id": "item_84_oeufs", "name": "Oeufs", "checked": false, "qty": 1, "price": "" },
    { "id": "item_85_fromage", "name": "Fromage", "checked": false, "qty": 1, "price": "" },
    { "id": "item_86_endives", "name": "Endives", "checked": false, "qty": 1, "price": "" },
    { "id": "item_87_patate-douce", "name": "Patate douce", "checked": false, "qty": 1, "price": "" },
    { "id": "item_88_tomates", "name": "Tomates", "checked": false, "qty": 1, "price": "" },
    { "id": "item_89_avocats", "name": "Avocats", "checked": false, "qty": 1, "price": "" },
    { "id": "item_90_concombre", "name": "Concombre", "checked": false, "qty": 1, "price": "" },
    { "id": "item_91_poivrons", "name": "Poivrons", "checked": false, "qty": 1, "price": "" },
    { "id": "item_92_bananes", "name": "Bananes", "checked": false, "qty": 1, "price": "" },
    { "id": "item_93_fraises", "name": "Fraises", "checked": false, "qty": 1, "price": "" },
    { "id": "item_94_pommes", "name": "Pommes", "checked": false, "qty": 1, "price": "" },
    { "id": "item_95_oignons", "name": "Oignons", "checked": false, "qty": 1, "price": "" },
    { "id": "item_96_saumon", "name": "Saumon", "checked": false, "qty": 1, "price": "" },
    { "id": "item_97_pomme-de-terre", "name": "Pomme de terre", "checked": false, "qty": 1, "price": "" },

    { "id": "item_98_saucisses", "name": "Saucisses", "checked": false, "qty": 1, "price": "" },
    { "id": "item_99_escalope", "name": "Escalope", "checked": false, "qty": 1, "price": "" },
    { "id": "item_100_poisson-pané", "name": "Poisson pané", "checked": false, "qty": 1, "price": "" },
    { "id": "item_101_cordon-bleu", "name": "Cordon bleu", "checked": false, "qty": 1, "price": "" },

    { "id": "item_102_poivron-surgelé", "name": "Poivron surgelé", "checked": false, "qty": 1, "price": "" },
    { "id": "item_103_steak", "name": "Steak", "checked": false, "qty": 1, "price": "" },
    { "id": "item_104_poisson", "name": "Poisson", "checked": false, "qty": 1, "price": "" },
    { "id": "item_105_nuggets", "name": "nuggets", "checked": false, "qty": 1, "price": "" },
    { "id": "item_106_poisson-pané", "name": "Poisson pané", "checked": false, "qty": 1, "price": "" },
    { "id": "item_107_pomme-de-terre-surgelé", "name": "Pomme de terre surgelé", "checked": false, "qty": 1, "price": "" },
    { "id": "item_108_glaces", "name": "Glaces", "checked": false, "qty": 1, "price": "" }
  ]
};

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

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(INITIAL_STATE);
    const state = JSON.parse(raw);
    if (!state || !Array.isArray(state.items)) return structuredClone(INITIAL_STATE);

    const items = state.items.map((it, idx) => ({
      id: String(it.id ?? `item_${idx}`),
      name: String(it.name ?? "Produit"),
      checked: Boolean(it.checked),
      qty: clamp(Number(it.qty ?? 1) || 1, 1, 999),
      price: (it.price ?? "").toString()
    }));

    return { items };
  } catch {
    return structuredClone(INITIAL_STATE);
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ---- DOM
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
  btnApplyAi: document.getElementById("btnApplyAi"),
  btnClearAi: document.querySelectorAll("#btnClearAi")
};

let settings = loadSettings();
let state = loadState();
let lastAiPayload = null;

// ---- Tabs
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

// ---- Total
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
      count === 0 ? "Coche un produit + saisis un prix pour l’ajouter au total."
                 : `${count} produit(s) coché(s).`;
  }
}

function qtyOptions(max) {
  const out = [];
  for (let i = 1; i <= max; i++) out.push(i);
  return out;
}

// ---- Render list
function render() {
  if (!els.itemsList) return;
  els.itemsList.innerHTML = "";

  const qmax = Number(loadSettings().qtyMax) || 10;
  const qopts = qtyOptions(qmax);

  for (const it of state.items) {
    const li = document.createElement("li");
    li.className = "item" + (it.checked ? " is-checked" : "");
    li.dataset.id = it.id;

    const handle = document.createElement("div");
    handle.className = "handle";
    handle.textContent = "☰";
    handle.title = "Glisser pour réordonner";
    handle.setAttribute("role", "button");
    handle.setAttribute("aria-label", "Réordonner");
    handle.tabIndex = 0;

    const toggle = document.createElement("button");
toggle.className = "toggle" + (it.checked ? " is-on" : "");
toggle.type = "button";
toggle.setAttribute("aria-pressed", it.checked ? "true" : "false");
toggle.title = "Cocher / décocher";


    const name = document.createElement("div");
    name.className = "name";

    const title = document.createElement("div");
    title.className = "name__title";
    title.textContent = it.name;

    const sub = document.createElement("div");
    sub.className = "name__sub";
    sub.textContent = "Prix unitaire × quantité (coché = total)";

    name.appendChild(title);
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
      opt.textContent = "×" + String(v);
      if (Number(it.qty) === v) opt.selected = true;
      qty.appendChild(opt);
    }

    const del = document.createElement("button");
    del.className = "delete";
    del.textContent = "🗑️";
    del.title = "Supprimer";

    controls.appendChild(price);
    controls.appendChild(qty);
    controls.appendChild(del);

    li.appendChild(handle);
    li.appendChild(toggle);
    li.appendChild(name);
    li.appendChild(controls);
    els.itemsList.appendChild(li);

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
      if (!confirm(`Supprimer “${it.name}” ?`)) return;
      state.items = state.items.filter((x) => x.id !== it.id);
      saveState(state);
      render();
      computeTotal();
    });

    setupDrag(handle, li);
  }

  computeTotal();
}

// ---- Drag & drop
let dragState = null;

function setupDrag(handleEl, itemEl) {
  handleEl.addEventListener("pointerdown", (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();

    const rect = itemEl.getBoundingClientRect();
    const startY = e.clientY;
    const offsetY = startY - rect.top;

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

    itemEl.parentElement.insertBefore(placeholder, itemEl.nextSibling);

    dragState = { itemEl, placeholder, offsetY };
    handleEl.setPointerCapture(e.pointerId);
  });

  handleEl.addEventListener("pointermove", (e) => {
    if (!dragState) return;
    e.preventDefault();

    const { itemEl, offsetY, placeholder } = dragState;
    const x = placeholder.getBoundingClientRect().left;
    const y = e.clientY - offsetY;

    itemEl.style.left = x + "px";
    itemEl.style.top = y + "px";

    const margin = 80;
    const vh = window.innerHeight;
    if (e.clientY < margin) window.scrollBy({ top: -14, left: 0, behavior: "auto" });
    else if (e.clientY > vh - margin) window.scrollBy({ top: 14, left: 0, behavior: "auto" });

    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el) return;
    const targetItem = el.closest("li.item");
    if (!targetItem || targetItem === itemEl || targetItem === placeholder) return;

    const targetRect = targetItem.getBoundingClientRect();
    const before = e.clientY < targetRect.top + targetRect.height / 2;

    const list = document.getElementById("itemsList");
    if (!list) return;

    if (before) list.insertBefore(placeholder, targetItem);
    else list.insertBefore(placeholder, targetItem.nextSibling);
  });

  function endDrag(e) {
    if (!dragState) return;
    e.preventDefault();

    const { itemEl, placeholder } = dragState;

    itemEl.classList.remove("is-dragging");
    itemEl.style.position = "";
    itemEl.style.left = "";
    itemEl.style.top = "";
    itemEl.style.width = "";
    itemEl.style.zIndex = "";
    itemEl.style.pointerEvents = "";
    itemEl.style.boxShadow = "";

    placeholder.parentElement.insertBefore(itemEl, placeholder);
    placeholder.remove();
    dragState = null;

    const domIds = Array.from(document.querySelectorAll("#itemsList li.item"))
      .map((li) => li.dataset.id)
      .filter(Boolean);

    const map = new Map(state.items.map((it) => [it.id, it]));
    const newItems = [];
    for (const did of domIds) {
      const it = map.get(did);
      if (it) newItems.push(it);
    }
    for (const it of state.items) if (!newItems.includes(it)) newItems.push(it);

    state.items = newItems;
    saveState(state);
    render();
  }

  handleEl.addEventListener("pointerup", endDrag);
  handleEl.addEventListener("pointercancel", endDrag);

  handleEl.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const id = itemEl.dataset.id;
    const idx = state.items.findIndex((it) => it.id === id);
    if (idx < 0) return;
    const dir = e.shiftKey ? 1 : -1;
    const j = idx + dir;
    if (j < 0 || j >= state.items.length) return;
    const tmp = state.items[idx];
    state.items[idx] = state.items[j];
    state.items[j] = tmp;
    saveState(state);
    render();
  });
}

// ---- Add item
function openAdd() {
  if (!els.addRow) return;
  els.addRow.hidden = false;
  if (els.addName) { els.addName.value = ""; els.addName.focus(); }
}
function closeAdd() {
  if (!els.addRow) return;
  els.addRow.hidden = true;
}

if (els.btnAddQuick) {
  els.btnAddQuick.addEventListener("click", () => {
    if (!els.addRow) return;
    if (els.addRow.hidden) openAdd();
    else closeAdd();
  });
}

if (els.btnAddCancel) {
  els.btnAddCancel.addEventListener("click", (e) => {
    e.preventDefault();
    closeAdd();
  });
}

if (els.btnAddConfirm) {
  els.btnAddConfirm.addEventListener("click", (e) => {
    e.preventDefault();
    const name = (els.addName?.value || "").trim();
    if (!name) return;
    const id = "item_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
    state.items.unshift({ id, name, checked: false, qty: 1, price: "" });
    saveState(state);
    closeAdd();
    render();
  });
}

// ---- Bulk actions
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
  if (!confirm("Reset complet (ordre, cochés, prix, quantités) ?")) return;
  localStorage.removeItem(STORAGE_KEY);
  state = structuredClone(INITIAL_STATE);
  saveState(state);
  render();
});

// ---- Settings
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
});

// ---- AI
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
    price: parsePrice(it.price)
  }));

  return { checked, all };
}

async function callAI(kind, prompt, extra = {}) {
  const endpoint = (loadSettings().aiEndpoint || "").trim();
  if (!endpoint) {
    alert("Configure d'abord l'URL backend IA dans ⚙️ Réglages.");
    return null;
  }

  const payload = {
    kind,
    prompt: prompt || "",
    budget: extra.budget ?? null,
    goal: extra.goal ?? null,
    state: getCheckedSummary(),
    locale: "fr-FR"
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

function pretty(obj) {
  try { return JSON.stringify(obj, null, 2); }
  catch { return String(obj); }
}

document.querySelectorAll("[data-ai]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const kind = btn.getAttribute("data-ai");
    btn.disabled = true;

    try {
      if (kind === "plan_recipe") {
        const prompt = els.aiPromptRecipes?.value || "";
        const out = await callAI(kind, prompt);
        if (!out) return;
        lastAiPayload = out;
        if (els.aiOutRecipes) els.aiOutRecipes.textContent = pretty(out);
        if (els.btnApplyAi) els.btnApplyAi.disabled = !out?.actions;
        setActiveTab("recipes");
      } else if (kind === "weekly_plan") {
        const budget = parsePrice(els.budgetValue?.value || "");
        const goal = els.budgetGoal?.value || "equilibre";
        const prompt = els.aiPromptBudget?.value || "";
        const out = await callAI(kind, prompt, { budget, goal });
        if (!out) return;
        lastAiPayload = out;
        if (els.aiOutBudget) els.aiOutBudget.textContent = pretty(out);
        if (els.btnApplyAi) els.btnApplyAi.disabled = !out?.actions;
        setActiveTab("budget");
      } else {
        const out = await callAI(kind, "");
        if (!out) return;
        lastAiPayload = out;
        if (els.aiOutRecipes) els.aiOutRecipes.textContent = pretty(out);
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

els.btnClearAi.forEach((b) => {
  b.addEventListener("click", () => {
    lastAiPayload = null;
    if (els.aiOutRecipes) els.aiOutRecipes.textContent = "—";
    if (els.aiOutBudget) els.aiOutBudget.textContent = "—";
    if (els.btnApplyAi) els.btnApplyAi.disabled = true;
  });
});

els.btnApplyAi?.addEventListener("click", () => {
  const out = lastAiPayload;
  if (!out || !Array.isArray(out.actions)) return;

  let changed = false;

  for (const a of out.actions) {
    if (!a || typeof a !== "object") continue;
    const type = a.type;
    const name = (a.name || "").toString().trim();
    if (!name) continue;

    const findByName = () =>
      state.items.find((it) => it.name.toLowerCase() === name.toLowerCase());

    if (type === "check") {
      const it = findByName();
      if (it) { it.checked = a.checked !== false; changed = true; }
    } else if (type === "set_qty") {
      const it = findByName();
      if (it) { it.qty = clamp(Number(a.qty) || 1, 1, 999); changed = true; }
    } else if (type === "add_item") {
      const exists = findByName();
      if (!exists) {
        const id = "item_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
        state.items.unshift({
          id,
          name,
          checked: true,
          qty: clamp(Number(a.qty) || 1, 1, 999),
          price: ""
        });
        changed = true;
      }
    }
  }

  if (changed) {
    saveState(state);
    render();
    alert("OK — actions appliquées ✅");
    setActiveTab("list");
  } else {
    alert("Rien à appliquer (actions non reconnues ou produits introuvables).");
  }
});

// ---- SW
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

// init
setActiveTab("list");
render();
