(function () {
  'use strict';

  var attr = document.body.getAttribute('data-img-format');
  var outFmt = (attr === 'png' || attr === 'webp' || attr === 'pdf') ? attr : 'jpg';
  try {
    var urlFmt = new URLSearchParams(location.search).get('fmt');
    if (urlFmt === 'png' || urlFmt === 'webp' || urlFmt === 'jpg' || urlFmt === 'pdf') outFmt = urlFmt;
  } catch (e) {}

  function outType() {
    if (outFmt === 'png') return 'image/png';
    if (outFmt === 'webp') return 'image/webp';
    return 'image/jpeg';
  }
  function outExt() { return outFmt; }

  var _MSG = {
    zh: {
      waiting: '排队中…',
      converting: '转换中…',
      ready: '完成',
      failed_lib: '出错 — 转换组件未加载',
      failed: '转换失败',
      download: '下载',
      retry: '重试',
      lib_error: '转换组件加载失败，请检查网络后刷新页面。',
      not_heic: '不是 HEIC/HEIF 文件，已跳过。',
      fmt_switch: '格式已切换 — 之后添加的文件将转换为 %s。',
      orig: '原始尺寸',
      page_ready: '已就绪',
      engine_loading: '解码引擎下载中，请稍候…',
      engine_hint: '首次使用需下载解码引擎（约 2MB），下载完成后即可转换，请保持网络畅通。',
      pdf_btn: '下载 PDF（%d 页）'
    },
    es: {
    waiting: 'esperando…',
    converting: 'convirtiendo…',
    ready: 'listo',
    failed_lib: 'error — biblioteca no disponible',
    failed: 'no se pudo convertir',
    download: 'Descargar',
    retry: 'Reintentar',
    page_ready: 'página lista',
    engine_loading: 'descargando el motor de conversión, espera…',
    engine_hint: 'La primera vez se descarga el motor de conversión (~2 MB). Espera con conexión estable.',
    pdf_btn: 'Descargar PDF (%d páginas)',
    lib_error: 'No se pudo cargar la biblioteca de conversión. Comprueba tu conexión y recarga la página.',
    not_heic: 'no es un archivo HEIC/HEIF y fue ignorado.',
    fmt_switch: 'Formato cambiado — los archivos que añadas se convertirán a %s.',
    orig: 'Tamaño original'
    },
    en: {
    waiting: 'waiting…',
    converting: 'converting…',
    ready: 'ready',
    failed_lib: 'failed — library missing',
    failed: 'failed to convert',
    download: 'Download',
    retry: 'Retry',
    page_ready: 'page ready',
    engine_loading: 'downloading conversion engine, please wait…',
    engine_hint: 'First visit downloads the conversion engine (~2 MB). Please keep your connection stable.',
    pdf_btn: 'Download PDF (%d pages)',
    lib_error: 'The conversion library failed to load. Check your connection and refresh the page.',
    not_heic: 'is not a HEIC/HEIF file and was skipped.',
    fmt_switch: 'Format switched — files added from now on will be %s.',
    orig: 'Original size'
    }
  };
  var T = _MSG[document.documentElement.lang] || _MSG.en;

  /* ---------- engine loading watchdog ---------- */
  var engineWaitSince = 0;
  var engineHintEl = null;
  function _unused_libReady() { return !!window.libheifLocal; }
  function showEngineHint() {
    if (engineHintEl || !dropzone) return;
    engineHintEl = document.createElement('div');
    engineHintEl.className = 'engine-hint';
    engineHintEl.style.cssText = 'margin-top:10px;font-size:13px;color:#6b7280;';
    engineHintEl.textContent = T.engine_hint;
    dropzone.appendChild(engineHintEl);
  }
  function hideEngineHint() {
    if (engineHintEl) { engineHintEl.remove(); engineHintEl = null; }
  }


  var dropzone = document.getElementById('dropzone');
  var fileInput = document.getElementById('file-input');
  var fileList = document.getElementById('file-list');
  var errorBanner = document.getElementById('error-banner');
  var downloadAllBtn = document.getElementById('download-all');
  var doneCountEl = document.getElementById('done-count');
  var addMoreBtn = document.getElementById('add-more');

  var items = [];
  var converting = false;

  /* ---------- helpers ---------- */

  function fmtSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function libReady() {
    return typeof window.heic2any === 'function';
  }

  function isHeic(file) {
    var name = (file.name || '').toLowerCase();
    return /\.heic$|\.heif$/.test(name) ||
      file.type === 'image/heic' || file.type === 'image/heif';
  }

  function outName(name) {
    return name.replace(/\.(heic|heif)$/i, '') + '.' + outExt();
  }

  var errTimer = null;
  function showError(msg) {
    errorBanner.textContent = msg;
    errorBanner.hidden = false;
    clearTimeout(errTimer);
    errTimer = setTimeout(function () { errorBanner.hidden = true; }, 8000);
  }

  function setStatus(item, text, cls) {
    var span = item.ui.status;
    span.textContent = text;
    span.className = cls || '';
  }

  function updateDoneCount() {
    var done = items.filter(function (it) { return it.status === 'done'; });
    doneCountEl.textContent = String(done.length);
    if (outFmt === 'pdf') {
      downloadAllBtn.textContent = T.pdf_btn.replace('%d', done.length);
      downloadAllBtn.hidden = done.length < 1;
    } else {
      downloadAllBtn.hidden = done.length < 2;
    }
  }

  /* ---------- file intake ---------- */

  function addFiles(list) {
    var added = 0;
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      if (!f) continue;
      if (!isHeic(f)) {
        showError('"' + f.name + '" ' + T.not_heic);
        continue;
      }
      var item = { file: f, status: 'pending', blob: null, url: null };
      items.push(item);
      buildRow(item);
      added++;
    }
    if (added > 0) {
      fileList.hidden = false;
      addMoreBtn.hidden = false;
      processQueue();
    }
  }

  function buildRow(item) {
    var row = document.createElement('div');
    row.className = 'file-item';

    var thumb = document.createElement('div');
    thumb.className = 'file-thumb placeholder';
    thumb.textContent = 'HEIC';

    var info = document.createElement('div');
    info.className = 'file-info';

    var name = document.createElement('div');
    name.className = 'file-name';
    name.textContent = item.file.name;
    name.title = item.file.name;

    var meta = document.createElement('div');
    meta.className = 'file-meta';
    meta.appendChild(document.createTextNode(fmtSize(item.file.size) + ' · '));

    var status = document.createElement('span');
    status.className = 'status-working';
    status.textContent = T.waiting;
    meta.appendChild(status);

    info.appendChild(name);
    info.appendChild(meta);

    var action = document.createElement('div');
    action.className = 'file-action';

    row.appendChild(thumb);
    row.appendChild(info);
    row.appendChild(action);
    fileList.appendChild(row);

    item.ui = { thumb: thumb, meta: meta, status: status, action: action, row: row };
  }

  /* ---------- conversion queue (serial) ---------- */

  function handleDone(item, blob) {
    var gotExt = blob.type === 'image/png' ? 'png' : (blob.type === 'image/webp' ? 'webp' : 'jpg');
    item.blob = blob;
    item.actualExt = gotExt;
    item.status = 'done';
    item.ui.row.classList.add('done-pop');

    var img = document.createElement('img');
    img.className = 'file-thumb';
    img.alt = '';
    item.url = URL.createObjectURL(blob);
    img.onload = function () {
      item.w = img.naturalWidth;
      item.h = img.naturalHeight;
    };
    img.src = item.url;
    item.ui.thumb.replaceWith(img);
    item.ui.thumb = img;

    if (outFmt === 'pdf') {
      setStatus(item, fmtSize(blob.size) + ' · ' + T.page_ready, 'status-done');
    } else {
      setStatus(item, fmtSize(blob.size) + ' · ' + gotExt.toUpperCase() + ' ' + T.ready, 'status-done');

      var a = document.createElement('a');
      a.className = 'btn btn-small';
      a.textContent = T.download;
      a.href = item.url;
      a.download = outName(item.file.name).replace(/\.[a-z0-9]+$/i, '.' + gotExt);
      item.ui.action.appendChild(a);
    }

    converting = false;
    updateDoneCount();
    processQueue();
  }

  function libheifDecode(file) {
    var started = Date.now();
    var retriedLoader = false;
    function usable(L) { return L && L.HeifDecoder; }
    function waitLib() {
      var F = window.libheifLocal;
      if (usable(F)) return Promise.resolve(F);
      if (F && typeof F === 'function') {
        try {
          var r = F();
          if (r && typeof r.then === 'function') {
            return r.then(function (i) { return usable(i) ? i : (usable(F) ? F : Promise.reject(new Error('libheif factory empty'))); });
          }
          if (usable(r)) return Promise.resolve(r);
        } catch (e) { /* treat as object below */ }
      }
      if (F && typeof F === 'object' && !retriedLoader) {
        // engine exported empty/broken object — reset and reload
        retriedLoader = true;
        console.warn('[MyHeicGo] engine object broken, reloading engine');
        try { window.libheifLocal = undefined; } catch (e2) {}
        if (typeof window.__mhgLoadEngine === 'function') window.__mhgLoadEngine();
      }
      if (window.libheifFailed) return Promise.reject(new Error('libheif engine failed to load (all 3 sources)'));
      if (Date.now() - started > 120000) return Promise.reject(new Error('libheif not loaded after 120s'));
      return new Promise(function (res) { setTimeout(res, 800); }).then(waitLib);
    }
    return waitLib().then(function (L) {
      return file.arrayBuffer().then(function (buf) { return runDecode(L, buf); });
    });
  }

  function runDecode(lib, buf) {
    var decoder = new lib.HeifDecoder();
    var data = decoder.decode(buf);
    if (!data || !data.length) return Promise.reject(new Error('libheif: no image'));
    var image = data[0];
    var w = image.get_width ? image.get_width() : (image.getwidth ? image.getwidth() : 0);
    var h = image.get_height ? image.get_height() : (image.getheight ? image.getheight() : 0);
    if (!w || !h) return Promise.reject(new Error('libheif: zero size'));
    return new Promise(function (resolve, reject) {
      var onOk = function (displayData) {
        try {
          var dw = displayData.width || w;
          var dh = displayData.height || h;
          var c = document.createElement('canvas');
          c.width = dw;
          c.height = dh;
          var ctx = c.getContext('2d');
          ctx.putImageData(new ImageData(new Uint8ClampedArray(displayData.data), dw, dh), 0, 0);
          c.toBlob(function (b) {
            if (b && /image\/(jpeg|png|webp)/.test(b.type)) resolve(b);
            else reject(new Error('libheif encode failed'));
          }, outType(), 0.92);
        } catch (e) { reject(e); }
      };
      var onErr = function (err) { reject(new Error('libheif display: ' + (err || 'error'))); };
      try {
        image.display({ data: new Uint8ClampedArray(w * h * 4) }, onOk);
      } catch (e) {
        try { image.display(onOk, onErr); } catch (e2) { onErr(e); }
      }
    });
  }

  function nativeDecode(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        try {
          var c = document.createElement('canvas');
          var long = Math.max(img.naturalWidth, img.naturalHeight);
          var scale = long > 4000 ? 4000 / long : 1;
          c.width = Math.round(img.naturalWidth * scale);
          c.height = Math.round(img.naturalHeight * scale);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          c.toBlob(function (b) {
            URL.revokeObjectURL(url);
            if (b && /image\/(jpeg|png|webp)/.test(b.type)) resolve(b);
            else reject(new Error('native decode unavailable'));
          }, outType(), 0.92);
        } catch (e) {
          URL.revokeObjectURL(url);
          reject(e);
        }
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('native decode failed')); };
      img.src = url;
    });
  }

  function addRetry(item) {
    var b = document.createElement('button');
    b.className = 'btn btn-small';
    b.textContent = T.retry;
    b.addEventListener('click', function () {
      b.remove();
      item.status = 'pending';
      setStatus(item, T.waiting, 'status-working');
      processQueue();
    });
    item.ui.action.appendChild(b);
  }

  function processQueue() {
    if (converting) return;
    var next = null;
    for (var i = 0; i < items.length; i++) {
      if (items[i].status === 'pending') { next = items[i]; break; }
    }
    if (!next) { updateDoneCount(); return; }

    converting = true;
    next.status = 'converting';
    setStatus(next, T.converting, 'status-working');

    if (!libReady()) {
      var now = Date.now();
      if (!engineWaitSince) engineWaitSince = now;
      if (now - engineWaitSince > 90000) {
        next.status = 'error';
        engineWaitSince = 0;
        setStatus(next, T.failed_lib, 'status-error');
        showError(T.lib_error);
        converting = false;
        processQueue();
        return;
      }
      next.status = 'pending';
      setStatus(next, T.engine_loading, 'status-working');
      converting = false;
      setTimeout(processQueue, 1500);
      return;
    }
    engineWaitSince = 0;

    window.heic2any({ blob: next.file, toType: outType(), quality: 0.92 })
      .then(function (result) {
        var blob = Array.isArray(result) ? result[0] : result;
        handleDone(next, blob);
      })
      .catch(function (e1) {
        console.error('HEIC convert failed:', next.file.name, e1);
        libheifDecode(next.file)
          .then(function (blob) { handleDone(next, blob); })
          .catch(function (e2) {
            console.error('HEIC libheif1.23 fallback failed:', next.file.name, e2);
            nativeDecode(next.file)
              .then(function (blob) { handleDone(next, blob); })
              .catch(function (e3) {
                console.error('HEIC native fallback failed:', next.file.name, e3);
                next.status = 'error';
                var why2 = e2 && e2.message ? String(e2.message).slice(0, 60) : 'unknown';
                var why3 = e3 && e3.message ? String(e3.message).slice(0, 40) : '';
                setStatus(next, T.failed + ' · L2:' + why2 + (why3 ? ' · L3:' + why3 : ''), 'status-error');
                addRetry(next);
                converting = false;
                processQueue();
              });
          });
      });
  }

  /* ---------- download all (zip) ---------- */

  function actualOutName(it) {
    return outName(it.file.name).replace(/\.[a-z0-9]+$/i, '.' + (it.actualExt || outExt()));
  }

  function uniqueName(name, used) {
    if (!used[name]) { used[name] = 1; return name; }
    used[name]++;
    return name.replace(/\.(jpg|jpeg|png|webp)$/i, '-' + used[name] + '.$1');
  }

  function buildPdf(done) {
    if (typeof window.jspdf === 'undefined' || !window.jspdf.jsPDF) {
      showError('PDF library not loaded. Refresh the page and try again.');
      return;
    }
    var FIXED = { a4: [595.28, 841.89], letter: [612, 792] };
    var doc = null, PW, PH, maxW, maxH;
    var chain = Promise.resolve();
    done.forEach(function (it, idx) {
      chain = chain.then(function () {
        return new Promise(function (resolve, reject) {
          var img = new Image();
          img.onload = function () { resolve(img); };
          img.onerror = reject;
          img.src = it.url;
        }).then(function (img) {
          var w = img.naturalWidth, h = img.naturalHeight;
          var c = document.createElement('canvas');
          c.width = w;
          c.height = h;
          c.getContext('2d').drawImage(img, 0, 0);
          var data = c.toDataURL('image/jpeg', 0.92);
          if (pdfPage === 'original') {
            if (!doc) doc = new window.jspdf.jsPDF({ unit: 'pt', format: [w, h] });
            else doc.addPage([w, h]);
            doc.addImage(data, 'JPEG', 0, 0, w, h);
          } else {
            var f = FIXED[pdfPage] || FIXED.a4;
            PW = f[0]; PH = f[1];
            maxW = PW - 48; maxH = PH - 48;
            if (!doc) doc = new window.jspdf.jsPDF({ unit: 'pt', format: pdfPage });
            else doc.addPage(pdfPage);
            var r = Math.min(maxW / w, maxH / h);
            doc.addImage(data, 'JPEG', (PW - w * r) / 2, (PH - h * r) / 2, w * r, h * r);
          }
        });
      });
    });
    chain.then(function () { if (!doc) throw new Error('no pages'); doc.save('myheicgo.pdf'); })
      .catch(function () { showError('PDF generation failed. Please try again.'); });
  }

  downloadAllBtn.addEventListener('click', function () {
    var done = items.filter(function (it) { return it.status === 'done' && it.blob; });
    if (!done.length) return;
    if (outFmt === 'pdf') { buildPdf(done); return; }

    if (typeof window.JSZip !== 'function') {
      // graceful fallback: trigger one-by-one downloads
      done.forEach(function (it, i) {
        setTimeout(function () {
          var a = document.createElement('a');
          a.href = it.url;
          a.download = actualOutName(it);
          document.body.appendChild(a);
          a.click();
          a.remove();
        }, i * 350);
      });
      return;
    }

    var zip = new window.JSZip();
    var used = {};
    done.forEach(function (it) {
      zip.file(uniqueName(actualOutName(it), used), it.blob);
    });
    zip.generateAsync({ type: 'blob' }).then(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'heic-to-' + outExt() + '.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    });
  });

  /* ---------- events ---------- */

  ['dragenter', 'dragover'].forEach(function (ev) {
    dropzone.addEventListener(ev, function (e) {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    dropzone.addEventListener(ev, function (e) {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    });
  });
  dropzone.addEventListener('drop', function (e) {
    if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
  });
  dropzone.addEventListener('click', function () { fileInput.click(); });
  dropzone.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });
  fileInput.addEventListener('change', function () {
    addFiles(fileInput.files);
    fileInput.value = '';
  });
  addMoreBtn.addEventListener('click', function () { fileInput.click(); });

  updatePageSelector();

  if (!libReady()) {
    showEngineHint();
    var enginePoll = setInterval(function () {
      if (libReady()) { clearInterval(enginePoll); hideEngineHint(); }
    }, 500);
  }

  /* ---------- pdf page-size selector ---------- */
  var pdfPage = 'a4';
  var pageSizeRow = null;
  function buildPageSelector() {
    if (pageSizeRow) return pageSizeRow;
    pageSizeRow = document.createElement('div');
    pageSizeRow.className = 'page-size-toggle';
    pageSizeRow.style.cssText = 'margin:10px auto 0;display:none;justify-content:center;';
    pageSizeRow.style.display = 'none';
    var opts = [['a4', 'A4'], ['letter', 'Letter'], ['original', T.orig]];
    opts.forEach(function (o, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'fmt-btn' + (i === 0 ? ' active' : '');
      if (i > 0) b.style.borderLeft = 'none';
      b.textContent = o[1];
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        pdfPage = o[0];
        pageSizeRow.querySelectorAll('.fmt-btn').forEach(function (x) { x.classList.toggle('active', x === b); });
      });
      pageSizeRow.appendChild(b);
    });
    var toggle = document.querySelector('.format-toggle');
    if (toggle && toggle.parentNode) toggle.parentNode.insertBefore(pageSizeRow, toggle.nextSibling);
    return pageSizeRow;
  }
  function updatePageSelector() {
    buildPageSelector().style.display = (outFmt === 'pdf') ? 'flex' : 'none';
  }

  /* ---------- format toggle ---------- */
  var fmtBtns = document.querySelectorAll('.format-toggle .fmt-btn');
  fmtBtns.forEach(function (x) { x.classList.toggle('active', x.getAttribute('data-fmt') === outFmt); });
  fmtBtns.forEach(function (b) {
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      var f = b.getAttribute('data-fmt');
      if (f === outFmt) return;
      outFmt = f;
      fmtBtns.forEach(function (x) { x.classList.toggle('active', x === b); });
      updatePageSelector();
      if (items.length) {
        showError(T.fmt_switch.replace('%s', outExt().toUpperCase()));
      }
    });
  });
})();
