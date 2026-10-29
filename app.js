(function () {
  'use strict';

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
    return name.replace(/\.(heic|heif)$/i, '') + '.jpg';
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
    downloadAllBtn.hidden = done.length < 2;
  }

  /* ---------- file intake ---------- */

  function addFiles(list) {
    var added = 0;
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      if (!f) continue;
      if (!isHeic(f)) {
        showError('"' + f.name + '" is not a HEIC/HEIF file and was skipped.');
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
    status.textContent = 'waiting…';
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
    setStatus(next, 'converting…', 'status-working');

    if (!libReady()) {
      next.status = 'error';
      setStatus(next, 'failed — library missing', 'status-error');
      showError('The conversion library failed to load. Check your connection and refresh the page.');
      converting = false;
      processQueue();
      return;
    }

    window.heic2any({ blob: next.file, toType: 'image/jpeg', quality: 0.92 })
      .then(function (result) {
        var blob = Array.isArray(result) ? result[0] : result;
        next.blob = blob;
        next.status = 'done';

        var img = document.createElement('img');
        img.className = 'file-thumb';
        img.alt = '';
        next.url = URL.createObjectURL(blob);
        img.src = next.url;
        next.ui.thumb.replaceWith(img);
        next.ui.thumb = img;

        setStatus(next, fmtSize(blob.size) + ' · JPG ready', 'status-done');

        var a = document.createElement('a');
        a.className = 'btn btn-small';
        a.textContent = 'Download';
        a.href = next.url;
        a.download = outName(next.file.name);
        next.ui.action.appendChild(a);

        converting = false;
        updateDoneCount();
        processQueue();
      })
      .catch(function () {
        next.status = 'error';
        setStatus(next, 'failed to convert', 'status-error');
        converting = false;
        processQueue();
      });
  }

  /* ---------- download all (zip) ---------- */

  function uniqueName(name, used) {
    if (!used[name]) { used[name] = 1; return name; }
    var n = used[name] + 1;
    used[name] = n;
    return name.replace(/\.jpg$/i, '-' + n + '.jpg');
  }

  downloadAllBtn.addEventListener('click', function () {
    var done = items.filter(function (it) { return it.status === 'done' && it.blob; });
    if (!done.length) return;

    if (typeof window.JSZip !== 'function') {
      // graceful fallback: trigger one-by-one downloads
      done.forEach(function (it, i) {
        setTimeout(function () {
          var a = document.createElement('a');
          a.href = it.url;
          a.download = outName(it.file.name);
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
      zip.file(uniqueName(outName(it.file.name), used), it.blob);
    });
    zip.generateAsync({ type: 'blob' }).then(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'heic-to-jpg.zip';
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
})();
