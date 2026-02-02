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

    // JSON Schema (Structured Outputs)
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
              missing_items: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    name: { type: "string" },
                    qty: { type: "integer" },
                    note: { type: "string" },
                  },
                  required: ["name", "qty"],
                },
              },
            },
            required: ["name"],
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
            },
            required: ["type", "name"],
          },
        },
      },
      required: ["kind", "message"],
    };

    const system = [
      "Tu es un conseiller culinaire et nutrition simple.",
      "Tu réponds STRICTEMENT au format JSON du schéma fourni (pas de texte hors JSON).",
      "Tu reçois la liste complète, les produits cochés, quantités, prix, et éventuellement budget + objectif.",
      "Réponses: simples, réalistes, faciles. Favorise magasin standard.",
      "Langue: français.",
    ].join("\n");

    let task = "";
    if (kind === "suggest_from_checked") {
      task = "Propose 8 idées de plats faisables à partir des produits cochés. Donne un message + recipes.";
    } else if (kind === "suggest_plus_2") {
      task = "Propose 8 idées de plats + pour chaque plat, 0 à 2 ingrédients manquants max.";
    } else if (kind === "plan_recipe") {
      task =
        "À partir de l'envie (prompt), propose 1 recette simple et génère des actions: cocher les ingrédients existants et ajouter ceux manquants.";
    } else if (kind === "weekly_plan") {
      task =
        "Avec budget + objectif, propose une liste de courses semaine + 5-7 idées de repas. Si budget absent, fais une semaine équilibrée standard.";
    } else {
      task = "Réponds avec un message utile sur les courses et des suggestions si possible.";
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
            user: { kind, prompt, locale, budget, goal, state },
          }),
        },
      ],
      // ✅ IMPORTANT: OpenAI exige un "name" pour json_schema (text.format.name)
      text: {
        format: {
          type: "json_schema",
          name: "shopping_ai_v1",
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

    return json(parsed, 200);
  },
};
