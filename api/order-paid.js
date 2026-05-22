function splitFullName(fullName = "") {
  const parts = fullName.trim().replace(/\s+/g, " ").split(" ");

  const firstName = parts.shift() || "";
  const lastName = parts.join(" ");

  return {
    firstName,
    lastName,
  };
}

async function getZohoAccessToken() {
  const response = await fetch("https://accounts.zoho.com/oauth/v2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      refresh_token: process.env.ZOHO_REFRESH_TOKEN,
      client_id: process.env.ZOHO_CLIENT_ID,
      client_secret: process.env.ZOHO_CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  });

  const data = await response.json();

  if (!response.ok || !data.access_token) {
    console.log("ZOHO_TOKEN_ERROR:", JSON.stringify(data));
    throw new Error("Não foi possível gerar access_token do Zoho");
  }

  return data.access_token;
}

function getOrderEmail(order) {
  return (
    order.contact_email ||
    order.email ||
    order.customer?.email ||
    order.billing_address?.email ||
    ""
  );
}

function getOrderName(order) {
  return (
    order.contact_name ||
    order.customer?.name ||
    order.billing_address?.name ||
    ""
  );
}

async function zohoSubscribeToList({ accessToken, listKey, contactinfo }) {
  const zohoUrl = "https://campaigns.zoho.com/api/v1.1/json/listsubscribe";

  const response = await fetch(zohoUrl, {
    method: "POST",
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      resfmt: "JSON",
      listkey: listKey,
      contactinfo: JSON.stringify(contactinfo),
    }),
  });

  return response.json();
}

async function zohoUnsubscribeFromList({ accessToken, listKey, email }) {
  const zohoUrl = "https://campaigns.zoho.com/api/v1.1/json/listunsubscribe";

  const response = await fetch(zohoUrl, {
    method: "POST",
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      resfmt: "JSON",
      listkey: listKey,
      contactinfo: JSON.stringify({
        "Contact Email": email,
      }),
    }),
  });

  return response.json();
}

async function processarCarrinhoRecuperado({ email, name }) {
  const accessToken = await getZohoAccessToken();

  const { firstName, lastName } = splitFullName(name || "");

  const contactinfo = {
    "Contact Email": email,
    status_carrinho: "comprou",
  };

  if (firstName) {
    contactinfo["First Name"] = firstName;
  }

  if (lastName) {
    contactinfo["Last Name"] = lastName;
  }

  const resultadoAtualizarAbandonado = await zohoSubscribeToList({
    accessToken,
    listKey: process.env.ZOHO_LIST_CARRINHO_ABANDONADO,
    contactinfo,
  });

  const resultadoAdicionarRecuperado = await zohoSubscribeToList({
    accessToken,
    listKey: process.env.ZOHO_LIST_CARRINHO_RECUPERADO,
    contactinfo,
  });

  const resultadoRemoverAbandonado = await zohoUnsubscribeFromList({
    accessToken,
    listKey: process.env.ZOHO_LIST_CARRINHO_ABANDONADO,
    email,
  });

  return {
    resultadoAtualizarAbandonado,
    resultadoAdicionarRecuperado,
    resultadoRemoverAbandonado,
  };
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return value;
  return Number(String(value).replace(",", ".")) || 0;
}

function normalizeCoupon(coupon) {
  if (!coupon) return undefined;

  if (Array.isArray(coupon)) {
    const codes = coupon
      .map((item) => {
        if (typeof item === "string") return item;
        return item.code || item.name || item.id;
      })
      .filter(Boolean);

    return codes.length ? codes.join(",") : undefined;
  }

  if (typeof coupon === "string") return coupon;

  return coupon.code || coupon.name || undefined;
}

function removeUndefined(object) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== undefined)
  );
}

function buildGA4PurchasePayload(order, transactionId) {
  const value = toNumber(
    order.total_paid_by_customer ||
      order.total_paid_by_customer_including_fees ||
      order.total
  );

  const shipping = toNumber(order.shipping_cost_customer || 0);

  const items = Array.isArray(order.products)
    ? order.products.map((product) => ({
        item_id: String(product.variant_id || product.product_id || product.id),
        item_name: String(product.name || "Produto"),
        price: toNumber(product.price),
        quantity: Number(product.quantity || 1),
      }))
    : [];

  const coupon = normalizeCoupon(order.coupon);

  const params = removeUndefined({
    transaction_id: transactionId,
    currency: order.currency || "BRL",
    value,
    shipping,
    coupon,
    items,
    payment_type:
      order.payment_details?.method || order.gateway_name || order.gateway,
    source: "nuvemshop_order_paid_webhook",
  });

  return {
    client_id: `server.${transactionId}`,
    events: [
      {
        name: "purchase",
        params,
      },
    ],
  };
}

async function sendToGA4({ measurementId, apiSecret, payload }) {
  const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(
    measurementId
  )}&api_secret=${encodeURIComponent(apiSecret)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();

  return {
    ok: response.ok,
    status: response.status,
    response: text || null,
    sent_payload: payload,
    error: response.ok ? null : text,
  };
}

