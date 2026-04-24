export default async function handler(req, res) {
  const token = "a687e51c0c454e0f89fe239db9c808d31d2bf15a";

  const response = await fetch("https://api.nuvemshop.com.br/v1/4882514/orders", {
    headers: {
      "Authentication": `bearer ${token}`,
      "User-Agent": "Elo Forte App (contato@elofortedigital.com.br)",
      "Content-Type": "application/json"
    }
  });

  const data = await response.json();

  return res.status(200).json(data);
}
