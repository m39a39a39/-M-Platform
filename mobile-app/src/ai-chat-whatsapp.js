const WHATSAPP_HOSTS = new Set([
  'wa.me', 'www.wa.me', 'api.whatsapp.com', 'web.whatsapp.com',
  'chat.whatsapp.com', 'whatsapp.com', 'www.whatsapp.com'
]);

function whatsappUrl(raw) {
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol) || !WHATSAPP_HOSTS.has(url.hostname.toLowerCase()) || url.username || url.password) return '';
    url.protocol = 'https:';
    return url.href;
  } catch {
    return '';
  }
}

// Return original text with WhatsApp URLs removed; links are rendered as buttons separately.
export function extractWhatsappLinks(content) {
  const links = [];
  const seen = new Set();
  const collect = raw => {
    const href = whatsappUrl(raw);
    if (!href) return false;
    if (!seen.has(href)) {
      seen.add(href);
      links.push(href);
    }
    return true;
  };
  let text = String(content ?? '');
  text = text.replace(/\[[^\]\r\n]+\]\((https?:\/\/[^\s)]+)\)/gi, (match, href) => collect(href) ? '' : match);
  text = text.replace(/https?:\/\/[^\s<>"']+/gi, match => {
    const raw = match.replace(/[),.;!?:\]\}،؛。]+$/u, '');
    return collect(raw) ? match.slice(raw.length) : match;
  });
  return {
    text: links.length ? text.replace(/[ \t]+\r?\n/g, '\n').trim() : text,
    links
  };
}
