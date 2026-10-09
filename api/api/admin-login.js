const crypto = require("crypto");

module.exports = (req, res) => {
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

const password = req.body?.password;

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

const passwordMatches =
supplied.length === expected.length &&
crypto.timingSafeEqual(supplied, expected);

if (!passwordMatches) {
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
};
