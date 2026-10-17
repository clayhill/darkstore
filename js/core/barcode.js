/* GS1 barcodes: EAN-13 / GTIN-13 for trade items, GS1-128 (Code 128 + FNC1)
 * for SSCC shipping labels (AI 00) and GRAI returnable assets (AI 8003, used
 * for storage bins and order totes). Renders to SVG strings. */
(function (WS) {
  'use strict';
  const B = (WS.Barcode = {});

  // GS1 mod-10 check digit: weights 3,1,3,1… from the rightmost data digit
  B.checkDigit = function (digits) {
    let sum = 0;
    for (let i = digits.length - 1, w = 3; i >= 0; i--, w = 4 - w) sum += (+digits[i]) * w;
    return String((10 - (sum % 10)) % 10);
  };
  B.withCheck = (digits) => digits + B.checkDigit(digits);
  B.isValidGTIN = (s) => /^\d{8}$|^\d{12,14}$/.test(s) && B.checkDigit(s.slice(0, -1)) === s.slice(-1);
  B.isValidSSCC = (s) => /^\d{18}$/.test(s) && B.checkDigit(s.slice(0, 17)) === s[17];

  B.COMPANY_PREFIX = '9521234'; // 7-digit GS1 company prefix; 952 is reserved by GS1 for demonstrations and examples
  B.makeGTIN13 = (itemRef) => B.withCheck(B.COMPANY_PREFIX + String(itemRef).padStart(5, '0'));
  // SSCC-18: extension digit + company prefix + serial reference (9 digits here) + check
  B.makeSSCC = (serial, ext = 3) => B.withCheck(String(ext) + B.COMPANY_PREFIX + String(serial).padStart(9, '0'));
  // GRAI: 0 + company prefix + asset type (5) + check, followed by a serial number
  B.makeGRAI = (assetType, serial) => '0' + B.withCheck(B.COMPANY_PREFIX + String(assetType).padStart(5, '0')) + String(serial);

  // ---------- EAN-13 ----------
  const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
  const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
  const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
  const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

  B.ean13Modules = function (code) {
    const p = PARITY[+code[0]];
    let m = '101';
    for (let i = 1; i <= 6; i++) m += (p[i - 1] === 'L' ? L : G)[+code[i]];
    m += '01010';
    for (let i = 7; i <= 12; i++) m += R[+code[i]];
    return m + '101';
  };

  B.ean13SVG = function (code, opts = {}) {
    const h = opts.height || 46, mw = opts.module || 1.6, fg = opts.color || '#111';
    const mods = B.ean13Modules(code);
    const qz = 11 * mw, w = mods.length * mw + qz * 2;
    const guard = (i) => i < 3 || (i >= 45 && i < 50) || i >= 92;
    let rects = '';
    for (let i = 0; i < mods.length; i++) {
      if (mods[i] !== '1') continue;
      let j = i; while (j + 1 < mods.length && mods[j + 1] === '1' && guard(j + 1) === guard(i)) j++;
      rects += `<rect x="${(qz + i * mw).toFixed(2)}" y="0" width="${((j - i + 1) * mw).toFixed(2)}" height="${guard(i) ? h + 6 : h}"/>`;
      i = j;
    }
    const fs = 9 * mw / 1.6 * 1.2;
    const txt = `<text x="${qz - 3 * mw}" y="${h + 6 + fs * 0.6}" text-anchor="end">${code[0]}</text>` +
      `<text x="${qz + 24 * mw}" y="${h + 6 + fs * 0.6}" text-anchor="middle" textLength="${38 * mw}">${code.slice(1, 7)}</text>` +
      `<text x="${qz + 71 * mw}" y="${h + 6 + fs * 0.6}" text-anchor="middle" textLength="${38 * mw}">${code.slice(7)}</text>`;
    return `<svg class="barcode" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(1)} ${h + 8 + fs}" width="${w.toFixed(0)}" height="${(h + 8 + fs).toFixed(0)}">` +
      `<rect width="100%" height="100%" fill="#fff"/><g fill="${fg}">${rects}</g>` +
      `<g fill="${fg}" font-family="ui-monospace,Menlo,monospace" font-size="${fs}">${txt}</g></svg>`;
  };

  // ---------- Code 128 / GS1-128 ----------
  const C128 = ['212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412', '211214', '211232', '2331112'];
  const FNC1 = 102, CODE_B = 100, CODE_C = 99, START_B = 104, START_C = 105, STOP = 106;
  const GS = '\x1d';

  // Encodes text into Code 128 symbol values. GS (\x1d) in the text becomes FNC1.
  B.code128Values = function (text, gs1) {
    const digitRun = (k) => { let n = 0; while (k + n < text.length && text.charCodeAt(k + n) >= 48 && text.charCodeAt(k + n) <= 57) n++; return n; };
    const out = [];
    let set;
    if (gs1 || digitRun(0) >= 4) { set = 'C'; out.push(START_C); } else { set = 'B'; out.push(START_B); }
    if (gs1) out.push(FNC1);
    let i = 0;
    while (i < text.length) {
      if (text[i] === GS) { out.push(FNC1); i++; continue; }
      const run = digitRun(i);
      if (set === 'C') {
        if (run >= 2) { out.push(+text.substr(i, 2)); i += 2; continue; }
        out.push(CODE_B); set = 'B'; continue;
      }
      if (run >= 4) {
        if (run % 2 === 1) { out.push(text.charCodeAt(i) - 32); i++; }
        out.push(CODE_C); set = 'C'; continue;
      }
      out.push(text.charCodeAt(i) - 32); i++;
    }
    let sum = out[0];
    for (let k = 1; k < out.length; k++) sum += out[k] * k;
    out.push(sum % 103, STOP);
    return out;
  };

  B.code128SVG = function (text, opts = {}) {
    const h = opts.height || 44, mw = opts.module || 1.3, fg = opts.color || '#111';
    const vals = B.code128Values(text, !!opts.gs1);
    const qz = 10 * mw;
    let x = qz, rects = '';
    for (const v of vals) {
      const p = C128[v];
      for (let k = 0; k < p.length; k++) {
        const w = +p[k] * mw;
        if (k % 2 === 0) rects += `<rect x="${x.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="${h}"/>`;
        x += w;
      }
    }
    const w = x + qz;
    const label = opts.label != null ? opts.label : text.replace(/\x1d/g, '');
    const fs = opts.fontSize || 10;
    return `<svg class="barcode" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(1)} ${h + fs + 5}" width="${w.toFixed(0)}" height="${h + fs + 5}">` +
      `<rect width="100%" height="100%" fill="#fff"/><g fill="${fg}">${rects}</g>` +
      `<text x="${(w / 2).toFixed(1)}" y="${h + fs + 1}" fill="${fg}" font-family="ui-monospace,Menlo,monospace" font-size="${fs}" text-anchor="middle">${WS.U.esc(label)}</text></svg>`;
  };

  // GS1-128 from a list of [AI, value] pairs. Variable-length fields followed by
  // another field get an FNC1 separator, as required by the GS1 General Specifications.
  const FIXED = { '00': 18, '01': 14, '02': 14, '410': 13, '414': 13 };
  B.gs1Data = function (pairs) {
    let raw = '', hri = '';
    pairs.forEach(([ai, val], i) => {
      raw += ai + val;
      hri += '(' + ai + ')' + val;
      if (!FIXED[ai] && i < pairs.length - 1) raw += GS;
    });
    return { raw, hri };
  };
  B.gs1SVG = function (pairs, opts = {}) {
    const d = B.gs1Data(pairs);
    return B.code128SVG(d.raw, Object.assign({ gs1: true, label: d.hri }, opts));
  };

  // Classify a scanned string
  B.identify = function (s) {
    s = String(s).trim().replace(/[()\s]/g, '');
    if (/^\d{13}$/.test(s) && B.isValidGTIN(s)) return { type: 'GTIN', value: s };
    if (/^00\d{18}$/.test(s)) s = s.slice(2);
    if (/^\d{18}$/.test(s) && B.isValidSSCC(s)) return { type: 'SSCC', value: s };
    if (/^8003\d+/.test(s)) s = s.slice(4);
    return { type: 'TEXT', value: s.toUpperCase() };
  };
})((globalThis.WS = globalThis.WS || {}));
