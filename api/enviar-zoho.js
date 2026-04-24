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

  const clientes = data
    .filter(c => c.accepts_marketing === true && c.email)
    .map(c => ({
      name: c.name,
      email: c.email,
      phone: c.phone
    }));

  const zohoTokenResponse = await fetch(
    "https://project-2jpn7.vercel.app/api/zoho-token"
  );

  const zohoTokenData = await zohoTokenResponse.json();
  const accessToken = zohoTokenData.access_token;

  const primeiroCliente = clientes[0];

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
        listkey: process.env.ZOHO_LIST_KEY,
        contactinfo: JSON.stringify({
          "Contact Email": primeiroCliente.email,
          "First Name": primeiroCliente.name || ""
        })
      })
    }
  );

  const resultado = await zohoResponse.json();

  return res.status(200).json({
    cliente_teste: primeiroCliente,
    zoho: resultado
  });
}
