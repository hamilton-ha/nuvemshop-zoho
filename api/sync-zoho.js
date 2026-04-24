export default async function handler(req, res) {
  const storeId = "4882514";
  const nuvemToken = "a687e51c0c454e0f89fe239db9c808d31d2bf15a";

  // Buscar clientes
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

  // Token Zoho
  const zohoTokenResponse = await fetch(
    "https://project-2jpn7.vercel.app/api/zoho-token"
  );

  const zohoTokenData = await zohoTokenResponse.json();
  const accessToken = zohoTokenData.access_token;

  let enviadosCompraram = 0;
  let enviadosNaoCompraram = 0;
  let erros = [];

  for (const cliente of clientes) {
    const comprou = Number(cliente.total_spent || 0) > 0 || cliente.last_order_id;

    const listKey = comprou
      ? process.env.ZOHO_LIST_COMPRARAM
      : process.env.ZOHO_LIST_NAO_COMPRARAM;

    try {
      const zohoResponse = await fetch(
        "https://campaigns.zoho.com/api/v1.1/json/listsubscribe",
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
              "Contact Email": cliente.email,
              "First Name": cliente.name || ""
            })
          })
        }
      );

      const resultado = await zohoResponse.json();

      if (resultado.status === "success") {
        if (comprou) {
          enviadosCompraram++;
        } else {
          enviadosNaoCompraram++;
        }
      } else {
        erros.push({ cliente: cliente.email, resultado });
      }

    } catch (e) {
      erros.push({ cliente: cliente.email, erro: e.message });
    }
  }

  return res.status(200).json({
    total_processados: clientes.length,
    enviados_compraram: enviadosCompraram,
    enviados_nao_compraram: enviadosNaoCompraram,
    erros
  });
}
