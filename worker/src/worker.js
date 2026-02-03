/**
 * Cloudflare Worker — /ai
 * - CORS simple
 * - Appelle OpenAI Responses API (POST https://api.openai.com/v1/responses)
 *
 * IMPORTANT: définis OPENAI_API_KEY en secret :
 *   wrangler secret put OPENAI_API_KEY
 *
 * Améliorations v2:
 * - recettes avec ingrédients + quantités (strings lisibles)
 * - actions + fiables: l'IA reçoit la liste canonique, puis on "match" côté Worker
 * - actions peuvent inclure category (prépare le déplacement de bloc côté app)
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function err(message, status = 400, extra = {}) {
  return json({ ok: false, error: { message, ...extra } }, status);
}

// ------------------ Matching utils (pour fiabiliser "Appliquer") ------------------
function norm(s) {
  return (s || "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function stripPunct(s) {
  return norm(s).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function singularish(token) {
  // ultra simple: retire un "s" final si > 3 chars
  if (!token) return token;
  if (token.length > 3 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

function tokenize(s) {
  const base = stripPunct(s);
  if (!base) return [];
  return base.split(" ").map(singularish).filter(Boolean);
}

function jaccard(aTokens, bTokens) {
  const A = new Set(aTokens);
  const B = new Set(bTokens);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
}

function bestMatchName(queryName, candidates) {
  // candidates = [{ name, n, tokens }]
  const qn = norm(queryName);
  if (!qn) return null;

  // 1) exact norm
  for (const c of candidates) {
    if (c.n === qn) return { name: c.name, score: 1.0 };
  }

  // 2) contains (poivre noir vs poivre)
  for (const c of candidates) {
    if (c.n.includes(qn) || qn.includes(c.n)) {
      return { name: c.name, score: 0.92 };
    }
  }

  // 3) token overlap scoring
  const qt = tokenize(queryName);
  let best = null;
  for (const c of candidates) {
    const score = jaccard(qt, c.tokens);
    if (!best || score > best.score) best = { name: c.name, score };
  }

  // seuil raisonnable (évite de cocher n'importe quoi)
  if (best && best.score >= 0.55) return best;
  return null;
}

function normalizeActions(parsed, catalog) {
  // catalog: { items: [{name, category}], categories: [...] }
  const allNames = (catalog?.items || [])
    .map((x) => (x?.name || "").toString().trim())
    .filter(Boolean);

  const candidates = allNames.map((name) => ({
    name,
    n: norm(name),
    tokens: tokenize(name),
  }));

  const out = structuredClone(parsed || {});
  if (!Array.isArray(out.actions)) return out;

  const newActions = [];

  for (const a of out.actions) {
    if (!a || typeof a !== "object") continue;

    let type = String(a.type || "").trim();
    let name = String(a.name || "").trim();
    if (!type || !name) continue;

    // Match name to canonical if possible
    const hit = bestMatchName(name, candidates);

    if (hit) {
      name = hit.name;

      // If IA says add_item but it's already in the list -> convert to check (+ optional set_qty)
      if (type === "add_item") {
        // convert to check
        newActions.push({ type: "check", name, checked: true });

        const qty = Number.isFinite(a.qty) ? a.qty : parseInt(a.qty, 10);
        if (qty && qty > 1) {
          newActions.push({ type: "set_qty", name, qty });
        }
        continue;
      }
    }

    // Keep action with normalized name (or original if no match)
    const cleaned = { type, name };

    if (type === "check") {
      cleaned.checked = a.checked !== false;
    } else if (type === "set_qty") {
      const qty = Number.isFinite(a.qty) ? a.qty : parseInt(a.qty, 10);
      if (qty && qty > 0) cleaned.qty = qty;
    } else if (type === "add_item") {
      // Keep qty if any
      const qty = Number.isFinite(a.qty) ? a.qty : parseInt(a.qty, 10);
      if (qty && qty > 0) cleaned.qty = qty;

      // Keep category suggestion if provided (future front support)
      if (a.category) cleaned.category = String(a.category).trim();
    }

    newActions.push(cleaned);
  }

  out.actions = newActions;
  return out;
}

// ------------------ Worker ------------------
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Preflight CORS
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== "POST" || url.pathname !== "/ai") {
      return err("Not found", 404);
    }

    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) return err("OPENAI_API_KEY manquant côté Worker (secret).", 500);

    let body;
    try {
      body = await request.json();
    } catch {
      return err("JSON invalide.");
    }

    const kind = String(body.kind || "");
    const prompt = String(body.prompt || "");
    const locale = String(body.locale || "fr-FR");
    const state = body.state || {};
    const budget = body.budget ?? null;
    const goal = body.goal ?? null;

    // Catalog canonique (pour que l'IA utilise EXACTEMENT tes noms)
    const catalogItems = Array.isArray(state?.all)
      ? state.all
          .map((it) => ({
            name: String(it?.name || "").trim(),
            // le front envoie checked/qty/price, mais pas category -> ok
          }))
          .filter((x) => x.name)
      : [];

    const allowedCategories = Array.isArray(body.categories)
      ? body.categories.map((x) => String(x)).filter(Boolean)
      : null;

    // JSON Schema (Structured Outputs)
    // IMPORTANT: on utilise des "strings" pour ingredients/missing/shopping_list afin de porter des quantités libres (g/ml/pincée/etc).
    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        kind: { type: "string" },
        title: { type: "string" },
        message: { type: "string" },

        // Recettes lisibles
        recipes: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: "string" },
              difficulty: { type: "string" },
              time_minutes: { type: "integer" },
              why: { type: "string" },

              // ✅ ingrédients avec quantités directement "dans la string"
              // ex: "Pâtes — 120 g", "Poivre noir — 1 pincée"
              ingredients: {
                type: "array",
                items: { type: "string" },
              },

              // ✅ manquants aussi en string avec quantité
              missing_items: {
                type: "array",
                items: { type: "string" },
              },

              // steps optionnel (lisible)
              steps: {
                type: "array",
                items: { type: "string" },
              },
            },
            required: ["name"],
          },
        },

        // Weekly plan
        meals: {
          type: "array",
          items: { type: "string" },
        },
        shopping_list: {
          type: "array",
          items: { type: "string" }, // "Poulet — 1 kg", etc.
        },

        // Actions pour appliquer à ta liste
        actions: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              type: { type: "string", enum: ["check", "set_qty", "add_item"] },
              name: { type: "string" },

              checked: { type: "boolean" },
              qty: { type: "integer" },

              // ✅ suggestion de catégorie (sera utilisée quand on modifiera app.js)
              category: { type: "string" },
            },
            required: ["type", "name"],
          },
        },
      },
      required: ["kind", "message"],
    };

    // System instructions
    const system = [
      "Tu es un conseiller culinaire et nutrition simple.",
      "Tu réponds STRICTEMENT au format JSON du schéma fourni (pas de texte hors JSON).",
      "Tu reçois la liste complète (catalogue), les produits cochés, quantités, prix, et éventuellement budget + objectif.",
      "Important: quand tu proposes des ingrédients, ajoute TOUJOURS des quantités réalistes (g/ml/pièces/pincée/etc).",
      "Important: pour les actions (check / set_qty), utilise EXACTEMENT les noms du catalogue quand l'article existe déjà.",
      "Si un ingrédient n'existe pas dans le catalogue: utilise add_item + qty + propose une category logique (ex: épices => Sec 1).",
      "Réponses simples, réalistes, faisables, magasin standard.",
      "Langue: français.",
    ].join("\n");

    let task = "";
    if (kind === "suggest_from_checked") {
      task =
        "Propose 8 idées de plats faisables à partir des produits cochés. Retourne recipes (name + why).";
    } else if (kind === "suggest_plus_2") {
      task =
        "Propose 8 idées de plats. Pour chaque plat, indique les 0 à 2 ingrédients manquants max (missing_items) avec quantités.";
    } else if (kind === "plan_recipe") {
      task =
        "À partir de l'envie (prompt), propose 1 recette simple avec ingredients (avec quantités) + steps. " +
        "Puis génère actions: check (si ingrédients existent), set_qty (si qty>1), add_item (si manquants) avec qty. " +
        "Utilise EXACTEMENT les noms du catalogue quand possible.";
    } else if (kind === "weekly_plan") {
      task =
        "Avec budget + objectif, propose une semaine de courses: shopping_list (avec quantités) + meals (5 à 7 repas). " +
        "Ajoute actions pour cocher/ajouter ce qui est nécessaire.";
    } else {
      task =
        "Réponds avec un message utile sur les courses et quelques suggestions si possible.";
    }

    const model = env.OPENAI_MODEL || "gpt-4o-mini";

    const payload = {
      model,
      instructions: system,
      input: [
        {
          role: "user",
          content: JSON.stringify({
            task,
            user: { kind, prompt, locale, budget, goal },
            // on transmet l'état comme avant
            state,
            // ✅ catalogue canonique (noms existants)
            catalog: {
              items: catalogItems.map((x) => x.name),
              // optionnel: si tu veux plus tard passer les catégories autorisées depuis le front
              allowed_categories: allowedCategories || [
                "Divers",
                "Soins",
                "Entretient 1",
                "Entretient 2",
                "Boissons 1",
                "Boissons 2",
                "Petit dej 1",
                "Petit dej 2",
                "Sucreries",
                "Sec 1",
                "Boites 1",
                "Boites 2",
                "Frais 1",
                "Frais 2",
                "Frais 3",
                "Fruits/légumes",
                "Viandes",
                "Surgelé",
              ],
              // mini-guideline pour classer
              category_hint: "Épices/condiments => Sec 1. Produits frais => Frais/Fruits-légumes/Viandes. Surgelés => Surgelé. Boissons => Boissons.",
            },
          }),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "shopping_ai_v2",
          strict: true,
          schema,
        },
      },
    };

    let openaiResp;
    try {
      openaiResp = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      return err("Erreur réseau vers OpenAI.", 502, { details: String(e) });
    }

    if (!openaiResp.ok) {
      const txt = await openaiResp.text().catch(() => "");
      return err("OpenAI a renvoyé une erreur.", 502, {
        status: openaiResp.status,
        body: txt.slice(0, 2000),
      });
    }

    const data = await openaiResp.json();

    // Extraction du JSON depuis output_text
    let outText = "";
    try {
      const outputs = data.output || [];
      for (const it of outputs) {
        if (it.type === "message" && Array.isArray(it.content)) {
          const t = it.content.find((c) => c.type === "output_text");
          if (t && typeof t.text === "string") {
            outText = t.text;
            break;
          }
        }
      }
    } catch {}

    if (!outText) outText = data.output_text || "";

    let parsed;
    try {
      parsed = JSON.parse(outText);
    } catch {
      return err("Réponse IA non-JSON (unexpected).", 502, {
        raw: outText.slice(0, 2000),
      });
    }

    // ✅ Post-traitement: rendre "actions" beaucoup + fiables
    try {
      parsed.kind = parsed.kind || kind;

      const catalog = {
        items: catalogItems.map((x) => ({ name: x.name || x, category: "" })),
        categories: (allowedCategories ||
          [
            "Divers","Soins","Entretient 1","Entretient 2","Boissons 1","Boissons 2","Petit dej 1","Petit dej 2",
            "Sucreries","Sec 1","Boites 1","Boites 2","Frais 1","Frais 2","Frais 3","Fruits/légumes","Viandes","Surgelé",
          ]),
      };

      parsed = normalizeActions(parsed, catalog);
    } catch {}

    return json(parsed, 200);
  },
};
