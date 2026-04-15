import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phrase, targetWords } = await req.json();

    if (!phrase || !targetWords || !Array.isArray(targetWords)) {
      return new Response(
        JSON.stringify({ error: "Missing phrase or targetWords" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `Tu es un correcteur orthographique pour des dictées d'enfants en français.

On te donne :
- Une phrase écrite par un enfant
- La liste des mots de la dictée que l'enfant devait utiliser

Tu dois vérifier CHAQUE mot de la phrase : orthographe, grammaire, conjugaison, accords (genre, nombre, temps).

Réponds UNIQUEMENT avec un JSON valide (pas de markdown, pas de commentaires), au format suivant :
{
  "correctedPhrase": "la phrase entièrement corrigée",
  "errors": [
    {
      "wrong": "le mot mal écrit tel que l'enfant l'a écrit",
      "correct": "le mot correctement orthographié",
      "type": "orthographe | grammaire | conjugaison | accord"
    }
  ],
  "targetWordsStatus": [
    {
      "word": "mot de la liste",
      "found": true,
      "correct": true
    }
  ]
}

Règles :
- Si la phrase est parfaite, "errors" doit être un tableau vide.
- "targetWordsStatus" doit contenir un objet pour chaque mot de la liste, indiquant s'il a été trouvé dans la phrase et s'il est correctement orthographié.
- Sois strict sur les accents, les accords et la conjugaison.
- Ne change pas le sens de la phrase, corrige uniquement l'orthographe et la grammaire.`;

    const userPrompt = `Phrase de l'enfant : "${phrase}"

Mots de la dictée : ${targetWords.join(", ")}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Parse the JSON from the AI response
    let result;
    try {
      // Try to extract JSON from possible markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
      result = JSON.parse(jsonMatch[1].trim());
    } catch {
      console.error("Failed to parse AI response:", content);
      return new Response(
        JSON.stringify({ error: "Failed to parse AI response", raw: content }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("check-phrase error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
