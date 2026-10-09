```javascript
module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "허용되지 않은 요청입니다."
    });
  }

  const sessionSecret = process.env.ADMIN_SESSION_SECRET;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!sessionSecret || !supabaseUrl || !serviceKey) {
    return res.status(500).json({
      success: false,
      message: "서버 환경변수를 확인해 주세요."
    });
  }

  // 관리자 로그인 확인
  const cookies = (req.headers.cookie || "").split(";");

  const sessionCookie = cookies
    .map(cookie => cookie.trim())
    .find(cookie => cookie.startsWith("admin_session="));

  let sessionValue = "";

  try {
    sessionValue = sessionCookie
      ? decodeURIComponent(
          sessionCookie.slice("admin_session=".length)
        )
      : "";
  } catch {
    sessionValue = "";
  }

  if (sessionValue !== sessionSecret) {
    return res.status(401).json({
      success: false,
      message: "관리자 로그인이 필요합니다."
    });
  }

  // 요청 본문 처리
  let body = req.body;

  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }

  const orderId =
    typeof body?.orderId === "string"
      ? body.orderId.trim()
      : "";

  const orderNumber =
    typeof body?.orderNumber === "string"
      ? body.orderNumber.trim()
      : "";

  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      .test(orderId);

  // 내부 ID 또는 주문번호 중 하나는 필요
  if (!isUuid && !orderNumber) {
    return res.status(400).json({
      success: false,
      message: "주문 ID 또는 주문번호가 필요합니다."
    });
  }

  try {
    const baseUrl =
      `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/orders`;

    // 내부 UUID가 있으면 id로 삭제,
    // 없으면 주문번호로 삭제
    const filter = isUuid
      ? `id=eq.${encodeURIComponent(orderId)}`
      : `order_number=eq.${encodeURIComponent(orderNumber)}`;

    const response = await fetch(
      `${baseUrl}?${filter}`,
      {
        method: "DELETE",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          Prefer: "return=representation"
        }
      }
    );

    if (!response.ok) {
      const errorText = await response.text();

      console.error(
        "주문 삭제 실패:",
        response.status,
        errorText
      );

      return res.status(502).json({
        success: false,
        message: "주문 삭제에 실패했습니다. 서버 로그를 확인해 주세요."
      });
    }

    const deletedOrders = await response.json();

    if (
      !Array.isArray(deletedOrders) ||
      deletedOrders.length === 0
    ) {
      return res.status(404).json({
        success: false,
        message: "주문을 찾을 수 없습니다."
      });
    }

    return res.status(200).json({
      success: true,
      message: "주문이 삭제되었습니다."
    });

  } catch (error) {
    console.error("주문 삭제 서버 오류:", error);

    return res.status(500).json({
      success: false,
      message: "서버 오류가 발생했습니다."
    });
  }
};
```
