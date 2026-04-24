export default async function handler(req, res) {
  try {
    const storeId = "4882514";
    const nuvemToken = "a687e51c0c454e0f89fe239db9c808d31d2bf15a";

    const response = await fetch(
      `https://api.nuvemshop.com.br/v1/${storeId}/checkouts?page=1&per_page=10`,
      {
        headers: {
          "Authentication": `bearer ${nuvemToken}`,
          "User-Agent": "Elo Forte App (contato@elofortedigital.com.br)",
          "Content-Type": "application/json"
        }
      }
    );

    const text = await response.text(); // <- aqui é o segredo

    return res.status(200).json({
      status: response.status,
      ok: response.ok,
      resposta_bruta: text
    });

  } catch (erro) {
    return res.status(500).json({
      erro: erro.message
    });
  }
}
