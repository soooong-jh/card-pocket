
const crypto = require("crypto");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "허용되지 않은 요청입니다."
    });
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  const sessionSecret = process.env.ADMIN_SESSION_SECRET;

  if (!adminPassword || !sessionSecret) {
    return res.status(500).json({
      success: false,
      message: "관리자 환경변수가 설정되지 않았습니다."
    });
  }

  try {
    let body = req.body;

    if (typeof body === "string") {
      body = JSON.parse(body);
    }

    if (!body && req.on) {
      body = await new Promise((resolve, reject) => {
        let raw = "";
        req.on("data", chunk => {
          raw += chunk;
          if (raw.length > 4096) {
            reject(new Error("요청이 너무 큽니다."));
            req.destroy();
          }
        });
        req.on("end", () => {
          try {
            resolve(JSON.parse(raw || "{}"));
          } catch (error) {
            reject(error);
          }
        });
        req.on("error", reject);
      });
    }

    const password = body?.password;

    if (
      typeof password !== "string" ||
      Buffer.byteLength(password, "utf8") > 1024
    ) {
      return res.status(400).json({
        success: false,
        message: "비밀번호를 확인해 주세요."
      });
    }

    const supplied = Buffer.from(password);
    const expected = Buffer.from(adminPassword);

    const matches =
      supplied.length === expected.length &&
      crypto.timingSafeEqual(supplied, expected);

    if (!matches) {
      return res.status(401).json({
        success: false,
        message: "비밀번호가 올바르지 않습니다."
      });
    }

    res.setHeader("Cache-Control", "no-store");
    res.setHeader(
      "Set-Cookie",
      `admin_session=${encodeURIComponent(sessionSecret)}; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=28800`
    );

    return res.status(200).json({
      success: true,
      message: "관리자 인증에 성공했습니다."
    });
  } catch (error) {
    console.error("관리자 로그인 요청 처리 오류:", error.message);

    return res.status(400).json({
      success: false,
      message: "로그인 요청을 처리하지 못했습니다. 다시 시도해 주세요."
    });
  }
};
