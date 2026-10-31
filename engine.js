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

  /* ============================================================ VERSIONS ===
     Le jeu existe en deux editions qui partagent le meme moteur : memes
     reflexions, memes couleurs, mais des plateaux et des pieces differents.
     Tout ce qui depend de l'edition est regroupe ici ; le reste du fichier
     n'en sait rien et travaille sur le « ruleset » qu'on lui passe.        */

  /* ---------------------------------------------------------------- couleurs */

  var GEM_COLORS = {
    R: { key: 'R', nom: 'Rouge',      fill: '#e0342a', edge: '#9d1c14' },
    Y: { key: 'Y', nom: 'Jaune',      fill: '#f5a623', edge: '#a96b06' },
    B: { key: 'B', nom: 'Bleu',       fill: '#2b7fd4', edge: '#134f8c' },
    W: { key: 'W', nom: 'Blanc',      fill: '#f3f0e6', edge: '#b9b3a2' },
    D: { key: 'D', nom: 'Diamant',    fill: '#bfe8f4', edge: '#5f9fb1' },
    // contour gris-bleu et non noir : sinon la gemme disparait sur le fond
    // sombre du bac, et ses lignes de surface ne se voient pas non plus
    K: { key: 'K', nom: 'Corps noir', fill: '#181c24', edge: '#5b6577' }
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

  // Toutes les reponses possibles (sert a remplir le menu de saisie).
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

  // Aide de jeu : uniquement les melanges, dans l'ordre exact du paravent.
  // Lu en deux colonnes, chaque ligne oppose le melange et sa version blanchie.
  var COMBOS_AIDE = [
    { in: ['R', 'Y'],           out: 'orange' },
    { in: ['R', 'Y', 'W'],      out: 'orange clair' },
    { in: ['R', 'B'],           out: 'violet' },
    { in: ['R', 'B', 'W'],      out: 'violet clair' },
    { in: ['Y', 'B'],           out: 'vert' },
    { in: ['Y', 'B', 'W'],      out: 'vert clair' },
    { in: ['R', 'W'],           out: 'rose' },
    { in: ['R', 'Y', 'B'],      out: 'noir' },
    { in: ['Y', 'W'],           out: 'jaune clair' },
    { in: ['R', 'Y', 'B', 'W'], out: 'gris' },
    { in: ['B', 'W'],           out: 'bleu ciel' }
  ];

  function melange(set) {
    var p = ['R', 'Y', 'B'].filter(function (c) { return set.indexOf(c) >= 0; }).join('');
    return set.indexOf('W') >= 0 ? MIX_WHITE[p] : MIX_BASE[p];
  }

  /* ------------------------------------------------------------------ pieces */
  // Polygones canoniques, sommets entiers, coin haut-gauche de la boite en 0,0.
  // Le carre tangram complet fait 4x4 cases : aires 4+4+2+2+2+1+1 = 16.

  var PIECES_MINE = [
    { id: 'grandB', nom: 'Grand triangle',  color: 'B', base: true,
      poly: [[0, 0], [4, 0], [2, 2]] },
    { id: 'grandW', nom: 'Grand triangle',  color: 'W', base: true,
      poly: [[0, 0], [4, 0], [2, 2]] },
    { id: 'moyen',  nom: 'Triangle moyen',  color: 'Y', base: true,
      poly: [[0, 0], [2, 0], [2, 2]] },
    { id: 'carre',  nom: 'Carré',           color: 'W', base: true,
      poly: [[1, 0], [2, 1], [1, 2], [0, 1]] },
    { id: 'para',   nom: 'Parallélogramme', color: 'R', base: true, chiral: true,
      poly: [[1, 0], [3, 0], [2, 1], [0, 1]] },
    { id: 'diamant', nom: 'Diamant',        color: 'D', base: false,
      poly: [[0, 0], [2, 0], [1, 1]] },
    // Le corps noir n'est pas une piece de tangram : c'est une pyramide posee
    // sur sa base rectangulaire, donc une empreinte de 2 x 1 cases.
    { id: 'noir',   nom: 'Corps noir',      color: 'K', base: false,
      poly: [[0, 0], [2, 0], [2, 1], [0, 1]] }
  ];

  /* ---------------------------------------------------------- pieces SPACE --
     Relevees au pixel sur les schemas du livret coreen, sur une grille de
     11 x 7. Memes contraintes que Mine : sommets sur les coins de la grille,
     aretes alignees ou a 45 degres.

     Saturne introduit une primitive nouvelle : un MUR, segment d'epaisseur
     nulle pose sur une ligne de la grille. Les rayons circulant au centre des
     cases, un mur horizontal n'est jamais rencontre que perpendiculairement,
     par un rayon vertical, qui rebondit a 180 degres.                       */

  var PIECES_SPACE = [
    // Octogone : boite 3x3, les quatre coins coupes d'une demi-case — aire 7
    // Le livret coreen le nomme 목성 (Jupiter) dans son exemple de jeu.
    { id: 'jupiter', nom: 'Jupiter', color: 'Y', base: true,
      poly: [[1,0],[2,0],[3,1],[3,2],[2,3],[1,3],[0,2],[0,1]] },

    // Trapeze : base 4, sommet 2, flancs a 45 degres puis verticaux — aire 7
    // nom inconnu : la plus grande piece du jeu.
    // Elle se pose toujours grande face contre un bord du plateau : le segment
    // `grandeFace` suit les rotations de la piece et sert a le verifier.
    { id: 'geante',  nom: 'Grande planète', color: 'W', base: true,
      poly: [[1,0],[3,0],[4,1],[4,2],[0,2],[0,1]],
      grandeFace: [[0,2],[4,2]] },

    // Losange 2x2 (aire 2) traverse d'un ANNEAU : un mur d'epaisseur nulle
    // pose sur la ligne mediane, prolonge d'une case de chaque cote.
    { id: 'saturne', nom: 'Saturne', color: 'W', base: true,
      poly: [[2,0],[3,1],[2,2],[1,1]],
      walls: [ [[0,1],[1,1]], [[3,1],[4,1]] ] },

    { id: 'terre',   nom: 'Terre', color: 'B', base: true,
      poly: [[1,0],[2,1],[1,2],[0,1]] },
    { id: 'mars',    nom: 'Mars', color: 'R', base: true,
      poly: [[1,0],[2,1],[1,2],[0,1]] },

    // Petite planete : une case pleine
    { id: 'petite',  nom: 'Petite planète', color: 'R', base: true,   // nom inconnu
      poly: [[0,0],[1,0],[1,1],[0,1]] },

    // Extension : ni planete ni miroir. Il detruit le rayon au contact et le
    // devie une fois a 90 degres quand celui-ci le depasse par une case voisine.
    { id: 'trounoir', nom: 'Trou noir', color: 'K', base: false, trouNoir: true,
      poly: [[0,0],[1,0],[1,1],[0,1]] }
  ];

  function pieceById(R, id) {
    for (var i = 0; i < R.pieces.length; i++)
      if (R.pieces[i].id === id) return R.pieces[i];
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

  // Symetrie par rapport a un axe vertical, puis recalage sur 0,0.
  function mirrorPoly(poly) {
    var p = poly.map(function (v) { return [-v[0], v[1]]; });
    var mnx = Math.min.apply(null, p.map(function (v) { return v[0]; }));
    return p.map(function (v) { return [v[0] - mnx, v[1]]; });
  }


  /* Place une piece : polygone ET murs subissent la meme transformation, et
     le recalage se fait sur leur boite commune — l'anneau de Saturne deborde
     du losange, il doit compter dans l'encombrement.                        */
  function placePiece(R, pl) {
    var p = pieceById(R, pl.pieceId);
    if (!p) return { poly: [], walls: [], grandeFace: null };
    var copie = function (seg) { return [[seg[0][0], seg[0][1]], [seg[1][0], seg[1][1]]]; };
    var poly = p.poly, walls = (p.walls || []).map(copie);
    var face = p.grandeFace ? copie(p.grandeFace) : null;
    var neg = function (v) { return [-v[0], v[1]]; };
    if (pl.flip) {
      poly = poly.map(neg);
      walls = walls.map(function (s) { return s.map(neg); });
      if (face) face = face.map(neg);
    }
    var tour = function (v) { return [-v[1], v[0]]; };
    for (var t = 0; t < ((pl.rot % 4) + 4) % 4; t++) {
      poly = poly.map(tour);
      walls = walls.map(function (s) { return s.map(tour); });
      if (face) face = face.map(tour);
    }
    var tous = poly.concat.apply(poly, walls);
    var mnx = Math.min.apply(null, tous.map(function (v) { return v[0]; }));
    var mny = Math.min.apply(null, tous.map(function (v) { return v[1]; }));
    var dep = function (v) { return [v[0] - mnx + pl.x, v[1] - mny + pl.y]; };
    return { poly: poly.map(dep),
             walls: walls.map(function (s) { return s.map(dep); }),
             grandeFace: face ? face.map(dep) : null };
  }

  // Polygone d'un placement, en coordonnees plateau.
  function placedPoly(R, pl) { return placePiece(R, pl).poly; }
  // Murs d'un placement (l'anneau de Saturne), en coordonnees plateau.
  function placedWalls(R, pl) { return placePiece(R, pl).walls; }

  // Cle d'une arete de case : 'H,x,y' = arete horizontale en haut de (x,y),
  // 'V,x,y' = arete verticale a gauche de (x,y).
  function wallKeys(seg) {
    var a = seg[0], b = seg[1], out = [], i;
    if (a[1] === b[1]) {                         // mur horizontal
      for (i = Math.min(a[0], b[0]); i < Math.max(a[0], b[0]); i++)
        out.push('H,' + i + ',' + a[1]);
    } else {                                     // mur vertical
      for (i = Math.min(a[1], b[1]); i < Math.max(a[1], b[1]); i++)
        out.push('V,' + a[0] + ',' + i);
    }
    return out;
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

  function rasterize(R, placements) {
    var occ = {}, murs = {}, trou = null;
    placements.forEach(function (pl) {
      var mis = placePiece(R, pl), poly = mis.poly;
      var piece = pieceById(R, pl.pieceId);
      mis.walls.forEach(function (seg) {
        wallKeys(seg).forEach(function (k) {
          murs[k] = { pieceId: pl.pieceId, color: piece.color };
        });
      });
      if (piece && piece.trouNoir) {
        var bb = polyBox(poly);
        trou = { x: Math.floor(bb.x0), y: Math.floor(bb.y0) };
      }
      var bb = polyBox(poly);
      for (var y = Math.floor(bb.y0); y < bb.y0 + bb.h; y++) {
        for (var x = Math.floor(bb.x0); x < bb.x0 + bb.w; x++) {
          var h = cellHalf(x, y, poly);
          if (!h) continue;
          var k = key(x, y);
          (occ[k] = occ[k] || []).push({
            pieceId: pl.pieceId,
            color: pieceById(R, pl.pieceId).color,
            half: h
          });
        }
      }
    });
    // attaches en non-enumerable : Object.keys(occ) ne voit toujours que
    // les cases, tout le code existant continue de fonctionner
    Object.defineProperty(occ, 'murs', { value: murs, enumerable: false });
    Object.defineProperty(occ, 'trou', { value: trou, enumerable: false });
    return occ;
  }

  /* ------------------------------------------------------- points d'entree */
  // Haut    : 1..10          (colonnes, de gauche a droite)
  // Droite  : 11..18         (lignes A..H, de haut en bas)
  // Bas     : I..R           (colonnes, de gauche a droite)
  // Gauche  : A..H           (lignes, de haut en bas)


  function allEntries(R) {
    var out = [];
    var i;
    for (i = 1; i <= R.cols; i++) out.push(String(i));                    // haut
    for (i = 1; i <= R.rows; i++) out.push(String(R.cols + i));           // droite
    for (i = 0; i < R.cols; i++) out.push(R.colLetters[i]);               // bas
    for (i = 0; i < R.rows; i++) out.push(R.rowLetters[i]);               // gauche
    return out;
  }

  function entryStart(R, label) {
    var n = parseInt(label, 10);
    if (!isNaN(n) && String(n) === label) {
      if (n >= 1 && n <= R.cols)                                   // haut -> bas
        return { x: n - 0.5, y: 0, dx: 0, dy: 1 };
      if (n > R.cols && n <= R.cols + R.rows)                      // droite -> gauche
        return { x: R.cols, y: n - R.cols - 0.5, dx: -1, dy: 0 };
      return null;
    }
    var ci = R.colLetters.indexOf(label);
    if (ci >= 0) return { x: ci + 0.5, y: R.rows, dx: 0, dy: -1 };                 // bas -> haut
    var ri = R.rowLetters.indexOf(label);
    if (ri >= 0) return { x: 0, y: ri + 0.5, dx: 1, dy: 0 };                     // gauche -> droite
    return null;
  }

  // Sur quelle ligne / colonne se trouve un repere de bord ?
  // Deux reperes de meme axe et meme index sont face a face (ex. A et 11).
  function labelPos(R, label) {
    if (!label) return null;
    var n = parseInt(label, 10);
    if (!isNaN(n) && String(n) === label) {
      if (n >= 1 && n <= R.cols) return { axis: 'col', i: n - 1 };            // haut
      if (n > R.cols && n <= R.cols + R.rows)                                 // droite
        return { axis: 'row', i: n - R.cols - 1 };
      return null;
    }
    var ci = R.colLetters.indexOf(label);
    if (ci >= 0) return { axis: 'col', i: ci };                    // bas
    var ri = R.rowLetters.indexOf(label);
    if (ri >= 0) return { axis: 'row', i: ri };                    // gauche
    return null;
  }

  // Les cases traversees par un rayon qui va tout droit de a jusqu'a b.
  // Renvoie null si les deux reperes ne se font pas face.
  function straightLine(R, a, b) {
    var pa = labelPos(R, a), pb = labelPos(R, b);
    if (!pa || !pb || pa.axis !== pb.axis || pa.i !== pb.i) return null;
    if (a === b) return null;
    var out = [], k;
    if (pa.axis === 'row') { for (k = 0; k < R.cols; k++) out.push([k, pa.i]); }
    else                   { for (k = 0; k < R.rows; k++) out.push([pa.i, k]); }
    return out;
  }

  function exitLabel(R, x, y, dx, dy) {
    if (dy < 0 && y <= 0) return String(Math.floor(x) + 1);
    if (dy > 0 && y >= R.rows) return R.colLetters[Math.floor(x)];
    if (dx > 0 && x >= R.cols) return String(R.cols + 1 + Math.floor(y));
    if (dx < 0 && x <= 0) return R.rowLetters[Math.floor(y)];
    return null;
  }

  var ENTRY_EDGE = { '0,1': 'N', '0,-1': 'S', '1,0': 'O', '-1,0': 'E' };

  function reflectDiag(dx, dy, diag) {
    // "\" = droite y=x : (dx,dy) -> (dy,dx)
    // "/" = droite y=-x : (dx,dy) -> (-dy,-dx)
    return diag === '\\' ? { dx: dy, dy: dx } : { dx: -dy, dy: -dx };
  }

  /* ------------------------------------------------------------ trace rayon */

  function trace(R, occ, label) {
    var st = entryStart(R, label);
    if (!st) return null;

    var x = st.x, y = st.y, dx = st.dx, dy = st.dy;
    // Case dans laquelle on entre :
    var cx = dx > 0 ? 0 : dx < 0 ? R.cols - 1 : Math.floor(x);
    var cy = dy > 0 ? 0 : dy < 0 ? R.rows - 1 : Math.floor(y);

    var path = [[x, y]];
    // Couleur du faisceau sur le segment qui PART de chaque point du trajet.
    // C'est ce qui permet de voir la lumiere se teinter en cours de route.
    var segColors = [melange([])];
    var hits = [];          // couleurs touchees, dans l'ordre
    var touched = [];       // pieces touchees, dans l'ordre
    // `vus` ne retient que ce que le rayon rencontre AVANT d'avoir devie :
    // c'est la vision directe depuis le bord, celle qu'exige la regle e.
    var vus = [], droit = true;
    var absorbed = false;

    var murs = occ.murs || {}, trou = occ.trou || null;
    var devie = false;          // le trou noir ne devie qu'une fois par rayon
    var areteVue = null;        // arete dont on vient de rebondir

    for (var guard = 0; guard < 2000; guard++) {
      if (cx < 0 || cx >= R.cols || cy < 0 || cy >= R.rows) break;   // sortie

      /* --- un mur sur l'arete que l'on s'apprete a franchir ---
         Les rayons circulant au centre des cases, un mur n'est jamais
         rencontre que perpendiculairement : demi-tour franc.               */
      var arete = dx ? 'V,' + Math.round(x) + ',' + Math.floor(y)
                     : 'H,' + Math.floor(x) + ',' + Math.round(y);
      if (murs[arete] && arete !== areteVue) {
        var mur = murs[arete];
        if (touched.indexOf(mur.pieceId) < 0) touched.push(mur.pieceId);
        if (droit) { vus.push(mur.pieceId); droit = false; }
        if (mur.color === 'K') { absorbed = true; path.push([x, y]); break; }
        if (mur.color !== 'D' && hits.indexOf(mur.color) < 0) hits.push(mur.color);
        path.push([x, y]); segColors.push(melange(hits));
        dx = -dx; dy = -dy;
        cx += dx; cy += dy;
        areteVue = arete;       // ne pas la redetecter au retour
        continue;
      }
      areteVue = null;

      /* --- deviation par le trou noir ---
         Le rayon longe le trou noir sur une case voisine ; c'est une fois
         AU-DELA, sur la case en diagonale, qu'il tourne de 90 degres vers
         lui et contourne le coin. Tourner plus tot l'enverrait dedans.
         Une seule deviation, et aucun changement de couleur.               */
      if (trou && !devie && !occ[key(cx, cy)]) {
        var ex = trou.x - cx, ey = trou.y - cy;
        var px = cx - dx, py = cy - dy;            // case precedente
        var ortho = Math.abs(trou.x - px) + Math.abs(trou.y - py) === 1;
        if (Math.abs(ex) === 1 && Math.abs(ey) === 1 && ortho) {
          var ndx = dx ? 0 : (ex > 0 ? 1 : -1);
          var ndy = dx ? (ey > 0 ? 1 : -1) : 0;
          x = cx + 0.5; y = cy + 0.5;
          path.push([x, y]); segColors.push(melange(hits));
          dx = ndx; dy = ndy;
          x += dx * 0.5; y += dy * 0.5;
          cx += dx; cy += dy;
          devie = true;
          droit = false;        // le trou noir a courbe le rayon : plus rien
          continue;             // de ce qui suit n'est vu « en direct »
        }
      }

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
        if (droit) { vus.push(blocker.pieceId); droit = false; }
        if (blocker.color === 'K') { absorbed = true; path.push([x, y]); break; }
        if (blocker.color !== 'D' && hits.indexOf(blocker.color) < 0) hits.push(blocker.color);
        path.push([x, y]); segColors.push(melange(hits));
        dx = -dx; dy = -dy;
        cx += dx; cy += dy;
        continue;
      }

      // face inclinee : reflexion a 90 deg. au centre de la case
      var occu = list[0];
      if (touched.indexOf(occu.pieceId) < 0) touched.push(occu.pieceId);
      if (droit) { vus.push(occu.pieceId); droit = false; }
      var mx = cx + 0.5, my = cy + 0.5;
      path.push([mx, my]);
      if (occu.color === 'K') { absorbed = true; break; }
      if (occu.color !== 'D' && hits.indexOf(occu.color) < 0) hits.push(occu.color);
      segColors.push(melange(hits));

      var nd = reflectDiag(dx, dy, HALF_DIAG[occu.half]);
      dx = nd.dx; dy = nd.dy;
      x = mx + dx * 0.5; y = my + dy * 0.5;
      cx += dx; cy += dy;
    }

    if (absorbed) {
      return { entry: label, exit: null, absorbed: true, couleur: null,
               hex: null, path: path, segColors: segColors,
               touched: touched, vus: vus };
    }
    path.push([x, y]);
    var couleur = melange(hits);
    return {
      entry: label,
      exit: exitLabel(R, x, y, dx, dy),
      absorbed: false,
      couleur: couleur,
      hex: RAY_HEX[couleur],
      path: path,
      segColors: segColors,     // segColors[i] : couleur du segment i -> i+1
      touched: touched,
      vus: vus                  // vision directe : au plus une piece
    };
  }

  /* ----------------------------------------------- "Qu'y a-t-il en E4 ?" */

  function sonde(R, occ, col, row) {
    var list = occ[key(col, row)];
    if (!list || !list.length) return { texte: 'Rien', colors: [] };
    var noms = [], cols = [];
    list.forEach(function (o) {
      if (cols.indexOf(o.color) < 0) { cols.push(o.color); }
    });
    if (cols.indexOf('K') >= 0) return { texte: 'Le signal a été absorbé', colors: cols };
    cols.forEach(function (c) {
      noms.push(c === 'D' ? 'le diamant'
        : 'une ' + R.motPiece + ' ' + GEM_COLORS[c].nom.toLowerCase());
    });
    return { texte: noms.join(' et '), colors: cols };
  }

  /* --------------------------------------------------------- regles a..e */

  function checkRules(R, placements, skipReach) {
    var problems = [];
    var occ = rasterize(R, placements);

    // (c) rester dans le plateau
    placements.forEach(function (pl) {
      var mis = placePiece(R, pl);
      var tous = mis.poly.concat.apply(mis.poly, mis.walls);
      var bb = polyBox(tous);          // l'anneau compte dans l'encombrement
      if (bb.x0 < 0 || bb.y0 < 0 || bb.x0 + bb.w > R.cols || bb.y0 + bb.h > R.rows) {
        problems.push({ rule: 'c', msg: pieceById(R, pl.pieceId).nom + ' dépasse du plateau.' });
      }
    });

    /* (d) deux gemmes ne peuvent se toucher que par un COIN
       Ni chevauchement, ni case partagee, ni arete commune : le seul contact
       tolere est le contact en un point. Deux tests, parce qu'il y a deux
       geometries distinctes — se partager une case (donc sa diagonale), et
       se coller le long d'une ligne du quadrillage.                        */
    Object.keys(occ).forEach(function (k) {
      var l = occ[k];
      if (l.length > 1) {
        var ids = l.map(function (o) { return o.pieceId; });
        if (ids[0] !== ids[1]) {
          problems.push({ rule: 'd', msg: 'Deux ' + R.motPieces +
            ' se partagent la case ' + cellName(R, k) + '.' });
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
            problems.push({ rule: 'd', msg: R.motPiecesMaj +
              ' collées par une arête près de ' + cellName(R, k) + '.' });
          });
        });
      });
    });

    /* (d bis) un mur ne traverse pas une autre piece
       L'anneau de Saturne est une piece de matiere, pas une abstraction : il
       ne peut pas passer a travers une planete voisine. Comme il repose sur
       une ligne du quadrillage, il borde deux cases ; toute matiere etrangere
       dans l'une des deux serait, au mieux, collee contre lui — ce que la
       regle d interdit deja entre deux pieces.                             */
    Object.keys(occ.murs || {}).forEach(function (k) {
      var m = occ.murs[k], p = k.split(',');
      var cx = +p[1], cy = +p[2];
      var voisines = p[0] === 'H' ? [[cx, cy - 1], [cx, cy]]   // au-dessus, au-dessous
                                  : [[cx - 1, cy], [cx, cy]];  // a gauche, a droite
      voisines.forEach(function (c) {
        var l = occ[key(c[0], c[1])];
        if (!l) return;
        l.forEach(function (o) {
          if (o.pieceId === m.pieceId) return;
          problems.push({ rule: 'd', msg: pieceById(R, m.pieceId).nom +
            ' : son anneau traverse une autre pièce en ' + cellName(R, key(c[0], c[1])) + '.' });
        });
      });
    });

    /* (f) la grande planete se pose grande face contre un bord
       Elle est la seule piece contrainte ainsi ; son long cote suit ses
       rotations (voir `grandeFace` dans le catalogue et dans placePiece).  */
    placements.forEach(function (pl) {
      var f = placePiece(R, pl).grandeFace;
      if (!f) return;
      var horiz = f[0][1] === f[1][1], vert = f[0][0] === f[1][0];
      var colle = (horiz && (f[0][1] === 0 || f[0][1] === R.rows)) ||
                  (vert  && (f[0][0] === 0 || f[0][0] === R.cols));
      if (!colle) {
        problems.push({ rule: 'f', msg: pieceById(R, pl.pieceId).nom +
          ' doit être posée grande face contre un bord du plateau.' });
      }
    });

    /* (e) aucune forme entierement cachee derriere les autres
       Lecture stricte du livret : « si l'on regarde depuis un bord du
       plateau ». Une forme est visible si elle est la PREMIERE rencontree
       par l'un des 36 rayons, avant tout rebond et toute deviation — un
       contact obtenu apres reflexion ne compte pas.                        */
    if (!skipReach) {
      var vues = {};
      allEntries(R).forEach(function (e) {
        var r = trace(R, occ, e);
        if (r) r.vus.forEach(function (id) { vues[id] = true; });
      });
      placements.forEach(function (pl) {
        if (!vues[pl.pieceId]) {
          problems.push({ rule: 'e', msg: pieceById(R, pl.pieceId).nom +
            ' est entièrement cachée : aucun rayon direct ne l\'atteint.' });
        }
      });
    }

    // dedoublonnage
    var seen = {}, out = [];
    problems.forEach(function (p) {
      var s = p.rule + '|' + p.msg;
      if (!seen[s]) { seen[s] = 1; out.push(p); }
    });
    return out;
  }

  function cellName(R, k) {
    var p = k.split(',').map(Number);
    return R.rowLetters[p[1]] + (p[0] + 1);
  }

  // « C6 » -> { x: 5, y: 2 }. Renvoie null si ce n'est pas une case du plateau.
  // Aucune ambiguite avec les reperes de bord : ceux-ci sont soit un nombre
  // seul (1 a 18), soit une lettre seule (A a R).
  function cellFromName(R, name) {
    var t = (name || '').trim().toUpperCase();
    var m = /^([A-Z])(\d{1,2})$/.exec(t);
    if (!m) return null;
    var y = R.rowLetters.indexOf(m[1]), x = parseInt(m[2], 10) - 1;
    if (y < 0 || x < 0 || x >= R.cols) return null;
    return { x: x, y: y };
  }

  /* --------------------------------------------------- placement aleatoire */

  function randomSetup(R, pieceIds, tries) {
    tries = tries || 4000;
    // Les pieces les plus contraintes passent en premier, sinon les autres
    // leur mangent les bords et le tirage echoue sans raison.
    pieceIds = pieceIds.slice().sort(function (a, b) {
      var pa = pieceById(R, a), pb = pieceById(R, b);
      return (pb && pb.grandeFace ? 1 : 0) - (pa && pa.grandeFace ? 1 : 0);
    });
    for (var t = 0; t < tries; t++) {
      var placements = [];
      var ok = true;
      for (var i = 0; i < pieceIds.length && ok; i++) {
        var placed = false;
        for (var a = 0; a < 250 && !placed; a++) {
          var rot = Math.floor(Math.random() * 4);
          var pc = pieceById(R, pieceIds[i]);
          var flip = (pc && pc.chiral) && Math.random() < 0.5 ? 1 : 0;
          var trial = { pieceId: pieceIds[i], rot: rot, flip: flip, x: 0, y: 0 };
          var mis0 = placePiece(R, trial);
          var bb = polyBox(mis0.poly);
          var px = Math.floor(Math.random() * (R.cols - bb.w + 1));
          var py = Math.floor(Math.random() * (R.rows - bb.h + 1));
          /* Piece a grande face : plutot que de tirer au hasard en esperant
             tomber contre un bord, on colle directement le cote long au bord
             vers lequel la rotation l'a tourne. L'autre coordonnee reste
             libre, donc le placement demeure varie.                        */
          var f0 = mis0.grandeFace;
          if (f0) {
            if (f0[0][1] === f0[1][1]) {                 // face horizontale
              py = (f0[0][1] === bb.y0) ? 0 : R.rows - bb.h;
            } else {                                     // face verticale
              px = (f0[0][0] === bb.x0) ? 0 : R.cols - bb.w;
            }
          }
          trial.x = px; trial.y = py;
          var cand = placements.concat([trial]);
          if (!checkRules(R, cand, true).length) { placements = cand; placed = true; }
        }
        if (!placed) ok = false;
      }
      if (ok && !checkRules(R, placements).length) return placements;
    }
    return null;
  }

  /* ======================================================= jeux de regles ===
     Chaque edition decrit son plateau et ses pieces ; le moteur ci-dessus
     n'en sait rien. `ruleset(nom)` renvoie une facade dont toutes les
     methodes sont deja liees a cette edition, ce qui permet de faire tourner
     deux parties de front sans qu'elles se melangent.                       */

  /* Chaque edition apporte aussi son vocabulaire. Sans ca, Space parlerait
     de « gemmes » et proposerait une pastille « Diamant » qu'aucune de ses
     pieces ne porte.                                                       */
  var VERSIONS = {
    mine: {
      id: 'mine', nom: 'Mine',
      cols: 10, rows: 8,
      rowLetters: 'ABCDEFGH',      // bord gauche, et noms de lignes
      colLetters: 'IJKLMNOPQR',    // bord bas
      pieces: PIECES_MINE,
      motPiece: 'gemme', motPieces: 'gemmes', motPiecesMaj: 'Gemmes',
      motPanneau: 'Mes gemmes',
      nomsCouleur: { K: 'Corps noir' }
    },
    space: {
      id: 'space', nom: 'Space',
      cols: 11, rows: 7,
      rowLetters: 'ABCDEFG',
      colLetters: 'HIJKLMNOPQR',
      pieces: PIECES_SPACE,
      motPiece: 'planète', motPieces: 'planètes', motPiecesMaj: 'Planètes',
      motPanneau: 'Mes planètes',
      nomsCouleur: { K: 'Trou noir' }
    }
  };

  // Couleurs effectivement portees par les pieces d'une edition, dans
  // l'ordre de la palette. Space n'a pas de diamant : il ne doit pas en
  // proposer la pastille.
  function couleursDe(R) {
    var ordre = ['R', 'Y', 'B', 'W', 'D', 'K'], vues = {};
    R.pieces.forEach(function (p) { vues[p.color] = true; });
    return ordre.filter(function (k) { return vues[k]; });
  }
  function nomCouleur(R, k) {
    return (R.nomsCouleur && R.nomsCouleur[k]) || GEM_COLORS[k].nom;
  }

  function ruleset(nom) {
    var R = VERSIONS[nom] || VERSIONS.mine;
    function lie(fn) {
      return function () {
        var args = [R].concat(Array.prototype.slice.call(arguments));
        return fn.apply(null, args);
      };
    }
    var f = {
      id: R.id, nom: R.nom,
      COLS: R.cols, ROWS: R.rows,
      LETTERS_ROW: R.rowLetters, LETTERS_COL: R.colLetters,
      PIECES: R.pieces,
      pieceById:   lie(pieceById),
      placedPoly:  lie(placedPoly),
      placedWalls: lie(placedWalls),
      rasterize:   lie(rasterize),
      allEntries:  lie(allEntries),
      entryStart:  lie(entryStart),
      labelPos:    lie(labelPos),
      straightLine:lie(straightLine),
      trace:       lie(trace),
      sonde:       lie(sonde),
      checkRules:  lie(checkRules),
      randomSetup: lie(randomSetup),
      cellName:    lie(cellName),
      cellFromName:lie(cellFromName),
      motPiece: R.motPiece, motPieces: R.motPieces,
      motPiecesMaj: R.motPiecesMaj, motPanneau: R.motPanneau,
      COULEURS: couleursDe(R),
      nomCouleur: function (k) { return nomCouleur(R, k); },
      isChiral: function (id) {
        var p = pieceById(R, id);
        return !!(p && p.chiral);
      }
    };
    /* Les donnees communes aux deux editions — couleurs, melanges, geometrie
       pure — sont recopiees sur la facade. L'interface n'a donc qu'un seul
       objet a manipuler : elle rebranche `O` sur l'autre edition et tout
       suit, y compris ce qui ne depend pas du plateau.                     */
    for (var k in COMMUN) if (!(k in f)) f[k] = COMMUN[k];
    return f;
  }

  // Ce qui ne depend ni du plateau ni des pieces.
  var COMMUN = {
    GEM_COLORS: GEM_COLORS, RAY_HEX: RAY_HEX,
    COMBOS: COMBOS, COMBOS_AIDE: COMBOS_AIDE, melange: melange,
    rotatePoly: rotatePoly, mirrorPoly: mirrorPoly, polyBox: polyBox,
    cellHalf: cellHalf, HALF_EDGES: HALF_EDGES, HALF_DIAG: HALF_DIAG
  };

  var API = { VERSIONS: VERSIONS, ruleset: ruleset };
  for (var ck in COMMUN) API[ck] = COMMUN[ck];

  // L'edition Mine reste accessible directement : tout le code existant
  // continue de fonctionner sans savoir que les versions existent.
  var MINE = ruleset('mine');
  for (var k in MINE) if (!(k in API)) API[k] = MINE[k];

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.Orapa = API;

})(typeof globalThis !== 'undefined' ? globalThis : this);
