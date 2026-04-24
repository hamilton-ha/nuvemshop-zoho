export default async function handler(req, res) {
  const storeId = "4882514";
  const nuvemToken = "a687e51c0c454e0f89fe239db9c808d31d2bf15a";

  const response = await fetch(
    `https://api.nuvemshop.com.br/v1/${storeId}/customers?page=1&per_page=200`,
    {
      headers: {
        "Authentication": `bearer ${nuvemToken}`,
        "User-Agent": "Elo Forte App (contato@elofortedigital.com.br)",
        "Content-Type": "application/json"
      }
    }
  );

  const data = await response.json();

  const clientes = data.filter(c => c.accepts_marketing === true && c.email);

  const compraram = clientes.filter(c =>
    Number(c.total_spent || 0) > 0 || c.last_order_id
  );

  const naoCompraram = clientes.filter(c =>
    Number(c.total_spent || 0) === 0 && !c.last_order_id
  );

  const zohoTokenResponse = await fetch(
    "https://project-2jpn7.vercel.app/api/zoho-token"
  );

  const zohoTokenData = await zohoTokenResponse.json();
  const accessToken = zohoTokenData.access_token;

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
      } else {
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

  const resultadoRemocao = await removerDaLista(
    compraram,
    process.env.ZOHO_LIST_NAO_COMPRARAM
  );

  return res.status(200).json({
    total_processados: clientes.length,
    compraram: compraram.length,
    nao_compraram: naoCompraram.length,
    adicionados_em_compraram: resultadoCompraram.enviados,
    adicionados_em_nao_compraram: resultadoNaoCompraram.enviados,
    removidos_de_nao_compraram: resultadoRemocao.removidos,
    erros: [
      ...resultadoCompraram.erros,
      ...resultadoNaoCompraram.erros,
      ...resultadoRemocao.erros
    ]
  });
}
