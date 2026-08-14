/* ============================================================================
   ORAPA MINE — moteur de jeu
   ----------------------------------------------------------------------------
   Modele geometrique deduit du livret de regles :

   - Le plateau est une grille de 10 colonnes x 8 lignes.
   - Les 7 gemmes forment un jeu de TANGRAM dont le carre complet mesure 4x4
     cases. Chaque gemme a ses sommets sur des coins de la grille et ses aretes
     sont soit alignees sur la grille, soit a 45 degres.
   - Consequence : chaque case du plateau est soit vide, soit entierement
     couverte, soit couverte par une moitie triangulaire (NE / NO / SE / SO).
   - Les rayons circulent le long des axes centraux des cases. Une diagonale de
     case passe toujours par son centre : la reflexion a 90 degres se produit
     donc exactement au centre de la case. Une face plate est toujours sur un
     bord de case : la reflexion a 180 degres se produit sur ce bord.

   Repere : x = colonne (0..10), y = ligne (0..8), y croissant vers le bas.
   ========================================================================== */

(function (root) {
  'use strict';

  var COLS = 10;
  var ROWS = 8;

  /* ---------------------------------------------------------------- couleurs */

  var GEM_COLORS = {
    R: { key: 'R', nom: 'Rouge',      fill: '#e0342a', edge: '#9d1c14' },
    Y: { key: 'Y', nom: 'Jaune',      fill: '#f5a623', edge: '#a96b06' },
    B: { key: 'B', nom: 'Bleu',       fill: '#2b7fd4', edge: '#134f8c' },
    W: { key: 'W', nom: 'Blanc',      fill: '#f3f0e6', edge: '#b9b3a2' },
    D: { key: 'D', nom: 'Diamant',    fill: '#bfe8f4', edge: '#5f9fb1' },
    K: { key: 'K', nom: 'Corps noir', fill: '#181c24', edge: '#000000' }
  };

  // Melange soustractif R/Y/B, eclairci par le blanc.
  var MIX_BASE = {
    '':    'transparent',
    'R':   'rouge',
    'Y':   'jaune',
    'B':   'bleu',
    'RY':  'orange',
    'RB':  'violet',
    'YB':  'vert',
    'RYB': 'noir'
  };
  var MIX_WHITE = {
    '':    'blanc',
    'R':   'rose',
    'Y':   'jaune clair',
    'B':   'bleu ciel',
    'RY':  'orange clair',
    'RB':  'violet clair',
    'YB':  'vert clair',
    'RYB': 'gris'
  };
  // Teintes relevees sur le paravent du jeu.
  var RAY_HEX = {
    'transparent':   '#d8d8d8',
    'rouge':         '#e0342a',
    'jaune':         '#f5c518',
    'bleu':          '#2b7fd4',
    'orange':        '#f4793b',
    'vert':          '#7ed321',
    'violet':        '#b05fd6',
    'noir':          '#3b3b3b',
    'blanc':         '#ffffff',
    'rose':          '#f8a8bd',
    'jaune clair':   '#f7e9a0',
    'bleu ciel':     '#5cc9e8',
    'orange clair':  '#f7a97a',
    'vert clair':    '#a8e02c',
    'violet clair':  '#c77ee0',
    'gris':          '#8a8a8a'
  };

  // Aide de jeu : combinaisons possibles, dans l'ordre du paravent.
  var COMBOS = [
    { in: ['R'], out: 'rouge' },
    { in: ['Y'], out: 'jaune' },
    { in: ['B'], out: 'bleu' },
    { in: ['W'], out: 'blanc' },
    { in: ['R', 'Y'], out: 'orange' },
    { in: ['R', 'B'], out: 'violet' },
    { in: ['Y', 'B'], out: 'vert' },
    { in: ['R', 'Y', 'B'], out: 'noir' },
    { in: ['R', 'W'], out: 'rose' },
    { in: ['Y', 'W'], out: 'jaune clair' },
    { in: ['B', 'W'], out: 'bleu ciel' },
    { in: ['R', 'Y', 'W'], out: 'orange clair' },
    { in: ['R', 'B', 'W'], out: 'violet clair' },
    { in: ['Y', 'B', 'W'], out: 'vert clair' },
    { in: ['R', 'Y', 'B', 'W'], out: 'gris' }
  ];

  function melange(set) {
    var p = ['R', 'Y', 'B'].filter(function (c) { return set.indexOf(c) >= 0; }).join('');
    return set.indexOf('W') >= 0 ? MIX_WHITE[p] : MIX_BASE[p];
  }

  /* ------------------------------------------------------------------ pieces */
  // Polygones canoniques, sommets entiers, coin haut-gauche de la boite en 0,0.
  // Le carre tangram complet fait 4x4 cases : aires 4+4+2+2+2+1+1 = 16.

  var PIECES = [
    { id: 'grandB', nom: 'Grand triangle',  color: 'B', base: true,
      poly: [[0, 0], [4, 0], [2, 2]] },
    { id: 'grandW', nom: 'Grand triangle',  color: 'W', base: true,
      poly: [[0, 0], [4, 0], [2, 2]] },
    { id: 'moyen',  nom: 'Triangle moyen',  color: 'Y', base: true,
      poly: [[0, 0], [2, 0], [2, 2]] },
    { id: 'carre',  nom: 'Carre',           color: 'W', base: true,
      poly: [[1, 0], [2, 1], [1, 2], [0, 1]] },
    { id: 'para',   nom: 'Parallelogramme', color: 'R', base: true,
      poly: [[1, 0], [3, 0], [2, 1], [0, 1]] },
    { id: 'diamant', nom: 'Diamant',        color: 'D', base: false,
      poly: [[0, 0], [2, 0], [1, 1]] },
    { id: 'noir',   nom: 'Corps noir',      color: 'K', base: false,
      poly: [[0, 0], [2, 0], [1, 1]] }
  ];

  function pieceById(id) {
    for (var i = 0; i < PIECES.length; i++) if (PIECES[i].id === id) return PIECES[i];
    return null;
  }

  // Rotation de 90 deg. horaire : (x,y) -> (-y,x), puis recalage sur 0,0.
  function rotatePoly(poly, k) {
    var p = poly.map(function (v) { return [v[0], v[1]]; });
    for (var t = 0; t < ((k % 4) + 4) % 4; t++) {
      p = p.map(function (v) { return [-v[1], v[0]]; });
      var mnx = Math.min.apply(null, p.map(function (v) { return v[0]; }));
      var mny = Math.min.apply(null, p.map(function (v) { return v[1]; }));
      p = p.map(function (v) { return [v[0] - mnx, v[1] - mny]; });
    }
    return p;
  }

  function polyBox(poly) {
    var xs = poly.map(function (v) { return v[0]; });
    var ys = poly.map(function (v) { return v[1]; });
    return {
      x0: Math.min.apply(null, xs), y0: Math.min.apply(null, ys),
      w: Math.max.apply(null, xs) - Math.min.apply(null, xs),
      h: Math.max.apply(null, ys) - Math.min.apply(null, ys)
    };
  }

  // Polygone d'un placement, en coordonnees plateau.
  function placedPoly(pl) {
    var p = pieceById(pl.pieceId);
    return rotatePoly(p.poly, pl.rot).map(function (v) {
      return [v[0] + pl.x, v[1] + pl.y];
    });
  }

  function pointInPoly(px, py, poly) {
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if ((yi > py) !== (yj > py)) {
        var xc = (xj - xi) * (py - yi) / (yj - yi) + xi;
        if (px < xc) inside = !inside;
      }
    }
    return inside;
  }

  /* ------------------------------------------------------------ occupation */
  // Pour chaque case : liste des occupants { pieceId, color, half }
  // half vaut 'full' | 'NE' | 'NO' | 'SE' | 'SO'
  //
  // NE = sommets NO,NE,SE  -> diagonale NO-SE ("\"), couvre les bords N et E
  // NO = sommets NO,NE,SO  -> diagonale NE-SO ("/"), couvre les bords N et O
  // SE = sommets NE,SE,SO  -> diagonale NE-SO ("/"), couvre les bords S et E
  // SO = sommets NO,SO,SE  -> diagonale NO-SE ("\"), couvre les bords S et O

  var HALF_EDGES = {
    full: ['N', 'E', 'S', 'O'],
    NE: ['N', 'E'], NO: ['N', 'O'], SE: ['S', 'E'], SO: ['S', 'O']
  };
  var HALF_DIAG = { NE: '\\', SO: '\\', NO: '/', SE: '/' };

  function cellHalf(cx, cy, poly) {
    var n = pointInPoly(cx + 0.5, cy + 1 / 3, poly);
    var e = pointInPoly(cx + 2 / 3, cy + 0.5, poly);
    var s = pointInPoly(cx + 0.5, cy + 2 / 3, poly);
    var o = pointInPoly(cx + 1 / 3, cy + 0.5, poly);
    if (n && e && s && o) return 'full';
    if (n && e) return 'NE';
    if (n && o) return 'NO';
    if (s && e) return 'SE';
    if (s && o) return 'SO';
    return null;
  }

  function key(x, y) { return x + ',' + y; }

  function rasterize(placements) {
    var occ = {};
    placements.forEach(function (pl) {
      var poly = placedPoly(pl);
      var bb = polyBox(poly);
      for (var y = Math.floor(bb.y0); y < bb.y0 + bb.h; y++) {
        for (var x = Math.floor(bb.x0); x < bb.x0 + bb.w; x++) {
          var h = cellHalf(x, y, poly);
          if (!h) continue;
          var k = key(x, y);
          (occ[k] = occ[k] || []).push({
            pieceId: pl.pieceId,
            color: pieceById(pl.pieceId).color,
            half: h
          });
        }
      }
    });
    return occ;
  }

  /* ------------------------------------------------------- points d'entree */
  // Haut    : 1..10          (colonnes, de gauche a droite)
  // Droite  : 11..18         (lignes A..H, de haut en bas)
  // Bas     : I..R           (colonnes, de gauche a droite)
  // Gauche  : A..H           (lignes, de haut en bas)

  var LETTERS_ROW = 'ABCDEFGH';        // bord gauche + noms de lignes
  var LETTERS_COL = 'IJKLMNOPQR';      // bord bas

  function allEntries() {
    var out = [];
    var i;
    for (i = 1; i <= 10; i++) out.push(String(i));            // haut
    for (i = 11; i <= 18; i++) out.push(String(i));           // droite
    for (i = 0; i < 10; i++) out.push(LETTERS_COL[i]);        // bas
    for (i = 0; i < 8; i++) out.push(LETTERS_ROW[i]);         // gauche
    return out;
  }

  function entryStart(label) {
    var n = parseInt(label, 10);
    if (!isNaN(n) && String(n) === label) {
      if (n >= 1 && n <= 10) return { x: n - 0.5, y: 0, dx: 0, dy: 1 };          // haut -> bas
      if (n >= 11 && n <= 18) return { x: COLS, y: n - 11 + 0.5, dx: -1, dy: 0 };// droite -> gauche
      return null;
    }
    var ci = LETTERS_COL.indexOf(label);
    if (ci >= 0) return { x: ci + 0.5, y: ROWS, dx: 0, dy: -1 };                 // bas -> haut
    var ri = LETTERS_ROW.indexOf(label);
    if (ri >= 0) return { x: 0, y: ri + 0.5, dx: 1, dy: 0 };                     // gauche -> droite
    return null;
  }

  function exitLabel(x, y, dx, dy) {
    if (dy < 0 && y <= 0) return String(Math.floor(x) + 1);
    if (dy > 0 && y >= ROWS) return LETTERS_COL[Math.floor(x)];
    if (dx > 0 && x >= COLS) return String(11 + Math.floor(y));
    if (dx < 0 && x <= 0) return LETTERS_ROW[Math.floor(y)];
    return null;
  }

  var ENTRY_EDGE = { '0,1': 'N', '0,-1': 'S', '1,0': 'O', '-1,0': 'E' };

  function reflectDiag(dx, dy, diag) {
    // "\" = droite y=x : (dx,dy) -> (dy,dx)
    // "/" = droite y=-x : (dx,dy) -> (-dy,-dx)
    return diag === '\\' ? { dx: dy, dy: dx } : { dx: -dy, dy: -dx };
  }

  /* ------------------------------------------------------------ trace rayon */

  function trace(occ, label) {
    var st = entryStart(label);
    if (!st) return null;

    var x = st.x, y = st.y, dx = st.dx, dy = st.dy;
    // Case dans laquelle on entre :
    var cx = dx > 0 ? 0 : dx < 0 ? COLS - 1 : Math.floor(x);
    var cy = dy > 0 ? 0 : dy < 0 ? ROWS - 1 : Math.floor(y);

    var path = [[x, y]];
    var hits = [];          // couleurs touchees, dans l'ordre
    var touched = [];       // pieces touchees
    var absorbed = false;

    for (var guard = 0; guard < 2000; guard++) {
      if (cx < 0 || cx >= COLS || cy < 0 || cy >= ROWS) break;   // sortie

      var list = occ[key(cx, cy)];
      if (!list || !list.length) {
        x += dx; y += dy; cx += dx; cy += dy;
        continue;
      }

      var edge = ENTRY_EDGE[dx + ',' + dy];
      var blocker = null;
      for (var i = 0; i < list.length; i++) {
        if (HALF_EDGES[list[i].half].indexOf(edge) >= 0) { blocker = list[i]; break; }
      }

      if (blocker) {
        // face plate : demi-tour sur le bord de la case
        if (touched.indexOf(blocker.pieceId) < 0) touched.push(blocker.pieceId);
        if (blocker.color === 'K') { absorbed = true; path.push([x, y]); break; }
        if (blocker.color !== 'D' && hits.indexOf(blocker.color) < 0) hits.push(blocker.color);
        path.push([x, y]);
        dx = -dx; dy = -dy;
        cx += dx; cy += dy;
        continue;
      }

      // face inclinee : reflexion a 90 deg. au centre de la case
      var occu = list[0];
      if (touched.indexOf(occu.pieceId) < 0) touched.push(occu.pieceId);
      var mx = cx + 0.5, my = cy + 0.5;
      path.push([mx, my]);
      if (occu.color === 'K') { absorbed = true; break; }
      if (occu.color !== 'D' && hits.indexOf(occu.color) < 0) hits.push(occu.color);

      var nd = reflectDiag(dx, dy, HALF_DIAG[occu.half]);
      dx = nd.dx; dy = nd.dy;
      x = mx + dx * 0.5; y = my + dy * 0.5;
      cx += dx; cy += dy;
    }

    if (absorbed) {
      return { entry: label, exit: null, absorbed: true, couleur: null,
               hex: null, path: path, touched: touched };
    }
    path.push([x, y]);
    var couleur = melange(hits);
    return {
      entry: label,
      exit: exitLabel(x, y, dx, dy),
      absorbed: false,
      couleur: couleur,
      hex: RAY_HEX[couleur],
      path: path,
      touched: touched
    };
  }

  /* ----------------------------------------------- "Qu'y a-t-il en E4 ?" */

  function sonde(occ, col, row) {
    var list = occ[key(col, row)];
    if (!list || !list.length) return { texte: 'Rien', colors: [] };
    var noms = [], cols = [];
    list.forEach(function (o) {
      if (cols.indexOf(o.color) < 0) { cols.push(o.color); }
    });
    if (cols.indexOf('K') >= 0) return { texte: 'Le signal a ete absorbe', colors: cols };
    cols.forEach(function (c) {
      noms.push(c === 'D' ? 'le diamant' : 'une gemme ' + GEM_COLORS[c].nom.toLowerCase());
    });
    return { texte: noms.join(' et '), colors: cols };
  }

  /* --------------------------------------------------------- regles a..e */

  function checkRules(placements, skipReach) {
    var problems = [];
    var occ = rasterize(placements);

    // (c) rester dans le plateau
    placements.forEach(function (pl) {
      var bb = polyBox(placedPoly(pl));
      if (bb.x0 < 0 || bb.y0 < 0 || bb.x0 + bb.w > COLS || bb.y0 + bb.h > ROWS) {
        problems.push({ rule: 'c', msg: pieceById(pl.pieceId).nom + ' depasse du plateau.' });
      }
    });

    // (d) pas de chevauchement, pas de contact par une arete
    Object.keys(occ).forEach(function (k) {
      var l = occ[k];
      if (l.length > 1) {
        var ids = l.map(function (o) { return o.pieceId; });
        if (ids[0] !== ids[1]) {
          problems.push({ rule: 'd', msg: 'Deux gemmes se chevauchent ou sont cote a cote en ' + cellName(k) + '.' });
        }
      }
    });
    var dirs = [[1, 0, 'E', 'O'], [0, 1, 'S', 'N']];
    Object.keys(occ).forEach(function (k) {
      var p = k.split(',').map(Number);
      dirs.forEach(function (d) {
        var nk = key(p[0] + d[0], p[1] + d[1]);
        var a = occ[k], b = occ[nk];
        if (!b) return;
        a.forEach(function (oa) {
          if (HALF_EDGES[oa.half].indexOf(d[2]) < 0) return;
          b.forEach(function (ob) {
            if (ob.pieceId === oa.pieceId) return;
            if (HALF_EDGES[ob.half].indexOf(d[3]) < 0) return;
            problems.push({ rule: 'd', msg: 'Gemmes cote a cote (arete commune) pres de ' + cellName(k) + '.' });
          });
        });
      });
    });

    // (e) chaque gemme doit pouvoir etre atteinte par au moins un rayon
    var reached = {};
    if (!skipReach) allEntries().forEach(function (e) {
      var r = trace(occ, e);
      if (r) r.touched.forEach(function (id) { reached[id] = true; });
    });
    if (!skipReach) placements.forEach(function (pl) {
      if (!reached[pl.pieceId]) {
        problems.push({ rule: 'e', msg: pieceById(pl.pieceId).nom + ' n\'est atteinte par aucun rayon.' });
      }
    });

    // dedoublonnage
    var seen = {}, out = [];
    problems.forEach(function (p) {
      var s = p.rule + '|' + p.msg;
      if (!seen[s]) { seen[s] = 1; out.push(p); }
    });
    return out;
  }

  function cellName(k) {
    var p = k.split(',').map(Number);
    return LETTERS_ROW[p[1]] + (p[0] + 1);
  }

  /* --------------------------------------------------- placement aleatoire */

  function randomSetup(pieceIds, tries) {
    tries = tries || 4000;
    for (var t = 0; t < tries; t++) {
      var placements = [];
      var ok = true;
      for (var i = 0; i < pieceIds.length && ok; i++) {
        var placed = false;
        for (var a = 0; a < 250 && !placed; a++) {
          var rot = Math.floor(Math.random() * 4);
          var poly = rotatePoly(pieceById(pieceIds[i]).poly, rot);
          var bb = polyBox(poly);
          var px = Math.floor(Math.random() * (COLS - bb.w + 1));
          var py = Math.floor(Math.random() * (ROWS - bb.h + 1));
          var cand = placements.concat([{ pieceId: pieceIds[i], rot: rot, x: px, y: py }]);
          if (!checkRules(cand, true).length) { placements = cand; placed = true; }
        }
        if (!placed) ok = false;
      }
      if (ok && !checkRules(placements).length) return placements;
    }
    return null;
  }

  var API = {
    COLS: COLS, ROWS: ROWS,
    GEM_COLORS: GEM_COLORS, RAY_HEX: RAY_HEX, COMBOS: COMBOS,
    PIECES: PIECES, pieceById: pieceById,
    LETTERS_ROW: LETTERS_ROW, LETTERS_COL: LETTERS_COL,
    rotatePoly: rotatePoly, polyBox: polyBox, placedPoly: placedPoly,
    rasterize: rasterize, cellHalf: cellHalf, HALF_EDGES: HALF_EDGES, HALF_DIAG: HALF_DIAG,
    allEntries: allEntries, entryStart: entryStart,
    trace: trace, sonde: sonde, melange: melange,
    checkRules: checkRules, randomSetup: randomSetup, cellName: cellName
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.Orapa = API;

})(typeof globalThis !== 'undefined' ? globalThis : this);
