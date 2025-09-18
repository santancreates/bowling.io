// Color order fixed at 4 players max
export const COLORS = ["red","blue","yellow","green"];
export const COLOR_HEX = { red:"#ef4444", blue:"#3b82f6", yellow:"#eab308", green:"#22c55e" };

// Track: 52 main cells (0..51). Each color has a start index offset:
// Red:0, Blue:13, Yellow:26, Green:39. Home path has 6 cells per color: ids 0..5 in a separate home array.
// Yard: -1. Finished: 6 (home index == 6).
export const START_OFFSET = { red:0, blue:13, yellow:26, green:39 };
export const SAFE_CELLS = new Set([0,8,13,21,26,34,39,47]); // classic safe stars (incl start squares)

// Build board coordinates (grid-ish but hand-coded where needed)
export function buildBoardGeometry(size=600){
  // 15x15 grid; each cell size:
  const cs = size/15;
  // path sequence coordinates for 52 main cells (clockwise around)
  // We'll generate roughly: top row, right column, bottom row, left column, etc.
  // For simplicity, use a common simple Ludo layout path:
  const path = [];
  const toXY = (gx,gy)=>({x: gx*cs + cs*0.5, y: gy*cs + cs*0.5, r: cs*0.38});

  // start at red entry (middle top going right → classic differs; we'll choose a consistent ring)
  // We'll define a ring: (6,1)→(8,1)→down→→… This is a simplified layout that fits the look.
  const seq = [
    [6,1],[7,1],[8,1],[9,2],[9,3],[9,4],[9,5],[10,6],[11,6],[12,6],
    [13,6],[13,7],[13,8],[12,8],[11,8],[10,8],[9,9],[9,10],[9,11],[9,12],
    [8,13],[7,13],[6,13],[5,12],[5,11],[5,10],[5,9],[4,8],[3,8],[2,8],
    [1,8],[1,7],[1,6],[2,6],[3,6],[4,6],[5,5],[5,4],[5,3],[5,2],
    [6,1] // loop close (we'll shift offsets per color)
  ];
  // We need 52 unique cells; expand/duplicate to 52 by walking ring (avoid last duplicate)
  const ring = [];
  for (let i=0;i<seq.length-1;i++) ring.push(seq[i]);
  // Stretch ring to 52 by repeating some segments (good enough for MVP)
  while (ring.length < 52) {
    ring.push(ring[ring.length % (seq.length-1)]);
  }
  ring.length = 52;
  for (const [gx,gy] of ring) path.push(toXY(gx,gy));

  // home paths (6 each), roughly straight lines into center
  const home = {
    red:   Array.from({length:6}, (_,i)=>toXY(7, 2+i)),   // down from top to center
    blue:  Array.from({length:6}, (_,i)=>toXY(12-i,7)),   // left from right to center
    yellow:Array.from({length:6}, (_,i)=>toXY(7,12-i)),   // up from bottom to center
    green: Array.from({length:6}, (_,i)=>toXY(2+i,7))     // right from left to center
  };

  // yard positions (4 per color)
  const yard = {
    red:   [[2,2],[4,2],[2,4],[4,4]].map(([gx,gy])=>toXY(gx,gy)),
    blue:  [[11,2],[13,2],[11,4],[13,4]].map(([gx,gy])=>toXY(gx,gy)),
    yellow:[[11,11],[13,11],[11,13],[13,13]].map(([gx,gy])=>toXY(gx,gy)),
    green: [[2,11],[4,11],[2,13],[4,13]].map(([gx,gy])=>toXY(gx,gy))
  };

  // start cells (entries to track):
  const startCell = {
    red:    path[0],
    blue:   path[13%52],
    yellow: path[26%52],
    green:  path[39%52]
  };

  return { cs, path, home, yard, startCell };
}

// Helpers to rotate a color’s main track index
export function colorTrackIndex(color, rawIndex) {
  // The shared path uses red's 0 at raw path[0].
  // For a piece with absolute index k on the main ring (0..51), its visual pos is path[(k)%52].
  // A player's "start" absolute index is START_OFFSET[color].
  return (rawIndex + 52) % 52;
}

// --- Rules ---

export function initialState(players) {
  // players: [{id,name,color}]
  const pos = {};
  for (const p of players) pos[p.id] = [-1,-1,-1,-1]; // -1 = yard
  return {
    status: "waiting",       // "waiting" | "playing" | "finished"
    order: players.map(p=>p.id),
    colors: Object.fromEntries(players.map(p=>[p.id,p.color])),
    turnIndex: 0,
    dice: null,              // last rolled value 1..6 (or null)
    positions: pos,          // {pid:[p0,p1,p2,p3]}
    winners: []              // array of pids in finishing order
  };
}

export function nextColorForJoin(currentColors) {
  // pick next available in COLORS
  for (const c of COLORS) if (!currentColors.includes(c)) return c;
  return null;
}

