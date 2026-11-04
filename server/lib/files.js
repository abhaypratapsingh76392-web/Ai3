'use strict';
/* ============================================================================
 * File extraction helpers - turns an uploaded file into text the model can use.
 * Only text-like formats + PDF text streams + images are accepted.
 * ==========================================================================*/
const path = require('path');
const zlib = require('zlib');

const TEXT_EXT = new Set([
  '.txt', '.md', '.markdown', '.csv', '.tsv', '.json', '.xml', '.yml', '.yaml', '.html', '.htm',
  '.css', '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.c', '.h', '.cpp', '.cs', '.go', '.rs',
  '.rb', '.php', '.sh', '.sql', '.log', '.ini', '.conf', '.env', '.toml', '.srt', '.vtt'
]);
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);

const MIME_BY_EXT = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.bmp': 'image/bmp'
};

function ext(name = '') {
  return path.extname(String(name)).toLowerCase();
}

function isImage(name) {
  return IMAGE_EXT.has(ext(name));
}

function isText(name) {
  return TEXT_EXT.has(ext(name));
}

/** Minimal PDF text extraction (works for most text-based PDFs). */
function extractPdf(buffer) {
  const chunks = [];
  const raw = buffer.toString('latin1');
  const re = /stream\r?\n?([\s\S]*?)endstream/g;
  let m;
  while ((m = re.exec(raw))) {
    const body = Buffer.from(m[1], 'latin1');
    let text = '';
    try {
      text = zlib.inflateSync(body).toString('latin1');
    } catch {
      text = body.toString('latin1');
    }
    if (!/BT|Tj|TJ/.test(text)) continue;
    const tokens = text.match(/\((?:\\.|[^\\()])*\)\s*Tj|\[(?:[^\]])*\]\s*TJ/g) || [];
    for (const tok of tokens) {
      const inner = tok.match(/\((?:\\.|[^\\()])*\)/g) || [];
      for (const s of inner) {
        const clean = s
          .slice(1, -1)
          .replace(/\\([nrt])/g, ' ')
          .replace(/\\([()\\])/g, '$1')
          .replace(/\\[0-7]{1,3}/g, ' ');
        chunks.push(clean);
      }
      chunks.push(tok.endsWith('TJ') ? '' : '\n');
    }
  }
  return chunks.join(' ').replace(/[ \t]{2,}/g, ' ').trim();
}

/**
 * @returns {{ ok, kind:'text'|'image', text?, dataUrl?, name, size, mime, note? }}
 */
function extract(file) {
  const name = String(file.originalname || 'file');
  const size = file.size || 0;
  const e = ext(name);

  if (isImage(name)) {
    const mime = MIME_BY_EXT[e] || file.mimetype || 'image/png';
    return {
      ok: true, kind: 'image', name, size, mime,
      dataUrl: `data:${mime};base64,${file.buffer.toString('base64')}`,
      text: ''
    };
  }

  if (e === '.pdf') {
    const text = extractPdf(file.buffer);
    return {
      ok: true, kind: 'text', name, size, mime: 'application/pdf',
      text: text.slice(0, 60000),
      note: text ? '' : 'No selectable text found (scanned PDF).'
    };
  }

  if (isText(name) || (file.mimetype || '').startsWith('text/')) {
    return {
      ok: true, kind: 'text', name, size, mime: file.mimetype || 'text/plain',
      text: file.buffer.toString('utf8').slice(0, 60000)
    };
  }

  return { ok: false, name, size, reason: 'Unsupported file type. Allowed: txt, md, csv, json, code files, pdf, images.' };
}

module.exports = { extract, isImage, isText, ext };
