export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    let { message, history } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message valide requis' });
    }

    const clean = (t) => t.replace(/<[^>]*>/gm, '').trim();

    message = clean(message);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Clé API non configurée sur le serveur.' });
    }

    const systemPrompt = `Vous êtes Cherry, l'assistante virtuelle officielle de Sève & Sens, dédiée au bien-être naturel et holistique (phytothérapie, aromathérapie, routines de bien-être).

RÈGLES DE SÉCURITÉ ET DIRECTIVES STRICTES :
1. LANGUE & TON : Répondez exclusivement en français avec un ton chaleureux, bienveillant et professionnel.
2. ÉTHIQUE & SANTÉ : Vous n'êtes pas médecin. Ne donnez AUCUN diagnostic médical, prescription ou traitement de maladie.
3. PÉRIMÈTRE D'ACTION : Restez strictement limitée au domaine du bien-être naturel.
4. FORMAT : Réponses courtes, 100 mots maximum, en texte simple, sans mise en forme Markdown (pas de gras, pas de titres, pas de listes à puces). Écrivez dans un français correct avec la ponctuation normale : apostrophes, accents et traits d'union. Écrivez toujours le nom de la marque ainsi : Sève & Sens. Donnez 2 ou 3 conseils essentiels, puis terminez par une question pour poursuivre l'échange.
5. CONVERSATION : Tenez compte des messages précédents de la conversation et répondez dans leur continuité. Ne saluez et ne souhaitez la bienvenue qu'au tout premier message.`;

    const pastTurns = (Array.isArray(history) ? history : [])
      .filter((h) => h && (h.role === 'user' || h.role === 'model') && typeof h.text === 'string')
      .map((h) => ({ role: h.role, parts: [{ text: clean(h.text).slice(0, 2000) }] }))
      .filter((h) => h.parts[0].text)
      .slice(-10);

    while (pastTurns.length && pastTurns[0].role !== 'user') {
      pastTurns.shift();
    }

    const contents = [...pastTurns, { role: 'user', parts: [{ text: message }] }];

    const models = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'];
    let lastError = 'Erreur API';

    for (const model of models) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: contents
          })
        });

        const data = await response.json();

        if (response.ok) {
          const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (reply) {
            return res.status(200).json({ response: reply });
          }
        }

        console.error(`Erreur API Gemini (${model}):`, data);
        lastError = data.error?.message || lastError;
      } catch (err) {
        console.error(`Erreur réseau (${model}):`, err);
        lastError = err.message || lastError;
      }
    }

    return res.status(500).json({
      error: 'Désolé, une erreur est survenue.',
      details: lastError
    });
  } catch (error) {
    console.error('Erreur serveur:', error);
    return res.status(500).json({ error: 'Désolé, une erreur est survenue.' });
  }
}
