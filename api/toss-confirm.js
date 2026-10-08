export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method Not Allowed'
    });
  }

  try {
    const {
      paymentKey,
      orderId,
      amount
    } = req.body || {};

    if (!paymentKey || !orderId || amount === undefined) {
      return res.status(400).json({
        success: false,
        message: '결제 정보가 부족합니다.'
      });
    }

    const tossSecretKey = process.env.TOSS_SECRET_KEY;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!tossSecretKey) {
      return res.status(500).json({
        success: false,
        message: 'TOSS_SECRET_KEY가 Vercel 환경변수에 없습니다.'
      });
    }

    if (!supabaseUrl) {
      return res.status(500).json({
        success: false,
        message: 'SUPABASE_URL이 Vercel 환경변수에 없습니다.'
      });
    }

    if (!supabaseServiceRoleKey) {
      return res.status(500).json({
        success: false,
        message:
          'SUPABASE_SERVICE_ROLE_KEY가 Vercel 환경변수에 없습니다.'
      });
    }

    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: '결제 금액이 올바르지 않습니다.'
      });
    }

    /*
      ------------------------------------------------
      1. Supabase에서 주문 확인
      ------------------------------------------------
    */

    const orderResponse = await fetch(
      `${supabaseUrl}/rest/v1/orders?order_number=eq.${encodeURIComponent(
        orderId
      )}&select=id,order_number,total_price,status`,
      {
        method: 'GET',
        headers: {
          apikey: supabaseServiceRoleKey,
          Authorization: `Bearer ${supabaseServiceRoleKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!orderResponse.ok) {
      const errorText = await orderResponse.text();

      console.error(
        'Supabase 주문 조회 오류:',
        errorText
      );

      return res.status(500).json({
        success: false,
        message: '주문 정보를 확인하지 못했습니다.'
      });
    }

    const orders = await orderResponse.json();

    if (!orders || orders.length === 0) {
      return res.status(404).json({
        success: false,
        message: '존재하지 않는 주문입니다.'
      });
    }

    const order = orders[0];

    /*
      ------------------------------------------------
      2. 금액 검증
      ------------------------------------------------
    */

    const orderAmount = Number(order.total_price);

    if (
      !Number.isFinite(orderAmount) ||
      orderAmount !== numericAmount
    ) {
      console.error(
        '결제 금액 불일치:',
        {
          orderAmount,
          requestAmount: numericAmount
        }
      );

      return res.status(400).json({
        success: false,
        message:
          '결제 금액이 주문 금액과 일치하지 않습니다.'
      });
    }

    /*
      ------------------------------------------------
      3. 이미 결제 완료된 주문인지 확인
      ------------------------------------------------
    */

    if (order.status === '결제완료') {
      return res.status(200).json({
        success: true,
        alreadyCompleted: true,
        message: '이미 결제 완료된 주문입니다.',
        orderId: order.order_number
      });
    }

    /*
      ------------------------------------------------
      4. 토스 결제 승인
      ------------------------------------------------

      토스 공식 API:
      POST /v1/payments/confirm
    */

    const encodedSecretKey = Buffer
      .from(`${tossSecretKey}:`)
      .toString('base64');

    const tossResponse = await fetch(
      'https://api.tosspayments.com/v1/payments/confirm',
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${encodedSecretKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          paymentKey,
          orderId,
          amount: numericAmount
        })
      }
    );

    const tossData = await tossResponse.json();

    if (!tossResponse.ok) {
      console.error(
        'Toss 결제 승인 실패:',
        tossData
      );

      return res.status(tossResponse.status).json({
        success: false,
        message:
          tossData?.message ||
          '토스 결제 승인에 실패했습니다.',
        code: tossData?.code || null
      });
    }

    /*
      ------------------------------------------------
      5. 실제 승인 상태 확인
      ------------------------------------------------
    */

    if (tossData.status !== 'DONE') {
      return res.status(400).json({
        success: false,
        message:
          '토스 결제가 최종 승인되지 않았습니다.',
        status: tossData.status
      });
    }

    /*
      ------------------------------------------------
      6. Supabase 주문 상태 변경
      ------------------------------------------------
    */

    const updateResponse = await fetch(
      `${supabaseUrl}/rest/v1/orders?order_number=eq.${encodeURIComponent(
        orderId
      )}`,
      {
        method: 'PATCH',
        headers: {
          apikey: supabaseServiceRoleKey,
          Authorization: `Bearer ${supabaseServiceRoleKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({
          status: '결제완료'
        })
      }
    );

    if (!updateResponse.ok) {
      const updateError =
        await updateResponse.text();

      console.error(
        'Supabase 주문 상태 변경 실패:',
        updateError
      );

      return res.status(500).json({
        success: false,
        message:
          '결제는 승인되었지만 주문 상태 변경에 실패했습니다.',
        paymentApproved: true
      });
    }

    /*
      ------------------------------------------------
      7. 성공
      ------------------------------------------------
    */

    return res.status(200).json({
      success: true,
      message: '결제가 완료되었습니다.',
      orderId,
      paymentKey,
      amount: numericAmount,
      status: '결제완료'
    });

  } catch (error) {
    console.error(
      'toss-confirm 오류:',
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error?.message ||
        '결제 승인 처리 중 오류가 발생했습니다.'
    });
  }
}
