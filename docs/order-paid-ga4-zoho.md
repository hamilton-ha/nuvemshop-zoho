# Fluxo técnico `order-paid` (Nuvemshop → Vercel → Zoho + GA4)

Este documento descreve, de ponta a ponta, o comportamento atual do endpoint `api/order-paid.js` para eventos de pedido pago.

---

## 1) O que o endpoint `api/order-paid.js` faz

O endpoint é uma função serverless (Vercel) com comportamento:

- `GET`: responde healthcheck simples (`ok: true`, endpoint ativo).
- `POST`: processa o webhook de pedido pago da Nuvemshop.
- Outros métodos: retorna `405`.

No `POST`, o fluxo é:

1. Valida variáveis mínimas para operação (token Nuvemshop e listas Zoho).
2. Lê o payload do webhook e extrai `orderId` de `id`, `order_id` ou `resource_id`.
3. Busca o pedido completo na API da Nuvemshop (`/orders/{orderId}`), porque o webhook pode vir resumido.
4. Extrai e-mail e nome do cliente.
5. Processa Zoho para marcar carrinho como comprado e mover contato entre listas.
6. Processa GA4 server-side **somente quando o pagamento for Pix**.
7. Responde `200` com resumo de processamento (`resultadoZoho`, `resultadoGA4`).

---

## 2) Como o webhook de pedido pago da Nuvemshop aciona a Vercel

Arquitetura esperada:

1. Na Nuvemshop, o evento de pedido pago é configurado para chamar a URL pública da Vercel.
2. A URL alvo é a rota serverless: `POST /api/order-paid`.
3. A Vercel executa a função `api/order-paid.js`.
4. A função consulta o pedido completo na API Nuvemshop e segue os processamentos internos.

Observação importante:

- O webhook **aciona a Vercel**; a lógica de negócio (Zoho + regra Pix para GA4 + controle Supabase) acontece dentro da função.

---

## 3) Como o Zoho é processado para todos os pedidos pagos

Para qualquer pedido pago com e-mail válido:

1. A função obtém `access_token` Zoho via OAuth usando refresh token.
2. Monta `contactinfo` com:
   - `Contact Email`
   - `status_carrinho = "comprou"`
   - `First Name` e `Last Name` (quando disponíveis, via split do nome).
3. Executa três ações no Zoho Campaigns:
   - Atualiza/inscreve na lista de carrinho abandonado (marcando como comprou).
   - Adiciona na lista de carrinho recuperado.
   - Remove da lista de carrinho abandonado.

Se Zoho falhar, o endpoint **não interrompe** o restante: registra erro e continua, retornando o status no `resultadoZoho`.

---

## 4) Como o GA4 server-side funciona somente para pedidos Pix

A rotina `processarGA4ServerSide` aplica filtros antes de enviar para o GA4:

1. Confere variáveis obrigatórias de GA4/Supabase.
2. Garante que o pedido esteja pago (`payment_status === paid`, quando informado).
3. Detecta Pix por texto normalizado (sem acentos/caixa) em:
   - `order.payment_details.method`
   - `order.gateway_name`
   - `order.gateway`

Somente se algum desses campos contiver `pix`, o envio server-side é elegível.

Pedidos não-Pix são marcados como `skipped` com motivo explícito: não elegível para GA4 server-side.

---

## 5) Por que cartões não devem ser enviados server-side ao GA4

Decisão técnica do fluxo atual:

- O server-side foi restrito a Pix para evitar **duplicidade de compra** no GA4 em meios de pagamento onde o client-side já costuma registrar `purchase` (ex.: checkout/cartão).
- Com isso, cartão permanece no rastreamento client-side (quando existente), e o server-side cobre apenas o cenário Pix definido na regra.

Resultado prático:

- Reduz inflar receita/conversões por eventos duplicados.
- Mantém controle transacional de Pix no backend com chave única.

---

## 6) Como o Supabase `ga4_purchase_events` é usado para controle dos envios Pix

A tabela `ga4_purchase_events` é a camada de idempotência/auditoria do envio server-side:

1. Antes do envio GA4, insere registro com:
   - `order_id`, `order_number`, `transaction_id`
   - `source = nuvemshop_webhook_order_paid`
   - `status = processing`
   - `payload` (webhook + order)
2. Se a inserção retornar `409`, a transação já existe: considera duplicado e **não envia** novamente para GA4.
3. Após tentativa de envio, atualiza o registro por `transaction_id` para:
   - `status = sent` (sucesso) ou `status = error` (falha)
   - `ga4_response`
   - `error_message` quando aplicável.

---

## 7) Como validar um pedido Pix no Supabase

Checklist recomendado (SQL no Supabase):

1. Localizar o registro:

```sql
select *
from ga4_purchase_events
where transaction_id = '<transaction_id_do_pedido>';
```

2. Confirmar critérios:

- Existe 1 linha para o `transaction_id`.
- `source = 'nuvemshop_webhook_order_paid'`.
- `status = 'sent'` para sucesso.
- `ga4_response.ok = true` (quando armazenado em JSON).

3. Em caso de problema:

- `status = 'error'` + `error_message` ajudam no diagnóstico.
- ausência de linha pode indicar que não era Pix ou webhook não chegou.

---

## 8) Como validar o `transaction_id` no GA4

No GA4 (UI), use o caminho mais fiel ao processo de validação:

1. Acesse **GA4 → Explorar → Formato livre**.
2. Configure as dimensões:
   - **Data e hora**
   - **ID da Transação**
   - **Nome do evento**
