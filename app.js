/*
  Liste de course (PWA) — 100% front (GitHub Pages)
  - Toggle ON/OFF + prix + quantité => total
  - Séparation en blocs/familles (ordre magasin)
  - Réorganisation par glisser-déposer (touch-friendly) DANS une famille
  - Sauvegarde localStorage

  ⚠️ IA: l'app appelle un BACKEND (Worker / Function). Ne jamais mettre une clé OpenAI ici.
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
  {
    name: "Divers",
    items: ["Tupperwear", "Lingette voiture", "Tableaux", "Débardeur blanc"]
  },
  {
    name: "Soins",
    items: [
      "Shampoing",
      "Après Shampoing",
      "Laque",
      "Deo",
      "Crème hyd",
      "Masque visage",
      "Gel douche",
      "Coton tige",
      "Bain de bouche",
      "Gratte langue",
      "Dentifrice",
      "Brosse à dent",
      "Mouchoir"
    ]
  },
  {
    name: "Entretient 1",
    items: [
      "Pierre d'argile",
      "Eau déminéralisée",
      "Alcool ménagé",
      "Savon noir",
      "Acide chlorydrique",
      "Bicarbonate de soude",
      "Percarbonate",
      "Acide citrique",
      "Cristaux de soude",
      "Vinaigre ménagé",
      "Sel d'oseille"
    ]
  },
  {
    name: "Entretient 2",
    items: [
      "Éponges",
      "Lessive",
      "Destop",
      "Adoucissant",
      "Liquide vaisselle",
      "Pastille lave vaisselle",
      "Sac poubelle carton",
      "Sac poubelles (50L)",
      "Sopalin",
      "PQ"
    ]
  },
  {
    name: "Boissons 1",
    items: ["Lait", "Soft", "Sirop", "Jus"]
  },
  {
    name: "Boissons 2",
    items: ["Bières", "Vin blanc"]
  },
  {
    name: "Petit dej 1",
    items: [
      "Sucre",
      "Pépite choco",
      "Agar-agar",
      "Farine",
      "Confiture",
      "Miel",
      "Compotes à boire",
      "Cornichon"
    ]
  },
  {
    name: "Petit dej 2",
    items: ["Café", "Thé", "Flocon d'avoine", "Barre Céréale"]
  },
  {
    name: "Sucreries",
    items: ["Bonbons", "Pastille menthe", "Country", "Prince"]
  },
  {
    name: "Sec 1",
    items: [
      "Olives",
      "Huile d'olive",
      "Moutardes",
      "Vinaigre balsamique",
      "Gros sel",
      "Herbe de provence",
      "Cub'or",
      "Piment de cayenne"
    ]
  },
  {
    name: "Boites 1",
    items: ["Maïs", "Pois chiches"]
  },
  {
    name: "Boites 2",
    items: ["Thon", "Croûtons", "Riz", "Riz/quinoa pré cuit", "Purée", "Pâtes"]
  },
  {
    name: "Frais 1",
    items: ["Tranche dinde", "Lardon", "Carottes", "Gnocchi"]
  },
  {
    name: "Frais 2",
    items: ["Yaourt", "Skyr à boire", "Compotes"]
  },
  {
    name: "Frais 3",
    items: ["Oeufs", "Fromage"]
  },
  {
    name: "Fruits/légumes",
    items: [
      "Endives",
      "Patate douce",
      "Tomates",
      "Avocats",
      "Concombre",
      "Poivrons",
      "Bananes",
      "Fraises",
      "Pommes",
      "Oignons",
      "Saumon",
      "Pomme de terre"
    ]
  },
  {
    name: "Viandes",
    items: ["Saucisses", "Escalope", "Poisson pané", "Cordon bleu"]
  },
  {
    name: "Surgelé",
    items: [
      "Poivron surgelé",
      "Steak",
      "Poisson",
      "nuggets",
      "Poisson pané (surgelé)",
      "Pomme de terre surgelé",
      "Glaces"
    ]
  }
];

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
function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

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
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(s) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

function sanitizeItem(it, fallback) {
  return {
    id: String(it.id ?? fallback.id),
    name: String(it.name ?? fallback.name),
    category: String(it.category ?? fallback.category ?? "Divers"),
    checked: Boolean(it.checked),
    qty: clamp(Number(it.qty ?? 1) || 1, 1, 999),
    price: (it.price ?? "").toString()
  };
}

/**
 * Migration:
 * - si un état v2 existe => on le charge
 * - sinon on regarde l’ancien v1 => on “merge” les champs (checked/qty/price) sur la nouvelle liste canonique
 * - sinon on prend l’état initial canonique
 */
