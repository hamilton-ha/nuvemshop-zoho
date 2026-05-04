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

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedProductId = String(product_id);
    const normalizedVariantId = variant_id ? String(variant_id) : "";

    // 1. Verifica se já existe inscrição aguardando para o mesmo e-mail + produto + variação
    const duplicateUrl =
      `${supabaseUrl}/rest/v1/restock_requests` +
      `?email=eq.${encodeURIComponent(normalizedEmail)}` +
      `&product_id=eq.${encodeURIComponent(normalizedProductId)}` +
      `&variant_id=eq.${encodeURIComponent(normalizedVariantId)}` +
      `&status=eq.aguardando` +
      `&select=id,email,product_id,variant_id,status`;

    const duplicateResponse = await fetch(duplicateUrl, {
      method: "GET",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    });

    const duplicateData = await duplicateResponse.json();

    if (!duplicateResponse.ok) {
      console.error("Erro ao verificar duplicidade:", duplicateData);

      return res.status(500).json({
        ok: false,
        message: "Erro ao verificar inscrição existente.",
        error: duplicateData,
      });
    }

    if (duplicateData.length > 0) {
      return res.status(200).json({
        ok: true,
        duplicate: true,
        message: "Você já está cadastrada para ser avisada sobre este produto.",
        data: duplicateData[0],
      });
    }

    // 2. Se não existe duplicidade, cria nova inscrição
    const insertResponse = await fetch(`${supabaseUrl}/rest/v1/restock_requests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        name: name || null,
        email: normalizedEmail,
        product_id: normalizedProductId,
        variant_id: normalizedVariantId || null,
        product_name: String(product_name),
        product_url: product_url || null,
        status: "aguardando",
      }),
    });

    const insertData = await insertResponse.json();

    if (!insertResponse.ok) {
      console.error("Erro Supabase:", insertData);

      return res.status(500).json({
        ok: false,
        message: "Erro ao salvar inscrição no Supabase.",
        error: insertData,
      });
    }

    return res.status(200).json({
      ok: true,
      duplicate: false,
      message: "Inscrição de reposição registrada com sucesso.",
      data: insertData,
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
