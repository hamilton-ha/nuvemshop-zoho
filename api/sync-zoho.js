export default async function handler(req, res) {
  try {
    return res.status(200).json({
      status: "ok",
      mensagem: "Rota sync-zoho funcionando",
      list_compraram: process.env.ZOHO_LIST_COMPRARAM ? "configurada" : "faltando",
      list_nao_compraram: process.env.ZOHO_LIST_NAO_COMPRARAM ? "configurada" : "faltando",
      zoho_list_key_principal: process.env.ZOHO_LIST_KEY ? "configurada" : "faltando"
    });
  } catch (error) {
    return res.status(500).json({
      erro: error.message
    });
  }
}
