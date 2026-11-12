/**
 * Dev Coffee API
 * ---------------------------------------------------------------
 * API RESTful em memória para gerenciar a fila de pedidos da
 * cafeteria Dev Coffee, construída apenas com módulos nativos do
 * Node.js (node:http). Nenhuma dependência externa é utilizada.
 *
 * Rotas:
 *   GET    /orders              -> lista pedidos (filtro ?status=)
 *   GET    /orders/:id          -> busca um pedido
 *   POST   /orders              -> cria um pedido
 *   PATCH  /orders/:id/status   -> atualiza apenas o status
 *   DELETE /orders/:id          -> remove um pedido
 *   ANY    /*                   -> 404 com mensagem JSON
 */

'use strict';

const http = require('node:http');

const PORT = process.env.PORT || 3000;
const MAX_BODY_BYTES = 1024 * 1024; // 1 MB: protege contra corpos gigantes
const VALID_STATUS = ['pendente', 'pronto', 'cancelado'];

// ---------------------------------------------------------------
// "Banco de dados" em memória
// ---------------------------------------------------------------
const orders = [];
let nextId = 1; // ID sequencial automático (não é reaproveitado após DELETE)

// ---------------------------------------------------------------
// Helpers de resposta
// ---------------------------------------------------------------

/** Envia resposta JSON com o Content-Type exigido pelo enunciado. */
function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

/** Envia 204 No Content: corpo vazio e sem Content-Type. */
function sendNoContent(res) {
  res.writeHead(204);
  res.end();
}

/** Atalho para respostas de erro padronizadas. */
function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { error: message });
}

// ---------------------------------------------------------------
// Leitura do corpo via eventos de stream (data / end)
// ---------------------------------------------------------------

/**
 * Consome o stream da requisição com req.on('data') e req.on('end').
 * Resolve com o texto bruto do corpo; rejeita se o limite for excedido.
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;

    req.on('data', (chunk) => {
      if (tooLarge) return; // continua drenando o stream sem acumular
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (tooLarge) {
        const err = new Error('Corpo da requisição excede o limite permitido.');
        err.code = 'BODY_TOO_LARGE';
        return reject(err);
      }
      resolve(Buffer.concat(chunks).toString('utf-8'));
    });

    req.on('error', reject);
  });
}

/**
 * Desserializa JSON com try/catch para que entradas malformadas
 * nunca derrubem o processo. Retorna { ok, data }.
 */
function parseJson(raw) {
  try {
    return { ok: true, data: JSON.parse(raw) };
  } catch (_) {
    return { ok: false, data: null };
  }
}

/** Garante que o valor seja um objeto simples (não null, não array). */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Garante string não vazia (ignorando espaços). */
function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

// ---------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------

function listOrders(res, query) {
  const status = query.get('status');
  const result = status === null ? orders : orders.filter((o) => o.status === status);
  sendJson(res, 200, result);
}

function getOrder(res, id) {
  const order = orders.find((o) => o.id === id);
  if (!order) return sendError(res, 404, `Pedido ${id} não encontrado.`);
  sendJson(res, 200, order);
}

async function createOrder(req, res) {
  let raw;
  try {
    raw = await readBody(req);
  } catch (err) {
    const code = err.code === 'BODY_TOO_LARGE' ? 413 : 400;
    return sendError(res, code, err.message);
  }

  const parsed = parseJson(raw);
  if (!parsed.ok || !isPlainObject(parsed.data)) {
    return sendError(res, 400, 'Corpo inválido: envie um JSON válido (objeto).');
  }

  const { client, item } = parsed.data;
  if (!isNonEmptyString(client) || !isNonEmptyString(item)) {
    return sendError(res, 400, 'Campos obrigatórios: "client" e "item" (strings não vazias).');
  }

  const order = {
    id: nextId++,
    client: client.trim(),
    item: item.trim(),
    status: 'pendente',
  };
  orders.push(order);
  sendJson(res, 201, order);
}

async function updateOrderStatus(req, res, id) {
  // O corpo é sempre consumido, mesmo que o pedido não exista.
  let raw;
  try {
    raw = await readBody(req);
  } catch (err) {
    const code = err.code === 'BODY_TOO_LARGE' ? 413 : 400;
    return sendError(res, code, err.message);
  }

  const order = orders.find((o) => o.id === id);
  if (!order) return sendError(res, 404, `Pedido ${id} não encontrado.`);

  const parsed = parseJson(raw);
  if (!parsed.ok || !isPlainObject(parsed.data)) {
    return sendError(res, 400, 'Corpo inválido: envie um JSON válido (objeto).');
  }

  const { status } = parsed.data;
  if (!VALID_STATUS.includes(status)) {
    return sendError(res, 400, `Status inválido. Valores aceitos: ${VALID_STATUS.join(', ')}.`);
  }

  order.status = status;
  sendJson(res, 200, order);
}

function deleteOrder(res, id) {
  const index = orders.findIndex((o) => o.id === id);
  if (index === -1) return sendError(res, 404, `Pedido ${id} não encontrado.`);
  orders.splice(index, 1);
  sendNoContent(res);
}

function notFound(res, method, pathname) {
  sendError(res, 404, `Rota não encontrada: ${method} ${pathname}`);
}

// ---------------------------------------------------------------
// Roteamento manual
// ---------------------------------------------------------------

async function router(req, res) {
  // Base fixa: o Host da requisição pode estar ausente ou malformado.
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname.replace(/\/+$/, '') || '/'; // tolera "/" final
  const segments = pathname.split('/').filter(Boolean); // "/orders/1" -> ["orders","1"]
  const method = req.method;

  if (segments[0] === 'orders') {
    // /orders
    if (segments.length === 1) {
      if (method === 'GET') return listOrders(res, url.searchParams);
      if (method === 'POST') return createOrder(req, res);
    }

    // /orders/:id  e  /orders/:id/status
    if (segments.length >= 2 && /^\d+$/.test(segments[1])) {
      const id = Number(segments[1]);

      if (segments.length === 2) {
        if (method === 'GET') return getOrder(res, id);
        if (method === 'DELETE') return deleteOrder(res, id);
      }

      if (segments.length === 3 && segments[2] === 'status' && method === 'PATCH') {
        return updateOrderStatus(req, res, id);
      }
    }
  }

  // Qualquer rota ou verbo não previsto
  return notFound(res, method, pathname);
}

// ---------------------------------------------------------------
// Servidor
// ---------------------------------------------------------------

const server = http.createServer((req, res) => {
  router(req, res).catch((err) => {
    // Rede de segurança: erro inesperado nunca derruba o servidor.
    console.error('Erro inesperado:', err);
    if (!res.headersSent) {
      sendError(res, 500, 'Erro interno do servidor.');
    } else {
      res.end();
    }
  });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Dev Coffee API rodando em http://localhost:${PORT}`);
  });
}

module.exports = server;
