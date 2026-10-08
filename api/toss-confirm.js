export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { paymentKey, orderId, amount } = req.body || {};
    const numericAmount = Number(amount);

    if (!paymentKey || !orderId || !Number.isFinite(numericAmount)) {
      return res.status(400).json({ message: 'paymentKey, orderId, amount가 필요합니다.' });
    }

    const secretKey = process.env.TOSS_SECRET_KEY;

    if (!secretKey) {
      return res.status(500).json({ message: 'TOSS_SECRET_KEY가 Vercel 환경변수에 없습니다.' });
    }

    const authorization = Buffer.from(`${secretKey}:`).toString('base64');

    const tossResponse = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${authorization}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        paymentKey,
        orderId,
        amount: numericAmount
      })
    });

    const tossData = await tossResponse.json();

    if (!tossResponse.ok) {
      return res.status(tossResponse.status).json(tossData);
    }

    // 결제 승인 후 Supabase 주문 상태를 결제완료로 변경합니다.
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return res.status(500).json({
        message: '결제는 승인됐지만 Supabase 서버 환경변수가 없습니다. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY를 확인해주세요.',
        payment: tossData
      });
    }

    const updateResponse = await fetch(
      `${supabaseUrl}/rest/v1/orders?order_number=eq.${encodeURIComponent(orderId)}`,
      {
        method: 'PATCH',
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation'
        },
        body: JSON.stringify({
          status: '결제완료'
        })
      }
    );

    const updatedOrders = await updateResponse.json();

    if (!updateResponse.ok) {
      return res.status(500).json({
        message: '결제는 승인됐지만 주문 상태 변경에 실패했습니다.',
        payment: tossData,
        supabaseError: updatedOrders
      });
    }

    return res.status(200).json({
      success: true,
      payment: tossData,
      order: updatedOrders?.[0] || null
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: error.message || '결제 승인 중 오류가 발생했습니다.' });
  }
}
