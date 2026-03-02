/**
 * OA SVG Export Module
 * Generates A4-sized SVG cutting templates for laser cutters.
 *
 * LightBurn / CorelDraw colour layer convention:
 *   Black  #000000  →  Cut (card boundary, face outlines, holes)
 *   Red    #FF0000  →  Score mountain folds
 *   Blue   #0000FF  →  Score valley folds
 *   Green  #00FF00  →  Score center fold line
 *
 * All strokes are solid hairlines (0.01mm) for clean laser import.
 * Dash patterns are visual only in the on-screen preview — the laser
 * operator assigns cut/score/engrave by colour in LightBurn.
 *
 * Page: A4 portrait (210 x 297 mm)
 * Card is centred on page with fold line at A4 vertical centre.
 */
OA.SvgExport = (function() {

  // A4 dimensions in mm
  var A4_W = 210;
  var A4_H = 297;

  // LightBurn layer colours
  var COLOR_CUT       = "#000000";  // Black  - cut through
  var COLOR_MOUNTAIN  = "#FF0000";  // Red    - score mountain folds
  var COLOR_VALLEY    = "#0000FF";  // Blue   - score valley folds
  var COLOR_CENTER    = "#00FF00";  // Green  - score center fold

  // Stroke width in mm — 0.3 is visible on screen for preview.
  // LightBurn/CorelDraw ignore stroke width and use their own kerf.
  var STROKE_WIDTH = 0.3;

  /**
   * Show export dialog and generate SVG.
   */
  function exportSVG(oaModel) {
    var modelData = oaModel.getModel();
    var cardW = modelData.settings.cardW;
    var cardH = modelData.settings.cardH;

    // The full card unfolded is cardW wide x (cardH * 2) tall
    // Max that fits on A4 with 5mm margin each side:
    var margin = 5;
    var maxW = A4_W - (margin * 2);
    var maxH = A4_H - (margin * 2);
    var maxCardW = maxW;
    var maxCardH = maxH / 2; // because card unfolds to 2x height

    // Calculate default target: scale to fit A4
    var fitScale = Math.min(maxW / cardW, maxH / (cardH * 2));
    var defaultW = Math.floor(cardW * fitScale);

    var input = prompt(
      'Enter target card WIDTH in mm (card will be ' +
      'scaled proportionally).\n\n' +
      'Current design ratio: ' + cardW + ' x ' + (cardH * 2) + ' units (W x H unfolded)\n' +
      'Max width for A4 with 5mm margins: ' + maxW + 'mm\n' +
      'Max height for A4: ' + maxCardH + 'mm (half-card)\n\n' +
      'Suggested (fit to A4): ' + defaultW + 'mm',
      defaultW
    );

    if (input === null) return; // cancelled

    var targetW = parseFloat(input);
    if (isNaN(targetW) || targetW <= 0) {
      alert('Invalid width. Please enter a number in mm.');
      return;
    }

    // Warn if it won't fit on A4
    var scale = targetW / cardW;
    var actualH = cardH * 2 * scale;
    if (targetW > maxW || actualH > maxH) {
      var proceed = confirm(
        'Warning: card at ' + targetW + 'mm wide will be ' +
        round(targetW) + ' x ' + round(actualH) + 'mm unfolded.\n' +
        'This exceeds A4 printable area (' + maxW + ' x ' + maxH + 'mm).\n\n' +
        'Export anyway?'
      );
      if (!proceed) return;
    }

    var svg = generateSVG(oaModel, { targetCardWidth: targetW });

    var date = new Date();
    var dateStr = date.getFullYear() + '-' +
      ('0' + (date.getMonth() + 1)).slice(-2) + '-' +
      ('0' + date.getDate()).slice(-2);
    downloadSVG(svg, 'popupcard_' + dateStr + '_' + targetW + 'mm.svg');
  }

  /**
   * Generate SVG string from the current OA model state.
   */
  function generateSVG(oaModel, opts) {
    opts = opts || {};
    var modelData = oaModel.getModel();
    var cardW = modelData.settings.cardW;
    var cardH = modelData.settings.cardH;

    // Calculate scale from OA units to mm
    var targetW = opts.targetCardWidth || 180;
    var scale = targetW / cardW;

    // Scaled card dimensions in mm
    var scaledW = cardW * scale;
    var scaledH = cardH * 2 * scale; // full unfolded height

    // Centre on A4
    var offsetX = (A4_W - scaledW) / 2;
    var offsetY = (A4_H - scaledH) / 2;

    // Get the 2D-flattened clipped faces (at 180°)
    var clippedFaces = oaModel.getCloneClippedFaces();
    var foldLines = oaModel.foldLines;

    // Coordinate transform: OA space → A4 mm space
    // OA X: 0 to cardW  →  offsetX to offsetX + scaledW
    // OA Y: cardH (top) to -cardH (bottom)  →  offsetY (top) to offsetY + scaledH (bottom)
    // SVG Y is inverted (down = positive)
    function tx(x) { return round(offsetX + (x * scale)); }
    function ty(y) { return round(offsetY + ((cardH - y) * scale)); }

    var svg = [];

    // SVG header — A4 page in mm, 1:1 scale
    svg.push(
      '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
      '<svg xmlns="http://www.w3.org/2000/svg"',
      '  width="210mm" height="297mm"',
      '  viewBox="0 0 210 297"',
      '  version="1.1">',
      '',
      '<!-- Pop-Up Card SVG Template for Laser Cutting -->',
      '<!-- Page: A4 (210 x 297 mm) -->',
      '<!-- Card: ' + round(scaledW) + ' x ' + round(scaledH) + ' mm (unfolded) -->',
      '<!-- Scale: 1 OA unit = ' + round(scale) + ' mm -->',
      '<!--',
      '  Colour layers for LightBurn / CorelDraw:',
      '    Black  #000000 = CUT (outline, faces, holes)',
      '    Red    #FF0000 = SCORE mountain folds',
      '    Blue   #0000FF = SCORE valley folds',
      '    Green  #00FF00 = SCORE center fold',
      '-->',
      ''
    );

    // ── Layer 1: Cut lines (black) ──
    svg.push('<g id="Cut" stroke="' + COLOR_CUT + '" stroke-width="' + STROKE_WIDTH + '" fill="none">');

    // Card boundary rectangle
    svg.push(
      '  <rect x="' + tx(0) + '" y="' + ty(cardH) + '"',
      '    width="' + round(scaledW) + '" height="' + round(scaledH) + '" />'
    );

    // Face outlines from clipped faces
    if (clippedFaces && clippedFaces.length) {
      $.each(clippedFaces, function(i, face) {
        // Skip base faces
        if (face.oaInfo && face.oaInfo.name &&
            (face.oaInfo.name === "baseVFace" || face.oaInfo.name === "baseHFace")) {
          return;
        }

        var contours = face.getExPolygons();
        if (!contours) return;

        $.each(contours, function(j, exPoly) {
          if (exPoly.outer && exPoly.outer.length > 1) {
            svg.push('  <path d="' + buildPath(exPoly.outer, tx, ty, true) + '" />');
          }
          if (exPoly.holes) {
            $.each(exPoly.holes, function(k, hole) {
              if (hole && hole.length > 1) {
                svg.push('  <path d="' + buildPath(hole, tx, ty, true) + '" />');
              }
            });
          }
        });
      });
    }

    svg.push('</g>');
    svg.push('');

    // ── Layer 2: Mountain folds (red) ──
    svg.push('<g id="Mountain_Folds" stroke="' + COLOR_MOUNTAIN + '" stroke-width="' + STROKE_WIDTH + '" fill="none">');

    if (foldLines && foldLines.mountain) {
      $.each(foldLines.mountain, function(i, ln) {
        if (ln && ln.length === 2) {
          svg.push(
            '  <line x1="' + tx(ln[0].X) + '" y1="' + ty(ln[0].Y) + '"',
            '    x2="' + tx(ln[1].X) + '" y2="' + ty(ln[1].Y) + '" />'
          );
        }
      });
    }

    svg.push('</g>');
    svg.push('');

    // ── Layer 3: Valley folds (blue) ──
    svg.push('<g id="Valley_Folds" stroke="' + COLOR_VALLEY + '" stroke-width="' + STROKE_WIDTH + '" fill="none">');

    if (foldLines && foldLines.valley) {
      $.each(foldLines.valley, function(i, ln) {
        if (ln && ln.length === 2) {
          svg.push(
            '  <line x1="' + tx(ln[0].X) + '" y1="' + ty(ln[0].Y) + '"',
            '    x2="' + tx(ln[1].X) + '" y2="' + ty(ln[1].Y) + '" />'
          );
        }
      });
    }

    svg.push('</g>');
    svg.push('');

    // ── Layer 4: Center fold (green) ──
    svg.push('<g id="Center_Fold" stroke="' + COLOR_CENTER + '" stroke-width="' + STROKE_WIDTH + '" fill="none">');
    svg.push(
      '  <line x1="' + tx(0) + '" y1="' + ty(0) + '"',
      '    x2="' + tx(cardW) + '" y2="' + ty(0) + '" />'
    );
    svg.push('</g>');
    svg.push('');

    svg.push('</svg>');

    return svg.join('\n');
  }

  /**
   * Build SVG path data from {X, Y} points.
   */
  function buildPath(points, tx, ty, closePath) {
    var d = [];
    $.each(points, function(i, pt) {
      d.push((i === 0 ? 'M' : 'L') + tx(pt.X) + ',' + ty(pt.Y));
    });
    if (closePath) d.push('Z');
    return d.join(' ');
  }

  function round(val) {
    return Math.round(val * 1000) / 1000;
  }

  function downloadSVG(svgString, filename) {
    var blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    var url = (window.URL || window.webkitURL).createObjectURL(blob);
    var link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function() {
      (window.URL || window.webkitURL).revokeObjectURL(url);
    }, 250);
  }

  // Public API
  return {
    generateSVG: generateSVG,
    downloadSVG: downloadSVG,
    exportSVG: exportSVG
  };

})();
