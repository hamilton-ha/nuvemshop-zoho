export default function handler(req, res) {
  const { code } = req.query;

  console.log('Código recebido da Nuvemshop:', code);

  if (!code) {
    return res.status(400).send('Nenhum código recebido da Nuvemshop.');
  }

  return res.status(200).send('Código recebido com sucesso. Próximo passo: trocar por token.');
}
