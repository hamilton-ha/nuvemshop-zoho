export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed",
    });
  }

  const {
    NUVEMSHOP_STORE_ID,
    NUVEMSHOP_ACCESS_TOKEN,
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    GA4_MEASUREMENT_ID,
    GA4_API_SECRET,
  } = process.env;

  if (
    !NUVEMSHOP_STORE_ID ||
    !NUVEMSHOP_ACCESS_TOKEN ||
    !SUPABASE_URL ||
    !SUPABASE_SERVICE_ROLE_KEY ||
    !GA4_MEASUREMENT_ID ||
    !GA4_API_SECRET
  ) {
    return res.status(500).json({
      ok: false,
      error: "Missing environment variables",
    });
  }

  try {
    const webhookPayload = req.body || {};

    const orderId =
      webhookPayload.id ||
      webhookPayload.order_id ||
      webhookPayload.resource_id ||
      webhookPayload.resource?.id;

    if (!orderId) {
      return res.status(400).json({
        ok: false,
        error: "Order ID not found in webhook payload",
        payload: webhookPayload,
      });
    }

    const order = await fetchNuvemshopOrder({
      storeId: NUVEMSHOP_STORE_ID,
      accessToken: NUVEMSHOP_ACCESS_TOKEN,
      orderId,
    });

    if (!order?.id) {
      return res.status(404).json({
        ok: false,
        error: "Order not found in Nuvemshop",
        orderId,
      });
    }

    if (order.payment_status !== "paid") {
      return res.status(200).json({
        ok: true,
        skipped: true,
        reason: "Order is not paid",
        order_id: String(order.id),
        payment_status: order.payment_status,
      });
    }

    const transactionId = String(order.number || order.id);

    const insertResult = await insertSupabaseControl({
      supabaseUrl: SUPABASE_URL,
      serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
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
      return res.status(200).json({
        ok: true,
        skipped: true,
        reason: "Duplicate transaction_id already processed",
        transaction_id: transactionId,
      });
    }

    const ga4Payload = buildGA4PurchasePayload(order, transactionId);

    const ga4Result = await sendToGA4({
      measurementId: GA4_MEASUREMENT_ID,
      apiSecret: GA4_API_SECRET,
      payload: ga4Payload,
    });

    await updateSupabaseControl({
      supabaseUrl: SUPABASE_URL,
      serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
      transactionId,
      data: {
        status: ga4Result.ok ? "sent" : "error",
        ga4_response: ga4Result,
        error_message: ga4Result.ok ? null : ga4Result.error || "GA4 send failed",
      },
    });

    return res.status(200).json({
      ok: true,
      transaction_id: transactionId,
      order_id: String(order.id),
      order_number: order.number ? String(order.number) : null,
      payment_status: order.payment_status,
      ga4: ga4Result,
    });
  } catch (error) {
    console.error("nuvemshop-order-paid-ga4 error:", error);

    return res.status(500).json({
      ok: false,
      error: error.message || "Internal server error",
    });
  }
}

async function fetchNuvemshopOrder({ storeId, accessToken, orderId }) {
  const url = `https://api.tiendanube.com/v1/${storeId}/orders/${orderId}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authentication: `bearer ${accessToken}`,
      "User-Agent": "Elo Forte GA4 Server Side Tracking",
      "Content-Type": "application/json",
    },
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Nuvemshop API error ${response.status}: ${text}`);
  }

  return text ? JSON.parse(text) : null;
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
    payment_type: order.payment_details?.method || order.gateway_name || order.gateway,
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

async function insertSupabaseControl({ supabaseUrl, serviceRoleKey, data }) {
  const response = await fetch(`${supabaseUrl}/rest/v1/ga4_purchase_events`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(data),
  });

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

async function updateSupabaseControl({
  supabaseUrl,
  serviceRoleKey,
  transactionId,
  data,
}) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/ga4_purchase_events?transaction_id=eq.${encodeURIComponent(
      transactionId
    )}`,
    {
      method: "PATCH",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
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
