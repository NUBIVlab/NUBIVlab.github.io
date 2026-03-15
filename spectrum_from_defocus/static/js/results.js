/** Results: carousel + RGB (hover for spectrum) + Plotly spectrum plot. Binary format: 12-byte H,W,C header then gt/recon float32; or set SPECTRUM_BINARY_URLS to { gt, recon } per result. */
(function () {
  'use strict';

  var WAVELENGTH_MIN = 440;
  var WAVELENGTH_MAX = 720;

  var RESULT_IMAGE_PATHS = {
    "0": {
      measurements: [
        "./static/images/result0/m0.png",
        "./static/images/result0/m1.png",
        "./static/images/result0/m2.png",
        "./static/images/result0/m3.png",
        "./static/images/result0/m4.png"
      ],
      rgb: "./static/images/result0/rgb_actual.png"
    },
    "1": {
      measurements: [
        "./static/images/result1/m0.png",
        "./static/images/result1/m1.png",
        "./static/images/result1/m2.png",
        "./static/images/result1/m3.png",
        "./static/images/result1/m4.png"
      ],
      rgb: "./static/images/result1/rgb_actual.png"
    }
  };

  var SPECTRUM_BINARY_URLS = {
    "0": {
      gt: "./static/images/result0/gt.bin",
      recon: "./static/images/result0/recon.bin"
    },
    "1": {
      gt: "./static/images/result1/gt.bin",
      recon: "./static/images/result1/recon.bin"
    }
  };

  var SPECTRUM_DIMENSIONS = { "0": { H: 515, W: 795 }, "1": { H: 550, W: 550 } };
  var binaryCubes = {};
  var SPECTRUM_DATA = null;
  var SPECTRUM_DATA_URL = null;
  var loadedSpectrumData = null;
  var SPECTRUM_ERROR_MESSAGE = 'Spectrum data failed to load.';

  function isMobileResults() {
    return window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
  }

  var DEFAULT_SPECTRUM_PIXEL = {
    "0": { px: 640, py: 175 },
    "1": { px: 309, py: 476 }
  };

  function parseBinaryCube(resultId, buffer) {
    var dv = new DataView(buffer);
    var H = dv.getUint32(0, true);
    var W = dv.getUint32(4, true);
    var C = dv.getUint32(8, true);
    var n = H * W * C;
    var gtOffset = 12;
    var reconOffset = 12 + n * 4;
    binaryCubes[resultId] = { buffer: buffer, dv: dv, H: H, W: W, C: C, gtOffset: gtOffset, reconOffset: reconOffset };
  }

  function parseBinaryCubesFromTwoFiles(resultId, gtBuffer, reconBuffer) {
    var dvGt = new DataView(gtBuffer);
    var dvRecon = new DataView(reconBuffer);
    var expectedLen = function (H, W, C) { return 12 + C * H * W * 4; };
    var H = dvGt.getUint32(0, true);
    var W = dvGt.getUint32(4, true);
    var C = dvGt.getUint32(8, true);
    var gtOffset = 12;
    var reconOffset = 12;
    var noHeader = (H > 10000 || W > 10000 || C > 10000);
    if (noHeader) {
      H = W = C = 0;
      gtOffset = 0;
      reconOffset = 0;
      var dims = SPECTRUM_DIMENSIONS && SPECTRUM_DIMENSIONS[resultId];
      if (dims && dims.H && dims.W) {
        H = dims.H;
        W = dims.W;
      } else {
        var rgbImg = document.getElementById('results-rgb-image-' + resultId);
        if (rgbImg && rgbImg.naturalWidth && rgbImg.naturalHeight) {
          W = rgbImg.naturalWidth;
          H = rgbImg.naturalHeight;
        }
      }
      if (H && W) {
        var nFloats = gtBuffer.byteLength / 4;
        C = Math.floor(nFloats / (H * W));
        if (C * H * W !== nFloats) {
          throw new Error('gt.bin headerless: size ' + gtBuffer.byteLength + ' does not match C*H*W*4. Got H=' + H + ' W=' + W + ' => C=' + C + ', remainder ' + (nFloats - C * H * W));
        }
      } else {
        throw new Error('gt.bin has no header. Set SPECTRUM_DIMENSIONS["' + resultId + '"] = { H: height, W: width } in results.js, or ensure the RGB image loads first.');
      }
    } else {
      if (gtBuffer.byteLength !== expectedLen(H, W, C)) {
        C = dvGt.getUint32(0, true);
        H = dvGt.getUint32(4, true);
        W = dvGt.getUint32(8, true);
      }
      if (gtBuffer.byteLength !== expectedLen(H, W, C)) {
        throw new Error('gt.bin size mismatch: got ' + gtBuffer.byteLength + ', expected 12 + C*H*W*4 for H=' + H + ' W=' + W + ' C=' + C);
      }
    }
    binaryCubes[resultId] = {
      dv: dvGt,
      dvRecon: dvRecon,
      H: H, W: W, C: C,
      gtOffset: gtOffset,
      reconOffset: reconOffset
    };
  }

  function readSpectrumFromCube(cube, px, py, isRecon) {
    var H = cube.H, W = cube.W, C = cube.C;
    var x = Math.max(0, Math.min(W - 1, Math.floor(px)));
    var y = Math.max(0, Math.min(H - 1, Math.floor(py)));
    var pixelIndex = y * W + x;
    var dv = isRecon && cube.dvRecon ? cube.dvRecon : cube.dv;
    var dataStartBytes = isRecon ? cube.reconOffset : cube.gtOffset;
    var arr = [];
    for (var c = 0; c < C; c++) {
      arr.push(dv.getFloat32(dataStartBytes + (c * H * W + pixelIndex) * 4, true));
    }
    return arr;
  }

  function wavelengthArray(C) {
    var out = [];
    for (var i = 0; i < C; i++) out.push(WAVELENGTH_MIN + (WAVELENGTH_MAX - WAVELENGTH_MIN) * i / Math.max(1, C - 1));
    return out;
  }

  function getSpectrumFromBinary(resultId, px, py) {
    var cube = binaryCubes[resultId];
    if (!cube) return null;
    var H = cube.H, W = cube.W, C = cube.C;
    if (px == null || py == null) {
      var def = (DEFAULT_SPECTRUM_PIXEL && DEFAULT_SPECTRUM_PIXEL[String(resultId)]) || (DEFAULT_SPECTRUM_PIXEL && DEFAULT_SPECTRUM_PIXEL["0"]);
      px = def ? def.px : 640;
      py = def ? def.py : 175;
    }
    var gt = readSpectrumFromCube(cube, px, py, false);
    var recon = readSpectrumFromCube(cube, px, py, true);
    return { wavelengths: wavelengthArray(C), gt: gt, recon: recon };
  }

  function getSpectrumForResult(resultId, px, py) {
    var id = resultId != null ? String(resultId) : '0';
    if (binaryCubes[id]) return getSpectrumFromBinary(id, px, py);
    var data = loadedSpectrumData || SPECTRUM_DATA;
    if (!data || !data[id]) return null;
    var result = data[id];
    var def = result.default || result;
    if (px != null && py != null && result.pixels) {
      var key = py + '_' + px;
      if (result.pixels[key]) return result.pixels[key];
    }
    return def;
  }

  function getSpectrumAtPixel(resultId, px, py) {
    return getSpectrumForResult(resultId, px, py);
  }

  function getSpectrumLayout() {
    return {
      margin: { t: 24, r: 32, b: 40, l: 48 },
      xaxis: {
        title: 'Wavelength (nm)',
        range: [WAVELENGTH_MIN, WAVELENGTH_MAX],
        zeroline: false,
        showgrid: true,
        gridcolor: '#eee',
      },
      yaxis: {
        title: 'Intensity',
        range: [0, 1],
        zeroline: false,
        showgrid: true,
        gridcolor: '#eee',
      },
      showlegend: false,
      paper_bgcolor: '#fff',
      plot_bgcolor: '#fff',
    };
  }

  function buildPlotlyData(data) {
    if (!data || !data.wavelengths || !data.gt || !data.recon) return [];
    return [
      {
        x: data.wavelengths,
        y: data.gt,
        name: 'gt',
        type: 'scatter',
        mode: 'lines',
        line: { color: '#2563eb', width: 2 },
      },
      {
        x: data.wavelengths,
        y: data.recon,
        name: 'recon',
        type: 'scatter',
        mode: 'lines',
        line: { color: '#dc2626', width: 2 },
      },
    ];
  }

  function drawSpectrumPlot(plotDivId, data) {
    if (typeof Plotly === 'undefined') return;
    var el = document.getElementById(plotDivId);
    if (!el) return;
    var traceData = data ? buildPlotlyData(data) : [];
    if (traceData.length === 0) {
      el.innerHTML = '<p class="spectrum-plot-error">' + (data && data.errorMessage ? data.errorMessage : SPECTRUM_ERROR_MESSAGE) + '</p>';
      return;
    }
    var layout = getSpectrumLayout();
    Plotly.react(plotDivId, traceData, layout, { responsive: true });
  }

  function attachResultRow(row) {
    var resultId = row.getAttribute('data-result-id') || '0';
    var paths = RESULT_IMAGE_PATHS && RESULT_IMAGE_PATHS[resultId];
    if (paths) {
      if (paths.measurements && paths.measurements.length) {
        var items = row.querySelectorAll('.results-measurements-carousel .item img');
        for (var i = 0; i < items.length && i < paths.measurements.length; i++) {
          items[i].src = paths.measurements[i];
        }
      }
      if (paths.rgb) {
        var rgbImgEl = row.querySelector('.results-rgb-image');
        if (rgbImgEl) {
          var rgbUrl;
          try {
            rgbUrl = new URL(paths.rgb, window.location.href).href;
          } catch (e) {
            rgbUrl = paths.rgb;
          }
          rgbImgEl.src = rgbUrl;
          rgbImgEl.onerror = function () {
            this.onerror = null;
            this.src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect fill="#ddd" width="400" height="300"/><text x="50%" y="50%" fill="#999" font-family="sans-serif" font-size="14" text-anchor="middle" dy=".3em">Add static/images/result0/rgb_actual.png</text></svg>');
          };
        }
      }
    }
    var carouselEl = row.querySelector('.results-measurements-carousel');
    var rgbWrap = row.querySelector('.results-rgb-wrap');
    var rgbImg = row.querySelector('.results-rgb-image');
    var spectrumEl = row.querySelector('.spectrum-plot');
    var hint = row.querySelector('.spectrum-plot-hint');

    if (carouselEl && typeof bulmaCarousel !== 'undefined') {
      bulmaCarousel.attach(carouselEl, {
        slidesToShow: 1,
        slidesToScroll: 1,
        loop: true,
        breakpoints: [{ changePoint: 99999, slidesToShow: 1, slidesToScroll: 1 }]
      });
    }

    if (isMobileResults()) return;

    var plotDivId = spectrumEl && spectrumEl.id ? spectrumEl.id : null;
    if (!plotDivId && spectrumEl) {
      plotDivId = 'spectrum-plot-' + resultId;
      spectrumEl.id = plotDivId;
    }
    if (!plotDivId) return;

    var defaultSpectrum = getSpectrumForResult(resultId, null, null);
    drawSpectrumPlot(plotDivId, defaultSpectrum);

    if (rgbWrap && rgbImg) {
      rgbWrap.addEventListener('mousemove', function (e) {
        var rect = rgbImg.getBoundingClientRect();
        var nw = rgbImg.naturalWidth || 1;
        var nh = rgbImg.naturalHeight || 1;
        var scaleX = nw / rect.width;
        var scaleY = nh / rect.height;
        var px = Math.floor((e.clientX - rect.left) * scaleX);
        var py = Math.floor((e.clientY - rect.top) * scaleY);
        px = Math.max(0, Math.min(nw, px));
        py = Math.max(0, Math.min(nh, py));
        var data = getSpectrumAtPixel(resultId, px, py);
        if (data) drawSpectrumPlot(plotDivId, data);
        if (hint) hint.textContent = 'px: ' + px + ', ' + py;
      });
      rgbWrap.addEventListener('mouseleave', function () {
        drawSpectrumPlot(plotDivId, getSpectrumForResult(resultId, null, null));
        if (hint) hint.textContent = 'Hover over reconstruction';
      });
    }
  }

  var resultsLoadingEl = null;
  var resultsRowEl = null;

  function showResultsLoading() {
    resultsLoadingEl = document.getElementById('results-loading');
    var container = document.querySelector('.results-container');
    if (container) resultsRowEl = container.querySelector('.results-row');
    if (resultsLoadingEl) {
      resultsLoadingEl.classList.remove('results-loading-done');
    }
    if (resultsRowEl) resultsRowEl.style.visibility = 'hidden';
  }

  function hideResultsLoading() {
    if (resultsRowEl) resultsRowEl.style.visibility = '';
    if (resultsLoadingEl) {
      resultsLoadingEl.classList.add('results-loading-done');
      setTimeout(function () {
        if (resultsLoadingEl) resultsLoadingEl.style.display = 'none';
      }, 320);
    }
  }

  function init() {
    var rows = document.querySelectorAll('.results-row');
    for (var i = 0; i < rows.length; i++) attachResultRow(rows[i]);
    if (RESULT_IMAGE_PATHS && typeof RESULT_IMAGE_PATHS === 'object') {
      function setRgbSrc(img, url) {
        if (!img || !url) return;
        try {
          img.src = new URL(url, window.location.href).href;
        } catch (e) {
          img.src = url;
        }
      }
      document.querySelectorAll('.results-row').forEach(function (row) {
        var resultId = row.getAttribute('data-result-id') || '0';
        var paths = RESULT_IMAGE_PATHS[resultId];
        var rgbImg = row.querySelector('.results-rgb-image');
        if (paths && paths.rgb) setRgbSrc(rgbImg, paths.rgb);
      });
      Object.keys(RESULT_IMAGE_PATHS).forEach(function (resultId) {
        var paths = RESULT_IMAGE_PATHS[resultId];
        if (!paths || !paths.rgb) return;
        var imgById = document.getElementById('results-rgb-image-' + resultId);
        if (imgById) setRgbSrc(imgById, paths.rgb);
      });
    }
  }

  function waitForResultImages() {
    var imgs = document.querySelectorAll('.results-row .results-measurements-carousel .item img');
    if (imgs.length === 0) return Promise.resolve();
    return Promise.all(Array.prototype.map.call(imgs, function (img) {
      return new Promise(function (resolve) {
        if (img.complete && img.naturalWidth !== 0) resolve();
        else {
          img.addEventListener('load', resolve);
          img.addEventListener('error', resolve);
        }
      });
    }));
  }

  function onReady() {
    init();
    waitForResultImages().then(function () {
      requestAnimationFrame(function () {
        requestAnimationFrame(hideResultsLoading);
      });
    });
  }

  function start() {
    if (RESULT_IMAGE_PATHS && typeof RESULT_IMAGE_PATHS === 'object') {
      Object.keys(RESULT_IMAGE_PATHS).forEach(function (resultId) {
        var paths = RESULT_IMAGE_PATHS[resultId];
        if (!paths || !paths.rgb) return;
        var img = document.getElementById('results-rgb-image-' + resultId);
        if (img) {
          try {
            img.src = new URL(paths.rgb, window.location.href).href;
          } catch (e) {
            img.src = paths.rgb;
          }
        }
      });
    }
    showResultsLoading();

    var promises = [];
    var isFileProtocol = window.location.protocol === 'file:';
    if (isFileProtocol && (SPECTRUM_BINARY_URLS || SPECTRUM_DATA_URL)) {
      console.warn('Spectrum from Defocus: Open this page over HTTP (e.g. http://localhost:8000) to load spectrum data. file:// cannot load local binaries.');
    }

    if (!isFileProtocol && !isMobileResults() && SPECTRUM_BINARY_URLS && typeof SPECTRUM_BINARY_URLS === 'object') {
      Object.keys(SPECTRUM_BINARY_URLS).forEach(function (resultId) {
        var urls = SPECTRUM_BINARY_URLS[resultId];
        if (typeof urls === 'string') {
          promises.push(
            fetch(urls).then(function (r) { return r.arrayBuffer(); }).then(function (buffer) {
              parseBinaryCube(resultId, buffer);
            })
          );
        } else if (urls && urls.gt && urls.recon) {
          var id = String(resultId);
          promises.push(
            Promise.all([
              fetch(urls.gt).then(function (r) { if (!r.ok) throw new Error(urls.gt + ' ' + r.status); return r.arrayBuffer(); }),
              fetch(urls.recon).then(function (r) { if (!r.ok) throw new Error(urls.recon + ' ' + r.status); return r.arrayBuffer(); })
            ]).then(function (bufs) {
              try {
                parseBinaryCubesFromTwoFiles(id, bufs[0], bufs[1]);
              } catch (e) {
                console.error('parseBinaryCubesFromTwoFiles failed', e);
                throw e;
              }
            })
          );
        }
      });
    }

    if (!isFileProtocol && !isMobileResults() && SPECTRUM_DATA_URL) {
      promises.push(
        fetch(SPECTRUM_DATA_URL).then(function (r) { return r.json(); }).then(function (data) {
          loadedSpectrumData = data;
        })
      );
    }

    if (promises.length > 0) {
      Promise.all(promises).then(function () { onReady(); }).catch(function (err) {
        console.error('Spectrum binary load failed', err);
        onReady();
      });
    } else {
      onReady();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
