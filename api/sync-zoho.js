function splitFullName(fullName = "") {
  const parts = fullName.trim().replace(/\s+/g, " ").split(" ");

  const firstName = parts.shift() || "";
  const lastName = parts.join(" ");

  return {
    firstName,
    lastName,
  };
}

export default async function handler(req, res) {
  try {
    const storeId = "4882514";
    const nuvemToken = "a687e51c0c454e0f89fe239db9c808d31d2bf15a";

    const headers = {
      Authentication: `bearer ${nuvemToken}`,
      "User-Agent": "Elo Forte App (contato@elofortedigital.com.br)",
      "Content-Type": "application/json"
    };

    // BUSCAR CARRINHOS
    const carrinhosResp = await fetch(
      `https://api.nuvemshop.com.br/v1/${storeId}/checkouts?page=1&per_page=50`,
      { headers }
    );

    const carrinhosData = await carrinhosResp.json();
    const carrinhos = Array.isArray(carrinhosData) ? carrinhosData : [];

    // ORDENAR DO MAIS RECENTE PARA O MAIS ANTIGO
    carrinhos.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // FILTRAR APENAS ABANDONADOS
    const carrinhoAbandonado = carrinhos
      .filter(c => c.contact_email)
      .map(c => ({
        email: c.contact_email,
        name: c.contact_name || "",
        checkout_url: c.abandoned_checkout_url || "",
        created_at: c.created_at
      }));

    // PEGAR OS 5 MAIS RECENTES PRA DEBUG
    const exemplos = carrinhoAbandonado.slice(0, 5);

    // TOKEN ZOHO
    const { firstName, lastName } = splitFullName(cliente.name || "");

const zohoResponse = await fetch(
  zohoUrl,
  {
    method: "POST",
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      resfmt: "JSON",
      listkey: listKey,
      contactinfo: JSON.stringify({
        "Contact Email": cliente.email,
        "First Name": firstName,
        "Last Name": lastName,
        "link_carrinho": String(cliente.checkout_url || "")
      })
    })
  }
);
        const resultado = await zohoResponse.json();

        if (resultado.status === "success") {
          enviados++;
        } else {
          erros.push({ email: cliente.email, resultado });
        }
      }

      return { enviados, erros };
    }

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
  erros: resultadoCarrinho.erros
});

  } catch (erro) {
    return res.status(500).json({
      erro: erro.message
    });
  }
}
