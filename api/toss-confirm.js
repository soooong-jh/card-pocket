export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method Not Allowed"
    });
  }

  try {
    const {
      paymentKey,
      orderId,
      amount
    } = req.body || {};

    // 필수값 확인
    if (!paymentKey || !orderId || amount === undefined) {
      return res.status(400).json({
        success: false,
        message: "결제 승인에 필요한 정보가 없습니다.",
        detail: {
          paymentKey: !!paymentKey,
          orderId: !!orderId,
          amount: amount !== undefined
        }
      });
    }

    const tossSecretKey = process.env.TOSS_SECRET_KEY;

    if (!tossSecretKey) {
      return res.status(500).json({
        success: false,
        message: "Vercel에 TOSS_SECRET_KEY가 설정되어 있지 않습니다."
      });
    }

    // 토스 결제 승인 인증
    // 반드시 SECRET_KEY 뒤에 ':'를 붙여 Base64 인코딩
    const authorization = Buffer
      .from(`${tossSecretKey}:`)
      .toString("base64");

    // 토스 결제 승인
    const tossResponse = await fetch(
      "https://api.tosspayments.com/v1/payments/confirm",
      {
        method: "POST",
        headers: {
          "Authorization": `Basic ${authorization}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          paymentKey,
          orderId,
          amount: Number(amount)
        })
      }
    );

    const tossData = await tossResponse.json();

    // 토스 승인 실패
    if (!tossResponse.ok) {
      console.error("TOSS CONFIRM ERROR:", tossData);

      return res.status(tossResponse.status).json({
        success: false,
        message:
          tossData?.message ||
          "토스 결제 승인에 실패했습니다.",
        code:
          tossData?.code ||
          "TOSS_CONFIRM_ERROR"
      });
    }

    // -----------------------------
    // Supabase 주문 상태 업데이트
    // -----------------------------

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && supabaseServiceRoleKey) {
      try {
        const updateResponse = await fetch(
          `${supabaseUrl}/rest/v1/orders?order_number=eq.${encodeURIComponent(orderId)}`,
          {
            method: "PATCH",
            headers: {
              "apikey": supabaseServiceRoleKey,
              "Authorization":
                `Bearer ${supabaseServiceRoleKey}`,
              "Content-Type": "application/json",
              "Prefer": "return=minimal"
            },
            body: JSON.stringify({
              status: "결제완료"
            })
          }
        );

        if (!updateResponse.ok) {
          const updateError = await updateResponse.text();

          console.error(
            "SUPABASE UPDATE ERROR:",
            updateError
          );
        }
      } catch (supabaseError) {
        console.error(
          "SUPABASE ERROR:",
          supabaseError
        );
      }
    }

    // 최종 성공
    return res.status(200).json({
      success: true,
      message: "결제가 정상적으로 승인되었습니다.",
      payment: tossData
    });

  } catch (error) {
    console.error("PAYMENT CONFIRM SERVER ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "결제 처리 중 서버 오류가 발생했습니다.",
      detail: error?.message || "Unknown error"
    });
  }
}
