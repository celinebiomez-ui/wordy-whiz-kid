// Edge function: génère des passages de dictée (2-3 phrases) regroupant plusieurs mots de la liste
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { words } = await req.json();

    if (!Array.isArray(words) || words.length === 0) {
      return new Response(JSON.stringify({ error: 'Liste de mots requise' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY manquante');

    // Nombre de passages : regrouper plusieurs mots par passage (~3-4 mots par passage)
    const passageCount = Math.max(2, Math.min(6, Math.ceil(words.length / 3.5)));

    const systemPrompt = `Tu es un professeur des écoles en France. Tu rédiges des petites dictées pour enfants de primaire (CE2-CM2).

RÈGLES STRICTES :
- Rédige exactement ${passageCount} passages courts.
- Chaque passage contient 2 ou 3 phrases simples et naturelles.
- Chaque passage doit utiliser PLUSIEURS mots de la liste fournie (au moins 2-3 mots par passage).
- Tous les mots de la liste doivent apparaître au moins une fois au total dans l'ensemble des passages.
- Vocabulaire et grammaire adaptés à un enfant de primaire.
- Orthographe et grammaire IMPECCABLES (la dictée doit servir de référence).
- Pas d'émojis, pas de guillemets, pas de listes à puces.
- Ponctuation claire : points, virgules, points d'exclamation/interrogation si utiles.`;

    const userPrompt = `Voici la liste de mots : ${words.join(', ')}

Rédige ${passageCount} passages de 2-3 phrases pour une dictée.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'return_passages',
              description: 'Retourne la liste des passages de dictée',
              parameters: {
                type: 'object',
                properties: {
                  passages: {
                    type: 'array',
                    description: `Liste de ${passageCount} passages de dictée, chacun étant 2-3 phrases`,
                    items: { type: 'string' },
                  },
                },
                required: ['passages'],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: 'return_passages' } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Trop de requêtes, réessaie dans un instant.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'Crédits IA épuisés.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const t = await response.text();
      console.error('AI gateway error:', response.status, t);
      return new Response(JSON.stringify({ error: 'Erreur IA' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error('Pas de réponse structurée de l\'IA');

    const args = JSON.parse(toolCall.function.arguments);
    const passages: string[] = args.passages || [];

    return new Response(JSON.stringify({ passages }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('generate-dictation-passages error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Erreur inconnue' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
