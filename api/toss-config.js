export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    return res.status(405).json({
      message: 'Method Not Allowed'
    });
  }

  const clientKey = process.env.TOSS_CLIENT_KEY;

  if (!clientKey) {
    return res.status(500).json({
      message: 'TOSS_CLIENT_KEY가 Vercel 환경변수에 없습니다.'
    });
  }

  return res.status(200).json({
    clientKey
  });
}
