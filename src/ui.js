import { COLORS, COLOR_HEX, buildBoardGeometry, START_OFFSET, SAFE_CELLS, colorTrackIndex } from "./ludo.js";

export const el = (id)=>document.getElementById(id);

export function renderPlayersList(players, order, turnIndex, myId, wrapEl) {
  wrapEl.innerHTML = "";
  const byId = new Map(players.map(p=>[p.id,p]));
  order.map(id=>byId.get(id)).filter(Boolean).forEach((p, i)=>{
    const d=document.createElement("div");
    d.textContent = `${i+1}. ${p.name} — ${p.color}${p.id===myId?" (you)":""}`;
    if (i===turnIndex) d.style.background = "rgba(251,191,36,.25)";
    wrapEl.appendChild(d);
  });
}

export function createBoard(canvas) {
  const ctx = canvas.getContext("2d");
  const G = buildBoardGeometry(canvas.width);

  function drawGrid() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    // ring cells
    ctx.strokeStyle = "#cbd5e1"; ctx.lineWidth = 1;
    for (let i=0;i<52;i++){
      const {x,y,r} = G.path[i];
      ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.stroke();
      if (SAFE_CELLS.has(i)) {
        ctx.beginPath(); ctx.fillStyle = "rgba(148,163,184,.25)"; ctx.arc(x,y,r*0.6,0,Math.PI*2); ctx.fill();
      }
    }
    // home paths (light colored bands)
    const homeFill = { red:"rgba(239,68,68,.15)", blue:"rgba(59,130,246,.15)", yellow:"rgba(234,179,8,.15)", green:"rgba(34,197,94,.15)" };
    for (const c of COLORS){
      for (const cell of G.home[c]) {
        ctx.beginPath(); ctx.fillStyle = homeFill[c]; ctx.arc(cell.x, cell.y, cell.r, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.strokeStyle = "#cbd5e1"; ctx.arc(cell.x, cell.y, cell.r, 0, Math.PI*2); ctx.stroke();
      }
    }
    // yards
    for (const c of COLORS){
      for (const cell of G.yard[c]) {
        ctx.beginPath(); ctx.fillStyle = "rgba(15,23,42,.05)"; ctx.arc(cell.x, cell.y, cell.r, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.strokeStyle = "#cbd5e1"; ctx.arc(cell.x, cell.y, cell.r, 0, Math.PI*2); ctx.stroke();
      }
    }
  }

  function drawPieces(state, players){
    // draw pieces per player in their positions
    for (const pid of state.order) {
      const color = state.colors[pid];
      const arr = state.positions[pid];
      ctx.fillStyle = COLOR_HEX[color];
      ctx.strokeStyle = "#0f172a";
      arr.forEach((v, idx)=>{
        let cx, cy, r;
        if (v === -1) {
          // yard slot (spread across 4 circles)
          const pos = G.yard[color][idx];
          cx=pos.x; cy=pos.y; r=pos.r*0.7;
        } else if (v >= 0 && v < 52) {
          // ring index relative to player's start
          const abs = (START_OFFSET[color] + v) % 52;
          const pos = G.path[abs];
          cx=pos.x; cy=pos.y; r=pos.r*0.7;
        } else {
          // home path 100..106
          const homeIndex = Math.min(6, v-100);
          const pos = G.home[color][homeIndex] || G.home[color][5];
          cx=pos.x; cy=pos.y; r=pos.r*0.7;
        }
        // piece
        ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fill(); ctx.stroke();
        // pip
        ctx.beginPath(); ctx.fillStyle="white"; ctx.arc(cx,cy,r*0.35,0,Math.PI*2); ctx.fill();
      });
    }
  }

  function drawDice(die, currentColor){
    if (!die) return;
    // draw a die at top-left
    const x=20,y=20,s=40;
    ctx.fillStyle="#e2e8f0"; ctx.fillRect(x,y,s,s);
    ctx.strokeStyle="#0f172a"; ctx.strokeRect(x,y,s,s);
    ctx.fillStyle= currentColor ? COLOR_HEX[currentColor] : "#0f172a";
    const dot=(dx,dy)=>{ ctx.beginPath(); ctx.arc(x+dx,y+dy,4,0,Math.PI*2); ctx.fill(); };
    const m=s/2, q=s/4;
    const pips = {
      1: [[m,m]],
      2: [[q,q],[3*q,3*q]],
      3: [[q,q],[m,m],[3*q,3*q]],
      4: [[q,q],[q,3*q],[3*q,q],[3*q,3*q]],
      5: [[q,q],[q,3*q],[m,m],[3*q,q],[3*q,3*q]],
      6: [[q,q],[q,m],[q,3*q],[3*q,q],[3*q,m],[3*q,3*q]]
    }[die] || [];
    for (const [dx,dy] of pips) dot(dx,dy);
  }

  function render(state, players) {
    drawGrid();
    drawPieces(state, players);
    const curPid = state.order[state.turnIndex];
    const curColor = state.colors[curPid];
    drawDice(state.dice, curColor);
  }

  return { render, geometry:G };
}

export function screenToPiecePick(canvas, state, players, x, y) {
  // Return {pieceIndex} for the current player if clicked near a piece
  const ctx = canvas.getContext("2d");
  const G = buildBoardGeometry(canvas.width);
  const pid = state.order[state.turnIndex];
  const color = state.colors[pid];
  const arr = state.positions[pid];

  function near(cx,cy,r){ return ( (x-cx)*(x-cx) + (y-cy)*(y-cy) ) <= r*r; }

  for (let idx=0; idx<4; idx++){
    const v = arr[idx];
    let pos;
    if (v === -1) pos = G.yard[color][idx];
    else if (v >=0 && v < 52) {
      const abs = (START_OFFSET[color] + v) % 52;
      pos = G.path[abs];
    } else {
      const homeIndex = Math.min(6, v-100);
      pos = G.home[color][homeIndex] || G.home[color][5];
    }
    if (near(pos.x,pos.y, pos.r)) return { pieceIndex: idx };
  }
  return null;
}
