export default async function handler(req, res) {
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

  const clientes = clientesData.filter(c => c.accepts_marketing && c.email);

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
    name: c.contact_name,
    checkout_url: c.abandoned_checkout_url
  }));

const carrinhosData = await carrinhosResp.json();

// PROTEÇÃO CONTRA ERRO
const carrinhos = Array.isArray(carrinhosData) ? carrinhosData : [];

const carrinhoAbandonado = carrinhos
  .map(c => ({
    email: c.contact_email || c.email,
    name: c.contact_name || c.name
  }))
  .filter(c => c.email);
  
  // TOKEN ZOHO
  const zohoTokenResponse = await fetch(
    "https://project-2jpn7.vercel.app/api/zoho-token"
  );

  const zohoTokenData = await zohoTokenResponse.json();
  const accessToken = zohoTokenData.access_token;

  async function adicionarEmLotes(lista, listKey) {
    let enviados = 0;

    for (let i = 0; i < lista.length; i += 10) {
      const lote = lista.slice(i, i + 10).map(c => c.email).join(",");

      await fetch(
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

      enviados += lista.slice(i, i + 10).length;
    }

    return enviados;
  }

  async function removerDaLista(lista, listKey) {
    for (const cliente of lista) {
      await fetch(
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
    }
  }

  // EXECUÇÃO
  await adicionarEmLotes(compraram, process.env.ZOHO_LIST_COMPRARAM);
  await adicionarEmLotes(naoCompraram, process.env.ZOHO_LIST_NAO_COMPRARAM);
  await adicionarEmLotes(carrinhoAbandonado, process.env.ZOHO_LIST_CARRINHO_ABANDONADO);

  await removerDaLista(compraram, process.env.ZOHO_LIST_NAO_COMPRARAM);

  return res.status(200).json({
    total_clientes: clientes.length,
    compraram: compraram.length,
    nao_compraram: naoCompraram.length,
    carrinho_abandonado: carrinhoAbandonado.length
  });
}