3. Configure as métricas:
   - **Contagem de eventos**
   - **Receita total**
4. Aplique filtro: **Nome do evento** corresponde exatamente a `purchase`.
5. Procure o `transaction_id` do pedido e confirme o valor esperado.

No payload server-side, o `transaction_id` é enviado em `events[0].params.transaction_id`.

---

## 9) Como identificar duplicidade no GA4

Sinais de duplicidade:

- Mais de um evento `purchase` para o mesmo `transaction_id`.
- Receita/eventos maiores do que o esperado para um único pedido.

Como cruzar:

1. Compare contagem de `purchase` no GA4 por `transaction_id`.
2. Compare com Supabase (`ga4_purchase_events`): deveria haver no máximo 1 envio server-side por transação Pix.
3. Se houver duplicidade e o pedido for cartão, revisar implementação client-side (tag/gtm/script) — o backend atual não envia não-Pix.

---

## 10) Pedidos usados na validação

Histórico informado para validação do fluxo:

- **1952**: Pix teste validado.
- **1953**: cartão duplicado antes do ajuste.
- **1954**: Pix real validado.

Observação histórica:

- **1951**: Pix teste usado no início da validação, antes da confirmação completa do fluxo.

Uso recomendado desses casos:

- 1952/1954 para confirmar trilha Pix (Supabase `sent` + GA4 `purchase` com `transaction_id` correto).
- 1953 como referência histórica de duplicidade em cartão antes da regra restritiva server-side.

---

## 11) Variáveis de ambiente necessárias (somente nomes)

### Nuvemshop
- `NUVEMSHOP_ACCESS_TOKEN`
- `NUVEMSHOP_STORE_ID` (opcional no código, com fallback, mas recomendado configurar)

### Zoho
- `ZOHO_REFRESH_TOKEN`
- `ZOHO_CLIENT_ID`
- `ZOHO_CLIENT_SECRET`
- `ZOHO_LIST_CARRINHO_ABANDONADO`
- `ZOHO_LIST_CARRINHO_RECUPERADO`

### GA4 / Supabase (fluxo Pix server-side)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GA4_MEASUREMENT_ID`
- `GA4_API_SECRET`

---

## 12) Cuidados importantes

1. **Não alterar a rota** `api/order-paid.js` sem necessidade operacional clara (webhook depende desse path).
2. **Não criar novas funções serverless desnecessárias** para o mesmo gatilho; manter centralização reduz risco de inconsistência.
3. **Não colocar segredos no código** (tokens, secrets, keys). Usar apenas variáveis de ambiente da Vercel/Supabase.
4. Manter a regra de elegibilidade Pix no server-side GA4 para evitar regressão de duplicidade em cartões.

---

## Resumo executivo

- O webhook de pedido pago chama `POST /api/order-paid` na Vercel.
- O endpoint processa Zoho para pedidos com e-mail válido, independentemente do meio de pagamento.
- A restrição a Pix vale apenas para o envio server-side ao GA4.
- A tabela `ga4_purchase_events` é usada no controle dos envios server-side Pix (idempotência e rastreabilidade).

## 13) Regra recomendada no GTM para eliminar duplicidade de Pix

Objetivo operacional (sem alterar backend):

- **Pix**: enviar `purchase` **somente** via webhook server-side (`api/order-paid.js`).
- **Cartão** (e demais não-Pix): manter `purchase` no client-side/GTM.

### Regra de disparo da tag `purchase` (client-side)

No Google Tag Manager, a tag de `purchase` deve disparar apenas quando o método de pagamento **não** for Pix.

Condição recomendada (normalizada, case-insensitive):

- bloquear quando qualquer campo de pagamento contiver `pix`, por exemplo:
  - `payment_method`
  - `payment_type`
  - `gateway`

Em termos lógicos:

- **Dispara purchase client-side** se `payment_text` **NÃO** contém `pix`.
- **Não dispara purchase client-side** se `payment_text` contém `pix`.

### Como montar `payment_text` no GTM

Criar uma variável (ex.: `{{payment_text_normalized}}`) concatenando candidatos do `dataLayer` e normalizando:

1. `payment_method`
2. `payment_type`
3. `gateway`

Depois aplicar:

- `toLowerCase()`
- remoção de acentos
- trim

E testar regex de Pix equivalente a termo isolado (evita falso positivo):

- `(^|[^a-z0-9])pix([^a-z0-9]|$)`

### Se o `dataLayer` não trouxer método de pagamento

Como este repositório não contém o código client-side da loja, a identificação precisa ser feita no tema/GTM da Nuvemshop. Procedimento sugerido:

1. Abrir preview do GTM em uma compra real de teste (Pix e cartão).
2. Inspecionar o evento `purchase` no painel do GTM e listar todas as chaves disponíveis no `dataLayer`.
3. Procurar campos equivalentes de pagamento (ex.: `payment_method`, `payment_type`, `gateway`, `payment_gateway`, `transaction.payment_method`, etc.).
4. Se não houver campo explícito, mapear variável da Nuvemshop/checkout que exponha o meio de pagamento no momento do `purchase` e empurrar para `dataLayer` antes da tag GA4.

### Critério de aceite da correção

Após ajustar GTM:

1. Pedido Pix deve gerar:
   - 1 envio em `ga4_purchase_events` com `status = sent` (server-side)
   - 1 único `purchase` no GA4 por `transaction_id`
2. Pedido cartão deve gerar:
   - `purchase` apenas no client-side/GTM
   - nenhum envio server-side (continua `skipped` no backend)

