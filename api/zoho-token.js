export default async function handler(req, res) {
  const { code } = req.query;

  if (!code) {
    return res.status(200).send("Aguardando code do Zoho...");
  }

  const response = await fetch("https://accounts.zoho.com/oauth/v2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: "1000.GIMYXWBM45YXE5EI4Q6JILEK5CH86R",
      client_secret: "f28096d07558b6c277a0d5551260c1be5e8f006a5c",
      redirect_uri: "https://project-2jpn7.vercel.app/api/zoho-token",
      code: code
    })
  });

  const data = await response.json();

  return res.status(200).json(data);
}
