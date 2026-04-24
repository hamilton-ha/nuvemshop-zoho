export default async function handler(req, res) {
  const token = "a687e51c0c454e0f89fe239db9c808d31d2bf15a";

  const response = await fetch("https://api.nuvemshop.com.br/v1/orders", {
    headers: {
      Authentication: `bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "Elo Forte App (contato@elofortedigital.com.br)"
    }
  });

  const data = await response.json();

  return res.status(200).json(data);
}
