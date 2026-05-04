export default async function handler(req, res) {
  // Libera chamadas vindas do site
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Responde a requisições de verificação do navegador
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Aceita somente POST
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      message: "Método não permitido. Use POST.",
    });
  }

  try {
    const {
      name,
      email,
      product_id,
      variant_id,
      product_name,
      product_url,
    } = req.body || {};

    // Validação básica
    if (!email || !product_id || !product_name) {
      return res.status(400).json({
        ok: false,
        message: "Campos obrigatórios ausentes: email, product_id ou product_name.",
      });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({
        ok: false,
        message: "Variáveis do Supabase não configuradas na Vercel.",
      });
    }

    const response = await fetch(`${supabaseUrl}/rest/v1/restock_requests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        name: name || null,
        email: String(email).trim().toLowerCase(),
        product_id: String(product_id),
        variant_id: variant_id ? String(variant_id) : null,
        product_name: String(product_name),
        product_url: product_url || null,
        status: "aguardando",
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Erro Supabase:", data);

      return res.status(500).json({
        ok: false,
        message: "Erro ao salvar inscrição no Supabase.",
        error: data,
      });
    }

    return res.status(200).json({
      ok: true,
      message: "Inscrição de reposição registrada com sucesso.",
      data,
    });
  } catch (error) {
    console.error("Erro geral:", error);

    return res.status(500).json({
      ok: false,
      message: "Erro interno ao registrar inscrição.",
      error: error.message,
    });
  }
}
