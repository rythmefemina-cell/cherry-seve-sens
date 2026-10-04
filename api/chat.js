  const SHEETS = [
  { store: 'Notino', url: 'https://docs.google.com/spreadsheets/d/1V5xe3BJgx_EudyPPL_mRd4op-fwBn11xgrGR_LeJgKs/export?format=csv' }
];

const CACHE_MS = 5 * 60 * 1000;
let cache = { time: 0, items: [] };

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

async function loadCatalog() {
  if (cache.items.length && Date.now() - cache.time < CACHE_MS) {
    return cache.items;
  }

  const items = [];

  for (const sheet of SHEETS) {
    try {
      const r = await fetch(sheet.url);
      const text = await r.text();

      if (!r.ok || text.trim().startsWith('<')) {
        console.error(`Planilha inacessível (${sheet.store}): verifique o compartilhamento.`);
        continue;
      }

      const rows = parseCSV(text);
      if (rows.length < 2) continue;

      const header = rows[0].map(norm);
      const col = (word) => header.findIndex((h) => h.includes(word));
      const iAlbum = col('album');
      const iPour = col('para quem');
      const iProd = col('produto');
      const iLink = col('link');
      const iOk = col('aprovado');
      const iArg = col('argumento');

      if (iProd < 0 || iLink < 0) {
        console.error(`Colunas não encontradas (${sheet.store}).`);
        continue;
      }

      for (const row of rows.slice(1)) {
        const name = (row[iProd] || '').trim();
        const url = (row[iLink] || '').trim();
        const approved = iOk < 0 || norm(row[iOk]).startsWith('sim');

        if (!name || !url.startsWith('https://') || !approved) continue;

        items.push({
          album: iAlbum >= 0 ? (row[iAlbum] || '').trim() : '',
          pour: iPour >= 0 ? (row[iPour] || '').trim() : '',
          name: name,
          arg: iArg >= 0 ? (row[iArg] || '').trim() : '',
          url: url,
          store: sheet.store
        });
      }
    } catch (err) {
      console.error(`Erro ao ler a planilha (${sheet.store}):`, err);
    }
  }

  items.forEach((p, i) => { p.id = `P${i + 1}`; });

  if (items.length) {
    cache = { time: Date.now(), items: items };
    return items;
  }
  return cache.items;
}

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

    message = clean(message).slice(0, 1000);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Clé API non configurée sur le serveur.' });
    }

    const catalog = await loadCatalog();

    const catalogText = catalog.length
      ? catalog.map((p) => `${p.id} | ${p.album} | ${p.pour} | ${p.name}${p.arg ? ' | ' + p.arg : ''}`).join('\n')
      : '(catalogue vide pour le moment)';

    const systemPrompt = `Vous êtes Cherry, la conseillère virtuelle de Sève & Sens, une sélection de soins naturels. Votre mission : faciliter le choix de chaque personne en lui proposant rapidement les produits de la sélection qui correspondent à sa demande.

CATALOGUE (code | album | pour qui | produit | argument éventuel) :
${catalogText}

RÈGLES STRICTES :
1. LANGUE & TON : Répondez exclusivement en français, avec un ton chaleureux, élégant et direct.
2. ACCUEIL : Saluez et présentez-vous en une phrase, uniquement au tout premier message.
3. SUGGESTIONS : Proposez uniquement des produits du catalogue. Jusqu'à 4 produits si la demande est large, seulement ceux qui correspondent vraiment si la demande est précise. Une seule phrase de présentation suffit : les produits s'affichent sous votre message. N'inventez jamais de produit.
4. CODES : Pour chaque produit proposé, écrivez son code entre doubles crochets à la toute fin de la réponse, par exemple [[P3]]. N'écrivez jamais de lien ni d'adresse web.
5. AUTRES OPTIONS : Si la personne demande d'autres idées, proposez d'autres produits adaptés sans répéter ceux déjà proposés.
6. DEMANDE VAGUE : Posez une seule question courte pour pouvoir choisir.
7. QUESTIONS : Répondez poliment en une ou deux phrases, sans explication longue. Pour la composition, l'âge conseillé ou le mode d'emploi d'un produit, renvoyez à la fiche produit sur le site du partenaire.
8. HORS CATALOGUE : Si rien ne correspond ou si le catalogue est vide, dites simplement que la sélection Sève & Sens s'agrandit bientôt, sans écrire de code.
9. RÈGLES COMMERCIALES : Ne mentionnez jamais de prix, de promotion ni de promesse de résultat. Ne dites jamais qu'un produit soigne ou guérit. Ne citez jamais les marques Hermès, Dior ou Guerlain.
10. SANTÉ : Vous n'êtes pas médecin. Aucun diagnostic, aucune prescription. En cas de problème de santé, orientez vers un professionnel de santé.
11. PÉRIMÈTRE : Restez strictement dans le domaine des soins naturels et du bien-être.
12. FORMAT : 40 mots maximum, en texte simple, sans mise en forme Markdown, avec la ponctuation normale du français. Écrivez toujours le nom de la marque ainsi : Sève & Sens.
13. TRANSPARENCE : Si on vous le demande, expliquez que certains liens sont affiliés : l'achat se fait sur le site du partenaire et Sève & Sens peut percevoir une commission, sans coût supplémentaire pour la cliente.`;

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
          const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (raw) {
            const ids = [...raw.matchAll(/\[\[\s*(P\d+)\s*\]\]/g)].map((m) => m[1]);
            const unique = [...new Set(ids)].slice(0, 4);
            const products = unique
              .map((id) => catalog.find((p) => p.id === id))
              .filter(Boolean)
              .map((p) => ({ name: p.name, url: p.url, store: p.store }));
            const reply = raw.replace(/\[\[[^\]]*\]\]/g, '').trim();

            return res.status(200).json({ response: reply, products: products });
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
