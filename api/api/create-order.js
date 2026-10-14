
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function json(res, status, data) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(data);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { message: "허용되지 않은 요청입니다." });
  }

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json(res, 500, { message: "서버 설정을 확인해 주세요." });
  }

  try {
    const { buyer_name, buyer_phone, buyer_address, items } = req.body || {};

    if (
      typeof buyer_name !== "string" ||
      !buyer_name.trim() ||
      buyer_name.length > 40 ||
      typeof buyer_phone !== "string" ||
      !buyer_phone.trim() ||
      buyer_phone.length > 30 ||
      typeof buyer_address !== "string" ||
      !buyer_address.trim() ||
      buyer_address.length > 300
    ) {
      return json(res, 400, { message: "주문자 정보를 확인해 주세요." });
    }

    if (!Array.isArray(items) || items.length < 1 || items.length > 50) {
      return json(res, 400, { message: "주문 상품을 확인해 주세요." });
    }

    const quantities = new Map();

    for (const item of items) {
      const id = item?.id;
      const quantity = Number(item?.quantity);

      if (
        (typeof id !== "string" && typeof id !== "number") ||
        !String(id).trim() ||
        !Number.isSafeInteger(quantity) ||
        quantity < 1 ||
        quantity > 20
      ) {
        return json(res, 400, { message: "상품 수량이 올바르지 않습니다." });
      }

      const key = String(id);
      quantities.set(key, (quantities.get(key) || 0) + quantity);

      if (quantities.get(key) > 20) {
        return json(res, 400, { message: "상품 수량을 확인해 주세요." });
      }
    }

    const ids = [...quantities.keys()];

    const productResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/products?select=id,name,price,image_url&id=in.(${ids.map(id => encodeURIComponent(id)).join(",")})`,
      {
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`
        }
      }
    );

    if (!productResponse.ok) {
      return json(res, 500, { message: "상품 정보를 확인하지 못했습니다." });
    }

    const products = await productResponse.json();

    if (!Array.isArray(products) || products.length !== ids.length) {
      return json(res, 400, { message: "판매 중인 상품을 다시 확인해 주세요." });
    }

    const productMap = new Map(products.map(p => [String(p.id), p]));
    const canonicalItems = [];
    let total = 0;

    for (const id of ids) {
      const product = productMap.get(id);
      const quantity = quantities.get(id);
      const price = Number(product?.price);

      if (
        !product ||
        !Number.isSafeInteger(price) ||
        price <= 0
      ) {
        return json(res, 400, { message: "상품 가격을 확인해 주세요." });
      }

      total += price * quantity;

      if (!Number.isSafeInteger(total) || total <= 0) {
        return json(res, 400, { message: "주문 금액이 올바르지 않습니다." });
      }

      canonicalItems.push({
        id: product.id,
        name: product.name,
        price,
        image_url: product.image_url || "",
        quantity
      });
    }

    const orderNumber =
      "CP" +
      new Date().toISOString().replace(/\D/g, "").slice(0, 14) +
      "-" +
      cryptoRandom();

    const orderResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/orders`,
      {
        method: "POST",
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        },
        body: JSON.stringify({
          order_number: orderNumber,
          buyer_name: buyer_name.trim(),
          buyer_phone: buyer_phone.trim(),
          buyer_address: buyer_address.trim(),
          items: canonicalItems,
          total_price: total,
          status: "결제대기"
        })
      }
    );

    if (!orderResponse.ok) {
      return json(res, 500, { message: "주문을 저장하지 못했습니다." });
    }

    return json(res, 200, {
      success: true,
      orderNumber,
      total,
      items: canonicalItems
    });
  } catch (error) {
    console.error("create-order error:", error);
    return json(res, 500, { message: "주문 처리 중 오류가 발생했습니다." });
  }
}

function cryptoRandom() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}
