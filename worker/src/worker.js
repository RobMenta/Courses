/**
 * Cloudflare Worker — /ai
 * - CORS simple
 * - Appelle OpenAI Responses API (POST https://api.openai.com/v1/responses)
 *
 * IMPORTANT: définis OPENAI_API_KEY en secret :
 *   wrangler secret put OPENAI_API_KEY
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

function norm(s) {
  return (s || "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// tokens utilitaires
function tokens(s) {
  const t = norm(s).replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  return t;
}

// Match robuste (comme ton front): exact -> includes -> jaccard tokens
function findBestMatch(name, allItems) {
  const q = (name || "").toString().trim();
  const qn = norm(q);
  if (!qn) return null;

  // 1) exact norm
  let hit = allItems.find((it) => norm(it?.name) === qn);
  if (hit) return hit;

  // 2) includes either way
  hit = allItems.find((it) => {
    const n = norm(it?.name);
    return n.includes(qn) || qn.includes(n);
  });
  if (hit) return hit;

  // 3) token overlap (jaccard)
  const qt = tokens(q);
  if (!qt.length) return null;

  let best = null;
  for (const it of allItems) {
    const itName = String(it?.name || "");
    const itTokens = tokens(itName);
    if (!itTokens.length) continue;

    const set = new Set(itTokens);
    let inter = 0;
    for (const t of qt) if (set.has(t)) inter++;
    const union = new Set([...qt, ...itTokens]).size;
    const score = inter / Math.max(1, union);

    if (!best || score > best.score) best = { it, score };
  }
  return best && best.score >= 0.55 ? best.it : null;
}

// Sanitize catégorie côté worker (si tu fournis categories[])
function sanitizeCategory(cat, categories) {
  const c = (cat || "").toString().trim();
  if (Array.isArray(categories) && categories.includes(c)) return c;
  return "Divers";
}

// extrait ingrédients depuis recipes[] (schema actuel)
function extractIngredientNames(parsed) {
  const out = [];
  const recipes = Array.isArray(parsed?.recipes) ? parsed.recipes : [];
  for (const r of recipes) {
    const ings = Array.isArray(r?.ingredients) ? r.ingredients : [];
    for (const ing of ings) {
      const n = (ing?.name ?? "").toString().trim();
      if (n) out.push(n);
    }
  }
  return out;
}

// dédoublonne via norm
function uniqByNorm(arr) {
  const seen = new Set();
  const out = [];
  for (const x of arr || []) {
    const s = (x ?? "").toString().trim();
    if (!s) continue;
    const k = norm(s);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

// recalcule have_it + actions fiables à partir de state.all (source of truth)
function postProcess(parsed, { kind, allItems, categories }) {
  if (!parsed || typeof parsed !== "object") return parsed;

  // On garantit kind
  parsed.kind = String(parsed.kind || kind || "");

  const ingredientNames = uniqByNorm(extractIngredientNames(parsed));

  // 1) Recalcule have_it dans recipes.ingredients
  const recipes = Array.isArray(parsed.recipes) ? parsed.recipes : [];
  for (const r of recipes) {
    const ings = Array.isArray(r?.ingredients) ? r.ingredients : [];
    for (const ing of ings) {
      const n = (ing?.name ?? "").toString().trim();
      if (!n) continue;
      const hit = findBestMatch(n, allItems);
      ing.have_it = !!hit;
    }
  }

  // 2) Reconstruit actions fiables
  //    - si ingredient existe -> check exact name de la liste
  //    - sinon -> add_item
  // IMPORTANT: on ne met jamais category sur un item existant
  const actions = [];
  for (const ingName of ingredientNames) {
    const hit = findBestMatch(ingName, allItems);
    if (hit) {
      actions.push({
        type: "check",
        name: String(hit.name), // EXACT libellé existant
        checked: true,
      });
    } else {
      actions.push({
        type: "add_item",
        name: ingName,
        qty: 1,
        category: "Divers",
      });
    }
  }

  // 3) Si le modèle a fourni des actions, on peut les fusionner mais en les “sanitisant”
  //    (utile pour weekly_plan: il peut ajouter des produits hors ingrédients)
  const modelActions = Array.isArray(parsed.actions) ? parsed.actions : [];
  for (const a of modelActions) {
    if (!a || typeof a !== "object") continue;
    const type = String(a.type || "").trim();
    const rawName = String(a.name || "").trim();
    if (!type || !rawName) continue;

    const hit = findBestMatch(rawName, allItems);

    if (type === "check" || type === "set_qty") {
      if (!hit) {
        // check/set_qty sur produit inexistant -> ignore (ou convertir en add_item, mais risqué)
        continue;
      }
      const base = { type, name: String(hit.name) };
      if (type === "check") base.checked = a.checked !== false;
      if (type === "set_qty") base.qty = Math.max(1, Math.min(999, Number(a.qty) || 1));
      actions.push(base);
      continue;
    }

    if (type === "add_item") {
      if (hit) {
        // add_item mais existe déjà -> on le coche, sans category
        actions.push({ type: "check", name: String(hit.name), checked: true });
      } else {
        actions.push({
          type: "add_item",
          name: rawName,
          qty: Math.max(1, Math.min(999, Number(a.qty) || 1)),
          category: sanitizeCategory(a.category, categories),
        });
      }
      continue;
    }
  }

  // 4) Dédupe actions (type+name)
  const seen = new Set();
  const finalActions = [];
  for (const a of actions) {
    const key = `${a.type}::${norm(a.name)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // sécurité: pas de category si l'item existe déjà
    const hit = findBestMatch(a.name, allItems);
    if (hit && "category" in a) delete a.category;

    finalActions.push(a);
  }

  parsed.actions = finalActions;

  // 5) Garde-fou qualité recette (si plan_recipe et recette trop vide)
  if (String(kind) === "plan_recipe") {
    const r0 = recipes[0];
    const ingCount = Array.isArray(r0?.ingredients) ? r0.ingredients.length : 0;
    const stepCount = Array.isArray(r0?.steps) ? r0.steps.length : 0;

    if (ingCount < 4 || stepCount < 4) {
      // on garde la réponse mais on avertit
      parsed.message =
        (parsed.message ? parsed.message + " " : "") +
        "⚠️ Réponse IA incomplète détectée: la recette manque d’ingrédients/étapes. Relance avec une demande plus précise.";
    }
  }

  return parsed;
}

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

    // catégories autorisées (optionnel, ton app.js les envoie)
    const categories = Array.isArray(body.categories) ? body.categories.map(String) : [];

    // On extrait la liste complète côté client pour aider le matching
    const all = Array.isArray(state?.all) ? state.all : [];
    const allItems = all
      .map((x) => ({
        name: String(x?.name || "").trim(),
        category: String(x?.category || "").trim(),
        checked: !!x?.checked,
      }))
      .filter((x) => x.name);

    const allNames = allItems.map((x) => x.name);
    const allNamesNorm = allNames.map((n) => norm(n));

    // JSON Schema (Structured Outputs)
    // ➜ petit boost qualité: on impose un minimum d'items/steps
    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        kind: { type: "string" },
        title: { type: "string" },
        message: { type: "string" },

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
              ingredients: {
                type: "array",
                minItems: 4,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    name: { type: "string" },
                    qty: { type: "number" },
                    unit: { type: "string" },
                    note: { type: "string" },
                    have_it: { type: "boolean" },
                  },
                  required: ["name", "qty", "unit", "have_it"],
                },
              },
              steps: {
                type: "array",
                minItems: 4,
                items: { type: "string" },
              },
            },
            required: ["name", "ingredients", "steps"],
          },
        },

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
              category: { type: "string" },
            },
            required: ["type", "name"],
          },
        },
      },
      required: ["kind", "message"],
    };

    const system = [
      "Tu es un conseiller cuisine + courses.",
      "Tu DOIS répondre STRICTEMENT en JSON selon le schéma fourni (aucun texte hors JSON).",
      "",
      "IMPORTANT MATCHING:",
      "- Tu reçois state.all (liste complète).",
      "- Si un ingrédient existe déjà dans state.all, tu dois utiliser EXACTEMENT le même libellé (mêmes lettres) dans actions[].name.",
      "- Ne marque PAS un ingrédient 'manquant' s'il existe déjà.",
      "- NOTE: le serveur recalculera have_it et corrigera actions si besoin.",
      "",
      "QUALITÉ RECETTE:",
      "- Pour plan_recipe: renvoie UNE vraie recette complète (>=4 ingrédients, >=4 étapes).",
      "- Donne des quantités réalistes (unités: g, ml, pcs, càs, càc).",
      "- Ex crêpes: farine + œufs + lait + sel + beurre/huile (+ sucre optionnel).",
      "",
      "ACTIONS:",
      "- Génère actions pour cocher les ingrédients existants nécessaires.",
      "- Pour ceux manquants: add_item + qty + category (si possible).",
      "- Ne propose JAMAIS de category pour un produit qui existe déjà.",
      "Langue: français.",
    ].join("\n");

    let task = "";
    if (kind === "suggest_from_checked") {
      task =
        "Propose 8 idées de plats faisables à partir des produits cochés. Donne message + recipes (idées).";
    } else if (kind === "suggest_plus_2") {
      task =
        "Propose 8 idées de plats + pour chaque plat, 0 à 2 ingrédients manquants max.";
    } else if (kind === "plan_recipe") {
      task =
        "À partir de l'envie (prompt), propose 1 recette simple et complète (ingredients + steps) et génère actions: cocher les ingrédients existants et ajouter ceux manquants.";
    } else if (kind === "weekly_plan") {
      task =
        "Avec budget + objectif, propose une semaine: menu + liste de courses. Génère actions pour cocher/ajouter.";
    } else {
      task = "Réponds avec un message utile et des suggestions si possible.";
    }

    const model = env.OPENAI_MODEL || "gpt-4o-mini";

    const payload = {
      model,
      temperature: 0.2,
      instructions: system,
      input: [
        {
          role: "user",
          content: JSON.stringify({
            task,
            user: {
              kind,
              prompt,
              locale,
              budget,
              goal,
              categories,
              // aide matching (source of truth)
              list_names: allNames,
              list_names_norm: allNamesNorm,
              state,
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

    // ✅ POST-PROCESS : source of truth = ta liste
    const fixed = postProcess(parsed, { kind, allItems, categories });

    return json(fixed, 200);
  },
};