
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "허용되지 않은 요청입니다."
    });
  }

  try {
    const { paymentKey, orderId, amount } = req.body || {};

    // 1. 입력값 검증
    const requestedAmount = Number(amount);

    if (
      typeof paymentKey !== "string" ||
      !paymentKey.trim() ||
      typeof orderId !== "string" ||
      !orderId.trim() ||
      amount === undefined ||
      amount === null ||
      amount === "" ||
      !Number.isSafeInteger(requestedAmount) ||
      requestedAmount <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "결제 요청 정보가 올바르지 않습니다."
      });
    }

    // 2. 서버 비밀키 확인
    const tossSecretKey = process.env.TOSS_SECRET_KEY;
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!tossSecretKey || !supabaseUrl || !serviceKey) {
      console.error("필수 서버 환경변수가 누락되었습니다.");

      return res.status(500).json({
        success: false,
        message: "서버 설정을 확인해 주세요."
      });
    }

    // 3. Supabase에 저장된 실제 주문 조회
    const orderUrl = new URL(
      `${supabaseUrl}/rest/v1/orders`
    );

    orderUrl.searchParams.set(
      "order_number",
      `eq.${orderId}`
    );
    orderUrl.searchParams.set(
      "select",
      "order_number,total_price,status"
    );
    orderUrl.searchParams.set("limit", "2");

    const orderResponse = await fetch(orderUrl.toString(), {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`
      }
    });

    if (!orderResponse.ok) {
      console.error(
        "주문 조회 실패:",
        await orderResponse.text()
      );

      return res.status(500).json({
        success: false,
        message: "주문 정보를 확인하지 못했습니다."
      });
    }

    const orders = await orderResponse.json();

    // 주문번호가 정확히 하나 존재해야 함
    if (!Array.isArray(orders) || orders.length !== 1) {
      return res.status(404).json({
        success: false,
        message: "주문 정보를 찾을 수 없습니다."
      });
    }

    const order = orders[0];
    const storedAmount = Number(order.total_price);

    // 4. DB 금액과 결제 요청 금액 비교
    if (
      !Number.isSafeInteger(storedAmount) ||
      storedAmount <= 0 ||
      storedAmount !== requestedAmount
    ) {
      return res.status(400).json({
        success: false,
        message: "주문 금액이 일치하지 않습니다."
      });
    }

    // 이미 결제된 주문은 재승인하지 않음
    if (order.status !== "결제대기") {
      return res.status(409).json({
        success: false,
        message: "결제 대기 상태의 주문이 아닙니다."
      });
    }

    // 5. 토스 결제 승인
    const authorization = Buffer
      .from(`${tossSecretKey}:`)
      .toString("base64");

    const tossResponse = await fetch(
      "https://api.tosspayments.com/v1/payments/confirm",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${authorization}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          paymentKey,
          orderId,
          amount: storedAmount
        })
      }
    );

    const tossData = await tossResponse.json();

    if (!tossResponse.ok) {
      console.error(
        "토스 결제 승인 실패:",
        tossData?.code || "UNKNOWN"
      );

      return res.status(tossResponse.status).json({
        success: false,
        message:
          tossData?.message ||
          "토스 결제 승인에 실패했습니다.",
        code: tossData?.code || "TOSS_CONFIRM_ERROR"
      });
    }

    // 6. 결제 승인 후 주문 상태 변경
    const updateUrl = new URL(
      `${supabaseUrl}/rest/v1/orders`
    );

    updateUrl.searchParams.set(
      "order_number",
      `eq.${orderId}`
    );
    updateUrl.searchParams.set(
      "status",
      "eq.결제대기"
    );

    try {
      const updateResponse = await fetch(
        updateUrl.toString(),
        {
          method: "PATCH",
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
            Prefer: "return=representation"
          },
          body: JSON.stringify({
            status: "결제완료"
          })
        }
      );

      if (!updateResponse.ok) {
        console.error(
          "결제 후 주문 상태 업데이트 실패:",
          await updateResponse.text()
        );
      } else {
        const updatedOrders = await updateResponse.json();

        if (!Array.isArray(updatedOrders) ||
            updatedOrders.length !== 1) {
          console.error(
            "결제는 승인됐지만 주문 상태 변경 결과를 확인하지 못했습니다."
          );
        }
      }
    } catch (updateError) {
      console.error(
        "결제 후 주문 상태 업데이트 오류:",
        updateError
      );
    }

    // 토스 승인 자체는 성공한 상태
    return res.status(200).json({
      success: true,
      message: "결제가 정상적으로 승인되었습니다."
    });

  } catch (error) {
    console.error(
      "결제 승인 서버 오류:",
      error?.message || "Unknown error"
    );

    return res.status(500).json({
      success: false,
      message: "결제 처리 중 서버 오류가 발생했습니다."
    });
  }
}
