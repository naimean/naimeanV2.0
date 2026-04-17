const DEFAULT_WIDTH = 1024;
const DEFAULT_HEIGHT = 1536;
const MAX_DIMENSION = 8192;

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, MAX_DIMENSION);
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function normalizeImageUrl(input, requestUrl) {
  const url = new URL(input, requestUrl);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }
  return url.toString();
}

function buildStackedSvg({ topSrc, bottomSrc, width, height }) {
  const totalHeight = height * 2;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${totalHeight}" viewBox="0 0 ${width} ${totalHeight}">
  <image href="${escapeXml(topSrc)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none" />
  <image href="${escapeXml(bottomSrc)}" x="0" y="${height}" width="${width}" height="${height}" preserveAspectRatio="none" />
</svg>`;
}

export default {
  async fetch(request) {
    const requestUrl = new URL(request.url);

    if (requestUrl.pathname !== '/stitch') {
      return new Response('Not found', { status: 404 });
    }

    const source = requestUrl.searchParams.get('src');
    if (!source) {
      return new Response('Missing "src" query parameter', { status: 400 });
    }

    const topCandidate = requestUrl.searchParams.get('top') ?? source;
    const bottomCandidate = requestUrl.searchParams.get('bottom') ?? source;
    const topSrc = normalizeImageUrl(topCandidate, request.url);
    const bottomSrc = normalizeImageUrl(bottomCandidate, request.url);

    if (!topSrc || !bottomSrc) {
      return new Response('Invalid image URL', { status: 400 });
    }

    const width = toPositiveInt(requestUrl.searchParams.get('width'), DEFAULT_WIDTH);
    const height = toPositiveInt(requestUrl.searchParams.get('height'), DEFAULT_HEIGHT);
    const svg = buildStackedSvg({ topSrc, bottomSrc, width, height });

    return new Response(svg, {
      headers: {
        'content-type': 'image/svg+xml; charset=utf-8',
        'cache-control': 'public, max-age=300, s-maxage=86400'
      }
    });
  }
};
