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

  const sessionCookie = cookies
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith("admin_session="));

  let sessionValue = "";

  try {
    sessionValue = sessionCookie
      ? decodeURIComponent(sessionCookie.slice("admin_session=".length))
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

  const orderId = req.body?.orderId;

  if (
    typeof orderId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)
  ) {
    return res.status(400).json({
      success: false,
      message: "주문 번호가 올바르지 않습니다."
    });
  }

  try {
    const response = await fetch(
      `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}`,
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
      return res.status(502).json({
        success: false,
        message: "주문 삭제에 실패했습니다."
      });
    }

    const deletedOrders = await response.json();

    if (!Array.isArray(deletedOrders) || deletedOrders.length === 0) {
      return res.status(404).json({
        success: false,
        message: "주문을 찾을 수 없습니다."
      });
    }

    return res.status(200).json({
      success: true,
      message: "주문이 삭제되었습니다."
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "서버 오류가 발생했습니다."
    });
  }
};