function loadState() {
  // v2
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && Array.isArray(s.items)) {
        // On garde l'ordre stocké, mais on sécurise les champs
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
        saveState(s2); // on écrit directement en v2
        return s2;
      }
    }
  } catch {}

  // default
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
  btnApplyAi: document.getElementById("btnApplyAi"),
  btnClearAi: document.querySelectorAll("#btnClearAi")
};

let settings = loadSettings();
let state = loadState();
let lastAiPayload = null;
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
      count === 0 ? "Active un produit + saisis un prix pour l’ajouter au total."
                 : `${count} produit(s) activé(s).`;
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
    const c = it.category || "Divers";
    if (!map.has(c)) map.set(c, []);
    map.get(c).push(it);
  }
  return map;
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

    // Section container as <li> inside the main UL
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
      handle.textContent = "☰";
      handle.title = f ? "Réordonnancement désactivé pendant la recherche" : "Glisser pour réordonner";
      handle.setAttribute("role", "button");
      handle.setAttribute("aria-label", "Réordonner");
      handle.tabIndex = 0;

      // Toggle switch
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
      sub.textContent = "Prix unitaire × quantité (activé = total)";

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
        if (!confirm(`Supprimer “${it.name}” ?`)) return;
        state.items = state.items.filter((x) => x.id !== it.id);
        saveState(state);
        render();
        computeTotal();
      });

      // Drag only if no search filter
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
    if (it.category === category) moved.set(it.id, it);
    else keep.push(it);
  }

  const newCat = [];
  for (const id of orderedIds) {
    const it = moved.get(id);
    if (it) newCat.push(it);
  }
  // in case something is missing
  for (const it of moved.values()) if (!newCat.includes(it)) newCat.push(it);

  // rebuild in global category order (so blocs stay in place)
  const byCat = new Map();
  for (const it of [...keep, ...newCat]) {
    const c = it.category || "Divers";
    if (!byCat.has(c)) byCat.set(c, []);
    byCat.get(c).push(it);
  }

  const rebuilt = [];
  for (const cat of CATEGORIES) {
    const arr = byCat.get(cat.name) || [];
    for (const it of arr) rebuilt.push(it);
  }
  // unknown categories at end
  for (const [c, arr] of byCat.entries()) {
    if (!CATEGORIES.some((x) => x.name === c)) rebuilt.push(...arr);
  }

  state.items = rebuilt;
  saveState(state);
}

