/* ============================================================================
   FreeModel VIP — shared client core (api, toasts, modals, markdown, utils)
   ==========================================================================*/
(function (global) {
  'use strict';

  /* ------------------------------- storage -------------------------------- */
  const store = {
    get(k, d = null) {
      try {
        const v = localStorage.getItem('fmv_' + k);
        return v === null ? d : JSON.parse(v);
      } catch {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem('fmv_' + k, JSON.stringify(v));
      } catch {}
    },
    del(k) {
      try {
        localStorage.removeItem('fmv_' + k);
      } catch {}
    }
  };

  /* --------------------------------- api ---------------------------------- */
  let TOKEN = store.get('token', '');

  async function api(path, opts = {}) {
    const headers = Object.assign({}, opts.headers || {});
    if (opts.body !== undefined && !(opts.body instanceof FormData)) {
      headers['content-type'] = 'application/json';
    }
    if (TOKEN) headers.authorization = 'Bearer ' + TOKEN;
    const admin = store.get('adminToken', '');
    if (admin && path.startsWith('/api/admin')) headers['x-admin-token'] = admin;

    let res;
    try {
      res = await fetch('/api' + path, {
        method: opts.method || (opts.body !== undefined ? 'POST' : 'GET'),
        headers,
        body:
          opts.body === undefined || opts.body instanceof FormData
            ? opts.body
            : JSON.stringify(opts.body)
      });
    } catch (e) {
      throw Object.assign(new Error('Network error — check your connection.'), { code: 'network' });
    }

    let data = null;
    const text = await res.text();
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { error: text.slice(0, 200) };
    }

    if (!res.ok) {
      const err = new Error((data && data.error) || `Request failed (${res.status})`);
      err.status = res.status;
      err.code = data && data.code;
      err.data = data;
      if (res.status === 401 && !path.startsWith('/api/admin')) {
        global.dispatchEvent(new CustomEvent('fmv:unauthorised'));
      }
      throw err;
    }
    return data;
  }

  /* -------------------------------- toasts -------------------------------- */
  function toastHost() {
    let h = document.getElementById('toasts');
    if (!h) {
      h = document.createElement('div');
      h.id = 'toasts';
      document.body.appendChild(h);
    }
    return h;
  }

  function toast(msg, type = 'info', ms = 3600) {
    const host = toastHost();
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    const ico =
      type === 'ok' ? 'ok' : type === 'err' ? 'err' : type === 'warn' ? 'warn' : 'info';
    el.innerHTML = `<span class="t-ico">${svgIcon(ico)}</span><div class="grow">${escapeHtml(msg)}</div>`;
    host.appendChild(el);
    const kill = () => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 260);
    };
    el.addEventListener('click', kill);
    setTimeout(kill, ms);
    return el;
  }

  /* -------------------------------- modal --------------------------------- */
  function modal({ title, body, footer, wide, onOpen, closable = true }) {
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `
      <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
        <div class="modal-head">
          <div class="panel-title">${title || ''}</div>
          ${closable ? `<button class="x-btn" data-x>${svgIcon('close')}</button>` : ''}
        </div>
        <div class="modal-body">${body || ''}</div>
        ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
      </div>`;
    document.body.appendChild(bg);
    const close = () => {
      bg.style.opacity = '0';
      setTimeout(() => bg.remove(), 150);
    };
    if (closable) {
      bg.querySelector('[data-x]')?.addEventListener('click', close);
      bg.addEventListener('click', (e) => {
        if (e.target === bg) close();
      });
      document.addEventListener(
        'keydown',
        (e) => {
          if (e.key === 'Escape' && document.body.contains(bg)) close();
        },
        { once: true }
      );
    }
    if (onOpen) onOpen(bg, close);
    return { el: bg, close, body: bg.querySelector('.modal-body') };
  }

  function confirmDialog(text, { title = 'Please confirm', ok = 'Confirm', danger = false } = {}) {
    return new Promise((resolve) => {
      const m = modal({
        title,
        body: `<p class="muted" style="font-size:14.5px">${escapeHtml(text)}</p>`,
        footer: `<button class="btn btn-ghost" data-no>Cancel</button>
                 <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-yes>${escapeHtml(ok)}</button>`,
        onOpen(el, close) {
          el.querySelector('[data-no]').onclick = () => {
            close();
            resolve(false);
          };
          el.querySelector('[data-yes]').onclick = () => {
            close();
            resolve(true);
          };
        }
      });
      m.el.addEventListener('click', (e) => {
        if (e.target === m.el) resolve(false);
      });
    });
  }

  /* ------------------------------- helpers -------------------------------- */
  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/`/g, '&#96;');
  }

  function num(n) {
    n = Number(n || 0);
    if (n >= 1e7) return (n / 1e7).toFixed(n % 1e7 === 0 ? 0 : 1) + 'Cr';
    if (n >= 1e5) return (n / 1e5).toFixed(n % 1e5 === 0 ? 0 : 1) + 'L';
    if (n >= 1000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'k';
    return String(Math.round(n));
  }

  function money(n, cur = '₹') {
    const v = Number(n || 0);
    return cur + v.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  }

  function timeAgo(ts) {
    if (!ts) return '—';
    const d = Date.now() - ts;
    const m = Math.floor(d / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + 'm ago';
    const h = Math.floor(m / 60);
    if (h < 24) return h + 'h ago';
    const days = Math.floor(h / 24);
    if (days < 30) return days + 'd ago';
    return new Date(ts).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
  }

  function fmtDate(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }

  const debounce = (fn, ms = 250) => {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  };

  const throttle = (fn, ms = 120) => {
    let last = 0, timer = null, lastArgs;
    return (...a) => {
      lastArgs = a;
      const now = Date.now();
      if (now - last >= ms) {
        last = now;
        fn(...a);
      } else if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          last = Date.now();
          fn(...lastArgs);
        }, ms - (now - last));
      }
    };
  };

  /* ------------------------------ markdown -------------------------------- */
  /* Tiny, dependency-free markdown renderer. Everything is escaped first so
     model output can never inject HTML/scripts.                              */
  function markdown(src) {
    if (!src) return '';
    const blocks = [];
    let text = String(src).replace(/\r\n/g, '\n');

    // fenced code blocks -> placeholders
    text = text.replace(/```([a-zA-Z0-9+#._-]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      const i = blocks.push({ lang: lang || 'code', code: code.replace(/\n$/, '') }) - 1;
      return `\u0000CODE${i}\u0000`;
    });

    text = escapeHtml(text);

    // headings
    text = text.replace(/^###### (.*)$/gm, '<h6>$1</h6>')
      .replace(/^##### (.*)$/gm, '<h5>$1</h5>')
      .replace(/^#### (.*)$/gm, '<h4>$1</h4>')
      .replace(/^### (.*)$/gm, '<h3>$1</h3>')
      .replace(/^## (.*)$/gm, '<h2>$1</h2>')
      .replace(/^# (.*)$/gm, '<h1>$1</h1>');

    // blockquote
    text = text.replace(/^&gt; (.*)$/gm, '<blockquote>$1</blockquote>');

    // lists
    text = text.replace(/(?:^|\n)((?:[-*+] .*(?:\n|$))+)/g, (m, list) => {
      const items = list.trim().split('\n').map((l) => `<li>${l.replace(/^[-*+] /, '')}</li>`).join('');
      return `\n<ul>${items}</ul>\n`;
    });
    text = text.replace(/(?:^|\n)((?:\d+\. .*(?:\n|$))+)/g, (m, list) => {
      const items = list.trim().split('\n').map((l) => `<li>${l.replace(/^\d+\. /, '')}</li>`).join('');
      return `\n<ol>${items}</ol>\n`;
    });

    // inline
    text = text
      .replace(/`([^`\n]+)`/g, '<code class="inl">$1</code>')
      .replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/~~([^~]+)~~/g, '<del>$1</del>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer nofollow">$1</a>')
      .replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer nofollow">$2</a>');

    // tables (simple)
    text = text.replace(/((?:^\|.*\|\s*$\n?)+)/gm, (tbl) => {
      const rows = tbl.trim().split('\n').filter(Boolean);
      if (rows.length < 2 || !/^\|[\s:|-]+\|$/.test(rows[1].trim())) return tbl;
      const cells = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(rows[0]).map((c) => `<th>${c}</th>`).join('');
      const rest = rows.slice(2).map((r) => `<tr>${cells(r).map((c) => `<td>${c}</td>`).join('')}</tr>`).join('');
      return `<table class="md-table"><thead><tr>${head}</tr></thead><tbody>${rest}</tbody></table>`;
    });

    // paragraphs
    text = text
      .split(/\n{2,}/)
      .map((chunk) => {
        const t = chunk.trim();
        if (!t) return '';
        if (/^<(h\d|ul|ol|blockquote|table|pre|div)/.test(t)) return t;
        if (/^\u0000CODE\d+\u0000$/.test(t)) return t;
        return `<p>${t.replace(/\n/g, '<br>')}</p>`;
      })
      .join('\n');

    // restore code blocks
    text = text.replace(/\u0000CODE(\d+)\u0000/g, (_, i) => {
      const b = blocks[Number(i)];
      return `<div class="code-block"><div class="code-head"><span>${escapeHtml(b.lang)}</span>
        <button class="code-copy" data-code-copy>${svgIcon('copy')}<span>Copy</span></button></div>
        <pre><code>${escapeHtml(b.code)}</code></pre></div>`;
    });

    return text;
  }

  /* copy buttons inside rendered markdown */
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-code-copy]');
    if (!btn) return;
    const code = btn.closest('.code-block')?.querySelector('code')?.textContent || '';
    copyText(code).then(() => {
      btn.querySelector('span').textContent = 'Copied';
      setTimeout(() => (btn.querySelector('span').textContent = 'Copy'), 1500);
    });
  });

  async function copyText(t) {
    try {
      await navigator.clipboard.writeText(t);
      return true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = t;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      return true;
    }
  }

  /* ------------------------------ reveal --------------------------------- */
  function observeReveals(root = document) {
    const els = root.querySelectorAll('.fade-up:not(.in)');
    if (!('IntersectionObserver' in window)) {
      els.forEach((e) => e.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add('in');
            io.unobserve(en.target);
          }
        });
      },
      { threshold: 0.14, rootMargin: '0px 0px -40px 0px' }
    );
    els.forEach((e, i) => {
      e.style.transitionDelay = (i % 8) * 55 + 'ms';
      io.observe(e);
    });
  }

  /* ------------------------------ buttons -------------------------------- */
  function busy(btn, on = true) {
    if (!btn) return;
    if (on) {
      btn.dataset.html = btn.innerHTML;
      btn.classList.add('is-loading');
      btn.disabled = true;
      btn.innerHTML = `<span class="spin"></span><span>Please wait…</span>`;
    } else {
      btn.classList.remove('is-loading');
      btn.disabled = false;
      if (btn.dataset.html) btn.innerHTML = btn.dataset.html;
    }
  }

  /* ------------------------- auth state helpers -------------------------- */
  const session = {
    get token() {
      return TOKEN;
    },
    set token(v) {
      TOKEN = v || '';
      if (v) store.set('token', v);
      else store.del('token');
    },
    user: null,
    settings: null,
    models: [],
    plans: [],
    firebase: null,
    adminPath: 'admin'
  };

  function setToken(t) {
    session.token = t;
  }

  global.APP = {
    api,
    store,
    session,
    setToken,
    toast,
    modal,
    confirm: confirmDialog,
    escapeHtml,
    escapeAttr,
    num,
    money,
    timeAgo,
    fmtDate,
    debounce,
    throttle,
    markdown,
    copyText,
    observeReveals,
    busy
  };
})(window);