async function insertSupabaseControl({ data }) {
  const response = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/ga4_purchase_events`,
    {
      method: "POST",
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(data),
    }
  );

  const text = await response.text();

  if (response.status === 409) {
    return {
      duplicate: true,
      status: response.status,
      response: text,
    };
  }

  if (!response.ok) {
    throw new Error(`Supabase insert error ${response.status}: ${text}`);
  }

  return {
    duplicate: false,
    status: response.status,
    response: text ? JSON.parse(text) : null,
  };
}

async function updateSupabaseControl({ transactionId, data }) {
  const response = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/ga4_purchase_events?transaction_id=eq.${encodeURIComponent(
      transactionId
    )}`,
    {
      method: "PATCH",
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(data),
    }
  );

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Supabase update error ${response.status}: ${text}`);
  }

  return text ? JSON.parse(text) : null;
}

async function processarGA4ServerSide(order, webhookPayload) {
  const requiredVars = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "GA4_MEASUREMENT_ID",
    "GA4_API_SECRET",
  ];

  const missingVars = requiredVars.filter((name) => !process.env[name]);

  if (missingVars.length) {
    return {
      ok: false,
      skipped: true,
      reason: "Missing GA4/Supabase environment variables",
      missingVars,
    };
  }

  if (order.payment_status && order.payment_status !== "paid") {
    return {
      ok: true,
      skipped: true,
      reason: "Order is not paid",
      payment_status: order.payment_status,
    };
  }

  const normalizePaymentText = (value) =>
    String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

  const checkedPaymentFields = {
    payment_details_method: order.payment_details?.method || null,
    gateway_name: order.gateway_name || null,
    gateway: order.gateway || null,
  };

  const isPix = Object.values(checkedPaymentFields).some((fieldValue) =>
    normalizePaymentText(fieldValue).includes("pix")
  );

  if (!isPix) {
    return {
      ok: true,
      skipped: true,
      reason: "Order not eligible for GA4 server-side (non-Pix)",
      payment_type: order.payment_details?.method || order.gateway_name || order.gateway || null,
      checked_payment_fields: checkedPaymentFields,
    };
  }

  const transactionId = String(order.number || order.id);

  const insertResult = await insertSupabaseControl({
    data: {
      order_id: String(order.id),
      order_number: order.number ? String(order.number) : null,
      transaction_id: transactionId,
      source: "nuvemshop_webhook_order_paid",
      status: "processing",
      payload: {
        webhook: webhookPayload,
        order,
      },
    },
  });

  if (insertResult.duplicate) {
    return {
      ok: true,
      skipped: true,
      reason: "Duplicate transaction_id already processed",
      transaction_id: transactionId,
    };
  }

  const ga4Payload = buildGA4PurchasePayload(order, transactionId);

  const ga4Result = await sendToGA4({
    measurementId: process.env.GA4_MEASUREMENT_ID,
    apiSecret: process.env.GA4_API_SECRET,
    payload: ga4Payload,
  });

  await updateSupabaseControl({
    transactionId,
    data: {
      status: ga4Result.ok ? "sent" : "error",
      ga4_response: ga4Result,
      error_message: ga4Result.ok ? null : ga4Result.error || "GA4 send failed",
    },
  });

  return {
    ok: ga4Result.ok,
    transaction_id: transactionId,
    ga4: ga4Result,
  };
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === "GET") {
      return res.status(200).json({
        ok: true,
        message: "Endpoint order-paid ativo",
      });
    }

    if (req.method !== "POST") {
      return res.status(405).json({
        erro: "Método não permitido",
      });
    }

    const storeId = process.env.NUVEMSHOP_STORE_ID || "4882514";
    const nuvemToken = process.env.NUVEMSHOP_ACCESS_TOKEN;

    if (!nuvemToken) {
      return res.status(500).json({
        erro: "NUVEMSHOP_ACCESS_TOKEN não configurado na Vercel",
      });
    }

    if (!process.env.ZOHO_LIST_CARRINHO_ABANDONADO) {
      return res.status(500).json({
        erro: "ZOHO_LIST_CARRINHO_ABANDONADO não configurado na Vercel",
      });
    }

    if (!process.env.ZOHO_LIST_CARRINHO_RECUPERADO) {
      return res.status(500).json({
        erro: "ZOHO_LIST_CARRINHO_RECUPERADO não configurado na Vercel",
      });
    }

    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : req.body || {};

    const orderId = body.id || body.order_id || body.resource_id;

    if (!orderId) {
      return res.status(400).json({
        erro: "ID do pedido não recebido no webhook",
        body,
      });
    }

    const orderResponse = await fetch(
      `https://api.nuvemshop.com.br/v1/${storeId}/orders/${orderId}`,
      {
        headers: {
          Authentication: `bearer ${nuvemToken}`,
          "User-Agent": "Elo Forte App (contato@elofortedigital.com.br)",
          "Content-Type": "application/json",
        },
      }
    );

    const order = await orderResponse.json();

    if (!orderResponse.ok) {
      return res.status(orderResponse.status).json({
        erro: "Erro ao buscar pedido na Nuvemshop",
        orderId,
        resposta: order,
      });
    }

    const email = getOrderEmail(order);
    const name = getOrderName(order);

    if (!email) {
      return res.status(400).json({
        erro: "Pedido encontrado, mas sem e-mail do cliente",
        orderId,
        order,
      });
    }

    let resultadoZoho = null;

    try {
      resultadoZoho = await processarCarrinhoRecuperado({
        email,
        name,
      });
    } catch (zohoErro) {
      console.log("ZOHO_PROCESS_ERROR:", zohoErro);

      resultadoZoho = {
        ok: false,
        erro: zohoErro.message,
      };
    }

    let resultadoGA4 = null;

    try {
      resultadoGA4 = await processarGA4ServerSide(order, body);
    } catch (ga4Erro) {
      console.log("GA4_SERVER_SIDE_ERROR:", ga4Erro);

      resultadoGA4 = {
        ok: false,
        erro: ga4Erro.message,
      };
    }

    return res.status(200).json({
      ok: true,
      orderId,
      email,
      name,
      status_carrinho: "comprou",
      resultadoZoho,
      resultadoGA4,
    });
  } catch (erro) {
    console.log("ORDER_PAID_ERROR:", erro);

    return res.status(500).json({
      erro: erro.message,
    });
  }
};
