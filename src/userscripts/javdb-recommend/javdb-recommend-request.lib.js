  var KEY = '30820'; // APK 签名证书 X.509 DER hex 前 5 字符（getSecret / getIKey）
  var B64_1 = 'WzE3OCwyMTksMTI3LDE2MSwxODksMTYyLDEyMywxMDMsMTM3LDIxMCwxMjMsMjE5LDE4OSwxNzksMTIzLDIwMiwxMzksMTUwLDEzMywxNjAsMTI2LDIwNywxNjYsMTUxLDE0NiwxNTksMTg4LDEwMCwxMzgsMTM2LDE3NiwxNjEsMTQyLDEwMywxMzUsMTYwLDE0MiwxNzUsMTYwLDEwNCwxMzAsMTIxLDExOCwxMDYsMTMyLDEyNCwxMzAsMTA0LDEzMSwxMjEsMTI2LDE3MywxNDMsMTQwLDEzOCwxMDQsMTMwLDE1OSwxMTgsMTc1LDE0MiwxNTksMTYxLDE1OSwxNDMsMTI0LDEyMywxNjEsMTMxLDEzNywxMzQsMTAxLDEzMSwxNzUsMTU2LDEwMSwxMzEsMTc1LDE1NywxNTcsMTMwLDEzNywxNjAsMTA2LDE0MywxMzcsMTUzLDE2MCwxMzEsMTQwLDEyMiwxMDMsMTQzLDEzNywxMjMsMTU3LDEzMSwxMzcsMTUyLDEwMywxMzIsMTM3LDEyMiwxNzMsMTMwLDE1OSwxMzEsMTU5LDEzMCwxNDAsMTIyLDEwNiwxMzAsMTc1LDEyMywxNTksMTMwLDEyMSwxMzgsMTA0LDEzMiwxMjEsMTM0LDE3NCwxNDMsMTYyLDEyNiwxMDQsMTMwLDEwMywxMjcsMTU3LDEzMCwxMDMsMTI2LDE3NSwxNDIsMTc1LDE1NiwxNzUsMTQyLDE2MiwxMzEsMTYwLDEzMSwxNTksMTYxLDE1OSwxMzAsMTM3LDE1MywxNTksMTQyLDEwMywxNDIsMTczLDEzMSwxNzUsMTM0LDE3MiwxMzIsMTIxLDEyMywxNjEsMTMwLDEwMywxMzQsMTA1LDE0MiwxNDAsMTIyLDExNF0=';
  var B64_2 = 'WzE5OCwxNjksMTIzLDEwNiwxNzcsMTY2LDE0MCwxNjIsMTQ3LDE4OSwxNjIsMjE5LDE5OSwxMjIsMTE4LDE1OF0=';

  export function md5(s) {
    function rol(x, c) { return ((x << c) | (x >>> (32 - c))) >>> 0; }
    var K = [0xd76aa478,0xe8c7b756,0x242070db,0xc1bdceee,0xf57c0faf,0x4787c62a,0xa8304613,0xfd469501,0x698098d8,0x8b44f7af,0xffff5bb1,0x895cd7be,0x6b901122,0xfd987193,0xa679438e,0x49b40821,0xf61e2562,0xc040b340,0x265e5a51,0xe9b6c7aa,0xd62f105d,0x02441453,0xd8a1e681,0xe7d3fbc8,0x21e1cde6,0xc33707d6,0xf4d50d87,0x455a14ed,0xa9e3e905,0xfcefa3f8,0x676f02d9,0x8d2a4c8a,0xfffa3942,0x8771f681,0x6d9d6122,0xfde5380c,0xa4beea44,0x4bdecfa9,0xf6bb4b60,0xbebfbc70,0x289b7ec6,0xeaa127fa,0xd4ef3085,0x04881d05,0xd9d4d039,0xe6db99e5,0x1fa27cf8,0xc4ac5665,0xf4292244,0x432aff97,0xab9423a7,0xfc93a039,0x655b59c3,0x8f0ccc92,0xffeff47d,0x85845dd1,0x6fa87e4f,0xfe2ce6e0,0xa3014314,0x4e0811a1,0xf7537e82,0xbd3af235,0x2ad7d2bb,0xeb86d391];
    var S = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
    var bytes = [], i;
    for (i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i) & 0xff);
    var lenBits = (s.length * 8) >>> 0;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    function push32(v) { bytes.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff); }
    push32(lenBits);
    push32(Math.floor(s.length / 536870912) >>> 0);
    var a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    for (var o = 0; o < bytes.length; o += 64) {
      var M = new Array(16);
      for (var j = 0; j < 16; j++) M[j] = (bytes[o + j * 4] | (bytes[o + j * 4 + 1] << 8) | (bytes[o + j * 4 + 2] << 16) | (bytes[o + j * 4 + 3] << 24)) >>> 0;
      var A = a0, B = b0, C = c0, D = d0;
      for (var k = 0; k < 64; k++) {
        var F, g;
        if (k < 16) { F = (B & C) | ((~B) & D); g = k; }
        else if (k < 32) { F = (D & B) | ((~D) & C); g = (5 * k + 1) % 16; }
        else if (k < 48) { F = B ^ C ^ D; g = (3 * k + 5) % 16; }
        else { F = C ^ (B | (~D)); g = (7 * k) % 16; }
        F = (F + A + K[k] + M[g]) >>> 0;
        A = D; D = C; C = B;
        B = (B + rol(F, S[k])) >>> 0;
      }
      a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
    }
    // MD5 规范输出：每个 32 位字按小端字节序
    function hx(v) { var h = ''; for (var i = 0; i < 32; i += 8) h += ((v >>> i) & 0xff).toString(16).padStart(2, '0'); return h; }
    return hx(a0) + hx(b0) + hx(c0) + hx(d0);
  }

  function decrypt(blob) {
    var md5key = md5(KEY);
    var codes = JSON.parse(atob(blob));
    var out = '';
    for (var i = 0; i < codes.length; i++) {
      var idx = i < md5key.length ? i : md5key.length - 1;
      out += String.fromCharCode(codes[i] - md5key.charCodeAt(idx));
    }
    var bin = atob(out);
    var u8 = new Uint8Array(bin.length);
    for (var j = 0; j < bin.length; j++) u8[j] = bin.charCodeAt(j) & 0xff;
    return new TextDecoder('utf-8').decode(u8);
  }

  var S1 = decrypt(B64_1);
  var S2 = decrypt(B64_2);

  export function signature() {
    var t = Math.floor(Date.now() / 1000);
    return t + '.' + S2 + '.' + md5('' + t + S1);
  }


