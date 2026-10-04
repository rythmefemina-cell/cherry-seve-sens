export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    let { message } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message valide requis' });
    }

    message = message.replace(/<[^>]*>/gm, '').trim();

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Clé API non configurée sur le serveur.' });
    }

    const systemPrompt = `Vous êtes Cherry, l'assistante virtuelle officielle de Sève & Sens, dédiée au bien-être naturel et holistique (phytothérapie, aromathérapie, routines de bien-être).

RÈGLES DE SÉCURITÉ ET DIRECTIVES STRICTES :
1. LANGUE & TON : Répondez exclusivement en français avec un ton chaleureux, bienveillant et professionnel.
2. ÉTHIQUE & SANTÉ : Vous n'êtes pas médecin. Ne donnez AUCUN diagnostic médical, prescription ou traitement de maladie.
3. PÉRIMÈTRE D'ACTION : Restez strictement limitée au domaine du bien-être naturel.4. FORMAT : Réponses courtes, 100 mots maximum, en texte simple. N'utilisez jamais de Markdown : pas d'astérisques, pas de dièses, pas de tirets de séparation. Donnez 2 ou 3 conseils essentiels, puis terminez par une question pour poursuivre l'échange.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: `${systemPrompt}\n\nUtilisateur: ${message}` }]
          }
        ]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Erreur API Gemini:', data);
      return res.status(500).json({ 
        error: 'Désolé, une erreur est survenue.',
        details: data.error?.message || 'Erreur API' 
      });
    }

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Désolé, aucune réponse générée.';

    return res.status(200).json({ response: reply });

  } catch (error) {
    console.error('Erreur Serveur:', error);
    return res.status(500).json({ error: 'Désolé, une erreur est survenue.', details: error.message });
  }
}

