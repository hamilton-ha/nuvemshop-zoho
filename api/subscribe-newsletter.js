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

export default async function handler(req, res) {
  const redirectBase = "https://elofortedigital.com.br/receba_novidades";

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Método não permitido",
    });
  }

  try {
    const { name, email } = getFormData(req);

    console.log("NEWSLETTER_FORM_RECEIVED:", { name, email });

    if (!email || !email.includes("@")) {
      return res.redirect(
        303,
        `${redirectBase}?newsletter=erro_email#formulario-newsletter`
      );
    }

    const zohoAccessToken = await getZohoAccessToken();

    const contactInfo = {
      "Contact Email": email.trim(),
      "First Name": name.trim() || "",
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

    console.log("ZOHO_NEWSLETTER_STATUS:", zohoResponse.status);
    console.log("ZOHO_NEWSLETTER_RESPONSE:", JSON.stringify(zohoData));

    if (!zohoResponse.ok) {
      return res.redirect(
        303,
        `${redirectBase}?newsletter=erro#formulario-newsletter`
      );
    }

    return res.redirect(
      303,
      `${redirectBase}?newsletter=sucesso#formulario-newsletter`
    );
  } catch (error) {
    console.log("NEWSLETTER_SUBSCRIBE_ERROR:", error.message);

    return res.redirect(
      303,
      `${redirectBase}?newsletter=erro#formulario-newsletter`
    );
  }
}