export function rollDie() {
  return 1 + Math.floor(Math.random()*6);
}

export function absoluteStartIndex(color) {
  return START_OFFSET[color]; // 0,13,26,39
}

export function legalMovesForPlayer(state, pid) {
  const color = state.colors[pid];
  const absStart = absoluteStartIndex(color);
  const dice = state.dice;
  if (!dice) return [];

  const my = state.positions[pid];
  const moves = []; // entries: {piece:0..3, from, to, kind:"enter|move|home", capturePid?:..., capturePiece?:...}

  // Build a map of board occupancy (absolute ring index -> {pid,piece})
  const occ = new Map();
  for (const opid of Object.keys(state.positions)) {
    const arr = state.positions[opid];
    const ocolor = state.colors[opid];
    const ostart = absoluteStartIndex(ocolor);
    arr.forEach((v,i)=>{
      if (v >= 0 && v < 52) {
        const abs = (ostart + v) % 52; // absolute ring index
        if (!occ.has(abs)) occ.set(abs, []);
        occ.get(abs).push({ pid: opid, piece:i, color: ocolor });
      }
    });
  }

  for (let i=0;i<4;i++){
    const v = my[i];

    // piece in yard
    if (v === -1) {
      if (dice === 6) {
        const absDest = absStart; // entering at start
        // safe square (start is safe) → allow even if others present (stack)
        moves.push({ piece:i, from:-1, to:0, kind:"enter" });
      }
      continue;
    }

    // piece already finished (coded as 100..106? we’ll use 100+homeIndex; 106 == home)
    if (v >= 100) continue; // already in home path or finished

    // moving along main track
    const newPos = v + dice;
    // Check if we must enter home path (after full loop + towards color’s home)
    // Simplified: each color enters home when passing its absStart again after 52 - absStart + 5 — classic rules depend on layout;
    // For MVP we use: when v in [52-6, 51] and move goes beyond 51, go into home with overflow steps.
    if (newPos < 52) {
      // landing cell absolute
      const absDest = (absStart + newPos) % 52;

      // safe square logic: captures allowed only if landing cell is NOT safe or if opponents are solo (classic Ludo: safe squares protect stacks)
      const occupants = occ.get(absDest) || [];
      let captures = [];
      if (!SAFE_CELLS.has(absDest) && occupants.length) {
        // capture all opponents on that cell (classic usually stacks protect; we’ll capture single opponents only)
        if (occupants.length === 1 && occupants[0].pid !== pid) {
          captures = occupants;
        } else {
          // landing on multiple or safe → blocked
          // but two of your own can stack (allowed)
          const allMine = occupants.every(o=>o.pid===pid);
          if (!allMine) continue; // illegal move
        }
      }
      moves.push({ piece:i, from:v, to:newPos, kind:"move", capture: captures[0] });
    } else {
      // home entries
      const overflow = newPos - 52; // steps into home path (0..6)
      if (overflow <= 6) {
        // must have exact 6 to finish (overflow==6)
        // cannot pass beyond home
        moves.push({ piece:i, from:v, to:100 + overflow, kind:"home" });
      }
    }
  }

  // Filter: for home move, ensure exact end <= 106 (100..106), if >106 it's illegal (we already bounded).
  // If no moves and dice !== 6 from yard etc., return [].
  return moves;
}

export function applyMove(state, pid, move) {
  // returns { state: newState, extraTurn: boolean, captured?: {pid,piece} }
  const ns = structuredClone(state);
  const color = ns.colors[pid];
  const absStart = absoluteStartIndex(color);
  const arr = ns.positions[pid];

  if (move.kind === "enter") {
    // enter to ring pos 0
    arr[move.piece] = 0;
  } else if (move.kind === "move") {
    arr[move.piece] = move.to;
    // handle capture
    if (move.capture) {
      const { pid:cpid, piece:cpi } = move.capture;
      const carr = ns.positions[cpid];
      // send captured piece to yard
      carr[cpi] = -1;
    }
  } else if (move.kind === "home") {
    arr[move.piece] = move.to; // 100..106
  }

  // Check if piece finished
  // (we mark 106 as finished)
  // Check overall win (all 4 >=106)
  const finishedAll = arr.every(v => v >= 106);
  if (finishedAll && !ns.winners.includes(pid)) {
    ns.winners.push(pid);
    if (ns.winners.length === 1) {
      // first finisher sets status finished (MVP)
      ns.status = "finished";
    }
  }

  // Extra turn if dice==6 and move was legal
  const extraTurn = ns.dice === 6;

  // Advance turn if no extra turn
  if (!extraTurn) {
    ns.turnIndex = (ns.turnIndex + 1) % ns.order.length;
    ns.dice = null;
  } else {
    ns.dice = null;
  }

  return { state: ns, extraTurn };
}
