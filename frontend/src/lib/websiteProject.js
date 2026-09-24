export const CSS_FILE = 'styles.css';
export const JS_FILE = 'script.js';
export const DEFAULT_PAGE = 'index.html';

export const PREVIEW_BRIDGE_SCRIPT = "(function(){document.addEventListener('click',function(e){var a=e.target.closest('a');if(!a)return;var href=a.getAttribute('href');if(!href||/^javascript:/i.test(href))return;if(href.indexOf('http://')===0||href.indexOf('https://')===0||href.indexOf('//')===0){a.setAttribute('target','_blank');a.setAttribute('rel','noopener noreferrer');return;}if(href.charAt(0)==='#')return;e.preventDefault();parent.postMessage({type:'allmodelai-preview-nav',href:href},'*');},true);})();";

const starterBody = {
  [DEFAULT_PAGE]: '<main class="hero">\n  <nav><strong>Nova</strong><a href="#features">Features</a></nav>\n  <section>\n    <p class="eyebrow">BUILT WITH ALLMODEL AI</p>\n    <h1>Turn an idea into a working website.</h1>\n    <p class="intro">Describe your website, generate the files, and refine every detail in the live editor.</p>\n    <button id="action">Start building</button>\n  </section>\n</main>',
  [CSS_FILE]: '* { box-sizing: border-box; }\nbody { margin: 0; font-family: Inter, system-ui, sans-serif; background: #f4f5f7; color: #15171a; }\n.hero { min-height: 100vh; padding: 28px clamp(24px, 6vw, 90px); background: linear-gradient(135deg, #ffffff 0 55%, #dcefe8 55%); }\nnav { display: flex; justify-content: space-between; align-items: center; }\nnav a { color: inherit; text-decoration: none; }\nsection { max-width: 720px; padding-top: 18vh; }\n.eyebrow { color: #087f5b; font-size: 12px; font-weight: 800; letter-spacing: 1.2px; }\nh1 { max-width: 680px; margin: 12px 0 18px; font-size: clamp(42px, 7vw, 82px); line-height: .98; }\n.intro { max-width: 560px; color: #565d66; font-size: 18px; line-height: 1.65; }\nbutton { margin-top: 20px; padding: 13px 18px; border: 0; background: #15171a; color: white; font: inherit; font-weight: 700; cursor: pointer; }',
  [JS_FILE]: "document.querySelector('#action')?.addEventListener('click', () => {\n  document.querySelector('#action').textContent = 'Website is live';\n});",
};

export const starterProject = () => ({ ...starterBody });

export function normalizeProject(raw) {
  if (!raw || typeof raw !== 'object') return starterProject();
  const entries = Object.entries(raw).filter(([, value]) => typeof value === 'string');
  if (!entries.length) return starterProject();

  if (typeof raw.html === 'string' && typeof raw.css === 'string' && typeof raw.js === 'string' && !raw[DEFAULT_PAGE]) {
    return normalizeProject({
      [DEFAULT_PAGE]: raw.html,
      [CSS_FILE]: raw.css,
      [JS_FILE]: raw.js,
    });
  }

  const files = Object.fromEntries(entries);
  const htmlPages = listHtmlPages(files);
  if (!htmlPages.length) return starterProject();
  if (!Object.prototype.hasOwnProperty.call(files, CSS_FILE)) files[CSS_FILE] = starterBody[CSS_FILE];
  if (!Object.prototype.hasOwnProperty.call(files, JS_FILE)) files[JS_FILE] = starterBody[JS_FILE];
  return files;
}

export function listHtmlPages(files) {
  return Object.keys(files)
    .filter((name) => name.endsWith('.html'))
    .sort((a, b) => {
      if (a === DEFAULT_PAGE) return -1;
      if (b === DEFAULT_PAGE) return 1;
      return a.localeCompare(b);
    });
}

export function listProjectFiles(files) {
  const pages = listHtmlPages(files);
  const assets = [CSS_FILE, JS_FILE].filter((name) => typeof files[name] === 'string');
  return [...pages, ...assets];
}

export function fileIcon(name) {
  if (name.endsWith('.html')) return '📄';
  if (name === CSS_FILE) return '🎨';
  if (name === JS_FILE) return '⚡';
  return '📄';
}

export function editorLabel(name) {
  if (name === JS_FILE) return 'script.js';
  if (name === CSS_FILE) return 'styles.css';
  return name;
}

