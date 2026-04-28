export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  try {
    const body = req.body;

    const storeId = body.store_id;
    const customerId = body.id;
    const event = body.event;
    console.log("WEBHOOK_BODY:", JSON.stringify(body));
    console.log("WEBHOOK_EVENT:", body.event, "STORE:", body.store_id, "ID:", body.id);

    if (!storeId || !customerId) {
      return res.status(400).json({
        error: "Webhook sem store_id ou customer id",
        received: body,
      });
    }

    if (!["customer/created", "customer/updated"].includes(event)) {
      return res.status(200).json({
        ignored: true,
        reason: "Evento ignorado",
        event,
      });
    }

    const customerResponse = await fetch(
  `https://api.nuvemshop.com.br/v1/${storeId}/customers/${customerId}`,
  {
    headers: {
      Authentication: `bearer ${process.env.a687e51c0c454e0f89fe239db9c808d31d2bf15a}`,
      "User-Agent": "Elo Forte Zoho Integration (contato@elofortedigital.com.br)",
    },
  }
);

const customer = await customerResponse.json();

console.log("CUSTOMER_STATUS:", customerResponse.status);
console.log("CUSTOMER_RESPONSE:", JSON.stringify(customer));
    
    if (!customerResponse.ok) {
      return res.status(500).json({
        error: "Erro ao buscar cliente na Nuvemshop",
        details: customer,
      });
    }

    const email = customer.email;
    const name = customer.name || "";

    const aceitaMarketing =
      customer.accepts_marketing === true ||
      customer.accepts_marketing === "true" ||
      customer.newsletter === true ||
      customer.newsletter === "true";

    if (!email) {
      return res.status(200).json({
        ignored: true,
        reason: "Cliente sem email",
        customer,
      });
    }

    if (!aceitaMarketing) {
      return res.status(200).json({
        ignored: true,
        reason: "Cliente não aceitou newsletter/marketing",
        email,
      });
    }

    const contactInfo = {
      "Contact Email": email,
      "First Name": name,
      origem: "Newsletter Nuvemshop",
    };

    const zohoUrl =
      "https://campaigns.zoho.com/api/v1.1/json/listsubscribe";

    const params = new URLSearchParams();
    params.append("resfmt", "JSON");
    params.append("listkey", process.env.ZOHO_NEWSLETTER_LIST_KEY);
    params.append("contactinfo", JSON.stringify(contactInfo));

    const zohoResponse = await fetch(zohoUrl, {
      method: "POST",
      headers: {
        Authorization: `Zoho-oauthtoken ${process.env.a687e51c0c454e0f89fe239db9c808d31d2bf15a}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });

    const zohoData = await zohoResponse.json();

    return res.status(200).json({
      success: true,
      email,
      name,
      zoho: zohoData,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Erro geral na integração newsletter → Zoho",
      details: error.message,
    });
  }
}
