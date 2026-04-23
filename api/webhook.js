export default function handler(req, res) {
  if (req.method === 'POST') {
    console.log('Webhook recebido:', req.body);
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Método não permitido' });
}
