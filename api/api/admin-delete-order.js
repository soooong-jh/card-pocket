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
    .map(function (cookie) {
      return cookie.trim();
    })
    .find(function (cookie) {
      return cookie.indexOf("admin_session=") === 0;
    });

  let sessionValue = "";

  try {
    if (sessionCookie) {
      sessionValue = decodeURIComponent(
        sessionCookie.substring("admin_session=".length)
      );
    }
  } catch (error) {
    sessionValue = "";
  }

  if (sessionValue !== sessionSecret) {
    return res.status(401).json({
      success: false,
      message: "관리자 로그인이 필요합니다."
    });
  }

  // 요청 내용 확인
  let body = req.body;

  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (error) {
      body = {};
    }
  }

  const orderId = body && body.orderId;
  const orderNumber = body && body.orderNumber;

  let filter = "";

  // UUID 형식의 주문 ID
  if (
    typeof orderId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)
  ) {
    filter = "id=eq." + encodeURIComponent(orderId);
  } else if (
    typeof orderNumber === "string" &&
    orderNumber.trim() !== ""
  ) {
    filter =
      "order_number=eq." +
      encodeURIComponent(orderNumber.trim());
  } else if (
    typeof orderId === "string" &&
    orderId.trim() !== ""
  ) {
    filter =
      "order_number=eq." +
      encodeURIComponent(orderId.trim());
  } else {
    return res.status(400).json({
      success: false,
      message: "주문 번호가 올바르지 않습니다."
    });
  }

  try {
    const baseUrl = supabaseUrl.replace(/\/+$/, "");
    const requestUrl =
      baseUrl + "/rest/v1/orders?" + filter;

    const response = await fetch(requestUrl, {
      method: "DELETE",
      headers: {
        apikey: serviceKey,
        Authorization: "Bearer " + serviceKey,
        Prefer: "return=representation"
      }
    });

    if (!response.ok) {
      const errorText = await response.text();

      console.error(
        "주문 삭제 실패:",
        response.status,
        errorText
      );

      return res.status(502).json({
        success: false,
        message: "주문 삭제에 실패했습니다."
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
