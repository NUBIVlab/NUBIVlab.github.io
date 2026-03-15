/**
 * Optical design diagram (Figure 2a style): thin lens arrows, optical axis,
 * distance annotations, 3 wavelengths (450, 550, 650 nm) with two rays each,
 * chromatic focus at same y (axis) but different z. Near-continuous slider with 5 ticks (z1..z5).
 *
 * PLUG-IN POINTS for real numbers:
 *   - OPTICS: distances (mm), wavelength range, measurement positions.
 *   - getFocusWavelength(): replace with lookup from slider → wavelength (e.g. from calibration).
 *   - draw(): xL1, xL2, xSensor can be driven by physical positions (mm) and a scale (mm → px).
 *   - drawRays(): focal positions (xFocal) can come from paraxial model or calibration table.
 */
(function () {
  'use strict';

  // --- Optical / calibration constants ---
  // Diagram is EXAGGERATED for clarity: real system has EFL ~34 mm at 550 nm,
  // red–blue focal separation ~0.9 mm, and moving lens travel <1 mm — too small to draw to scale.
  // When 550 nm is in focus: L1–L2 = 25.5 mm, L1–CCD = 41.9 mm (fixed), L2–CCD = 16.4 mm.
  // Effective focal length (mm) per wavelength for L1/L2; replace 450 and 650 with your values.
  var OPTICS = {
    focal_length_450_nm_mm: 47,
    focal_length_550_nm_mm: 50,
    focal_length_650_nm_mm: 53,
    distance_L1_CCD_mm: 41.9,
    distance_L1_L2_at_550_mm: 25.5,
    wavelength_min_nm: 440,
    wavelength_max_nm: 650,
    num_measurement_positions: 5,
    display_wavelengths_nm: [450, 550, 650]
  };

  var UI = {
    psf_size_px: 132,
    show_rays_at_slider: 50,
    lens_half_height_ratio: 0.22,
    sensor_half_height_ratio: 0.28,
    mobile_breakpoint_px: 640,
    lens_travel_exaggeration: 0.15,
    inset_size_px: 140,
    inset_circle_radius_px: 25,
    psf_block_bottom_margin: 20,
    psf_radius_per_mm_defocus: 10,
    psf_min_radius_px: 3
  };

  var RAY_COLORS = {
    450: 'rgb(30, 60, 200)',
    550: 'rgb(0, 130, 50)',
    650: 'rgb(190, 25, 35)'
  };

  function rgbToRgba(rgbStr, a) {
    var m = (rgbStr || '').match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (!m) return rgbStr || 'rgba(100,100,100,' + a + ')';
    return 'rgba(' + m[1] + ',' + m[2] + ',' + m[3] + ',' + a + ')';
  }

  var canvas = null;
  var slider = null;
  var ticksContainer = null;
  var wavelengthLabel = null;
  var ctx = null;
  var canvasWidth = 0;
  var canvasHeight = 0;
  var rafId = null;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);

  /** Focus position of 550 nm relative to CCD (mm). Set by draw(); use for PSF. */
  var focusRelativeToCCD_mm = null;
  /** Per-wavelength focus relative to CCD (mm), e.g. { 450: ..., 550: ..., 650: ... }. Set by draw(). */
  var focusRelativeToCCD_mm_by_wavelength = null;

  function getSliderNormalized() {
    return slider ? parseFloat(slider.value, 10) / 100 : 0.5;
  }

  function getFocalLengthMm(nm) {
    if (nm === 450) return OPTICS.focal_length_450_nm_mm;
    if (nm === 550) return OPTICS.focal_length_550_nm_mm;
    if (nm === 650) return OPTICS.focal_length_650_nm_mm;
    return OPTICS.focal_length_550_nm_mm;
  }

  /** Lens law: focus position (mm from L1) after L2, and relative to CCD. */
  function getFocusRelativeToCCD_mm(L2_mm, nm) {
    nm = nm == null ? 550 : nm;
    var f_mm = getFocalLengthMm(nm);
    var s_mm = L2_mm - f_mm;
    if (Math.abs(s_mm) < 0.01) return Infinity;
    var inv_s_prime = 1 / f_mm - 1 / s_mm;
    var s_prime_mm = Math.abs(inv_s_prime) < 1e-10 ? 1e10 : 1 / inv_s_prime;
    s_prime_mm = Math.max(-1e4, Math.min(1e4, s_prime_mm));
    var xFocal2_mm = L2_mm + s_prime_mm;
    return xFocal2_mm - OPTICS.distance_L1_CCD_mm;
  }

  /**
   * Wavelength (nm) that is in focus on the CCD at the current L2 position.
   * Uses focus_relative_to_CCD_mm_by_wavelength (set each draw) and linear interpolation.
   */
  function getFocusWavelength() {
    var byNm = focusRelativeToCCD_mm_by_wavelength;
    if (!byNm) {
      var t = getSliderNormalized();
      return OPTICS.wavelength_min_nm + (OPTICS.wavelength_max_nm - OPTICS.wavelength_min_nm) * t;
    }
    var d450 = byNm[450];
    var d550 = byNm[550];
    var d650 = byNm[650];
    if (d450 == null || d550 == null || d650 == null) return 550;
    var slope = (d650 - d450) / (650 - 450);
    if (Math.abs(slope) < 1e-10) return 550;
    var lambda = 450 - d450 / slope;
    var minNm = OPTICS.wavelength_min_nm;
    var maxNm = OPTICS.wavelength_max_nm;
    return Math.max(minNm, Math.min(maxNm, lambda));
  }

  function drawThinLensArrow(ctx, x, label, labelY, mainCy, mainHeight, subtitle) {
    var cy = mainCy != null ? mainCy : canvasHeight / 2;
    var h = (mainHeight != null ? mainHeight : canvasHeight) * UI.lens_half_height_ratio;
    var R = h * 3.2;
    var d = Math.sqrt(R * R - h * h);
    var angle = Math.atan2(h, d);
    var arrowHalfH = h * 1.2;
    var arrowHeadH = Math.min(12, arrowHalfH * 0.22);

    ctx.beginPath();
    ctx.arc(x - d, cy, R, -angle, angle, false);
    ctx.arc(x + d, cy, R, Math.PI - angle, Math.PI + angle, false);
    ctx.closePath();
    ctx.fillStyle = 'rgba(220, 212, 235, 0.75)';
    ctx.fill();
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.strokeStyle = '#000';
    ctx.fillStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, cy - arrowHalfH);
    ctx.lineTo(x, cy + arrowHalfH);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x, cy - arrowHalfH);
    ctx.lineTo(x - 5, cy - arrowHalfH + arrowHeadH);
    ctx.lineTo(x + 5, cy - arrowHalfH + arrowHeadH);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(x, cy + arrowHalfH);
    ctx.lineTo(x - 5, cy + arrowHalfH - arrowHeadH);
    ctx.lineTo(x + 5, cy + arrowHalfH - arrowHeadH);
    ctx.closePath();
    ctx.fill();

    if (labelY != null) {
      ctx.font = 'bold 14px sans-serif';
      ctx.fillStyle = '#363636';
      ctx.textAlign = 'center';
      ctx.fillText(label, x, labelY);
      if (subtitle != null) {
        drawFocalLengthSubtitle(ctx, x, labelY + 14, subtitle);
      }
    } else {
      ctx.font = 'bold 14px sans-serif';
      ctx.fillStyle = '#363636';
      ctx.textAlign = 'center';
      ctx.fillText(label, x, cy + arrowHalfH + 18);
      if (subtitle != null) {
        drawFocalLengthSubtitle(ctx, x, cy + arrowHalfH + 32, subtitle);
      }
    }
  }

  function drawFocalLengthSubtitle(ctx, x, y, focalMm) {
    var prefix = 'f ';
    var sub = '550nm';
    var suffix = ' = ' + focalMm + ' mm';
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#363636';
    ctx.textAlign = 'left';
    var w1 = ctx.measureText(prefix).width;
    ctx.font = '10px sans-serif';
    var w2 = ctx.measureText(sub).width;
    ctx.font = '12px sans-serif';
    var w3 = ctx.measureText(suffix).width;
    var total = w1 + w2 + w3;
    var x0 = x - total / 2;
    ctx.font = '12px sans-serif';
    ctx.fillText(prefix, x0, y);
    ctx.font = '10px sans-serif';
    ctx.fillText(sub, x0 + w1, y + 3);
    ctx.font = '12px sans-serif';
    ctx.fillText(suffix, x0 + w1 + w2, y);
    ctx.textAlign = 'center';
  }

  function drawOpticalAxis(ctx, xStart, xEnd, cy) {
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(xStart, cy);
    ctx.lineTo(xEnd, cy);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawDistanceLabel(ctx, x1, x2, y, text) {
    var ym = y - 18;
    ctx.strokeStyle = '#555';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x1, ym);
    ctx.lineTo(x2, ym);
    ctx.stroke();
    ctx.setLineDash([]);
    var arrow = 5;
    ctx.beginPath();
    ctx.moveTo(x1, ym);
    ctx.lineTo(x1 + arrow, ym - 3);
    ctx.lineTo(x1 + arrow, ym + 3);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, ym);
    ctx.lineTo(x2 - arrow, ym - 3);
    ctx.lineTo(x2 - arrow, ym + 3);
    ctx.closePath();
    ctx.stroke();
    ctx.font = 'bold 13px sans-serif';
    ctx.fillStyle = '#363636';
    ctx.textAlign = 'center';
    ctx.fillText(text, (x1 + x2) / 2, ym - 6);
  }

  function drawSensor(ctx, xSensor, labelY, mainCy, mainHeight) {
    var cy = mainCy != null ? mainCy : canvasHeight / 2;
    var h = (mainHeight != null ? mainHeight : canvasHeight) * UI.sensor_half_height_ratio;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(xSensor, cy - h);
    ctx.lineTo(xSensor, cy + h);
    ctx.stroke();
    ctx.font = 'bold 14px sans-serif';
    ctx.fillStyle = '#363636';
    ctx.textAlign = 'center';
    ctx.fillText('Grayscale Sensor', xSensor, labelY != null ? labelY : cy + h + 18);
  }

  function drawWavelengthLabel(ctx, xSensor, labelY) {
    var y = (labelY != null ? labelY + 20 : canvasHeight / 2 + canvasHeight * UI.sensor_half_height_ratio + 38);
    ctx.font = 'bold 13px sans-serif';
    ctx.fillStyle = '#363636';
    ctx.textAlign = 'center';
    ctx.fillText('λ in focus: ' + Math.round(getFocusWavelength()) + ' nm', xSensor, y);
  }

  /**
   * Draw rays for 450, 550, 650 nm at current lens position.
   * mainCy, mainHeight = vertical center and height of main diagram (for layout with PSFs below).
   * Returns { focus_relative_to_CCD_mm_by_wavelength, sensorY_by_nm: { nm: { top, bottom } } } for PSF and inset.
   */
  function drawRays(ctx, xL1, xL2, xSensor, scale, L2_mm, mainCy, mainHeight) {
    var cy = mainCy != null ? mainCy : canvasHeight / 2;
    var h = (mainHeight != null ? mainHeight : canvasHeight) * UI.lens_half_height_ratio;
    var x0 = 0;
    var focusByNm = {};
    var sensorYByNm = {};

    var wavelengths = OPTICS.display_wavelengths_nm;
    ctx.globalAlpha = 0.8;
    for (var w = 0; w < wavelengths.length; w++) {
      var nm = wavelengths[w];
      var f_mm = getFocalLengthMm(nm);

      var yTop = cy - h * 0.6;
      var yBottom = cy + h * 0.6;

      var xFocal1_px = xL1 + f_mm * scale;
      var dx1 = xFocal1_px - xL1;
      var tL2 = Math.abs(dx1) < 1e-6 ? 1 : (xL2 - xL1) / dx1;
      var yMidTop = yTop + tL2 * (cy - yTop);
      var yMidBottom = yBottom + tL2 * (cy - yBottom);

      var s_mm = L2_mm - f_mm;
      var inv_s_prime = Math.abs(s_mm) < 0.01 ? 0 : (1 / f_mm - 1 / s_mm);
      var s_prime_mm = Math.abs(inv_s_prime) < 1e-10 ? 1e10 : 1 / inv_s_prime;
      s_prime_mm = Math.max(-1e4, Math.min(1e4, s_prime_mm));
      var xFocal2_mm = L2_mm + s_prime_mm;
      var xFocal2_px = xL2 + s_prime_mm * scale;
      // Allow focus before L2 (virtual) or before CCD; only clamp to visible range
      xFocal2_px = Math.max(-200, Math.min(canvasWidth + 500, xFocal2_px));

      var denom = xFocal2_px - xL2;
      // tSensor = param such that ray from L2 toward focus hits plane x = xSensor.
      // When focus is before CCD, tSensor > 1 (rays converge then diverge to sensor) — do not clamp to 1.
      var tSensor = Math.abs(denom) < 1e-6 ? 1 : (xSensor - xL2) / denom;
      tSensor = Math.max(0, tSensor);
      var ySensorTop = yMidTop + tSensor * (cy - yMidTop);
      var ySensorBottom = yMidBottom + tSensor * (cy - yMidBottom);

      var focusRel = xFocal2_mm - OPTICS.distance_L1_CCD_mm;
      focusByNm[nm] = Number.isFinite(focusRel) ? focusRel : 0;
      sensorYByNm[nm] = { top: ySensorTop, bottom: ySensorBottom };

      var color = RAY_COLORS[nm] || 'rgb(100,100,100)';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.moveTo(x0, yTop);
      ctx.lineTo(xL1, yTop);
      ctx.lineTo(xL2, yMidTop);
      ctx.lineTo(xFocal2_px, cy);
      ctx.lineTo(xSensor, ySensorTop);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x0, yBottom);
      ctx.lineTo(xL1, yBottom);
      ctx.lineTo(xL2, yMidBottom);
      ctx.lineTo(xFocal2_px, cy);
      ctx.lineTo(xSensor, ySensorBottom);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    return { focus_relative_to_CCD_mm_by_wavelength: focusByNm, sensorY_by_nm: sensorYByNm };
  }

  function drawCircleAroundCCD(ctx, xSensor, cy, radius) {
    ctx.strokeStyle = 'rgba(180, 40, 40, 0.9)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.arc(xSensor, cy, radius, 0, Math.PI * 2, false);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /**
   * Draw the two common external tangent lines between the main circle (CCD region) and the inset circle.
   * Solves for the two lines that are tangent to both circles; no hardcoded angles.
   */
  function drawInsetConnectors(ctx, xSensor, cy, radius, insetX, insetY, insetW, insetH) {
    var cxInset = insetX + insetW / 2;
    var cyInset = insetY + insetH / 2;
    var insetRadius = Math.min(insetW, insetH) / 2 - 2;

    var x1 = xSensor;
    var y1 = cy;
    var r1 = radius;
    var x2 = cxInset;
    var y2 = cyInset;
    var r2 = insetRadius;

    var dx = x2 - x1;
    var dy = y2 - y1;
    var d = Math.sqrt(dx * dx + dy * dy);

    if (d < 1e-6 || d <= Math.abs(r2 - r1)) return;

    var ux = dx / d;
    var uy = dy / d;
    var vx = -uy;
    var vy = ux;

    var cosPhi = (r2 - r1) / d;
    var sinPhiSq = 1 - cosPhi * cosPhi;
    if (sinPhiSq < 0) return;
    var sinPhi = Math.sqrt(sinPhiSq);

    var n1x = ux * cosPhi + vx * sinPhi;
    var n1y = uy * cosPhi + vy * sinPhi;
    var n2x = ux * cosPhi - vx * sinPhi;
    var n2y = uy * cosPhi - vy * sinPhi;

    var p1ax = x1 - r1 * n1x;
    var p1ay = y1 - r1 * n1y;
    var p2ax = x2 - r2 * n1x;
    var p2ay = y2 - r2 * n1y;

    var p1bx = x1 - r1 * n2x;
    var p1by = y1 - r1 * n2y;
    var p2bx = x2 - r2 * n2x;
    var p2by = y2 - r2 * n2y;

    ctx.strokeStyle = 'rgba(180, 40, 40, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(p1ax, p1ay);
    ctx.lineTo(p2ax, p2ay);
    ctx.moveTo(p1bx, p1by);
    ctx.lineTo(p2bx, p2by);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /**
   * Draw inset by copying the circular region from the main canvas and scaling it up (true zoom).
   * Uses an offscreen canvas to avoid reading from the same canvas we draw to.
   */
  function drawInsetZoom(ctx, sourceCanvas, xSensor, cy, radius, insetX, insetY, insetW, insetH) {
    var cxInset = insetX + insetW / 2;
    var cyInset = insetY + insetH / 2;
    var insetRadius = Math.min(insetW, insetH) / 2 - 2;

    var srcSize = 2 * radius;
    var sx0 = (xSensor - radius) * dpr;
    var sy0 = (cy - radius) * dpr;
    var sw0 = srcSize * dpr;
    var sh0 = srcSize * dpr;
    var cw = sourceCanvas.width;
    var ch = sourceCanvas.height;
    var sx = Math.max(0, Math.min(cw - 1, sx0));
    var sy = Math.max(0, Math.min(ch - 1, sy0));
    var sw = Math.max(1, Math.min(sw0, cw - sx));
    var sh = Math.max(1, Math.min(sh0, ch - sy));

    if (sw < 2 || sh < 2) return;

    var off = document.createElement('canvas');
    off.width = sw;
    off.height = sh;
    var offCtx = off.getContext('2d');
    if (!offCtx) return;
    offCtx.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cxInset, cyInset, insetRadius, 0, Math.PI * 2, false);
    ctx.clip();
    ctx.drawImage(off, 0, 0, sw, sh, insetX, insetY, insetW, insetH);
    ctx.restore();

    ctx.strokeStyle = 'rgba(180, 40, 40, 0.8)';
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(cxInset, cyInset, insetRadius, 0, Math.PI * 2, false);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = '#363636';
    ctx.textAlign = 'center';
    ctx.fillText('CCD (magnified)', cxInset, insetY - 4);
  }

  function drawPSFPlaceholders(ctx, layoutRight, psfYOffset) {
    var wavelengths = OPTICS.display_wavelengths_nm;
    var n = wavelengths.length;
    var gap = 8;
    var totalW = n * UI.psf_size_px + (n - 1) * gap;
    var blockH = UI.psf_size_px + 36;
    psfYOffset = psfYOffset || 0;

    var x0, y0;
    if (layoutRight) {
      x0 = canvasWidth - 24 - totalW;
      y0 = (canvasHeight - blockH) / 2 + psfYOffset;
    } else {
      x0 = (canvasWidth - totalW) / 2;
      y0 = canvasHeight - blockH - 16;
    }

    var titleX = x0 + totalW / 2;
    ctx.font = 'bold 18px sans-serif';
    ctx.fillStyle = '#363636';
    ctx.textAlign = 'center';
    ctx.fillText("Simulated Sample PSF's", titleX, y0 - 6);

    var byNm = focusRelativeToCCD_mm_by_wavelength;
    var radiusPerMm = UI.psf_radius_per_mm_defocus;
    var minRadius = UI.psf_min_radius_px;
    var maxRadius = UI.psf_size_px / 2 - 4;

    for (var i = 0; i < n; i++) {
      var nm = wavelengths[i];
      var cx = x0 + UI.psf_size_px / 2 + i * (UI.psf_size_px + gap);
      var boxCy = y0 + UI.psf_size_px / 2 + 10;

      ctx.fillStyle = '#111';
      ctx.fillRect(cx - UI.psf_size_px / 2, boxCy - UI.psf_size_px / 2, UI.psf_size_px, UI.psf_size_px);
      ctx.strokeStyle = '#666';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - UI.psf_size_px / 2, boxCy - UI.psf_size_px / 2, UI.psf_size_px, UI.psf_size_px);

      if (byNm && byNm[nm] != null) {
        var defocusMm = byNm[nm];
        var defocusAbs = Number.isFinite(defocusMm) ? Math.abs(defocusMm) : 0;
        var r = Math.max(minRadius, Math.min(maxRadius, radiusPerMm * defocusAbs));
        var sigma = r;
        var color = RAY_COLORS[nm] || 'rgb(100,100,100)';
        var gradRadius = Math.min(maxRadius, Math.max(3 * sigma, 1));
        var stop1 = Math.min(1, sigma / gradRadius);
        var stop2 = Math.min(1, (2 * sigma) / gradRadius);
        var grad = ctx.createRadialGradient(cx, boxCy, 0, cx, boxCy, gradRadius);
        grad.addColorStop(0, rgbToRgba(color, 1));
        grad.addColorStop(stop1, rgbToRgba(color, Math.exp(-0.5)));
        if (stop2 > stop1) grad.addColorStop(stop2, rgbToRgba(color, Math.exp(-2)));
        grad.addColorStop(1, rgbToRgba(color, 0));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, boxCy, gradRadius, 0, Math.PI * 2, false);
        ctx.fill();
      }

      ctx.font = 'bold 13px sans-serif';
      ctx.fillStyle = '#363636';
      ctx.textAlign = 'center';
      ctx.fillText(nm + ' nm', cx, boxCy + UI.psf_size_px / 2 + 14);
    }
  }

  function draw() {
    if (!ctx || canvasWidth <= 0 || canvasHeight <= 0) return;

    var t = getSliderNormalized();
    var margin = canvasWidth * 0.04;
    var cy = canvasHeight / 2;
    var nPsf = OPTICS.display_wavelengths_nm.length;
    var totalPsfW = nPsf * UI.psf_size_px + (nPsf - 1) * 8;
    var psfBlockW = 24 + totalPsfW;
    var insetW = UI.inset_size_px;
    var insetH = UI.inset_size_px;
    var gap = 8;
    var opticsEnd = canvasWidth - margin - psfBlockW;
    var opticsW = opticsEnd - margin;

    var xL1 = margin + opticsW * 0.14;
    var xSensor = opticsEnd - opticsW * 0.12;
    var opticsSpan = xSensor - xL1;
    var ratioAt550 = OPTICS.distance_L1_L2_at_550_mm / OPTICS.distance_L1_CCD_mm;
    var ratioL2 = ratioAt550 + (t - 0.5) * UI.lens_travel_exaggeration;
    ratioL2 = Math.max(0.2, Math.min(0.85, ratioL2));
    var xL2 = xL1 + opticsSpan * ratioL2;

    var distance_L1_L2_mm = ratioL2 * OPTICS.distance_L1_CCD_mm;
    var distance_L2_CCD_mm = (1 - ratioL2) * OPTICS.distance_L1_CCD_mm;

    var arrowHalfH = canvasHeight * UI.lens_half_height_ratio * 1.2;
    var sensorH = canvasHeight * UI.sensor_half_height_ratio;
    var labelY = cy + Math.max(arrowHalfH, sensorH) + 18;
    var distanceY = cy - arrowHalfH + 4;

    var isMobile = canvasWidth <= UI.mobile_breakpoint_px;
    var psfLayoutRight = !isMobile;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    drawOpticalAxis(ctx, margin, opticsEnd, cy);

    var scale = opticsSpan / OPTICS.distance_L1_CCD_mm;
    var L2_mm = ratioL2 * OPTICS.distance_L1_CCD_mm;
    focusRelativeToCCD_mm = getFocusRelativeToCCD_mm(L2_mm, 550);
    var rayResult = drawRays(ctx, xL1, xL2, xSensor, scale, L2_mm, cy, canvasHeight);
    focusRelativeToCCD_mm_by_wavelength = rayResult.focus_relative_to_CCD_mm_by_wavelength;
    if (canvas) canvas.dataset.focusRelativeToCCD_mm = String(focusRelativeToCCD_mm);

    drawDistanceLabel(ctx, xL1, xL2, distanceY, distance_L1_L2_mm.toFixed(1) + ' mm');
    drawDistanceLabel(ctx, xL2, xSensor, distanceY, distance_L2_CCD_mm.toFixed(1) + ' mm');

    drawThinLensArrow(ctx, xL1, 'Objective Lens', labelY, null, null, OPTICS.focal_length_550_nm_mm);
    drawThinLensArrow(ctx, xL2, 'Moving Lens', labelY, null, null, OPTICS.focal_length_550_nm_mm);
    drawSensor(ctx, xSensor, labelY);
    drawWavelengthLabel(ctx, xSensor, labelY);

    var circleRadius = UI.inset_circle_radius_px;
    drawCircleAroundCCD(ctx, xSensor, cy, circleRadius);

    var psfX0 = canvasWidth - 24 - totalPsfW;
    var insetCenterX = psfX0 + UI.psf_size_px / 2;
    var insetX = insetCenterX - insetW / 2;
    var insetY = margin;
    var psfYOffset = Math.round(canvasHeight * 0.15);

    drawInsetConnectors(ctx, xSensor, cy, circleRadius, insetX, insetY, insetW, insetH);
    drawInsetZoom(ctx, canvas, xSensor, cy, circleRadius, insetX, insetY, insetW, insetH);

    drawPSFPlaceholders(ctx, psfLayoutRight, psfLayoutRight ? psfYOffset : 0);
  }

  function resize() {
    var container = canvas.parentElement;
    if (!container) return;
    var rect = container.getBoundingClientRect();
    var w = Math.max(300, Math.floor(rect.width));
    var h = Math.max(220, Math.floor(w * 0.5));
    if (w <= UI.mobile_breakpoint_px) h = Math.max(280, Math.floor(h * 1.15));

    canvasWidth = w;
    canvasHeight = h;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    draw();
  }

  function updateLabel() {
    if (wavelengthLabel) {
      wavelengthLabel.textContent = 'λ in focus: ' + Math.round(getFocusWavelength()) + ' nm';
    }
  }

  function scheduleDraw() {
    if (rafId) return;
    rafId = requestAnimationFrame(function () {
      rafId = null;
      draw();
      updateLabel();
    });
  }

  function buildTicks() {
    if (!ticksContainer) return;
    ticksContainer.innerHTML = '';
    for (var i = 0; i < OPTICS.num_measurement_positions; i++) {
      var tick = document.createElement('div');
      tick.className = 'tick';
      tick.setAttribute('data-position', i);
      ticksContainer.appendChild(tick);
    }
  }

  function init() {
    canvas = document.getElementById('optical-diagram-canvas');
    slider = document.getElementById('optical-slider');
    ticksContainer = document.getElementById('optical-slider-ticks');
    wavelengthLabel = document.getElementById('optical-wavelength-label');

    if (!canvas || !slider) return;

    // Start with 550 nm in focus (slider normalized t = 0.5)
    slider.value = 50;
    buildTicks();
    resize();
    updateLabel();

    slider.addEventListener('input', scheduleDraw);
    window.addEventListener('resize', function () {
      resize();
      updateLabel();
    });

    if (typeof ResizeObserver !== 'undefined') {
      var ro = new ResizeObserver(function () {
        resize();
        updateLabel();
      });
      var container = canvas.parentElement;
      if (container) ro.observe(container);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
