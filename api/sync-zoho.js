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

async function adicionarCarrinhoComLink(clientes, listKey) {
  const accessToken = await getZohoAccessToken();

  const zohoUrl = "https://campaigns.zoho.com/api/v1.1/json/listsubscribe";

  let enviados = 0;
  const erros = [];

  for (const cliente of clientes) {
    try {
      const { firstName, lastName } = splitFullName(cliente.name || "");

      const zohoResponse = await fetch(zohoUrl, {
        method: "POST",
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          resfmt: "JSON",
          listkey: listKey,
         contactinfo: JSON.stringify({
  "Contact Email": cliente.email,
  "First Name": firstName,
  "Last Name": lastName,
  link_carrinho: String(cliente.checkout_url || ""),
  status_carrinho: "abandonado",
          }),
        }),
      });

      const resultado = await zohoResponse.json();

      if (resultado.status === "success") {
        enviados++;
      } else {
        erros.push({
          email: cliente.email,
          resultado,
        });
      }
    } catch (error) {
      erros.push({
        email: cliente.email,
        erro: error.message,
      });
    }
  }

  return { enviados, erros };
}

module.exports = async function handler(req, res) {
  try {
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

    const headers = {
      Authentication: `bearer ${nuvemToken}`,
      "User-Agent": "Elo Forte App (contato@elofortedigital.com.br)",
      "Content-Type": "application/json",
    };

    const carrinhosResp = await fetch(
      `https://api.nuvemshop.com.br/v1/${storeId}/checkouts?page=1&per_page=50`,
      { headers }
    );

    const carrinhosData = await carrinhosResp.json();

    if (!carrinhosResp.ok) {
      return res.status(500).json({
        erro: "Erro ao buscar carrinhos na Nuvemshop",
        status: carrinhosResp.status,
        resposta: carrinhosData,
      });
    }

    const carrinhos = Array.isArray(carrinhosData) ? carrinhosData : [];

    carrinhos.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const carrinhoAbandonado = carrinhos
  .filter((c) => c.contact_email)
  .slice(0, 20)
  .map((c) => ({
    email: c.contact_email,
    name: c.contact_name || "",
    checkout_url: c.abandoned_checkout_url || "",
    created_at: c.created_at,
  }));

    const exemplos = carrinhoAbandonado.slice(0, 5);

    const resultadoCarrinho = await adicionarCarrinhoComLink(
      carrinhoAbandonado,
      process.env.ZOHO_LIST_CARRINHO_ABANDONADO
    );

    return res.status(200).json({
      total_carrinhos: carrinhos.length,
      carrinho_abandonado: carrinhoAbandonado.length,
      adicionados_carrinho_abandonado: resultadoCarrinho.enviados,
      exemplos_recentes: exemplos,
      list_key_usada: process.env.ZOHO_LIST_CARRINHO_ABANDONADO,
      erros: resultadoCarrinho.erros,
    });
  } catch (erro) {
    console.log("SYNC_ZOHO_ERROR:", erro);

    return res.status(500).json({
      erro: erro.message,
    });
  }
};
