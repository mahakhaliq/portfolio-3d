const recentSubmissions = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_SUBMISSIONS = 5;

function cleanLine(value) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim()
    : '';
}

function cleanMessage(value) {
  return typeof value === 'string'
    ? value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim()
    : '';
}

function reply(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(payload));
}

export default async function contactHandler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') return reply(res, 405, { error: 'POST required.' });

  const origin = req.headers.origin;
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.host) return reply(res, 403, { error: 'Request origin was rejected.' });
    } catch {
      return reply(res, 403, { error: 'Request origin was rejected.' });
    }
  }
  if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) {
    return reply(res, 415, { error: 'Send the form as JSON.' });
  }
  const size = Number(req.headers['content-length'] || 0);
  if (size > 12_000) return reply(res, 413, { error: 'Message is too large.' });

  let data = req.body;
  if (typeof data === 'string') {
    if (Buffer.byteLength(data, 'utf8') > 12_000) return reply(res, 413, { error: 'Message is too large.' });
    try { data = JSON.parse(data); } catch { return reply(res, 400, { error: 'The form data could not be read.' }); }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return reply(res, 400, { error: 'The form data could not be read.' });
  }
  if (Buffer.byteLength(JSON.stringify(data), 'utf8') > 12_000) {
    return reply(res, 413, { error: 'Message is too large.' });
  }

  // Quietly accept honeypot submissions so automated senders do not learn the trap.
  if (typeof data.website === 'string' && data.website.trim()) return reply(res, 200, { ok: true });

  const name = cleanLine(data.name);
  const email = cleanLine(data.email);
  const subject = cleanLine(data.subject);
  const message = cleanMessage(data.message);
  const emailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/;
  if (!name || name.length > 80) return reply(res, 400, { error: 'Enter your name (up to 80 characters).' });
  if (!email || email.length > 254 || !emailPattern.test(email)) return reply(res, 400, { error: 'Enter a valid email address.' });
  if (!subject || subject.length > 120) return reply(res, 400, { error: 'Enter a subject (up to 120 characters).' });
  if (!message || message.length > 5_000) return reply(res, 400, { error: 'Enter a message (up to 5,000 characters).' });

  const now = Date.now();
  for (const [key, value] of recentSubmissions) if (now - value.startedAt >= WINDOW_MS) recentSubmissions.delete(key);
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const bucket = recentSubmissions.get(ip);
  if (bucket && now - bucket.startedAt < WINDOW_MS && bucket.count >= MAX_SUBMISSIONS) {
    return reply(res, 429, { error: 'Too many messages from this connection. Please try again in a few minutes.' });
  }
  recentSubmissions.set(ip, bucket && now - bucket.startedAt < WINDOW_MS
    ? { startedAt: bucket.startedAt, count: bucket.count + 1 }
    : { startedAt: now, count: 1 });
  while (recentSubmissions.size > 1_000) recentSubmissions.delete(recentSubmissions.keys().next().value);

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return reply(res, 503, { error: 'Email delivery is not configured yet. Please use the direct email link.' });
  const recipient = process.env.CONTACT_TO_EMAIL || 'mahakhaliq151@gmail.com';
  const sender = process.env.CONTACT_FROM_EMAIL || 'Maha Khaliq Portfolio <onboarding@resend.dev>';
  let delivery;
  try {
    delivery = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(12_000),
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: sender,
        to: [recipient],
        reply_to: email,
        subject: `Portfolio message: ${subject}`,
        text: `New portfolio contact message\n\nName: ${name}\nEmail: ${email}\nSubject: ${subject}\n\nMessage:\n${message}`,
      }),
    });
  } catch {
    return reply(res, 502, { error: 'Email delivery failed temporarily. Please try again or use the direct email link.' });
  }
  if (!delivery.ok) {
    // Keep provider details and credentials out of the public response.
    return reply(res, 502, { error: 'Email delivery failed. Please try again or use the direct email link.' });
  }
  return reply(res, 200, { ok: true });
}
