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

  const compraram = clientes.filter(c => Number(c.total_spent || 0) > 0 || c.last_order_id);
  const naoCompraram = clientes.filter(c => Number(c.total_spent || 0) === 0 && !c.last_order_id);

  const zohoTokenResponse = await fetch("https://project-2jpn7.vercel.app/api/zoho-token");
  const zohoTokenData = await zohoTokenResponse.json();
  const accessToken = zohoTokenData.access_token;

  async function enviarLotes(lista, listKey) {
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

  const resultadoCompraram = await enviarLotes(compraram, process.env.ZOHO_LIST_COMPRARAM);
  const resultadoNaoCompraram = await enviarLotes(naoCompraram, process.env.ZOHO_LIST_NAO_COMPRARAM);

  return res.status(200).json({
    total_processados: clientes.length,
    compraram: compraram.length,
    nao_compraram: naoCompraram.length,
    enviados_compraram: resultadoCompraram.enviados,
    enviados_nao_compraram: resultadoNaoCompraram.enviados,
    erros: [
      ...resultadoCompraram.erros,
      ...resultadoNaoCompraram.erros
    ]
  });
}
