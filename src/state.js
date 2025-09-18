import { db } from "./firebase.js";
import {
  doc, setDoc, deleteDoc, runTransaction, onSnapshot,
  collection, getDocs, serverTimestamp
} from "firebase/firestore";
import { COLORS, nextColorForJoin, initialState, rollDie, legalMovesForPlayer, applyMove } from "./ludo.js";

export const roomRef = (code)=> doc(db, "rooms", code);
export const playersCol = (code)=> collection(db, "rooms", code, "players");

export async function joinRoom(code, uid, name) {
  // upsert room with waiting status if missing
  await setDoc(roomRef(code), { status:"waiting", lastUpdate: serverTimestamp() }, { merge:true });
  await setDoc(doc(playersCol(code), uid), { id: uid, name, joinedAt: serverTimestamp() });
}

export async function leaveRoom(code, uid) {
  try { await deleteDoc(doc(playersCol(code), uid)); } catch {}
}

export function listenRoom(code, cb) {
  return onSnapshot(roomRef(code), cb);
}
export async function fetchPlayers(code) {
  const snap = await getDocs(playersCol(code));
  const arr=[]; snap.forEach(d=>arr.push(d.data()));
  return arr;
}

export async function startMatch(code, uid) {
  await runTransaction(db, async (tx)=>{
    const rRef = roomRef(code);
    const snap = await tx.get(rRef);
    const data = snap.data() || {};
    if (data.status === "playing") return;

    const ps = await getDocs(playersCol(code));
    const pArr=[]; ps.forEach(d=>pArr.push(d.data()));
    if (pArr.length < 2) throw new Error("Need at least 2 players");

    // Assign colors by join order (up to 4)
    const colorsInUse = [];
    const players = pArr.slice(0,4).map((p,i)=>{
      const color = nextColorForJoin(colorsInUse) || COLORS[i];
      colorsInUse.push(color);
      return { id:p.id, name:p.name, color };
    });

    // Randomize turn order but keep color binding per player
    players.sort(()=>Math.random()-0.5);

    const st = initialState(players);
    st.status = "playing";
    tx.set(rRef, {
      status: st.status,
      order: st.order,
      colors: st.colors,
      turnIndex: st.turnIndex,
      dice: st.dice,
      positions: st.positions,
      winners: st.winners,
      lastUpdate: serverTimestamp()
    }, { merge:true });
  });
}

export async function rollDiceTxn(code, uid) {
  await runTransaction(db, async (tx)=>{
    const rRef = roomRef(code);
    const snap = await tx.get(rRef);
    const st = snap.data();
    if (!st || st.status!=="playing") throw new Error("Not playing");
    const cur = st.order?.[st.turnIndex];
    if (cur !== uid) throw new Error("Not your turn");

    if (st.dice) return; // already rolled

    const val = rollDie();
    tx.update(rRef, { dice: val, lastUpdate: serverTimestamp() });
  });
}

export async function movePieceTxn(code, uid, pieceIndex) {
  await runTransaction(db, async (tx)=>{
    const rRef = roomRef(code);
    const snap = await tx.get(rRef);
    const st = snap.data();
    if (!st || st.status!=="playing") throw new Error("Not playing");
    const cur = st.order?.[st.turnIndex];
    if (cur !== uid) throw new Error("Not your turn");
    if (!st.dice) throw new Error("Roll first");

    // Build a state object compatible with ludo.js
    const stateObj = {
      status: st.status,
      order: st.order,
      colors: st.colors,
      turnIndex: st.turnIndex,
      dice: st.dice,
      positions: st.positions,
      winners: st.winners||[]
    };

    const moves = legalMovesForPlayer(stateObj, uid);
    const chosen = moves.find(m => m.piece === pieceIndex);
    if (!chosen) throw new Error("Illegal move");

    const { state: ns } = applyMove(stateObj, uid, chosen);

    tx.update(rRef, {
      status: ns.status,
      order: ns.order,
      colors: ns.colors,
      turnIndex: ns.turnIndex,
      dice: ns.dice,
      positions: ns.positions,
      winners: ns.winners,
      lastUpdate: serverTimestamp()
    });
  });
}
