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

  // Nova função: relatório de produtos mais aguardados
if (req.method === "GET" && req.query.action === "report") {
  return await generateRestockReport(req, res);
}

  if (req.method === "GET" && req.query.action === "report-html") {
  return await generateRestockReportHtml(req, res);
}
  
  // Nova função: listar clientes prontos para receber aviso
if (req.method === "GET" && req.query.action === "ready-to-notify") {
  return await getReadyToNotify(req, res);
}

  if (req.method === "GET" && req.query.action === "ready-to-notify-html") {
  return await getReadyToNotifyHtml(req, res);
}
  
  // Nova função: prévia dos e-mails de reposição, sem enviar
if (req.method === "GET" && req.query.action === "preview-restock-emails") {
  return await previewRestockEmails(req, res);
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
  `&status=in.(aguardando,disponivel)` +
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
  variant = variants.find((item) => {
    const receivedVariantId = String(variantId || "").trim().toLowerCase();

    const itemId = String(item.id || "").trim().toLowerCase();
    const itemSku = String(item.sku || "").trim().toLowerCase();
    const itemName = String(item.name || "").trim().toLowerCase();

    const itemValues = Array.isArray(item.values)
      ? item.values
          .map((value) => {
            if (typeof value === "string") return value;

            if (value && typeof value === "object") {
              return value.pt || value.name || value.value || "";
            }

            return "";
          })
          .join(" ")
          .trim()
          .toLowerCase()
      : "";

    return (
      itemId === receivedVariantId ||
      itemSku === receivedVariantId ||
      itemName === receivedVariantId ||
      itemValues === receivedVariantId ||
      itemValues.includes(receivedVariantId)
    );
  });
}

// Se não encontrar pelo ID/SKU, mas o produto tiver apenas uma variante,
// usa automaticamente a única variante existente
if (!variant && variants.length === 1) {
  variant = variants[0];
}

// Se não tiver variant_id e houver variações, usa a primeira
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

let statusUpdated = false;
let updateError = null;

