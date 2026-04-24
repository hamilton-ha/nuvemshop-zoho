export default async function handler(req, res) {
  const response = await fetch("https://accounts.zoho.com/oauth/v2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: "1000.GIMYXWBM45YXE5EI4Q6JILEK5CH86R",
      client_secret: "f28096d07558b6c277a0d5551260c1be5e8f006a5c",
      redirect_uri: "https://www.zoho.com",
      code: "1000.61b01a2ad355f95a4f5d5f0c175c0d84.16d7a1f62f63719b658a7b41cbc9f4b0"
    })
  });

  const data = await response.json();

  return res.status(200).json(data);
}