export function cancelled() { return Object.assign(new Error('Request cancelled'), { name: 'AbortError' }); }
export function delay(ms, signal, timers = globalThis) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(cancelled());
    const finish = () => { signal?.removeEventListener('abort', abort); resolve(); };
    const timer = timers.setTimeout(finish, ms);
    const abort = () => { timers.clearTimeout(timer); signal.removeEventListener('abort', abort); reject(cancelled()); };
    signal?.addEventListener('abort', abort, { once: true });
  });
}
export function createRequest({ base, fetch: fetcher = globalThis.fetch, timers = globalThis }) {
  return async function api(path, params, { signal } = {}) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (signal?.aborted) throw cancelled();
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const abort = () => controller?.abort();
      signal?.addEventListener('abort', abort, { once: true });
      const timer = controller ? timers.setTimeout(abort, 12000) : null;
      let failure;
      try {
        const response = await fetcher(base + path + '?' + new URLSearchParams(params), {
          headers: { jdsignature: signature(), connection: 'keep-alive' },
          signal: controller?.signal || signal,
        });
        if (signal?.aborted) throw cancelled();
        if (!response.ok) throw Object.assign(new Error('HTTP ' + response.status), {
          retryable: response.status === 408 || response.status === 429 || response.status >= 500,
        });
        const body = await response.json();
        if (signal?.aborted) throw cancelled();
        if (body.success !== 1) throw new Error(body.message || '接口返回错误');
        return body.data;
      } catch (error) { failure = error; }
      finally {
        if (timer !== null) timers.clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
      }
      if (signal?.aborted) throw cancelled();
      if (attempt === 3 || !(failure.retryable || failure.name === 'TypeError' || failure.name === 'AbortError')) throw failure;
      await delay(500 * 2 ** (attempt - 1), signal, timers);
    }
  };
}
