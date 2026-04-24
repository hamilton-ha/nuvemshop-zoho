export default function handler(req, res) {
  const { code, store_id } = req.query;

  console.log('Query recebida:', req.query);

  if (!code) {
    return res.status(200).send('Instalação iniciada, aguardando código...');
  }

  return res.status(200).send(`
    <h1>Integração funcionando 🚀</h1>
    <p>Code: ${code}</p>
    <p>Store ID: ${store_id}</p>
  `);
}
