export default async function handler(req, res) {
  const storeId = "4882514";
  const nuvemToken = "a687e51c0c454e0f89fe239db9c808d31d2bf15a";

  const response = await fetch(
    `https://api.nuvemshop.com.br/v1/${storeId}/customers?page=1&per_page=200`,
    {
      headers: {
        "Authentication": `bearer ${nuvemToken}`,
        "User-Agent": "Elo Forte App (contato@elofortedigital.com.br)",
        "Content-Type": "application/json"
      }
    }
  );

  const data = await response.json();

  const clientesMarketing = data.filter(c => c.accepts_marketing === true && c.email);

  const compraram = clientesMarketing.filter(c => {
    const total = Number(c.total_spent || 0);
    return total > 0 || c.last_order_id;
  });

  const naoCompraram = clientesMarketing.filter(c => {
    const total = Number(c.total_spent || 0);
    return total === 0 && !c.last_order_id;
  });

  return res.status(200).json({
    total_aceitam_marketing: clientesMarketing.length,
    compraram: compraram.length,
    nao_compraram: naoCompraram.length,
    exemplo_compraram: compraram.slice(0, 5).map(c => ({
      nome: c.name,
      email: c.email,
      total_gasto: c.total_spent,
      ultimo_pedido: c.last_order_id
    })),
    exemplo_nao_compraram: naoCompraram.slice(0, 5).map(c => ({
      nome: c.name,
      email: c.email,
      total_gasto: c.total_spent,
      ultimo_pedido: c.last_order_id
    }))
  });
}
