export default async function handler(req, res) {
  try {
    const storeId = "4882514";
    const nuvemToken = "a687e51c0c454e0f89fe239db9c808d31d2bf15a";

    const headers = {
      "Authentication": `bearer ${nuvemToken}`,
      "User-Agent": "Elo Forte App (contato@elofortedigital.com.br)",
      "Content-Type": "application/json"
    };

    // CLIENTES
    const clientesResp = await fetch(
      `https://api.nuvemshop.com.br/v1/${storeId}/customers?page=1&per_page=200`,
      { headers }
    );

    const clientesData = await clientesResp.json();
    const clientes = Array.isArray(clientesData)
      ? clientesData.filter(c => c.accepts_marketing === true && c.email)
      : [];

    const compraram = clientes.filter(c =>
      Number(c.total_spent || 0) > 0 || c.last_order_id
    );

    const naoCompraram = clientes.filter(c =>
      Number(c.total_spent || 0) === 0 && !c.last_order_id
    );

    // CARRINHOS ABANDONADOS
    const carrinhosResp = await fetch(
      `https://api.nuvemshop.com.br/v1/${storeId}/checkouts?page=1&per_page=200`,
      { headers }
    );

    const carrinhosData = await carrinhosResp.json();
    const carrinhos = Array.isArray(carrinhosData) ? carrinhosData : [];

    const carrinhoAbandonado = carrinhos
      .filter(c => c.contact_email && c.contact_accepts_marketing === true)
      .map(c => ({
        email: c.contact_email,
        name: c.contact_name || "",
        checkout_url: c.abandoned_checkout_url || ""
      }));

    // TOKEN ZOHO
    const zohoTokenResponse = await fetch(
      "https://project-2jpn7.vercel.app/api/zoho-token"
    );

    const zohoTokenData = await zohoTokenResponse.json();
    const accessToken = zohoTokenData.access_token;

    if (!accessToken) {
      return res.status(500).json({
        erro: "Não foi possível gerar access_token do Zoho",
        detalhe: zohoTokenData
      });
    }

    async function adicionarEmLotes(lista, listKey) {
      let enviados = 0;
      let erros = [];

      for (let i = 0; i < lista.length; i += 10) {
        const lote = lista.slice(i, i + 10).map(c => c.email).join(",");

        const zohoResponse = await fetch(
          "https://campaigns.zoho.com/api/v1.1/addlistsubscribersinbulk",
          {
            method: "POST",
            headers: {
              "Authorization": `Zoho-oauthtoken ${accessToken}`,
              "Content-Type": "application/x-www-form-urlencoded"
            },
            body: new URLSearchParams({
              resfmt: "JSON",
              listkey: listKey,
              emailids: lote
            })
          }
        );

        const resultado = await zohoResponse.json();

        if (resultado.status === "success") {
          enviados += lista.slice(i, i + 10).length;
        } else {
          erros.push({ lote, resultado });
        }
      }

      return { enviados, erros };
    }

    async function removerDaLista(lista, listKey) {
      let removidos = 0;
      let erros = [];

      for (const cliente of lista) {
        const zohoResponse = await fetch(
          "https://campaigns.zoho.com/api/v1.1/json/listunsubscribe",
          {
            method: "POST",
            headers: {
              "Authorization": `Zoho-oauthtoken ${accessToken}`,
              "Content-Type": "application/x-www-form-urlencoded"
            },
            body: new URLSearchParams({
              resfmt: "JSON",
              listkey: listKey,
              contactinfo: JSON.stringify({
                "Contact Email": cliente.email
              })
            })
          }
        );

        const resultado = await zohoResponse.json();

        if (resultado.status === "success") {
          removidos++;
        } else if (resultado.code !== "2103") {
          erros.push({ email: cliente.email, resultado });
        }
      }

      return { removidos, erros };
    }

    const resultadoCompraram = await adicionarEmLotes(
      compraram,
      process.env.ZOHO_LIST_COMPRARAM
    );

    const resultadoNaoCompraram = await adicionarEmLotes(
      naoCompraram,
      process.env.ZOHO_LIST_NAO_COMPRARAM
    );

    const resultadoCarrinho = await adicionarEmLotes(
      carrinhoAbandonado,
      process.env.ZOHO_LIST_CARRINHO_ABANDONADO
    );

    const resultadoRemocao = await removerDaLista(
      compraram,
      process.env.ZOHO_LIST_NAO_COMPRARAM
    );

    return res.status(200).json({
      total_clientes: clientes.length,
      compraram: compraram.length,
      nao_compraram: naoCompraram.length,
      carrinho_abandonado: carrinhoAbandonado.length,
      adicionados_compraram: resultadoCompraram.enviados,
      adicionados_nao_compraram: resultadoNaoCompraram.enviados,
      adicionados_carrinho_abandonado: resultadoCarrinho.enviados,
      removidos_de_nao_compraram: resultadoRemocao.removidos,
      erros: [
        ...resultadoCompraram.erros,
        ...resultadoNaoCompraram.erros,
        ...resultadoCarrinho.erros,
        ...resultadoRemocao.erros
      ]
    });

  } catch (erro) {
    return res.status(500).json({
      erro: erro.message
    });
  }
}
