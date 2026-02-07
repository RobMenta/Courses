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
    const allNames = all.map((x) => String(x?.name || "").trim()).filter(Boolean);
    const allNamesNorm = allNames.map((n) => norm(n));

    // JSON Schema (Structured Outputs) — VERSION AMÉLIORÉE
    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        kind: { type: "string" },
        title: { type: "string" },
        message: { type: "string" },

        // ✅ recettes complètes (1 ou plusieurs)
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

              // ✅ ingrédients détaillés (avec quantités)
              ingredients: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    name: { type: "string" },
                    qty: { type: "number" },
                    unit: { type: "string" }, // "g" | "ml" | "pcs" | "càs" | etc.
                    note: { type: "string" },
                    have_it: { type: "boolean" }, // présent dans la liste
                  },
                  required: ["name", "qty", "unit", "have_it"],
                },
              },

              steps: {
                type: "array",
                items: { type: "string" },
              },
            },
            required: ["name", "ingredients", "steps"],
          },
        },

        // ✅ actions robustes
        actions: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              type: { type: "string", enum: ["check", "set_qty", "add_item"] },
              name: { type: "string" }, // IMPORTANT: si l'item existe, utiliser EXACTEMENT le nom de la liste
              checked: { type: "boolean" },
              qty: { type: "integer" },
              category: { type: "string" }, // utile pour add_item seulement
            },
            required: ["type", "name"],
          },
        },
      },
      required: ["kind", "message"],
    };

    // ✅ système : on force le “matching” sur la liste
    const system = [
      "Tu es un conseiller cuisine + courses.",
      "Tu DOIS répondre STRICTEMENT en JSON selon le schéma fourni (aucun texte hors JSON).",
      "",
      "IMPORTANT MATCHING:",
      "- Tu reçois state.all (liste complète).",
      "- Si un ingrédient existe déjà dans state.all, tu dois utiliser EXACTEMENT le même libellé (mêmes lettres) dans actions[].name.",
      "- Le matching se fait en ignorant accents/majuscules/pluriels (ex: 'lait' = 'Lait').",
      "- Ne marque PAS un ingrédient 'manquant' s'il existe déjà dans la liste.",
      "",
      "QUALITÉ RECETTE:",
      "- Pour plan_recipe: renvoie UNE vraie recette complète (ingredients + steps).",
      "- Les crêpes: farine + œufs + lait + (sucre optionnel) + beurre/huile + sel.",
      "- Donne des quantités réalistes (unités: g, ml, pcs, càs, càc).",
      "",
      "ACTIONS:",
      "- Génère actions pour cocher les items existants nécessaires.",
      "- Pour ceux manquants: add_item + qty + category (si possible).",
      "- Ne déplace JAMAIS un produit existant vers une autre catégorie : si l'item existe, ne propose pas de category pour lui.",
      "Langue: français."
    ].join("\n");

    let task = "";
    if (kind === "suggest_from_checked") {
      task = "Propose 8 idées de plats faisables à partir des produits cochés. Donne message + recipes (liste d'idées).";
    } else if (kind === "suggest_plus_2") {
      task = "Propose 8 idées de plats + pour chaque plat, 0 à 2 ingrédients manquants max.";
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
              // ✅ On donne une aide de matching (liste “source of truth”)
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
      return err("Réponse IA non-JSON (unexpected).", 502, { raw: outText.slice(0, 2000) });
    }

    return json(parsed, 200);
  },
};