export function resolvePreviewPage(href, currentPage, files) {
  const trimmed = String(href || '').trim();
  if (!trimmed || /^javascript:/i.test(trimmed)) return null;
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('//')) return null;
  if (trimmed.startsWith('#')) return { page: currentPage, hash: trimmed };

  const base = currentPage.includes('/') ? currentPage.replace(/[^/]+$/, '') : '';
  let path = trimmed.split('#')[0].split('?')[0];
  const hash = trimmed.includes('#') ? trimmed.slice(trimmed.indexOf('#')) : '';

  if (path.startsWith('/')) path = path.slice(1);
  if (!path) path = DEFAULT_PAGE;
  if (path.startsWith('./')) path = path.slice(2);
  if (base && !path.includes('/') && !files[path]) {
    const combined = `${base}${path}`.replace(/\/+/g, '/');
    if (files[combined]) path = combined;
  }
  if (!path.endsWith('.html') && !path.includes('.')) path = `${path}.html`;

  if (!Object.prototype.hasOwnProperty.call(files, path)) return null;
  return { page: path, hash };
}

export function buildPreviewDocument(files, page = DEFAULT_PAGE) {
  const htmlPages = listHtmlPages(files);
  const activePage = files[page] ? page : (htmlPages[0] || DEFAULT_PAGE);
  const body = files[activePage] || '';
  const css = files[CSS_FILE] || '';
  const js = files[JS_FILE] || '';
  const csp = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none';";
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body>${body}<script>${js}</script><script>${PREVIEW_BRIDGE_SCRIPT}</script></body></html>`;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(n) {
  const b = new Uint8Array(2);
  b[0] = n & 0xff;
  b[1] = (n >>> 8) & 0xff;
  return b;
}

function u32(n) {
  const b = new Uint8Array(4);
  b[0] = n & 0xff;
  b[1] = (n >>> 8) & 0xff;
  b[2] = (n >>> 16) & 0xff;
  b[3] = (n >>> 24) & 0xff;
  return b;
}

export function createProjectZip(files) {
  const normalized = normalizeProject(files);
  const names = listProjectFiles(normalized);
  const encoder = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;

  names.forEach((name) => {
    const data = encoder.encode(normalized[name] || '');
    const nameBytes = encoder.encode(name);
    const header = new Uint8Array(30 + nameBytes.length);
    header.set([0x50, 0x4b, 0x03, 0x04, 0x0a, 0x00], 0);
    header.set(u16(0), 6);
    header.set(u32(crc32(data)), 14);
    header.set(u32(data.length), 18);
    header.set(u32(data.length), 22);
    header.set(u16(nameBytes.length), 26);
    header.set(nameBytes, 30);
    parts.push(header, data);
    central.push({ nameBytes, data, offset });
    offset += header.length + data.length;
  });

  const centralStart = offset;
  central.forEach(({ nameBytes, data, offset: localOffset }) => {
    const entry = new Uint8Array(46 + nameBytes.length);
    entry.set([0x50, 0x4b, 0x01, 0x02, 0x14, 0x00, 0x0a, 0x00], 0);
    entry.set(u32(crc32(data)), 16);
    entry.set(u32(data.length), 20);
    entry.set(u32(data.length), 24);
    entry.set(u16(nameBytes.length), 28);
    entry.set(u32(localOffset), 42);
    entry.set(nameBytes, 46);
    parts.push(entry);
    offset += entry.length;
  });

  const end = new Uint8Array(22);
  end.set([0x50, 0x4b, 0x05, 0x06], 0);
  end.set(u16(central.length), 8);
  end.set(u16(central.length), 10);
  end.set(u32(offset - centralStart), 12);
  end.set(u32(centralStart), 16);
  parts.push(end);

  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const archive = new Uint8Array(total);
  let cursor = 0;
  parts.forEach((part) => { archive.set(part, cursor); cursor += part.length; });
  return archive;
}

export function downloadProject(files) {
  const normalized = normalizeProject(files);
  const pages = listHtmlPages(normalized);
  const multi = pages.length > 1 || listProjectFiles(normalized).length > 3;

  if (!multi) {
    const doc = buildPreviewDocument(normalized, pages[0] || DEFAULT_PAGE);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([doc], { type: 'text/html' }));
    link.download = 'allmodelai-app.html';
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    return;
  }

  const zip = createProjectZip(normalized);
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }));
  link.download = 'allmodelai-website.zip';
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
