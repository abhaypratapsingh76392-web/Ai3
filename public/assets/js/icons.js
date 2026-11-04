/* ============================================================================
   FreeModel VIP — inline SVG icon library (no external requests, crisp at any
   size, fully offline). Every icon is a function of optional size/class.
   ==========================================================================*/
(function (global) {
  const s = (inner, vb = '0 0 24 24', extra = '') =>
    `<svg viewBox="${vb}" fill="none" xmlns="http://www.w3.org/2000/svg" ${extra} aria-hidden="true">${inner}</svg>`;

  /* ---------------------------- UI icons ---------------------------------- */
  const ui = {
    spark: (o = {}) => s(`<path d="M12 2.5l2.1 5.6 5.6 2.1-5.6 2.1L12 17.9l-2.1-5.6-5.6-2.1 5.6-2.1L12 2.5z" fill="currentColor" opacity=".95"/><path d="M18.5 15l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1 1-2.6z" fill="currentColor" opacity=".6"/>`),
    bolt: () => s('<path d="M13 2L4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5z" fill="currentColor"/>'),
    chat: () => s('<path d="M21 11.5a8.4 8.4 0 01-9 8.4 9 9 0 01-3.9-.9L3 21l1.9-4.6A8.4 8.4 0 0112 3a8.4 8.4 0 019 8.5z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>'),
    plus: () => s('<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
    send: () => s('<path d="M4.5 12l15.5-7-6 15.5-2.7-6.3L4.5 12z" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/>'),
    mic: () => s('<rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" stroke-width="1.8"/><path d="M5.5 11.5a6.5 6.5 0 0013 0M12 18v3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'),
    clip: () => s('<path d="M20 11.5l-8 8a5 5 0 01-7-7l8.5-8.5a3.4 3.4 0 014.8 4.8L10 17.3a1.8 1.8 0 01-2.5-2.5l7.8-7.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'),
    history: () => s('<path d="M3.5 12a8.5 8.5 0 1114.9 5.6M3.5 12H7m-3.5 0V8.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M12 7.5V12l3 1.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'),
    settings: () => s('<circle cx="12" cy="12" r="3.1" stroke="currentColor" stroke-width="1.8"/><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.9 2.9l-.1-.1a1.7 1.7 0 00-2.9 1.2v.2a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.6 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.9-2.9l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.6-1.1H2.4a2 2 0 010-4h.1a1.7 1.7 0 001.6-1.1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.9-2.9l.1.1a1.7 1.7 0 001.9.3h.1A1.7 1.7 0 009.7 4v-.2a2 2 0 114 0V4a1.7 1.7 0 001.1 1.6 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.9 2.9l-.1.1a1.7 1.7 0 00-.3 1.9v.1a1.7 1.7 0 001.6 1.1h.2a2 2 0 010 4h-.1a1.7 1.7 0 00-1.6 1.1z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>'),
    user: () => s('<circle cx="12" cy="8.5" r="3.6" stroke="currentColor" stroke-width="1.8"/><path d="M4.5 20c.9-3.6 3.9-5.5 7.5-5.5s6.6 1.9 7.5 5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'),
    logout: () => s('<path d="M15 5V4a2 2 0 00-2-2H6a2 2 0 00-2 2v16a2 2 0 002 2h7a2 2 0 002-2v-1M18 15l3-3-3-3M9.5 12H21" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'),
    menu: () => s('<path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
    close: () => s('<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
    search: () => s('<circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.9"/><path d="M16 16l4.5 4.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>'),
    copy: () => s('<rect x="9" y="9" width="11" height="11" rx="2.5" stroke="currentColor" stroke-width="1.7"/><path d="M15 6.5V5.5A2.5 2.5 0 0012.5 3H6.5A2.5 2.5 0 004 5.5v6A2.5 2.5 0 006.5 14h1" stroke="currentColor" stroke-width="1.7"/>'),
    check: () => s('<path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'),
    trash: () => s('<path d="M4 7h16M9 7V5.2A1.2 1.2 0 0110.2 4h3.6A1.2 1.2 0 0115 5.2V7M6.5 7l.8 12.2A2 2 0 009.3 21h5.4a2 2 0 002-1.8L17.5 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'),
    edit: () => s('<path d="M4 20h4l10.5-10.5a2.5 2.5 0 10-3.5-3.5L4.5 16.5 4 20z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>'),
    pin: () => s('<path d="M9 3h6l-1 6 4 4H6l4-4-1-6z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 13v8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'),
    download: () => s('<path d="M12 3v12m0 0l4.5-4.5M12 15l-4.5-4.5M4 18.5V20a1.5 1.5 0 001.5 1.5h13A1.5 1.5 0 0020 20v-1.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'),
    crown: () => s('<path d="M3 8l4 3 5-6 5 6 4-3-2 11H5L3 8z" fill="currentColor" opacity=".9"/><path d="M5 19h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'),
    coins: () => s('<ellipse cx="12" cy="6.5" rx="7.5" ry="3.2" stroke="currentColor" stroke-width="1.7"/><path d="M4.5 6.5v5c0 1.8 3.4 3.2 7.5 3.2s7.5-1.4 7.5-3.2v-5M4.5 11.5v5c0 1.8 3.4 3.2 7.5 3.2s7.5-1.4 7.5-3.2v-5" stroke="currentColor" stroke-width="1.7"/>'),
    shield: () => s('<path d="M12 3l7.5 3v6c0 4.6-3.2 7.7-7.5 9-4.3-1.3-7.5-4.4-7.5-9V6L12 3z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 12l2.2 2.2L15.5 10" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>'),
    globe: () => s('<circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.7"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.6 5.4 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.4-3.6-8.5S9.6 5.9 12 3.5z" stroke="currentColor" stroke-width="1.5"/>'),
    rocket: () => s('<path d="M14 4c3.5 1 5.5 3 6 6.5L9.5 21 6 20.5 5.5 17 16 6.5" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="14.5" cy="9.5" r="1.6" stroke="currentColor" stroke-width="1.5"/><path d="M5.5 17c-1.5 1.5-1.5 4-1.5 4s2.5 0 4-1.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'),
    refresh: () => s('<path d="M20 11.5a8 8 0 10-2.5 5.8M20 5v6.5h-6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>'),
    thumbUp: () => s('<path d="M7 10.5V21H4.8A1.8 1.8 0 013 19.2v-6.9A1.8 1.8 0 014.8 10.5H7zm0 0l3.6-7.1a2 2 0 013.7.8V9h4.3a2 2 0 011.97 2.34l-1.1 7A2 2 0 0117.5 20H7" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>'),
    thumbDown: () => s('<path d="M17 13.5V3h2.2A1.8 1.8 0 0121 4.8v6.9a1.8 1.8 0 01-1.8 1.8H17zm0 0l-3.6 7.1a2 2 0 01-3.7-.8V15H5.4a2 2 0 01-1.97-2.34l1.1-7A2 2 0 016.5 4H17" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>'),
    key: () => s('<circle cx="8" cy="12" r="4" stroke="currentColor" stroke-width="1.8"/><path d="M12 12h9m-3 0v3.5M15 12v2.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'),
    users: () => s('<circle cx="9" cy="8.5" r="3.4" stroke="currentColor" stroke-width="1.7"/><path d="M2.8 19.5c.7-3 3.1-4.7 6.2-4.7s5.5 1.7 6.2 4.7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M16 5.4a3.2 3.2 0 010 6.2M17.5 14.9c2.2.5 3.6 2.1 4 4.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>'),
    card: () => s('<rect x="2.5" y="5" width="19" height="14" rx="3" stroke="currentColor" stroke-width="1.7"/><path d="M2.5 10h19M6 15h4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>'),
    chart: () => s('<path d="M4 20V4m0 16h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M8 16.5V11m4 5.5V7.5m4 9V13" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'),
    plug: () => s('<path d="M9 3v5m6-5v5M6.5 8h11v3a5.5 5.5 0 01-5.5 5.5A5.5 5.5 0 016.5 11V8zM12 16.5V21" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'),
    layers: () => s('<path d="M12 3l9 5-9 5-9-5 9-5z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M3 12.5l9 5 9-5M3 16.5l9 5 9-5" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>'),
    lock: () => s('<rect x="4.5" y="10" width="15" height="10.5" rx="2.6" stroke="currentColor" stroke-width="1.8"/><path d="M8 10V7.5a4 4 0 018 0V10M12 14.5v2.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'),
    eye: () => s('<path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="2.6" stroke="currentColor" stroke-width="1.7"/>'),
    mail: () => s('<rect x="2.5" y="5" width="19" height="14" rx="3" stroke="currentColor" stroke-width="1.7"/><path d="M3.5 7l8.5 6 8.5-6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>'),
    image: () => s('<rect x="3" y="4.5" width="18" height="15" rx="3" stroke="currentColor" stroke-width="1.7"/><circle cx="8.5" cy="10" r="1.8" stroke="currentColor" stroke-width="1.6"/><path d="M3.5 17l4.8-4.4a2 2 0 012.7 0l6 5.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>'),
    file: () => s('<path d="M14 3H7.5A2.5 2.5 0 005 5.5v13A2.5 2.5 0 007.5 21h9a2.5 2.5 0 002.5-2.5V8l-5-5z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M14 3v5h5" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>'),
    sun: () => s('<circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.8"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'),
    moon: () => s('<path d="M20 14.5A8.5 8.5 0 019.5 4 8.5 8.5 0 1020 14.5z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>'),
    chevron: () => s('<path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'),
    arrowRight: () => s('<path d="M4 12h15m0 0l-6-6m6 6l-6 6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>'),
    info: () => s('<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M12 11v5.5M12 7.8v.4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
    warn: () => s('<path d="M12 3.5l9.5 16.5H2.5L12 3.5z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 9.5v4.5M12 17v.4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
    ok: () => s('<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M8 12.3l2.7 2.7L16.2 9.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'),
    err: () => s('<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
    upgrade: () => s('<path d="M12 20V5m0 0l-6 6m6-6l6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'),
    qr: () => s('<rect x="3" y="3" width="7" height="7" rx="1.6" stroke="currentColor" stroke-width="1.7"/><rect x="14" y="3" width="7" height="7" rx="1.6" stroke="currentColor" stroke-width="1.7"/><rect x="3" y="14" width="7" height="7" rx="1.6" stroke="currentColor" stroke-width="1.7"/><path d="M14 14h3v3h-3zM20 14h1M14 20h3M20 17v4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>'),
    eyeOff: () => s('<path d="M4 4l16 16M9.9 5.2A9.6 9.6 0 0112 5c6 0 9.5 7 9.5 7a17 17 0 01-3.3 4.1M6.4 7.4A17 17 0 002.5 12S6 19 12 19c1 0 1.9-.2 2.7-.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>')
  };

  /* -------------------------- model brand marks --------------------------- */
  const models = {
    claude: () => s('<path d="M12 2.6l2.06 6.3 5.94-2.1-3.5 5.2 5.5 3.1-6.3 1.1 1.9 6-5.6-3.4-3.4 5.4-1.2-6.2-6.1 1.2 3.3-5.3L2 10.6l6.2-1.2L6.5 3l5.5 3.5V2.6z" fill="currentColor" opacity=".92"/>', '0 0 24 24'),
    openai: () => s('<path d="M12 3.2a4.4 4.4 0 00-4.2 3 4.3 4.3 0 00-2.6 6.9 4.4 4.4 0 003 6.4 4.3 4.3 0 006.6-1.3 4.4 4.4 0 003.4-6.7 4.3 4.3 0 00-3-6.4A4.3 4.3 0 0012 3.2z" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/>'),
    gemini: () => s('<path d="M12 2.5l2.2 5.9 5.9 2.2-5.9 2.2-2.2 5.9-2.2-5.9L3.9 10.6l5.9-2.2L12 2.5z" fill="currentColor" opacity=".95"/><path d="M18.6 15.5l1.1 2.9 2.9 1.1-2.9 1.1-1.1 2.9-1.1-2.9-2.9-1.1 2.9-1.1 1.1-2.9z" fill="currentColor" opacity=".55"/>'),
    deepseek: () => s('<path d="M3 13.4c2.9-6.1 6.5-8.6 9.6-8.8 3.8-.2 6.6 2 8.4 5.6-2.9-.6-5.2.1-7 1.9-1.5 1.5-2 3.3-1.8 5.5-1.2-2.6-2.9-4.2-5.3-4.6-1.4-.2-2.7 0-3.9.4z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="15" cy="9.6" r="1.2" fill="currentColor"/>'),
    llama: () => s('<path d="M8 8.5a4 4 0 118 0v2.2a5 5 0 01-1.4 3.4v3.2a2.6 2.6 0 01-5.2 0v-3.2A5 5 0 018 10.7V8.5z" stroke="currentColor" stroke-width="1.6"/><circle cx="10.2" cy="9.6" r="1" fill="currentColor"/><circle cx="13.8" cy="9.6" r="1" fill="currentColor"/><path d="M10.6 13.2h2.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'),
    grok: () => s('<path d="M4 5l16 14M20 5L4 19" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="12" r="8.6" stroke="currentColor" stroke-width="1.4" opacity=".5"/>'),
    mistral: () => s('<path d="M3 6h18v3.5H3V6zm0 5h18v3.5H3V11zm0 5h18v3.5H3V16z" fill="currentColor" opacity=".9"/>'),
    qwen: () => s('<circle cx="11" cy="11" r="6.4" stroke="currentColor" stroke-width="1.9"/><path d="M16 16l4.5 4.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M8.5 11h5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>'),
    meta: () => s('<path d="M3.6 15.5c1.3-6 3.1-9 5.4-9 2 0 3 2.1 3 5.5s1 5.5 3 5.5c2.3 0 4.1-3 5.4-9" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>'),
    cohere: () => s('<circle cx="9" cy="9" r="3" stroke="currentColor" stroke-width="1.7"/><circle cx="15" cy="9" r="3" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="15" r="3" stroke="currentColor" stroke-width="1.7"/>'),
    perplexity: () => s('<path d="M12 3v18M5 7l14 10M19 7L5 17" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" stroke-width="1.5" opacity=".6"/>'),
    spark: () => s('<path d="M12 3l2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4L12 3z" fill="currentColor"/>'),
    google: () => s('<path d="M21.6 12.2c0-.7-.06-1.4-.18-2H12v3.8h5.4a4.6 4.6 0 01-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z" fill="#4285F4"/><path d="M12 22c2.7 0 5-.9 6.6-2.5l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0012 22z" fill="#34A853"/><path d="M6.4 13.9a6 6 0 010-3.8V7.5H3.1a10 10 0 000 9l3.3-2.6z" fill="#FBBC05"/><path d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 003.1 7.5l3.3 2.6C7.2 7.8 9.4 5.9 12 5.9z" fill="#EA4335"/>')
  };

  function modelIcon(name, cls = '') {
    const key = String(name || 'spark').toLowerCase();
    const fn = models[key] || models.spark;
    return `<span class="m-ico ${cls}" data-ico="${key}">${fn()}</span>`;
  }

  function icon(name, cls = '') {
    const fn = ui[name] || models[name] || ui.spark;
    const svg = fn();
    return cls ? svg.replace('<svg', `<svg class="${cls}"`) : svg;
  }

  global.ICONS = { ui, models, icon, modelIcon };
  global.svgIcon = icon;
})(window);
