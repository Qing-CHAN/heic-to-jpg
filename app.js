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

  var T = document.documentElement.lang === 'es' ? {
    waiting: 'esperando…',
    converting: 'convirtiendo…',
    ready: 'listo',
    failed_lib: 'error — biblioteca no disponible',
    failed: 'no se pudo convertir',
    download: 'Descargar',
    page_ready: 'página lista',
    pdf_btn: 'Descargar PDF (%d páginas)',
    lib_error: 'No se pudo cargar la biblioteca de conversión. Comprueba tu conexión y recarga la página.',
    not_heic: 'no es un archivo HEIC/HEIF y fue ignorado.'
  } : {
    waiting: 'waiting…',
    converting: 'converting…',
    ready: 'ready',
    failed_lib: 'failed — library missing',
    failed: 'failed to convert',
    download: 'Download',
    page_ready: 'page ready',
    pdf_btn: 'Download PDF (%d pages)',
    lib_error: 'The conversion library failed to load. Check your connection and refresh the page.',
    not_heic: 'is not a HEIC/HEIF file and was skipped.'
  };

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

    item.ui = { thumb: thumb, meta: meta, status: status, action: action };
  }

  /* ---------- conversion queue (serial) ---------- */

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
      next.status = 'error';
      setStatus(next, T.failed_lib, 'status-error');
      showError(T.lib_error);
      converting = false;
      processQueue();
      return;
    }

    window.heic2any({ blob: next.file, toType: outType(), quality: 0.92 })
      .then(function (result) {
        var blob = Array.isArray(result) ? result[0] : result;
        var gotExt = blob.type === 'image/png' ? 'png' : (blob.type === 'image/webp' ? 'webp' : 'jpg');
        next.blob = blob;
        next.actualExt = gotExt;
        next.status = 'done';

        var img = document.createElement('img');
        img.className = 'file-thumb';
        img.alt = '';
        next.url = URL.createObjectURL(blob);
        img.src = next.url;
        next.ui.thumb.replaceWith(img);
        next.ui.thumb = img;
        next.w = img.naturalWidth;
        next.h = img.naturalHeight;

        if (outFmt === 'pdf') {
          setStatus(next, fmtSize(blob.size) + ' · ' + T.page_ready, 'status-done');
        } else {
          setStatus(next, fmtSize(blob.size) + ' · ' + next.actualExt.toUpperCase() + ' ' + T.ready, 'status-done');

          var a = document.createElement('a');
          a.className = 'btn btn-small';
          a.textContent = T.download;
          a.href = next.url;
          a.download = outName(next.file.name).replace(/\.[a-z0-9]+$/i, '.' + next.actualExt);
          next.ui.action.appendChild(a);
        }

        converting = false;
        updateDoneCount();
        processQueue();
      })
      .catch(function () {
        next.status = 'error';
        setStatus(next, T.failed, 'status-error');
        converting = false;
        processQueue();
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
    var doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4' });
    var A4W = 595.28, A4H = 841.89, MARGIN = 24;
    var maxW = A4W - MARGIN * 2, maxH = A4H - MARGIN * 2;
    var chain = Promise.resolve();
    done.forEach(function (it, idx) {
      chain = chain.then(function () {
        return new Promise(function (resolve, reject) {
          var img = new Image();
          img.onload = function () { resolve(img); };
          img.onerror = reject;
          img.src = it.url;
        }).then(function (img) {
          if (idx > 0) doc.addPage('a4', 'pt');
          var r = Math.min(maxW / it.w, maxH / it.h);
          var x = (A4W - it.w * r) / 2, y = (A4H - it.h * r) / 2;
          doc.addImage(img, 'JPEG', x, y, it.w * r, it.h * r);
        });
      });
    });
    chain.then(function () { doc.save('myheicgo.pdf'); })
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

  /* ---------- format toggle ---------- */
  var fmtBtns = document.querySelectorAll('.fmt-btn');
  fmtBtns.forEach(function (x) { x.classList.toggle('active', x.getAttribute('data-fmt') === outFmt); });
  fmtBtns.forEach(function (b) {
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      var f = b.getAttribute('data-fmt');
      if (f === outFmt) return;
      outFmt = f;
      fmtBtns.forEach(function (x) { x.classList.toggle('active', x === b); });
      if (items.length) {
        showError('Format switched — files added from now on will be ' + outExt().toUpperCase() + '.');
      }
    });
  });
})();