// Se voltou ao estoque, atualiza o status no Supabase
if (available) {
  const updateResponse = await fetch(
    `${supabaseUrl}/rest/v1/restock_requests?id=eq.${encodeURIComponent(request.id)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        status: "disponivel",
      }),
    }
  );

  const updateData = await updateResponse.json();

  if (!updateResponse.ok) {
    statusUpdated = false;
    updateError = updateData;
    console.error("Erro ao atualizar status para disponivel:", updateData);
  } else {
    statusUpdated = true;
  }
}

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
  status_updated: statusUpdated,
  update_error: updateError,
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

// Função de relatório dos produtos mais aguardados
async function generateRestockReport(req, res) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({
        ok: false,
        message: "Variáveis do Supabase não configuradas na Vercel.",
      });
    }

    const requestsUrl =
      `${supabaseUrl}/rest/v1/restock_requests` +
      `?status=eq.aguardando` +
      `&select=id,created_at,name,email,product_id,variant_id,product_name,product_url,status` +
      `&order=created_at.desc`;

    const requestsResponse = await fetch(requestsUrl, {
      method: "GET",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    });

    const requestsData = await requestsResponse.json();

    if (!requestsResponse.ok) {
      console.error("Erro ao buscar dados para relatório:", requestsData);

      return res.status(500).json({
        ok: false,
        message: "Erro ao buscar dados no Supabase para gerar relatório.",
        error: requestsData,
      });
    }

    if (!requestsData || requestsData.length === 0) {
      return res.status(200).json({
        ok: true,
        message: "Nenhum produto aguardando reposição no momento.",
        total_products: 0,
        total_requests: 0,
        items: [],
      });
    }

    const grouped = {};

    for (const item of requestsData) {
      const key = `${item.product_id || ""}__${item.variant_id || ""}`;

      if (!grouped[key]) {
        grouped[key] = {
          product_id: item.product_id,
          variant_id: item.variant_id,
          product_name: item.product_name,
          product_url: item.product_url,
          waiting_count: 0,
          emails: [],
          first_request_at: item.created_at,
          last_request_at: item.created_at,
        };
      }

      grouped[key].waiting_count += 1;

      if (item.email && !grouped[key].emails.includes(item.email)) {
        grouped[key].emails.push(item.email);
      }

      const currentDate = new Date(item.created_at);
      const firstDate = new Date(grouped[key].first_request_at);
      const lastDate = new Date(grouped[key].last_request_at);

      if (currentDate < firstDate) {
        grouped[key].first_request_at = item.created_at;
      }

      if (currentDate > lastDate) {
        grouped[key].last_request_at = item.created_at;
      }
    }

    const items = Object.values(grouped)
      .map((item) => ({
        ...item,
        unique_emails_count: item.emails.length,
      }))
      .sort((a, b) => b.waiting_count - a.waiting_count);

    return res.status(200).json({
      ok: true,
      message: "Relatório de produtos mais aguardados gerado com sucesso.",
      total_products: items.length,
      total_requests: requestsData.length,
      items,
    });
  } catch (error) {
    console.error("Erro geral ao gerar relatório:", error);

    return res.status(500).json({
      ok: false,
      message: "Erro interno ao gerar relatório.",
      error: error.message,
    });
  }
}

// Função para listar clientes prontos para receber aviso
async function getReadyToNotify(req, res) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({
        ok: false,
        message: "Variáveis do Supabase não configuradas na Vercel.",
      });
    }

    const requestsUrl =
      `${supabaseUrl}/rest/v1/restock_requests` +
      `?status=eq.disponivel` +
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
      console.error("Erro ao buscar clientes prontos para aviso:", requestsData);

      return res.status(500).json({
        ok: false,
        message: "Erro ao buscar clientes prontos para aviso no Supabase.",
        error: requestsData,
      });
    }

    if (!requestsData || requestsData.length === 0) {
      return res.status(200).json({
        ok: true,
        message: "Nenhum cliente pronto para receber aviso no momento.",
        total: 0,
        items: [],
      });
    }

    const items = requestsData.map((item) => ({
      id: item.id,
      name: item.name,
      email: item.email,
      product_id: item.product_id,
      variant_id: item.variant_id,
      product_name: item.product_name,
      product_url: item.product_url,
      status: item.status,
      created_at: item.created_at,
      notified_at: item.notified_at,
    }));

    return res.status(200).json({
      ok: true,
      message: "Clientes prontos para receber aviso listados com sucesso.",
      total: items.length,
      items,
    });
  } catch (error) {
    console.error("Erro geral ao listar clientes prontos para aviso:", error);

    return res.status(500).json({
      ok: false,
      message: "Erro interno ao listar clientes prontos para aviso.",
      error: error.message,
    });
  }
}

// Função para pré-visualizar os e-mails de aviso de reposição, sem enviar
async function previewRestockEmails(req, res) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({
        ok: false,
        message: "Variáveis do Supabase não configuradas na Vercel.",
      });
    }

    const requestsUrl =
      `${supabaseUrl}/rest/v1/restock_requests` +
      `?status=eq.disponivel` +
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
      console.error("Erro ao buscar clientes para prévia de e-mail:", requestsData);

      return res.status(500).json({
        ok: false,
        message: "Erro ao buscar clientes disponíveis para prévia de e-mail.",
        error: requestsData,
      });
    }

    if (!requestsData || requestsData.length === 0) {
      return res.status(200).json({
        ok: true,
        message: "Nenhum cliente com produto disponível para pré-visualizar e-mail.",
        total: 0,
        items: [],
      });
    }

    const items = requestsData.map((item) => {
      const firstName =
        item.name && String(item.name).trim()
          ? String(item.name).trim().split(" ")[0]
          : "Olá";

      const productName = item.product_name || "o produto que você estava aguardando";
      const productUrl = item.product_url || "https://elofortedigital.com.br/produtos/";

      const subject = "O produto que você queria voltou ao estoque 💛";

      const textBody =
`Olá, ${firstName}!

Boa notícia: o produto que você pediu para ser avisada voltou ao estoque:

${productName}

Você pode ver aqui:
${productUrl}

Como algumas reposições são limitadas, vale garantir o seu enquanto estiver disponível.

Com carinho,
Elo Forte`;

      const htmlBody =
`<p>Olá, ${firstName}!</p>

<p>Boa notícia: o produto que você pediu para ser avisada voltou ao estoque:</p>

<p><strong>${productName}</strong></p>

<p>
  <a href="${productUrl}" target="_blank">
    Ver produto na loja
  </a>
</p>

<p>Como a reposição pode acabar novamente, vale garantir o seu enquanto estiver disponível.</p>

<p>Com carinho,<br>Elo Forte</p>`;

      return {
        id: item.id,
        name: item.name,
        email: item.email,
        product_id: item.product_id,
        variant_id: item.variant_id,
        product_name: productName,
        product_url: productUrl,
        status: item.status,
        notified_at: item.notified_at,
        email_preview: {
          to: item.email,
          subject,
          text_body: textBody,
          html_body: htmlBody,
        },
      };
    });

    return res.status(200).json({
      ok: true,
      message: "Prévia dos e-mails de reposição gerada com sucesso. Nenhum e-mail foi enviado.",
      total: items.length,
      items,
    });
  } catch (error) {
    console.error("Erro geral ao gerar prévia dos e-mails:", error);

    return res.status(500).json({
      ok: false,
      message: "Erro interno ao gerar prévia dos e-mails.",
      error: error.message,
    });
  }
}

// Função de relatório visual dos produtos mais aguardados
async function generateRestockReportHtml(req, res) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).send("Variáveis do Supabase não configuradas na Vercel.");
    }

    const requestsUrl =
      `${supabaseUrl}/rest/v1/restock_requests` +
      `?status=eq.aguardando` +
      `&select=id,created_at,name,email,product_id,variant_id,product_name,product_url,status` +
      `&order=created_at.desc`;

    const requestsResponse = await fetch(requestsUrl, {
      method: "GET",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    });

    const requestsData = await requestsResponse.json();

    if (!requestsResponse.ok) {
      return res.status(500).send("Erro ao buscar dados no Supabase.");
    }

    const grouped = {};

    for (const item of requestsData || []) {
      const key = `${item.product_id || ""}__${item.variant_id || ""}`;

      if (!grouped[key]) {
        grouped[key] = {
          product_id: item.product_id || "",
          variant_id: item.variant_id || "sem_variacao",
          product_name: item.product_name || "",
          product_url: item.product_url || "",
          waiting_count: 0,
          emails: [],
          first_request_at: item.created_at,
          last_request_at: item.created_at,
        };
      }

      grouped[key].waiting_count += 1;

      if (item.email && !grouped[key].emails.includes(item.email)) {
        grouped[key].emails.push(item.email);
      }

      const currentDate = new Date(item.created_at);
      const firstDate = new Date(grouped[key].first_request_at);
      const lastDate = new Date(grouped[key].last_request_at);

      if (currentDate < firstDate) {
        grouped[key].first_request_at = item.created_at;
      }

      if (currentDate > lastDate) {
        grouped[key].last_request_at = item.created_at;
      }
    }

    const items = Object.values(grouped)
      .map((item) => ({
        ...item,
        unique_emails_count: item.emails.length,
      }))
      .sort((a, b) => b.waiting_count - a.waiting_count);

    function formatDate(dateString) {
      if (!dateString) return "-";

      try {
        return new Date(dateString).toLocaleString("pt-BR", {
          timeZone: "America/Sao_Paulo",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      } catch (error) {
        return dateString;
      }
    }

    function escapeHtml(value) {
      return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    const rows = items
      .map((item, index) => {
        const productLink = item.product_url
          ? `<a href="${escapeHtml(item.product_url)}" target="_blank">Ver produto</a>`
          : "-";

        return `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(item.product_name)}</td>
            <td>${escapeHtml(item.variant_id)}</td>
            <td>${item.waiting_count}</td>
            <td>${formatDate(item.last_request_at)}</td>
            <td>${productLink}</td>
          </tr>
        `;
      })
      .join("");

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Relatório - Avise-me quando chegar</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            background: #fff7fa;
            color: #444;
            margin: 0;
            padding: 24px;
          }

          .container {
            max-width: 1200px;
            margin: 0 auto;
            background: #fff;
            border: 1px solid #f3c2cf;
            border-radius: 18px;
            padding: 24px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.05);
          }

          h1 {
            margin: 0 0 8px;
            color: #555;
            font-size: 26px;
          }

          .subtitle {
            margin: 0 0 22px;
            color: #777;
            font-size: 14px;
          }

          .summary {
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
            margin-bottom: 22px;
          }

          .card {
            background: #fff7fa;
            border: 1px solid #f3c2cf;
            border-radius: 14px;
            padding: 14px 18px;
            min-width: 160px;
          }

          .card strong {
            display: block;
            font-size: 22px;
            color: #d8899f;
            margin-bottom: 4px;
          }

          .card span {
            font-size: 13px;
            color: #666;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            overflow: hidden;
            border-radius: 14px;
          }

          th {
            background: #f4b8c8;
            color: #444;
            text-align: left;
            padding: 12px;
            font-size: 13px;
          }

          td {
            border-bottom: 1px solid #f5d6df;
            padding: 12px;
            font-size: 13px;
            vertical-align: top;
          }

          tr:hover {
            background: #fff7fa;
          }

          a {
            color: #c45f7c;
            font-weight: 700;
            text-decoration: none;
          }

          a:hover {
            text-decoration: underline;
          }

          .empty {
            background: #fff7fa;
            border: 1px dashed #f3c2cf;
            border-radius: 14px;
            padding: 20px;
            color: #666;
            text-align: center;
          }

          .footer {
            margin-top: 18px;
            color: #888;
            font-size: 12px;
          }

          @media (max-width: 800px) {
            body {
              padding: 12px;
            }

            .container {
              padding: 16px;
            }

            table {
              display: block;
              overflow-x: auto;
              white-space: nowrap;
            }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Produtos mais aguardados 💛</h1>
          <p class="subtitle">
            Relatório de clientes aguardando reposição de estoque.
          </p>

          <div class="summary">
            <div class="card">
              <strong>${items.length}</strong>
              <span>produtos/variações</span>
            </div>

            <div class="card">
              <strong>${requestsData.length}</strong>
              <span>cadastros aguardando</span>
            </div>
          </div>

          ${
            items.length === 0
              ? `<div class="empty">Nenhum produto aguardando reposição no momento.</div>`
              : `
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Produto</th>
                      <th>Variação</th>
                      <th>Clientes aguardando</th>
                      <th>Último pedido</th>
                      <th>Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${rows}
                  </tbody>
                </table>
              `
          }

          <div class="footer">
            Atualizado em ${formatDate(new Date().toISOString())}.
          </div>
        </div>
      </body>
      </html>
    `;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(html);
  } catch (error) {
    return res.status(500).send("Erro interno ao gerar relatório visual.");
  }
}

