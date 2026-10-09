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

  const cookies = (req.headers.cookie || "").split(";");
  let sessionValue = "";

  for (const cookie of cookies) {
    const trimmed = cookie.trim();

    if (trimmed.startsWith("admin_session=")) {
      try {
        sessionValue = decodeURIComponent(
          trimmed.substring("admin_session=".length)
        );
      } catch (error) {
        sessionValue = "";
      }
      break;
    }
  }

  if (sessionValue !== sessionSecret) {
    return res.status(401).json({
      success: false,
      message: "관리자 로그인이 필요합니다."
    });
  }

  let body = req.body || {};

  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (error) {
      body = {};
    }
  }

  const orderId = body.orderId;
  const orderNumber = body.orderNumber;

  let filter = "";

  if (
    typeof orderId === "number" ||
    (typeof orderId === "string" && /^\d+$/.test(orderId.trim()))
  ) {
    filter = "id=eq." + encodeURIComponent(String(orderId).trim());
  } else if (
    typeof orderId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId.trim())
  ) {
    filter = "id=eq." + encodeURIComponent(orderId.trim());
  } else if (
    typeof orderNumber === "string" &&
    orderNumber.trim() !== ""
  ) {
    filter = "order_number=eq." + encodeURIComponent(orderNumber.trim());
  } else if (
    typeof orderId === "string" &&
    orderId.trim() !== ""
  ) {
    filter = "order_number=eq." + encodeURIComponent(orderId.trim());
  } else {
    return res.status(400).json({
      success: false,
      message: "주문 번호가 올바르지 않습니다."
    });
  }

  try {
    const baseUrl = supabaseUrl.replace(/\/+$/, "");
    const requestUrl = baseUrl + "/rest/v1/orders?" + filter;

    console.log("삭제 요청 orderId:", orderId);
    console.log("삭제 대상 필터:", filter);

    const response = await fetch(requestUrl, {
      method: "DELETE",
      headers: {
        apikey: serviceKey,
        Authorization: "Bearer " + serviceKey,
        Prefer: "return=representation"
      }
    });

    const responseText = await response.text();

    console.log("Supabase HTTP 상태:", response.status);
    console.log("Supabase 응답 내용:", responseText);

    if (!response.ok) {
      return res.status(502).json({
        success: false,
        message: "Supabase 삭제 요청에 실패했습니다."
      });
    }

    let deletedOrders = [];

    try {
      deletedOrders = responseText ? JSON.parse(responseText) : [];
    } catch (error) {
      console.error("삭제 응답 파싱 오류:", responseText);
    }

    if (!Array.isArray(deletedOrders) || deletedOrders.length === 0) {
      return res.status(404).json({
        success: false,
        message: "삭제된 주문이 없습니다. Supabase 필터와 권한을 확인해야 합니다."
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