function setupDrag(handleEl, itemEl, listEl, category, isSearchActive) {
  handleEl.addEventListener("pointerdown", (e) => {
    if (isSearchActive()) return; // pas de drag en mode recherche
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

    // auto-scroll
    const margin = 80;
    const vh = window.innerHeight;
    if (e.clientY < margin) window.scrollBy({ top: -14, left: 0, behavior: "auto" });
    else if (e.clientY > vh - margin) window.scrollBy({ top: 14, left: 0, behavior: "auto" });

    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el) return;

    const targetItem = el.closest("li.item");
    if (!targetItem || targetItem === itemEl || targetItem === placeholder) return;

    // must stay inside same list
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

  // keyboard (Enter=up, Shift+Enter=down) inside category
  handleEl.addEventListener("keydown", (e) => {
    if (isSearchActive()) return;
    if (e.key !== "Enter") return;
    e.preventDefault();

    const id = itemEl.dataset.id;
    const catItems = state.items.filter((it) => it.category === category);
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

// ------------------ Add item (ajout dans Divers par défaut) ------------------
function openAdd() {
  if (!els.addRow) return;
  els.addRow.hidden = false;
  if (els.addName) {
    els.addName.value = "";
    els.addName.focus();
  }
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

els.btnAddConfirm?.addEventListener("click", (e) => {
  e.preventDefault();
  const name = (els.addName?.value || "").trim();
  if (!name) return;

  const id = `item_${slugify("Divers")}_${Date.now().toString(36)}_${slugify(name)}`;
  state.items.push({
    id,
    name,
    category: "Divers",
    checked: false,
    qty: 1,
    price: ""
  });

  saveState(state);
  closeAdd();
  render();
});

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
  if (!confirm("Reset complet (ordre, activations, prix, quantités) ?")) return;

  // IMPORTANT: on reset sur la version canonique (tes blocs)
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
  render(); // pour rafraîchir les quantités max
});

// ------------------ AI (recettes: rendu joli, budget: JSON) ------------------
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

/**
 * Rendu HTML "propre" pour Recettes → Liste
 * On accepte plusieurs formats possibles côté backend, pour être robuste :
 * - out.recipes (array)
 * - out.suggestions (array)
 * - out.ideas (array)
 * Chaque recette peut être:
 *   { title/name, time_min/time, difficulty, why, steps[], ingredients[], missing_items[] }
 * Et on cherche aussi des manquants globaux:
 * - out.missing_items / out.missing / out.to_buy
 */
function renderAiRecipes(out) {
  if (!els.aiOutRecipes) return;

  if (!out) {
    els.aiOutRecipes.innerHTML = `<div class="ai-render__empty">—</div>`;
    return;
  }

  // candidates
  const recipes = pickArray(out, ["recipes", "suggestions", "ideas"]) || [];
  const globalMissing =
    pickArray(out, ["missing_items", "missing", "to_buy", "buy", "shopping_list"]) || [];

  const message =
    (out.message || out.summary || out.note || out.text || "").toString().trim();

  // Build HTML
  let html = "";

  if (message) {
    html += `
      <div class="ai-callout">
        <div class="ai-callout__title">🧠 Résumé</div>
        <div class="ai-callout__text">${escapeHtml(message)}</div>
      </div>
    `;
  }

  const cards = [];

  for (const r of recipes) {
    if (!r || typeof r !== "object") continue;

    const title =
      (r.title || r.name || r.recipe || "").toString().trim() || "Recette";

    const time =
      (r.time_min ?? r.time ?? r.duration ?? r.minutes ?? "").toString().trim();

    const difficulty =
      (r.difficulty || r.level || r.niveau || "").toString().trim();

    const why =
      (r.why || r.reason || r.pitch || r.description || "").toString().trim();

    const ingredients = pickArray(r, ["ingredients", "items", "list"]) || [];
    const steps = pickArray(r, ["steps", "instructions"]) || [];
    const missing = pickArray(r, ["missing_items", "missing", "to_buy"]) || [];

    const tags = [];
    if (time) tags.push(`⏱️ ${time}`);
    if (difficulty) tags.push(`😌 ${difficulty}`);

    let card = `<div class="ai-card">`;
    card += `<div class="ai-card__title">🍳 ${escapeHtml(title)}</div>`;

    if (tags.length) {
      card += `<div class="ai-tags">`;
      for (const t of tags) card += `<span class="ai-tag">${escapeHtml(t)}</span>`;
      card += `</div>`;
    }

    const ingClean = uniqStrings(
      ingredients.map((x) => (typeof x === "string" ? x : (x?.name ?? x?.item ?? "")))
    );
    const stepsClean = uniqStrings(steps.map((x) => (typeof x === "string" ? x : (x?.text ?? ""))));
    const missingClean = uniqStrings(
      missing.map((x) => (typeof x === "string" ? x : (x?.name ?? x?.item ?? "")))
    );

    if (ingClean.length) {
      card += `<div class="ai-subtitle">🧾 Ingrédients</div>`;
      card += `<ul class="ai-list">`;
      for (const it of ingClean) card += `<li>${escapeHtml(it)}</li>`;
      card += `</ul>`;
    }

    if (missingClean.length) {
      card += `<div class="ai-subtitle">🛍️ À acheter (manquants)</div>`;
      card += `<ul class="ai-list">`;
      for (const it of missingClean) card += `<li>${escapeHtml(it)}</li>`;
      card += `</ul>`;
    }

    if (stepsClean.length) {
      card += `<div class="ai-subtitle">👨‍🍳 Étapes</div>`;
      card += `<ul class="ai-list">`;
      for (const st of stepsClean) card += `<li>${escapeHtml(st)}</li>`;
      card += `</ul>`;
    }

    if (why) {
      card += `<div class="ai-card__why">${escapeHtml(why)}</div>`;
    }

    card += `</div>`;
    cards.push(card);
  }

  if (cards.length) {
    html += cards.join("");
  } else {
    // fallback: si le backend renvoie autre chose, on reste lisible
    html += `<div class="ai-render__empty">Aucune recette lisible trouvée. (Le bouton “Appliquer” peut quand même fonctionner si des actions existent.)</div>`;
  }

  const globalMissingClean = uniqStrings(
    globalMissing.map((x) => (typeof x === "string" ? x : (x?.name ?? x?.item ?? "")))
  );

  if (globalMissingClean.length) {
    html += `
      <div class="ai-card">
        <div class="ai-card__title">🛒 Achats proposés</div>
        <div class="ai-subtitle">Liste globale (si tu veux compléter)</div>
        <ul class="ai-list">
          ${globalMissingClean.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}
        </ul>
      </div>
    `;
  }

  els.aiOutRecipes.innerHTML = html || `<div class="ai-render__empty">—</div>`;
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

        // ✅ joli rendu
        renderAiRecipes(out);

        if (els.btnApplyAi) els.btnApplyAi.disabled = !out?.actions;
        setActiveTab("recipes");
      } else if (kind === "weekly_plan") {
        const budget = parsePrice(els.budgetValue?.value || "");
        const goal = els.budgetGoal?.value || "equilibre";
        const prompt = els.aiPromptBudget?.value || "";
        const out = await callAI(kind, prompt, { budget, goal });
        if (!out) return;
        lastAiPayload = out;

        // Budget reste en JSON (préservé)
        if (els.aiOutBudget) els.aiOutBudget.textContent = pretty(out);

        if (els.btnApplyAi) els.btnApplyAi.disabled = !out?.actions;
        setActiveTab("budget");
      } else {
        const out = await callAI(kind, "");
        if (!out) return;
        lastAiPayload = out;

        // ✅ joli rendu (suggestions)
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

els.btnClearAi.forEach((b) => {
  b.addEventListener("click", () => {
    lastAiPayload = null;
    if (els.aiOutRecipes) {
      // ✅ reset compatible div
      els.aiOutRecipes.innerHTML = `<div class="ai-render__empty">—</div>`;
    }
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

    const findByName = () => state.items.find((it) => norm(it.name) === norm(name));

    if (type === "check") {
      const it = findByName();
      if (it) { it.checked = a.checked !== false; changed = true; }
    } else if (type === "set_qty") {
      const it = findByName();
      if (it) { it.qty = clamp(Number(a.qty) || 1, 1, 999); changed = true; }
    } else if (type === "add_item") {
      const exists = findByName();
      if (!exists) {
        const id = `item_${slugify("Divers")}_${Date.now().toString(36)}_${slugify(name)}`;
        state.items.push({
          id,
          name,
          category: "Divers",
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

// ------------------ SW ------------------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

// init
setActiveTab("list");
render();

// petit init de l’affichage recettes si jamais tu avais encore le “—”
if (els.aiOutRecipes && !els.aiOutRecipes.innerHTML.trim()) {
  els.aiOutRecipes.innerHTML = `<div class="ai-render__empty">—</div>`;
}
