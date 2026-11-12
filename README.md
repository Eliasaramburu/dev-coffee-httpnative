# Dev Coffee API (dev-coffee-httpnative)

API RESTful em memória para gerenciar a fila de pedidos da cafeteria Dev Coffee, construída **apenas com módulos nativos do Node.js** (`node:http`), sem Express, Fastify, NestJS ou qualquer dependência via npm.

**Autor:** Joel Elias Aramburu da Silva

## Como executar

Requisito: Node.js 16 ou superior.

```bash
git clone https://github.com/<Eliasaramburu>/dev-coffee-httpnative.git
cd dev-coffee-httpnative
npm start
```

O servidor sobe em `http://localhost:3000`. Para usar outra porta:

```bash
PORT=4000 npm start
```

> Os dados ficam apenas em memória: reiniciar o servidor apaga todos os pedidos.

## Modelo do recurso

```json
{
  "id": 1,
  "client": "Nome do Cliente",
  "item": "Nome do Café/Produto",
  "status": "pendente"
}
```

`status` aceita somente: `pendente`, `pronto` ou `cancelado`.

## Endpoints

| Método | Rota                  | Sucesso        | Erros                |
|--------|-----------------------|----------------|----------------------|
| GET    | `/orders`             | 200 OK         |                      |
| GET    | `/orders/:id`         | 200 OK         | 404                  |
| POST   | `/orders`             | 201 Created    | 400                  |
| PATCH  | `/orders/:id/status`  | 200 OK         | 400, 404             |
| DELETE | `/orders/:id`         | 204 No Content | 404                  |
| ANY    | `/*`                  |                | 404 (JSON descritivo)|

Respostas com corpo usam `Content-Type: application/json; charset=utf-8` (exceto o 204).

## Exemplos (cURL)

### Criar pedido (POST /orders)

```bash
curl -i -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{"client":"Ana","item":"Cappuccino"}'
```

Resposta `201 Created`:

```json
{ "id": 1, "client": "Ana", "item": "Cappuccino", "status": "pendente" }
```

Corpo inválido ou campos faltantes retornam `400`:

```bash
curl -i -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{"client":"Ana"}'
```

### Listar pedidos (GET /orders)

```bash
curl -i http://localhost:3000/orders
```

### Filtrar por status (GET /orders?status=pendente)

```bash
curl -i "http://localhost:3000/orders?status=pendente"
```

### Buscar por ID (GET /orders/:id)

```bash
curl -i http://localhost:3000/orders/1
```

ID inexistente retorna `404`:

```bash
curl -i http://localhost:3000/orders/999
```

### Atualizar status (PATCH /orders/:id/status)

```bash
curl -i -X PATCH http://localhost:3000/orders/1/status \
  -H "Content-Type: application/json" \
  -d '{"status":"pronto"}'
```

Status inválido retorna `400`; pedido inexistente retorna `404`:

```bash
curl -i -X PATCH http://localhost:3000/orders/1/status \
  -H "Content-Type: application/json" \
  -d '{"status":"entregue"}'
```

### Remover pedido (DELETE /orders/:id)

```bash
curl -i -X DELETE http://localhost:3000/orders/1
```

Resposta `204 No Content` (sem corpo).

### Rota ou verbo não previsto

```bash
curl -i -X PUT http://localhost:3000/orders/1
```

Resposta `404 Not Found`:

```json
{ "error": "Rota não encontrada: PUT /orders/1" }
```

## Decisões de projeto

- **Leitura do body** via `req.on('data')` e `req.on('end')`, com limite de 1 MB.
- **`JSON.parse` protegido** por `try/catch`: JSON malformado gera `400`, nunca derruba o servidor.
- **IDs sequenciais** que não são reaproveitados após um `DELETE`.
- **Roteamento manual** sobre `new URL()`, com tolerância à barra final (`/orders/`).
- No `PATCH`, o pedido é verificado primeiro (`404`) e depois o status (`400`).
