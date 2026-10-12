// Avisos de venda da CJ (Notino) enviados para o Telegram.
// A Vercel chama este arquivo de hora em hora (ver "crons" no vercel.json).
// Teste manual: /api/vendas-cj?key=SEU_CRON_SECRET&horas=720

const CJ_URL = 'https://commissions.api.cj.com/query';

async function enviarTelegram(texto) {
  const token = process.env.TELEGRAM_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: texto }),
  });
  return r.ok;
}

function consulta(campos, desde, ate) {
  return `{ publisherCommissions(forPublishers: ["${process.env.CJ_CID}"], sincePostingDate: "${desde}", beforePostingDate: "${ate}") { count records { ${campos} } } }`;
}

// Primeiro tenta com todos os detalhes; se a CJ recusar algum campo, usa a versão simples
const CAMPOS_COMPLETOS = 'commissionId advertiserName postingDate actionStatus saleAmountPubCurrency pubCommissionAmountPubCurrency pubCommissionAmountUsd';
const CAMPOS_SIMPLES = 'advertiserName postingDate pubCommissionAmountUsd';

async function buscarCJ(campos, desde, ate) {
  const r = await fetch(CJ_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.CJ_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: consulta(campos, desde, ate) }),
  });
  const texto = await r.text();
  let dados;
  try { dados = JSON.parse(texto); } catch { return { erro: `HTTP ${r.status}: ${texto.slice(0, 200)}` }; }
  if (!r.ok || dados.errors) {
    return { erro: `HTTP ${r.status}: ${JSON.stringify(dados.errors || dados).slice(0, 300)}` };
  }
  return { registros: dados?.data?.publisherCommissions?.records || [] };
}

function valor(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : '?';
}

export default async function handler(req, res) {
  const segredo = process.env.CRON_SECRET;
  const auth = req.headers?.authorization || '';
  const q = req.query || {};
  const viaCron = segredo && auth === `Bearer ${segredo}`;
  const viaTeste = segredo && q.key === segredo;
  if (!viaCron && !viaTeste) return res.status(403).send('forbidden');

  if (!process.env.CJ_TOKEN || !process.env.CJ_CID) {
    await enviarTelegram('⚠️ Avisos CJ: faltam as variáveis CJ_TOKEN ou CJ_CID na Vercel.');
    return res.status(500).send('faltam variaveis');
  }

  // Janela: a hora cheia anterior (ex.: 14:00 às 15:00), sem repetir nem pular vendas.
  // No teste manual, as últimas N horas (máx. 720 = 30 dias).
  const agora = new Date();
  let ate = new Date(agora); ate.setUTCMinutes(0, 0, 0);
  let desde = new Date(ate.getTime() - 60 * 60 * 1000);
  if (viaTeste) {
    const horas = Math.min(Math.max(parseInt(q.horas || '24', 10) || 24, 1), 720);
    ate = agora;
    desde = new Date(agora.getTime() - horas * 60 * 60 * 1000);
  }
  const d = desde.toISOString(), a = ate.toISOString();

  let resultado = await buscarCJ(CAMPOS_COMPLETOS, d, a);
  if (resultado.erro) resultado = await buscarCJ(CAMPOS_SIMPLES, d, a);

  if (resultado.erro) {
    await enviarTelegram(`⚠️ Avisos CJ: não consegui consultar a CJ.\n${resultado.erro}`);
    return res.status(500).send('erro CJ');
  }

  const registros = resultado.registros;
  for (const r of registros) {
    const moeda = r.saleAmountPubCurrency !== undefined ? 'EUR' : 'USD';
    const comissao = r.pubCommissionAmountPubCurrency ?? r.pubCommissionAmountUsd;
    const linhas = [
      `🛍️ Nova venda${viaTeste ? ' (verificação)' : ''} – ${r.advertiserName || 'CJ'}`,
      r.saleAmountPubCurrency !== undefined ? `Valor do pedido: ${valor(r.saleAmountPubCurrency)} EUR` : null,
      `Sua comissão: ${valor(comissao)} ${moeda}`,
      r.actionStatus ? `Situação: ${r.actionStatus}` : null,
      r.commissionId ? `Comissão nº ${r.commissionId}` : null,
    ].filter(Boolean);
    await enviarTelegram(linhas.join('\n'));
  }

  if (viaTeste && registros.length === 0) {
    const horas = Math.round((ate - desde) / 3600000);
    await enviarTelegram(`✅ Ligação com a CJ funcionando.\nNenhuma venda nas últimas ${horas} horas.`);
  }

  return res.status(200).send(`ok (${registros.length})`);
}
