export default async function handler(req, res) {
  return res.status(200).json({
    status: "ok",
    mensagem: "Rota de envio para o Zoho criada com sucesso."
  });
}
