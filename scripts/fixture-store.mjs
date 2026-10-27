// Fake store that mimics Jumia's listing markup. Prices shift with ?v= so we can test price history.
import http from 'node:http';
let version = 1;
const PER_PAGE = 6, TOTAL_PAGES = 3;
const page = (q, p, v) => {
  const items = [];
  for (let i = 0; i < PER_PAGE; i++) {
    const n = (p - 1) * PER_PAGE + i + 1;
    const price = 1000 + n * 250 + v * 50;
    const hasOld = n % 2 === 0;
    const oldPrice = Math.round(price * 1.25);
    const pct = Math.min(100, 60 + n * 3);
    items.push(`<article class="prd _fb col c-prd">
      <a class="core" href="/${q.replace(/\s+/g, '-')}-model-${n}-${100 + n}.html?ref=listing">
        <div class="img-c"><img class="img" data-src="/img/${n}.jpg" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></div>
        <h3 class="name">${q} Model ${n}</h3>
        <div class="prc">KSh ${price.toLocaleString('en-US')}</div>
        ${hasOld ? `<div class="old">KSh ${oldPrice.toLocaleString('en-US')}</div><div class="bdg _dsct"><span>-20%</span></div>` : ''}
        <div class="stars _s">4.${n % 10} out of 5<div class="in" style="width:${pct}%"></div></div>
      </a></article>`);
  }
  return `<!doctype html><html><body><main><section class="sku">${items.join('\n')}</section></main></body></html>`;
};
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/__set') { version = Number(url.searchParams.get('v')); res.end(`version ${version}`); return; }
  if (url.pathname === '/catalog/') {
    const p = Number(url.searchParams.get('page') || 1);
    if (p > TOTAL_PAGES) { res.writeHead(200, {'Content-Type':'text/html'}); res.end('<html><body><p>No results</p></body></html>'); return; }
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.end(page(url.searchParams.get('q') || '', p, version));
    return;
  }
  res.writeHead(404); res.end('nope');
}).listen(8088, () => console.log('fixture on 8088'));
