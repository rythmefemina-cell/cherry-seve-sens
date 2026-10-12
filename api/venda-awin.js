// Aviso de venda da Awin (Ecco Verde, Beauty The Shop...) enviado para o Telegram.
// A Awin chama este endereço a cada nova venda (Toolbox > Transaction Notifications).

const LOJAS = {
  '44477': 'Ecco Verde',
};

async function enviarTelegram(texto) {
  const token = process.env.TELEGRAM_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.error('TELEGRAM_TOKEN ou TELEGRAM_CHAT_ID não configurados');
    return false;
  }
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: texto }),
  });
  if (!r.ok) console.error('Erro Telegram:', r.status, await r.text());
  return r.ok;
}

export default async function handler(req, res) {
  const q = req.query || {};

  // Só aceita chamadas com a chave secreta certa
  if (!process.env.AWIN_SEGREDO || q.key !== process.env.AWIN_SEGREDO) {
    return res.status(403).send('forbidden');
  }

  // Chamada de verificação da Awin, sem dados de venda (os !!!códigos!!! não foram preenchidos): ignora
  if (!q.id || String(q.id).includes('!!!')) {
    return res.status(200).send('ok (sem venda)');
  }

  const moeda = q.moeda || 'EUR';
  const loja = LOJAS[q.loja] || `Awin (loja nº ${q.loja || '?'})`;
  const teste = q.id === 'TESTE' ? ' (TESTE)' : '';

  const texto =
    `🛍️ Nova venda${teste} – ${loja}\n` +
    `Valor do pedido: ${q.valor || '?'} ${moeda}\n` +
    `Sua comissão: ${q.com || '?'} ${moeda}\n` +
    `Pedido nº ${q.id || '?'}\n` +
    `(fica pendente até a loja validar)`;

  const ok = await enviarTelegram(texto);
  return res.status(ok ? 200 : 500).send(ok ? 'ok' : 'erro');
}
