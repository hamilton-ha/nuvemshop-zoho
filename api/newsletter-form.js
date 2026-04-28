async function getZohoAccessToken() {
  const params = new URLSearchParams();

  params.append("refresh_token", process.env.ZOHO_REFRESH_TOKEN);
  params.append("client_id", process.env.ZOHO_CLIENT_ID);
  params.append("client_secret", process.env.ZOHO_CLIENT_SECRET);
  params.append("grant_type", "refresh_token");

  const response = await fetch("https://accounts.zoho.com/oauth/v2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  const data = await response.json();

  if (!response.ok || !data.access_token) {
    console.log("ZOHO_TOKEN_ERROR:", JSON.stringify(data));
    throw new Error("Não foi possível gerar access_token do Zoho");
  }

  return data.access_token;
}

function getFormData(req) {
  if (!req.body) {
    return {};
  }

  if (typeof req.body === "string") {
    const params = new URLSearchParams(req.body);

    return {
      name: params.get("name") || "",
      email: params.get("email") || "",
    };
  }

  return {
    name: req.body.name || "",
    email: req.body.email || "",
  };
}

function renderPage(status = "") {
  const successRedirect =
    status === "success"
      ? `<meta http-equiv="refresh" content="3;url=https://elofortedigital.com.br/">`
      : "";

  const successMessage =
    status === "success"
      ? `<div class="message success">Cadastro realizado com sucesso! Você será redirecionado para a Elo Forte em alguns segundos.</div>`
      : "";

  const errorMessage =
    status === "error"
      ? `<div class="message error">Não conseguimos concluir o cadastro agora. Confira os dados e tente novamente.</div>`
      : "";

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>  
  ${successRedirect}
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Newsletter Elo Forte</title>

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      font-family: Arial, sans-serif;
      background: #fffafa;
      color: #4d5557;
    }

    .newsletter-box {
      max-width: 560px;
      margin: 0 auto;
      padding: 28px 22px 30px;
      background: linear-gradient(135deg, #fff7f8 0%, #fde4e9 100%);
      border: 1px solid #f1cbd3;
      border-radius: 22px;
      box-shadow: 0 8px 24px rgba(216, 117, 138, 0.14);
      text-align: center;
    }

    .eyebrow {
      font-size: 13px;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: #d8758a;
      font-weight: 700;
      margin-bottom: 10px;
    }

    h2 {
      margin: 0 0 10px;
      font-size: 28px;
      line-height: 1.15;
      color: #4d5557;
    }

    p {
      margin: 0 auto 22px;
      font-size: 15px;
      line-height: 1.55;
      max-width: 440px;
      color: #555;
    }

    form {
      max-width: 430px;
      margin: 0 auto;
      text-align: left;
    }

    label {
      display: block;
      font-size: 14px;
      font-weight: 700;
      color: #4d5557;
      margin-bottom: 7px;
    }

    input {
      width: 100%;
      border: 1px solid #edcbd2;
      border-radius: 13px;
      padding: 15px 16px;
      font-size: 16px;
      outline: none;
      margin-bottom: 16px;
      background: #ffffff;
      color: #4d5557;
    }

    input:focus {
      border-color: #d8758a;
      box-shadow: 0 0 0 3px rgba(216, 117, 138, 0.15);
    }

    button {
      width: 100%;
      border: none;
      background: #d8758a;
      color: #ffffff;
      padding: 16px 20px;
      border-radius: 14px;
      font-size: 15px;
      font-weight: 700;
      letter-spacing: .4px;
      cursor: pointer;
      box-shadow: 0 6px 14px rgba(216, 117, 138, 0.25);
    }

    button:hover {
      filter: brightness(0.98);
    }

    .note {
      font-size: 12px;
      line-height: 1.5;
      color: #777;
      text-align: center;
      margin-top: 14px;
      margin-bottom: 0;
    }

    .message {
      max-width: 430px;
      margin: 0 auto 18px;
      padding: 12px 14px;
      border-radius: 12px;
      font-size: 14px;
      line-height: 1.45;
      text-align: center;
      font-weight: 600;
    }

    .success {
      background: #eef9f0;
      color: #327a3c;
      border: 1px solid #ccebd2;
    }

    .error {
      background: #fff0f0;
      color: #a83d3d;
      border: 1px solid #f3cccc;
    }

    .benefits {
      display: flex;
      justify-content: center;
      gap: 12px;
      flex-wrap: wrap;
      margin-top: 20px;
      font-size: 13px;
      color: #666;
    }

    .benefits span {
      background: rgba(255, 255, 255, 0.75);
      border: 1px solid #f2d4da;
      border-radius: 999px;
      padding: 8px 12px;
    }

    @media (max-width: 480px) {
      .newsletter-box {
        padding: 24px 16px;
        border-radius: 18px;
      }

      h2 {
        font-size: 24px;
      }

      button {
        font-size: 14px;
      }
    }
  </style>
</head>

<body>
  <div class="newsletter-box">
    <div class="eyebrow">Newsletter Elo Forte</div>

    <h2>Receba nossas novidades</h2>

    <p>
      Cadastre seu nome e e-mail para receber ofertas, lançamentos e conteúdos especiais da Elo Forte.
    </p>

    ${successMessage}
    ${errorMessage}

    <form method="POST" action="/api/newsletter-form">
      <label for="name">Seu nome</label>
      <input id="name" name="name" type="text" placeholder="Digite seu nome" required />

      <label for="email">Seu e-mail</label>
      <input id="email" name="email" type="email" placeholder="Digite seu melhor e-mail" required />

      <button type="submit">QUERO RECEBER AS NOVIDADES</button>

      <p class="note">
        Seus dados serão usados apenas para envio de comunicações da Elo Forte.
      </p>
    </form>

    <div class="benefits">
      <span>🎁 Promoções exclusivas</span>
      <span>♡ Novidades em primeira mão</span>
      <span>🏷️ Dicas especiais</span>
    </div>
  </div>
</body>
</html>
`;
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");

  if (req.method === "GET") {
    return res.status(200).send(renderPage());
  }

  if (req.method !== "POST") {
    return res.status(405).send(renderPage("error"));
  }

  try {
    const { name, email } = getFormData(req);

    console.log("NEWSLETTER_IFRAME_RECEIVED:", { name, email });

    if (!email || !email.includes("@")) {
      return res.status(200).send(renderPage("error"));
    }

    const zohoAccessToken = await getZohoAccessToken();

    const contactInfo = {
      "Contact Email": email.trim(),
      "First Name": name.trim(),
      origem: "Página Newsletter Elo Forte",
    };

    const zohoParams = new URLSearchParams();

    zohoParams.append("resfmt", "JSON");
    zohoParams.append("listkey", process.env.ZOHO_NEWSLETTER_LIST_KEY);
    zohoParams.append("contactinfo", JSON.stringify(contactInfo));

    const zohoResponse = await fetch(
      "https://campaigns.zoho.com/api/v1.1/json/listsubscribe",
      {
        method: "POST",
        headers: {
          Authorization: `Zoho-oauthtoken ${zohoAccessToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: zohoParams,
      }
    );

    const zohoData = await zohoResponse.json();

    console.log("ZOHO_IFRAME_STATUS:", zohoResponse.status);
    console.log("ZOHO_IFRAME_RESPONSE:", JSON.stringify(zohoData));

    if (!zohoResponse.ok) {
      return res.status(200).send(renderPage("error"));
    }

    return res.status(200).send(renderPage("success"));
  } catch (error) {
    console.log("NEWSLETTER_IFRAME_ERROR:", error.message);
    return res.status(200).send(renderPage("error"));
  }
}
