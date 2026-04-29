module.exports = async function handler(req, res) {
  try {
    const token = process.env.NUVEMSHOP_ACCESS_TOKEN;
    const storeId = process.env.NUVEMSHOP_STORE_ID || "4882514";

    if (!token) {
      return res.status(500).json({
        erro: "NUVEMSHOP_ACCESS_TOKEN não configurado na Vercel",
      });
    }

    const response = await fetch(
      `https://api.nuvemshop.com.br/v1/${storeId}/customers?page=1&per_page=200`,
      {
        headers: {
          Authentication: `bearer ${token}`,
          "User-Agent": "Elo Forte App (contato@elofortedigital.com.br)",
          "Content-Type": "application/json",
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        erro: "Erro ao buscar clientes na Nuvemshop",
        resposta: data,
      });
    }

    const clientes = Array.isArray(data)
      ? data
          .filter((cliente) => cliente.accepts_marketing === true)
          .map((cliente) => ({
            name: cliente.name,
            email: cliente.email,
            phone: cliente.phone,
          }))
      : [];

    return res.status(200).json(clientes);
  } catch (erro) {
    return res.status(500).json({
      erro: erro.message,
    });
  }
};
