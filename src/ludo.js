export const COLORS = ["red","blue","yellow","green"];
export const COLOR_HEX = { red:"#ef4444", blue:"#3b82f6", yellow:"#eab308", green:"#22c55e" };
export const START_OFFSET = { red:0, blue:13, yellow:26, green:39 };
export const SAFE_CELLS = new Set([0,8,13,21,26,34,39,47]);

export function buildBoardGeometry(size=600){
  const cs=size/15, toXY=(gx,gy)=>({x: gx*cs+cs*0.5, y: gy*cs+cs*0.5, r: cs*0.38});
  const seq = [
    [6,1],[7,1],[8,1],[9,2],[9,3],[9,4],[9,5],[10,6],[11,6],[12,6],
    [13,6],[13,7],[13,8],[12,8],[11,8],[10,8],[9,9],[9,10],[9,11],[9,12],
    [8,13],[7,13],[6,13],[5,12],[5,11],[5,10],[5,9],[4,8],[3,8],[2,8],
    [1,8],[1,7],[1,6],[2,6],[3,6],[4,6],[5,5],[5,4],[5,3],[5,2],
    [6,1]
  ];
  const ring=[]; for (let i=0;i<seq.length-1;i++) ring.push(seq[i]);
  while (ring.length<52) ring.push(ring[ring.length%(seq.length-1)]);
  ring.length=52;
  const path = ring.map(([gx,gy])=>toXY(gx,gy));
  const home = {
    red:   Array.from({length:6},(_,i)=>toXY(7, 2+i)),
    blue:  Array.from({length:6},(_,i)=>toXY(12-i,7)),
    yellow:Array.from({length:6},(_,i)=>toXY(7,12-i)),
    green: Array.from({length:6},(_,i)=>toXY(2+i,7))
  };
  const yard = {
    red:   [[2,2],[4,2],[2,4],[4,4]].map(([gx,gy])=>toXY(gx,gy)),
    blue:  [[11,2],[13,2],[11,4],[13,4]].map(([gx,gy])=>toXY(gx,gy)),
    yellow:[[11,11],[13,11],[11,13],[13,13]].map(([gx,gy])=>toXY(gx,gy)),
    green: [[2,11],[4,11],[2,13],[4,13]].map(([gx,gy])=>toXY(gx,gy))
  };
  const startCell = {
    red: path[0], blue: path[13%52], yellow: path[26%52], green: path[39%52]
  };
  return { cs, path, home, yard, startCell };
}

export function initialState(players){
  const pos={}; for (const p of players) pos[p.id]=[-1,-1,-1,-1];
  return { status:"waiting", order:players.map(p=>p.id), colors:Object.fromEntries(players.map(p=>[p.id,p.color])), turnIndex:0, dice:null, positions:pos, winners:[] };
}
export function nextColorForJoin(inUse){ for (const c of COLORS) if (!inUse.includes(c)) return c; return null; }
export const rollDie = ()=> 1 + Math.floor(Math.random()*6);
export const absoluteStartIndex = (color)=> START_OFFSET[color];

export function legalMovesForPlayer(state, pid){
  const color = state.colors[pid]; const absStart = absoluteStartIndex(color);
  const dice=state.dice; if (!dice) return [];
  const my=state.positions[pid]; const moves=[];

  const occ = new Map();
  for (const opid of Object.keys(state.positions)) {
    const arr = state.positions[opid]; const ocol = state.colors[opid]; const ostart = START_OFFSET[ocol];
    arr.forEach((v,i)=>{ if (v>=0 && v<52){ const abs=(ostart+v)%52; if(!occ.has(abs)) occ.set(abs,[]); occ.get(abs).push({pid:opid,piece:i}); } });
  }

  for (let i=0;i<4;i++){
    const v=my[i];
    if (v===-1){ if (dice===6) moves.push({piece:i, from:-1, to:0, kind:"enter"}); continue; }
    if (v>=100) continue;
    const newPos=v+dice;
    if (newPos<52){
      const absDest=(absStart+newPos)%52; const occupants=occ.get(absDest)||[];
      let capture=null;
      if (!SAFE_CELLS.has(absDest) && occupants.length===1 && occupants[0].pid!==pid) capture=occupants[0];
      if (occupants.length>1 && !occupants.every(o=>o.pid===pid)) continue;
      moves.push({piece:i, from:v, to:newPos, kind:"move", capture});
    } else {
      const overflow=newPos-52; if (overflow<=6) moves.push({piece:i, from:v, to:100+overflow, kind:"home"});
    }
  }
  return moves;
}

export function applyMove(state, pid, move){
  const ns=structuredClone(state); const arr=ns.positions[pid];
  if (move.kind==="enter"){ arr[move.piece]=0; }
  else if (move.kind==="move"){ arr[move.piece]=move.to; if (move.capture){ ns.positions[move.capture.pid][move.capture.piece]=-1; } }
  else if (move.kind==="home"){ arr[move.piece]=move.to; }

  const finishedAll = arr.every(v=>v>=106);
  if (finishedAll && !ns.winners.includes(pid)){ ns.winners.push(pid); ns.status="finished"; }

  const extraTurn = ns.dice===6; ns.dice=null;
  if (!extraTurn){ ns.turnIndex=(ns.turnIndex+1)%ns.order.length; }
  return { state: ns, extraTurn };
}