// Função de relatório visual dos clientes prontos para receber aviso
async function getReadyToNotifyHtml(req, res) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).send("Variáveis do Supabase não configuradas na Vercel.");
    }

    const requestsUrl =
      `${supabaseUrl}/rest/v1/restock_requests` +
      `?status=eq.disponivel` +
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
      return res.status(500).send("Erro ao buscar clientes prontos para aviso no Supabase.");
    }

    function formatDate(dateString) {
      if (!dateString) return "-";

      try {
        return new Date(dateString).toLocaleString("pt-BR", {
          timeZone: "America/Sao_Paulo",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      } catch (error) {
        return dateString;
      }
    }

    function escapeHtml(value) {
      return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    function formatVariant(value) {
      if (!value || value === "sem_variacao") {
        return "Sem variação";
      }

      return value;
    }

    const rows = (requestsData || [])
      .map((item, index) => {
        const productLink = item.product_url
          ? `<a href="${escapeHtml(item.product_url)}" target="_blank">Ver produto</a>`
          : "-";

        return `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(item.name || "-")}</td>
            <td>${escapeHtml(item.email)}</td>
            <td>${escapeHtml(item.product_name)}</td>
            <td>${escapeHtml(formatVariant(item.variant_id))}</td>
            <td>${formatDate(item.created_at)}</td>
            <td>${productLink}</td>
          </tr>
        `;
      })
      .join("");

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Clientes prontos para aviso</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            background: #fff7fa;
            color: #444;
            margin: 0;
            padding: 24px;
          }

          .container {
            max-width: 1200px;
            margin: 0 auto;
            background: #fff;
            border: 1px solid #f3c2cf;
            border-radius: 18px;
            padding: 24px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.05);
          }

          h1 {
            margin: 0 0 8px;
            color: #555;
            font-size: 26px;
          }

          .subtitle {
            margin: 0 0 22px;
            color: #777;
            font-size: 14px;
          }

          .summary {
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
            margin-bottom: 22px;
          }

          .card {
            background: #fff7fa;
            border: 1px solid #f3c2cf;
            border-radius: 14px;
            padding: 14px 18px;
            min-width: 160px;
          }

          .card strong {
            display: block;
            font-size: 22px;
            color: #d8899f;
            margin-bottom: 4px;
          }

          .card span {
            font-size: 13px;
            color: #666;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            overflow: hidden;
            border-radius: 14px;
          }

          th {
            background: #f4b8c8;
            color: #444;
            text-align: left;
            padding: 12px;
            font-size: 13px;
          }

          td {
            border-bottom: 1px solid #f5d6df;
            padding: 12px;
            font-size: 13px;
            vertical-align: top;
          }

          tr:hover {
            background: #fff7fa;
          }

          a {
            color: #c45f7c;
            font-weight: 700;
            text-decoration: none;
          }

          a:hover {
            text-decoration: underline;
          }

          .empty {
            background: #fff7fa;
            border: 1px dashed #f3c2cf;
            border-radius: 14px;
            padding: 20px;
            color: #666;
            text-align: center;
          }

          .footer {
            margin-top: 18px;
            color: #888;
            font-size: 12px;
          }

          @media (max-width: 800px) {
            body {
              padding: 12px;
            }

            .container {
              padding: 16px;
            }

            table {
              display: block;
              overflow-x: auto;
              white-space: nowrap;
            }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Clientes prontos para aviso 💌</h1>
          <p class="subtitle">
            Clientes com produto novamente disponível, aguardando envio pelo Zoho.
          </p>

          <div class="summary">
            <div class="card">
              <strong>${requestsData.length}</strong>
              <span>clientes prontos para aviso</span>
            </div>
          </div>

          ${
            requestsData.length === 0
              ? `<div class="empty">Nenhum cliente pronto para receber aviso no momento.</div>`
              : `
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Nome</th>
                      <th>E-mail</th>
                      <th>Produto</th>
                      <th>Variação</th>
                      <th>Pedido de aviso</th>
                      <th>Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${rows}
                  </tbody>
                </table>
              `
          }

          <div class="footer">
            Atualizado em ${formatDate(new Date().toISOString())}.
          </div>
        </div>
      </body>
      </html>
    `;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(html);
  } catch (error) {
    return res.status(500).send("Erro interno ao gerar relatório visual de clientes prontos para aviso.");
  }
}
