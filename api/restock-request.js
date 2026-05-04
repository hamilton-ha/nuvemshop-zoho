export default async function handler(req, res) {
  // Libera chamadas vindas do site
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Responde a requisições de verificação do navegador
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Nova função: verificar estoque sem criar uma nova rota na Vercel
  if (req.method === "GET" && req.query.action === "check-restock") {
    return await checkRestock(req, res);
  }

  // Se for GET sem a action correta
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      message: "Rota ativa. Para verificar estoque, use ?action=check-restock",
    });
  }

  // Aceita somente POST para cadastro no formulário
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

// Função de verificação de estoque
async function checkRestock(req, res) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const nuvemshopStoreId = process.env.NUVEMSHOP_STORE_ID;
    const nuvemshopAccessToken = process.env.NUVEMSHOP_ACCESS_TOKEN;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({
        ok: false,
        message: "Variáveis do Supabase não configuradas na Vercel.",
      });
    }

    if (!nuvemshopStoreId || !nuvemshopAccessToken) {
      return res.status(500).json({
        ok: false,
        message: "Variáveis da Nuvemshop não configuradas na Vercel.",
        required: ["NUVEMSHOP_STORE_ID", "NUVEMSHOP_ACCESS_TOKEN"],
      });
    }

    // 1. Busca no Supabase todos os pedidos ainda aguardando aviso
    const requestsUrl =
      `${supabaseUrl}/rest/v1/restock_requests` +
      `?status=eq.aguardando` +
      `&select=id,created_at,name,email,product_id,variant_id,product_name,product_url,status,notified_at` +
      `&order=created_at.asc`;

    const requestsResponse = await fetch(requestsUrl, {
      method: "GET",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    });

    const requestsData = await requestsResponse.json();

    if (!requestsResponse.ok) {
      console.error("Erro ao buscar registros aguardando:", requestsData);

      return res.status(500).json({
        ok: false,
        message: "Erro ao buscar registros aguardando no Supabase.",
        error: requestsData,
      });
    }

    if (!requestsData || requestsData.length === 0) {
      return res.status(200).json({
        ok: true,
        message: "Nenhum produto aguardando reposição.",
        total: 0,
        items: [],
      });
    }

    const results = [];

    // 2. Consulta cada produto na Nuvemshop
    for (const request of requestsData) {
      const productId = String(request.product_id || "").trim();
      const variantId = request.variant_id ? String(request.variant_id).trim() : "";

      if (!productId) {
        results.push({
          id: request.id,
          email: request.email,
          product_name: request.product_name,
          status_check: "product_id_ausente",
          available: false,
        });

        continue;
      }

      const productResponse = await fetch(
        `https://api.nuvemshop.com.br/v1/${nuvemshopStoreId}/products/${productId}`,
        {
          method: "GET",
          headers: {
            Authentication: `bearer ${nuvemshopAccessToken}`,
            "User-Agent": "Elo Forte Restock Automation",
          },
        }
      );

      if (!productResponse.ok) {
        results.push({
          id: request.id,
          email: request.email,
          product_id: request.product_id,
          variant_id: request.variant_id,
          product_name: request.product_name,
          status_check: "erro_ao_consultar_nuvemshop",
          http_status: productResponse.status,
          available: false,
        });

        continue;
      }

      const product = await productResponse.json();

      const variants = Array.isArray(product.variants) ? product.variants : [];

      let variant = null;

      if (variantId) {
        variant = variants.find((item) => String(item.id) === String(variantId));
      }

      // Se não tiver variant_id, usa a primeira variação encontrada
      if (!variant && variants.length > 0 && !variantId) {
        variant = variants[0];
      }

      if (!variant) {
  results.push({
    id: request.id,
    email: request.email,
    product_id: request.product_id,
    variant_id_recebido: request.variant_id,
    product_name: request.product_name,
    status_check: "variante_nao_encontrada",
    available: false,
    variantes_disponiveis: variants.map((item) => ({
      id: item.id,
      name: item.name,
      stock: item.stock,
      sku: item.sku,
    })),
  });

  continue;
}
      const stock = Number(variant.stock || 0);
      const available = stock > 0;

      results.push({
        id: request.id,
        name: request.name,
        email: request.email,
        product_id: request.product_id,
        variant_id: request.variant_id,
        product_name: request.product_name,
        product_url: request.product_url,
        stock,
        available,
        status_check: available ? "disponivel" : "sem_estoque",
      });
    }

    return res.status(200).json({
      ok: true,
      message: "Verificação de estoque concluída.",
      total: results.length,
      disponiveis: results.filter((item) => item.available === true).length,
      sem_estoque: results.filter((item) => item.status_check === "sem_estoque").length,
      com_erro: results.filter(
        (item) =>
          item.status_check !== "sem_estoque" &&
          item.status_check !== "disponivel"
      ).length,
      items: results,
    });
  } catch (error) {
    console.error("Erro geral ao verificar estoque:", error);

    return res.status(500).json({
      ok: false,
      message: "Erro interno ao verificar reposição.",
      error: error.message,
    });
  }
}
