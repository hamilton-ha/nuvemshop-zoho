export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    return res.status(405).json({
      ok: false,
      message: "Método não permitido. Use GET.",
    });
  }

  const alexaSecret = req.headers["x-alexa-secret"];
  const expectedSecret = process.env.ALEXA_INTERNAL_SECRET;

  if (!alexaSecret || !expectedSecret || alexaSecret !== expectedSecret) {
    return res.status(401).json({
      ok: false,
      message: "Não autorizado.",
    });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({
      ok: false,
      message: "Variáveis do Supabase não configuradas.",
      required: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
    });
  }

  try {
    const requestsUrl =
      `${supabaseUrl}/rest/v1/restock_requests` +
      `?status=eq.aguardando` +
      `&select=product_name`;

    const requestsResponse = await fetch(requestsUrl, {
      method: "GET",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    });

    const requestsData = await requestsResponse.json();

    if (!requestsResponse.ok) {
      return res.status(500).json({
        ok: false,
        message: "Erro ao buscar lista de espera no Supabase.",
        error: requestsData,
      });
    }

    if (!Array.isArray(requestsData)) {
      return res.status(500).json({
        ok: false,
        message: "Resposta inesperada do Supabase: formato inválido.",
      });
    }

    const groupedByProduct = requestsData.reduce((acc, item) => {
      const productName = item.product_name || "Produto sem nome";
      acc[productName] = (acc[productName] || 0) + 1;
      return acc;
    }, {});

    const topProducts = Object.entries(groupedByProduct)
      .map(([product_name, waiting_customers]) => ({
        product_name,
        waiting_customers,
      }))
      .sort((a, b) => {
        if (b.waiting_customers !== a.waiting_customers) {
          return b.waiting_customers - a.waiting_customers;
        }

        return a.product_name.localeCompare(b.product_name, "pt-BR");
      })
      .slice(0, 5);

    return res.status(200).json({
      ok: true,
      total_waiting_customers: requestsData.length,
      total_products: Object.keys(groupedByProduct).length,
      top_products: topProducts,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro interno ao montar relatório da lista de espera.",
      error: error.message,
    });
  }
}
