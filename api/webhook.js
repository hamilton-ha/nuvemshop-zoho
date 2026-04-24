export default async function handler(req, res) {
  const token = "a687e51c0c454e0f89fe239db9c808d31d2bf15a";
  const storeId = "4882514";

  const response = await fetch(
    `https://api.nuvemshop.com.br/v1/${storeId}/customers?page=1&per_page=200`,
    {
      headers: {
        "Authentication": `bearer ${token}`,
        "User-Agent": "Elo Forte App (contato@elofortedigital.com.br)",
        "Content-Type": "application/json"
      }
    }
  );

  const data = await response.json();

  const clientes = data.map(cliente => ({
    nome: cliente.name,
    email: cliente.email,
    telefone: cliente.phone,
    aceita_marketing: cliente.accepts_marketing
  }));

  return res.status(200).json(clientes);
}
