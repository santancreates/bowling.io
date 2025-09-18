import { ensureAnonAuth } from "./firebase.js";
import { roomRef, listenRoom, fetchPlayers, joinRoom, leaveRoom, startMatch, rollDiceTxn, movePieceTxn } from "./state.js";
import { createBoard, renderPlayersList, el, screenToPiecePick } from "./ui.js";
import { COLOR_HEX } from "./ludo.js";
import { getDoc } from "firebase/firestore";

const roomEl = el("room"), nameEl = el("name");
const joinBtn = el("join"), leaveBtn = el("leave"), startBtn = el("start");
const rollBtn = el("roll"), hud = el("hud"), boardCanvas = el("board"), playersWrap = el("playersWrap"), logEl = el("log");

let uid=null, currentRoom=null, unsub=null, playersCache=[];
const board = createBoard(boardCanvas);

ensureAnonAuth().then(u=>{ uid=u.uid; });

function setButtons(joined, amHost, canStart, myTurnPlaying){
  joinBtn.disabled = joined;
  leaveBtn.disabled = !joined;
  startBtn.disabled = !amHost || !canStart;
  rollBtn.disabled = !myTurnPlaying;
}

joinBtn.addEventListener("click", async ()=>{
  const code=(roomEl.value||"").trim().toUpperCase();
  const name=(nameEl.value||"").trim() || "Player";
  if (!code) return alert("Enter a room code");
  await joinRoom(code, uid, name);
  currentRoom=code; subscribe(code);
  hud.textContent=`Joined ${code}. Waiting…`;
});

leaveBtn.addEventListener("click", async ()=>{
  if (!currentRoom) return;
  await leaveRoom(currentRoom, uid);
  if (unsub) unsub(); currentRoom=null;
  board.render({ order:[], colors:{}, turnIndex:0, dice:null, positions:{}, status:"waiting" }, []);
  playersWrap.innerHTML=""; hud.textContent="Not connected.";
  setButtons(false,false,false,false);
});

startBtn.addEventListener("click", async ()=>{
  if (!currentRoom) return;
  try { await startMatch(currentRoom, uid); } catch(e){ alert(e.message); }
});

rollBtn.addEventListener("click", async ()=>{
  if (!currentRoom) return;
  try { await rollDiceTxn(currentRoom, uid); } catch(e){ alert(e.message); }
});

boardCanvas.addEventListener("click", async (e)=>{
  if (!currentRoom) return;
  const snap = await getDoc(roomRef(currentRoom));
  const st = snap.data() || {};
  if (st.status!=="playing") return;
  const myTurn = st.order?.[st.turnIndex]===uid;
  if (!myTurn || !st.dice) return;

  const rect = boardCanvas.getBoundingClientRect();
  const pick = screenToPiecePick(boardCanvas, st, playersCache, e.clientX-rect.left, e.clientY-rect.top);
  if (!pick) return;
  try { await movePieceTxn(currentRoom, uid, pick.pieceIndex); } catch(e){ alert(e.message); }
});

function subscribe(code){
  if (unsub) unsub();
  unsub = listenRoom(code, async (snap)=>{
    const st = snap.data() || { status:"waiting", order:[], colors:{}, positions:{}, dice:null, turnIndex:0 };
    playersCache = await fetchPlayers(code);
    renderPlayersList(playersCache, st.order||[], st.turnIndex||0, uid, playersWrap);

    const amHost = st.order?.length ? st.order[0]===uid : true;
    const canStart = st.status==="waiting" && playersCache.length>=2 && playersCache.length<=4;
    const myTurn = st.status==="playing" && (st.order?.[st.turnIndex]===uid);

    setButtons(!!currentRoom, amHost, canStart, myTurn);

    if (st.status==="waiting") hud.textContent="Waiting to start… (need 2–4 players)";
    else if (st.status==="playing"){
      const curPid = st.order?.[st.turnIndex];
      const curName = playersCache.find(p=>p.id===curPid)?.name || "—";
      hud.textContent = `Turn: ${curName}${st.dice?` — Dice: ${st.dice}`:" — roll the dice"}`;
    } else if (st.status==="finished") hud.textContent="Game over!";

    board.render(st, playersCache);
    logEl.textContent = JSON.stringify({ turnIndex: st.turnIndex, dice: st.dice, winners: st.winners||[] }, null, 2);
  });
}
