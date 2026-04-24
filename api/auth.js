export default async function handler(req, res) {
  const { code } = req.query;

  if (!code) {
    return res.status(200).send('Instalação iniciada...');
  }

  const response = await fetch('https://www.nuvemshop.com.br/apps/authorize/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      client_id: '30397',
      client_secret: '4532c203f6a247c5b8270730ec781cc5e219b66b0d1969d1',
      grant_type: 'authorization_code',
      code: code
    })
  });

  const data = await response.json();

  console.log('TOKEN RECEBIDO:', data);

  return res.status(200).send(`
    <h1>Token gerado 🚀</h1>
    <pre>${JSON.stringify(data, null, 2)}</pre>
  `);
}
