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

async function atualizarStatusCarrinhoNoZoho({ email, name }) {
  const accessToken = await getZohoAccessToken();

  const zohoUrl = "https://campaigns.zoho.com/api/v1.1/json/listsubscribe";

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

  const zohoResponse = await fetch(zohoUrl, {
    method: "POST",
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      resfmt: "JSON",
      listkey: process.env.ZOHO_LIST_CARRINHO_ABANDONADO,
      contactinfo: JSON.stringify(contactinfo),
    }),
  });

  const resultado = await zohoResponse.json();

  return resultado;
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

    const resultadoZoho = await atualizarStatusCarrinhoNoZoho({
      email,
      name,
    });

    return res.status(200).json({
      ok: true,
      orderId,
      email,
      name,
      status_carrinho: "comprou",
      resultadoZoho,
    });
  } catch (erro) {
    console.log("ORDER_PAID_ERROR:", erro);

    return res.status(500).json({
      erro: erro.message,
    });
  }
};
