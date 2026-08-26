/* ============================================================
   जनतरंग पथदूत e-Paper — viewer + archive
   Reads data/editions.json, renders with PDF.js
   ============================================================ */
(function () {
  'use strict';

  var PDFJS_VERSION = '3.11.174';
  var MANIFEST_URL  = 'data/editions.json';
  var PAGE_SIZE     = 12;          // archive cards per "page"
  var THUMB_CONCURRENCY = 2;       // simultaneous thumbnail renders
  var ZOOM_STEPS    = [0.5, 0.65, 0.8, 1, 1.25, 1.5, 2, 2.5, 3];
  var MAX_DPR       = 2;

  var HI_MONTHS = ['जनवरी','फ़रवरी','मार्च','अप्रैल','मई','जून',
                   'जुलाई','अगस्त','सितंबर','अक्तूबर','नवंबर','दिसंबर'];
  var HI_DAYS   = ['रविवार','सोमवार','मंगलवार','बुधवार','गुरुवार','शुक्रवार','शनिवार'];

  if (typeof pdfjsLib === 'undefined') {
    showFatal('PDF viewer लोड नहीं हो सका।', 'Could not load the PDF library. Please check your connection and refresh.');
    return;
  }
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'assets/pdfjs/pdf.worker.min.js';

  /* ---------------- DOM ---------------- */
  var $ = function (id) { return document.getElementById(id); };

  var els = {
    stage: $('stage'), status: $('stageStatus'),
    scroll: $('canvasScroll'), holder: $('canvasHolder'), canvas: $('pdfCanvas'),
    title: $('editionTitle'), date: $('editionDate'),
    prev: $('prevPage'), next: $('nextPage'), pageInput: $('pageInput'), pageCount: $('pageCount'),
    edgePrev: $('edgePrev'), edgeNext: $('edgeNext'),
    zoomIn: $('zoomIn'), zoomOut: $('zoomOut'), zoomLabel: $('zoomLabel'), fitWidth: $('fitWidth'),
    fullscreen: $('fullscreen'),
    grid: $('editionGrid'), loadMore: $('loadMore'),
    stamp: $('todayStamp'), year: $('year')
  };

  var ctx = els.canvas.getContext('2d', { alpha: false });

  /* ---------------- State ---------------- */
  var editions = [];
  var shown = 0;
  var current = null;      // current edition object
  var pdfDoc = null;
  var pageNum = 1;
  var zoomMode = 'fit';    // 'fit' | number
  var renderTask = null;
  var renderToken = 0;

  /* ---------------- Utils ---------------- */

  function parseISO(d) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || ''));
    if (!m) return null;
    var dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(dt.getTime()) ? null : dt;
  }

  function hiDate(iso, withDay) {
    var d = parseISO(iso);
    if (!d) return iso || '';
    var s = d.getDate() + ' ' + HI_MONTHS[d.getMonth()] + ' ' + d.getFullYear();
    return withDay ? HI_DAYS[d.getDay()] + ', ' + s : s;
  }

  function enDate(iso) {
    var d = parseISO(iso);
    if (!d) return '';
    var p = function (n) { return n < 10 ? '0' + n : String(n); };
    return p(d.getDate()) + '-' + p(d.getMonth() + 1) + '-' + d.getFullYear();
  }

  function todayISO() {
    var d = new Date(), p = function (n) { return n < 10 ? '0' + n : String(n); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function setStatus(hi, en, spinning) {
    if (!els.status) return;
    els.status.hidden = false;
    els.status.innerHTML = '';
    if (spinning) {
      var sp = document.createElement('div');
      sp.className = 'spinner';
      sp.setAttribute('aria-hidden', 'true');
      els.status.appendChild(sp);
    }
    var p = document.createElement('p');
    p.textContent = hi;
    els.status.appendChild(p);
    if (en) {
      var q = document.createElement('p');
      q.className = 'en-sub';
      q.textContent = en;
      els.status.appendChild(q);
    }
  }

  function hideStatus() { if (els.status) els.status.hidden = true; }

  function showFatal(hi, en) {
    var st = document.getElementById('stageStatus');
    if (st) {
      st.hidden = false;
      st.innerHTML = '';
      var p = document.createElement('p'); p.textContent = hi; st.appendChild(p);
      if (en) { var q = document.createElement('p'); q.className = 'en-sub'; q.textContent = en; st.appendChild(q); }
    }
  }

  /* ---------------- Viewer ---------------- */

  function computeScale(page) {
    var base = page.getViewport({ scale: 1 });
    if (zoomMode === 'fit') {
      var pad = window.innerWidth <= 720 ? 20 : 40;
      var avail = Math.max(160, els.scroll.clientWidth - pad);
      return avail / base.width;
    }
    // numeric zoom is relative to fit-width, so 100% == "fits the frame"
    var pad2 = window.innerWidth <= 720 ? 20 : 40;
    var fit = Math.max(160, els.scroll.clientWidth - pad2) / base.width;
    return fit * zoomMode;
  }

  function renderPage(n) {
    if (!pdfDoc) return;
    var token = ++renderToken;

    if (renderTask) { try { renderTask.cancel(); } catch (e) {} renderTask = null; }

    return pdfDoc.getPage(n).then(function (page) {
      if (token !== renderToken) return;

      var scale = computeScale(page);
      var vp = page.getViewport({ scale: scale });
      var dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);

      els.canvas.width  = Math.floor(vp.width  * dpr);
      els.canvas.height = Math.floor(vp.height * dpr);
      els.canvas.style.width  = Math.floor(vp.width)  + 'px';
      els.canvas.style.height = Math.floor(vp.height) + 'px';

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, els.canvas.width, els.canvas.height);

      renderTask = page.render({
        canvasContext: ctx,
        viewport: vp,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null
      });

      return renderTask.promise.then(function () {
        if (token !== renderToken) return;
        renderTask = null;
        hideStatus();
        syncControls();
      });
    }).catch(function (err) {
      if (err && (err.name === 'RenderingCancelledException')) return;
      console.error('[epaper] render failed', err);
      setStatus('यह पन्ना दिखाया नहीं जा सका।', 'This page could not be rendered.', false);
    });
  }

  function syncControls() {
    var total = pdfDoc ? pdfDoc.numPages : 0;
    els.pageCount.textContent = total || '–';
    els.pageInput.value = pageNum;
    els.pageInput.max = total || 1;
    els.pageInput.disabled = !total;

    var atFirst = pageNum <= 1, atLast = pageNum >= total;
    els.prev.disabled = els.edgePrev.disabled = atFirst;
    els.next.disabled = els.edgeNext.disabled = atLast;

    els.zoomLabel.textContent = zoomMode === 'fit' ? 'Fit' : Math.round(zoomMode * 100) + '%';
    els.fitWidth.disabled = zoomMode === 'fit';
  }

  function goToPage(n) {
    if (!pdfDoc) return;
    n = Math.max(1, Math.min(pdfDoc.numPages, Math.round(n) || 1));
    if (n === pageNum && els.canvas.width) { syncControls(); return; }
    pageNum = n;
    syncControls();
    els.scroll.scrollTop = 0;
    renderPage(pageNum);
  }

  function currentZoomValue(page1Fallback) {
    return zoomMode === 'fit' ? 1 : zoomMode;
  }

  function stepZoom(dir) {
    var cur = currentZoomValue();
    var i;
    if (dir > 0) {
      for (i = 0; i < ZOOM_STEPS.length; i++) {
        if (ZOOM_STEPS[i] > cur + 0.001) { zoomMode = ZOOM_STEPS[i]; break; }
      }
      if (i === ZOOM_STEPS.length) zoomMode = ZOOM_STEPS[ZOOM_STEPS.length - 1];
    } else {
      for (i = ZOOM_STEPS.length - 1; i >= 0; i--) {
        if (ZOOM_STEPS[i] < cur - 0.001) { zoomMode = ZOOM_STEPS[i]; break; }
      }
      if (i < 0) zoomMode = ZOOM_STEPS[0];
    }
    syncControls();
    renderPage(pageNum);
  }

  function loadEdition(ed) {
    if (!ed) return;
    current = ed;

    els.title.textContent = isToday(ed.date) ? 'आज का ePaper' : 'ePaper';
    els.date.textContent = hiDate(ed.date, true) + '  ·  ' + enDate(ed.date);

    document.title = (isToday(ed.date) ? 'आज का ePaper' : hiDate(ed.date, false) + ' का ePaper') +
                     ' — जनतरंग पथदूत | Jantarang Pathdoot ePaper';

    markActiveCard(ed.date);
    setStatus('ई-पेपर लोड हो रहा है…', 'Loading edition ' + enDate(ed.date), true);

    pageNum = 1;
    zoomMode = 'fit';

    if (pdfDoc) { try { pdfDoc.destroy(); } catch (e) {} pdfDoc = null; }

    pdfjsLib.getDocument({ url: ed.file, disableAutoFetch: true, disableStream: false })
      .promise
      .then(function (doc) {
        pdfDoc = doc;
        syncControls();
        return renderPage(1).then(unlockThumbs);
      })
      .catch(function (err) {
        console.error('[epaper] could not open PDF', err);
        setStatus(
          'यह ePaper खोला नहीं जा सका। कृपया कुछ देर बाद पुनः प्रयास करें।',
          'This edition could not be opened. Please refresh and try again.',
          false
        );
        unlockThumbs();   // don't strand the archive because the main edition failed
      });
  }

  function isToday(iso) { return iso === todayISO(); }

  /* ---------------- Archive grid ---------------- */

  var thumbObserver = null;

  function markActiveCard(date) {
    var cards = els.grid.querySelectorAll('.card');
    for (var i = 0; i < cards.length; i++) {
      cards[i].setAttribute('aria-current', cards[i].dataset.date === date ? 'true' : 'false');
    }
  }

  function buildCard(ed) {
    var card = document.createElement('button');
    card.type = 'button';
    card.className = 'card';
    card.dataset.date = ed.date;
    card.dataset.file = ed.file;
    card.setAttribute('role', 'listitem');
    card.setAttribute('aria-label', 'ePaper ' + hiDate(ed.date, false) + ' खोलें');

    var thumb = document.createElement('div');
    thumb.className = 'card-thumb';

    var skel = document.createElement('div');
    skel.className = 'thumb-skeleton';
    thumb.appendChild(skel);

    if (isToday(ed.date)) {
      var badge = document.createElement('span');
      badge.className = 'badge-today';
      badge.textContent = 'आज';
      thumb.appendChild(badge);
    }

    var d1 = document.createElement('p');
    d1.className = 'card-date';
    d1.textContent = hiDate(ed.date, false);

    var d2 = document.createElement('p');
    d2.className = 'card-sub';
    d2.textContent = HI_DAYS[(parseISO(ed.date) || new Date()).getDay()] + ' · ' + enDate(ed.date);

    card.appendChild(thumb);
    card.appendChild(d1);
    card.appendChild(d2);

    card.addEventListener('click', function () {
      loadEdition(ed);
      document.getElementById('viewer').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    if (thumbObserver) thumbObserver.observe(thumb);
    thumb._edition = ed;

    return card;
  }

  function thumbFallback(thumb) {
    thumb.innerHTML = '';
    var box = document.createElement('div');
    box.className = 'thumb-fallback';
    box.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/>' +
      '<path d="M14 3v5h5"/></svg>';
    var t = document.createElement('span');
    t.textContent = 'PDF';
    box.appendChild(t);
    thumb.appendChild(box);
  }

  /* Thumbnails are the expensive part of this page: naively, every card opens
     its own PDF.js document and spawns its own worker. Instead they share one
     worker, run at most THUMB_CONCURRENCY at a time, and only start once the
     main edition has finished rendering. */
  var thumbQueue = [];
  var thumbActive = 0;
  var thumbsUnlocked = false;
  var sharedWorker = null;

  function getSharedWorker() {
    if (!sharedWorker && pdfjsLib.PDFWorker) {
      try { sharedWorker = new pdfjsLib.PDFWorker({ name: 'jp-thumbs' }); }
      catch (e) { sharedWorker = null; }
    }
    return sharedWorker;
  }

  function queueThumb(thumb) {
    if (!thumb || thumb._queued) return;
    thumb._queued = true;
    thumbQueue.push(thumb);
    pumpThumbs();
  }

  function unlockThumbs() {
    if (thumbsUnlocked) return;
    thumbsUnlocked = true;
    pumpThumbs();
  }

  function pumpThumbs() {
    if (!thumbsUnlocked) return;
    while (thumbActive < THUMB_CONCURRENCY && thumbQueue.length) {
      thumbActive++;
      renderThumb(thumbQueue.shift()).then(function () {
        thumbActive--;
        pumpThumbs();
      });
    }
  }

  function renderThumb(thumb) {
    var ed = thumb && thumb._edition;
    if (!ed || thumb._done) return Promise.resolve();
    thumb._done = true;

    var opts = { url: ed.file, disableAutoFetch: true, disableStream: false };
    var w = getSharedWorker();
    if (w) opts.worker = w;

    return pdfjsLib.getDocument(opts)
      .promise
      .then(function (doc) {
        return doc.getPage(1).then(function (page) {
          var base = page.getViewport({ scale: 1 });
          var targetW = 300;
          var vp = page.getViewport({ scale: targetW / base.width });
          var c = document.createElement('canvas');
          c.width = Math.floor(vp.width);
          c.height = Math.floor(vp.height);
          var cc = c.getContext('2d', { alpha: false });
          cc.fillStyle = '#fff';
          cc.fillRect(0, 0, c.width, c.height);
          return page.render({ canvasContext: cc, viewport: vp }).promise.then(function () {
            var skel = thumb.querySelector('.thumb-skeleton');
            if (skel) skel.remove();
            c.setAttribute('role', 'img');
            c.setAttribute('aria-label', hiDate(ed.date, false) + ' का पहला पन्ना');
            thumb.insertBefore(c, thumb.firstChild);
            try { doc.destroy(); } catch (e) {}
          });
        });
      })
      .catch(function (err) {
        console.warn('[epaper] thumbnail failed for ' + ed.date, err);
        thumbFallback(thumb);
      });
  }

  function setupObserver() {
    if (!('IntersectionObserver' in window)) return null;
    return new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          obs.unobserve(en.target);
          queueThumb(en.target);
        }
      });
    }, { rootMargin: '300px 0px' });
  }

  function renderGrid(reset) {
    if (reset) { els.grid.innerHTML = ''; shown = 0; }

    if (!editions.length) {
      els.grid.innerHTML = '';
      var empty = document.createElement('p');
      empty.className = 'grid-empty';
      empty.textContent = 'अभी कोई ePaper प्रकाशित नहीं हुआ है। No ePaper published yet.';
      els.grid.appendChild(empty);
      els.loadMore.hidden = true;
      return;
    }

    var slice = editions.slice(shown, shown + PAGE_SIZE);
    var frag = document.createDocumentFragment();
    slice.forEach(function (ed) { frag.appendChild(buildCard(ed)); });
    els.grid.appendChild(frag);
    shown += slice.length;

    els.loadMore.hidden = shown >= editions.length;
    if (current) markActiveCard(current.date);
  }

  /* ---------------- Events ---------------- */

  function bind() {
    els.prev.addEventListener('click', function () { goToPage(pageNum - 1); });
    els.next.addEventListener('click', function () { goToPage(pageNum + 1); });
    els.edgePrev.addEventListener('click', function () { goToPage(pageNum - 1); });
    els.edgeNext.addEventListener('click', function () { goToPage(pageNum + 1); });

    els.pageInput.addEventListener('change', function () { goToPage(Number(els.pageInput.value)); });
    els.pageInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); goToPage(Number(els.pageInput.value)); els.pageInput.blur(); }
    });

    els.zoomIn.addEventListener('click', function () { stepZoom(1); });
    els.zoomOut.addEventListener('click', function () { stepZoom(-1); });
    els.fitWidth.addEventListener('click', function () {
      zoomMode = 'fit'; syncControls(); renderPage(pageNum);
    });

    els.fullscreen.addEventListener('click', function () {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else if (els.stage.requestFullscreen) {
        els.stage.requestFullscreen().catch(function (e) { console.warn('[epaper] fullscreen denied', e); });
      }
    });
    document.addEventListener('fullscreenchange', function () {
      setTimeout(function () { renderPage(pageNum); }, 60);
    });

    els.loadMore.addEventListener('click', function () { renderGrid(false); });

    document.addEventListener('keydown', function (e) {
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); goToPage(pageNum + 1); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); goToPage(pageNum - 1); }
      else if (e.key === '+' || e.key === '=') { e.preventDefault(); stepZoom(1); }
      else if (e.key === '-' || e.key === '_') { e.preventDefault(); stepZoom(-1); }
    });

    var rt;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () { if (pdfDoc) renderPage(pageNum); }, 220);
    });
  }

  /* ---------------- Boot ---------------- */

  function boot() {
    els.year.textContent = new Date().getFullYear();
    var t = new Date();
    els.stamp.textContent = HI_DAYS[t.getDay()] + ', ' + t.getDate() + ' ' + HI_MONTHS[t.getMonth()] + ' ' + t.getFullYear();

    thumbObserver = setupObserver();
    setTimeout(unlockThumbs, 3000);   // backstop if the main edition stalls
    bind();
    syncControls();

    // GitHub Pages serves the manifest with Cache-Control: max-age=600 and we
    // cannot change that, so Fastly would hide a new edition for up to ten
    // minutes. Fastly keys its cache on the full URL, so a per-minute query
    // string makes each new minute a cache miss — a new edition shows up within
    // a minute, while repeat views inside the same minute still hit cache.
    fetch(MANIFEST_URL + '?m=' + Math.floor(Date.now() / 60000), { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        var list = Array.isArray(data) ? data : (data && data.editions) || [];
        editions = list
          .filter(function (e) { return e && e.date && e.file; })
          .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });

        renderGrid(true);

        if (!thumbObserver) {
          // no IntersectionObserver: queue them all, the pump still throttles
          var thumbs = els.grid.querySelectorAll('.card-thumb');
          for (var i = 0; i < thumbs.length; i++) queueThumb(thumbs[i]);
        }

        if (editions.length) {
          loadEdition(editions[0]);
        } else {
          els.title.textContent = 'कोई ePaper उपलब्ध नहीं';
          els.date.textContent = 'No edition published yet';
          setStatus(
            'अभी कोई ePaper प्रकाशित नहीं हुआ है।',
            'No edition has been published yet. The latest edition will appear here automatically once uploaded.',
            false
          );
        }
      })
      .catch(function (err) {
        console.error('[epaper] manifest load failed', err);
        setStatus(
          'अंकों की सूची लोड नहीं हो सकी।',
          'Could not load the edition list. Please refresh the page.',
          false
        );
        els.grid.innerHTML = '';
        var p = document.createElement('p');
        p.className = 'grid-empty';
        p.textContent = 'सूची लोड नहीं हो सकी। Could not load the ePaper list.';
        els.grid.appendChild(p);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
