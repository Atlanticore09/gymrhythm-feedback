// GymRhythm feedback board — auth handoff + live board + voting + admin.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, signInWithCustomToken, onAuthStateChanged, setPersistence, browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, collection, query, orderBy, onSnapshot,
  addDoc, doc, getDoc, setDoc, deleteDoc, updateDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { firebaseConfig, ADMIN_UID } from "./firebase-config.js";

// ---------- Init ----------
const cfg = { ...firebaseConfig };
if (!cfg.appId) delete cfg.appId; // empty appId would warn; Auth/Firestore don't need it
const app = initializeApp(cfg);
const auth = getAuth(app);
const db = getFirestore(app);

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const stateLoading = $("state-loading");
const stateSignedout = $("state-signedout");
const board = $("board");
const listActive = $("list-active");
const listDone = $("list-done");
const doneBlock = $("done-block");
const emptyActive = $("empty-active");
const modal = $("modal");
const form = $("feedback-form");
const toastEl = $("toast");

const STATUSES = ["reviewing", "planned", "building", "done"];
const STATUS_LABEL = { reviewing: "Reviewing", planned: "Planned", building: "Building", done: "Done" };
const CAT_LABEL = { feature: "✨ Feature", improvement: "⚡ Improvement", bug: "🐞 Bug" };

let currentUser = null;
let items = [];
const votedSet = new Set();   // feedbackIds the current user has voted on
const checked = new Set();    // feedbackIds whose vote state we've already fetched
let unsubscribe = null;

const isAdmin = () => !!currentUser && currentUser.uid === ADMIN_UID;

// ---------- Auth handoff ----------
async function bootstrapAuth() {
  // Token arrives in the URL fragment (#t=...). Consume it and strip it so it
  // never lingers in history/referrer.
  const hash = new URLSearchParams(location.hash.slice(1));
  const token = hash.get("t");
  if (token) {
    history.replaceState(null, "", location.pathname + location.search);
    try {
      await setPersistence(auth, browserLocalPersistence);
      await signInWithCustomToken(auth, token);
    } catch (e) {
      console.error("Custom-token sign-in failed:", e);
      // fall through to onAuthStateChanged, which will show the signed-out gate
    }
  }
}

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (user) {
    stateLoading.classList.add("hidden");
    stateSignedout.classList.add("hidden");
    board.classList.remove("hidden");
    startBoard();
  } else {
    stateLoading.classList.add("hidden");
    board.classList.add("hidden");
    stateSignedout.classList.remove("hidden");
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  }
});

// ---------- Board ----------
function startBoard() {
  if (unsubscribe) return; // already listening
  const q = query(collection(db, "feedback"), orderBy("voteCount", "desc"));
  unsubscribe = onSnapshot(q, async (snap) => {
    items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    await syncVoteState(items);
    render();
  }, (err) => {
    console.error("Board listener error:", err);
    toast("Couldn’t load feedback", true);
  });
}

async function syncVoteState(list) {
  const toCheck = list.filter((i) => !checked.has(i.id));
  await Promise.all(toCheck.map(async (i) => {
    checked.add(i.id);
    try {
      const vs = await getDoc(doc(db, "feedback", i.id, "votes", currentUser.uid));
      if (vs.exists()) votedSet.add(i.id);
    } catch { /* ignore */ }
  }));
}

function render() {
  const active = items.filter((i) => i.status !== "done");
  const done = items.filter((i) => i.status === "done");

  listActive.replaceChildren(...active.map(renderCard));
  emptyActive.classList.toggle("hidden", active.length > 0);

  if (done.length) {
    doneBlock.classList.remove("hidden");
    listDone.replaceChildren(...done.map(renderCard));
  } else {
    doneBlock.classList.add("hidden");
  }
}

function renderCard(item) {
  const isDone = item.status === "done";
  const voted = votedSet.has(item.id);

  const card = elem("div", `card${isDone ? " card--done" : ""}`);

  // --- vote button ---
  const vote = elem("button", `vote${voted ? " is-voted" : ""}${isDone ? " is-locked" : ""}`);
  vote.innerHTML =
    `<svg class="vote__arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5l7 8H5z" fill="currentColor"/></svg>`;
  const count = elem("span", "vote__count");
  count.textContent = String(Math.max(0, item.voteCount || 0));
  vote.appendChild(count);
  if (isDone) {
    vote.title = "Shipped — voting closed";
  } else {
    vote.addEventListener("click", () => toggleVote(item));
    vote.setAttribute("aria-pressed", String(voted));
  }
  card.appendChild(vote);

  // --- body ---
  const body = elem("div", "card__body");
  const title = elem("h3", "card__title");
  title.textContent = item.title || "(untitled)";
  body.appendChild(title);

  if (item.description) {
    const desc = elem("p", "card__desc");
    desc.textContent = item.description;
    body.appendChild(desc);
  }

  const meta = elem("div", "card__meta");
  const status = elem("span", `badge badge--${item.status}`);
  status.textContent = STATUS_LABEL[item.status] || item.status;
  meta.appendChild(status);
  if (item.category) {
    const cat = elem("span", "chip chip--cat");
    cat.textContent = CAT_LABEL[item.category] || item.category;
    meta.appendChild(cat);
  }
  body.appendChild(meta);

  if (item.developerResponse) {
    const resp = elem("div", "response");
    const label = elem("div", "response__label");
    label.textContent = "Developer response";
    const text = elem("p", "response__text");
    text.textContent = item.developerResponse;
    resp.append(label, text);
    body.appendChild(resp);
  }

  if (isAdmin()) body.appendChild(renderAdmin(item));

  card.appendChild(body);
  return card;
}

function renderAdmin(item) {
  const wrap = elem("div", "admin");
  const label = elem("span", "admin__label");
  label.textContent = "Admin";
  wrap.appendChild(label);

  // status select
  const select = document.createElement("select");
  for (const s of STATUSES) {
    const opt = document.createElement("option");
    opt.value = s; opt.textContent = STATUS_LABEL[s];
    if (s === item.status) opt.selected = true;
    select.appendChild(opt);
  }
  select.addEventListener("change", () => setStatus(item, select.value));
  wrap.appendChild(select);

  // respond
  const respondBtn = elem("button", "admin__btn");
  respondBtn.textContent = item.developerResponse ? "Edit response" : "Respond";
  respondBtn.addEventListener("click", () => editResponse(item));
  wrap.appendChild(respondBtn);

  // delete
  const delBtn = elem("button", "admin__btn admin__btn--danger");
  delBtn.textContent = "Delete";
  delBtn.addEventListener("click", () => removeItem(item));
  wrap.appendChild(delBtn);

  return wrap;
}

// ---------- Actions ----------
async function toggleVote(item) {
  if (item.status === "done") return;
  const ref = doc(db, "feedback", item.id, "votes", currentUser.uid);
  const had = votedSet.has(item.id);

  // optimistic
  if (had) votedSet.delete(item.id); else votedSet.add(item.id);
  const local = items.find((i) => i.id === item.id);
  if (local) local.voteCount = Math.max(0, (local.voteCount || 0) + (had ? -1 : 1));
  render();

  try {
    if (had) await deleteDoc(ref);
    else await setDoc(ref, { voterId: currentUser.uid, createdAt: serverTimestamp() });
  } catch (e) {
    console.error("Vote failed:", e);
    // revert
    if (had) votedSet.add(item.id); else votedSet.delete(item.id);
    if (local) local.voteCount = Math.max(0, (local.voteCount || 0) + (had ? 1 : -1));
    render();
    toast("Couldn’t save your vote", true);
  }
}

async function setStatus(item, status) {
  try {
    await updateDoc(doc(db, "feedback", item.id), { status, updatedAt: serverTimestamp() });
    toast(`Marked “${STATUS_LABEL[status]}”`);
  } catch (e) {
    console.error(e); toast("Status update failed", true);
  }
}

async function editResponse(item) {
  const text = window.prompt("Developer response (leave blank to clear):", item.developerResponse || "");
  if (text === null) return; // cancelled
  try {
    await updateDoc(doc(db, "feedback", item.id), {
      developerResponse: text.trim(),
      updatedAt: serverTimestamp(),
    });
    toast("Response saved");
  } catch (e) {
    console.error(e); toast("Couldn’t save response", true);
  }
}

async function removeItem(item) {
  if (!window.confirm("Delete this feedback permanently?")) return;
  try {
    await deleteDoc(doc(db, "feedback", item.id));
    toast("Feedback deleted");
  } catch (e) {
    console.error(e); toast("Delete failed", true);
  }
}

// ---------- Add-feedback modal ----------
let pendingCategory = "feature";
$("btn-add").addEventListener("click", openModal);
modal.querySelectorAll("[data-close]").forEach((n) => n.addEventListener("click", closeModal));
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

$("f-category").querySelectorAll(".seg__opt").forEach((btn) => {
  btn.addEventListener("click", () => {
    pendingCategory = btn.dataset.cat;
    $("f-category").querySelectorAll(".seg__opt").forEach((b) => {
      const on = b === btn;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-checked", String(on));
    });
  });
});

$("f-title").addEventListener("input", (e) => { $("title-count").textContent = `${e.target.value.length}/80`; });
$("f-desc").addEventListener("input", (e) => { $("desc-count").textContent = `${e.target.value.length}/500`; });

function openModal() {
  form.reset();
  pendingCategory = "feature";
  $("title-count").textContent = "0/80";
  $("desc-count").textContent = "0/500";
  $("f-category").querySelectorAll(".seg__opt").forEach((b, i) => {
    b.classList.toggle("is-active", i === 0);
    b.setAttribute("aria-checked", String(i === 0));
  });
  modal.classList.remove("hidden");
  setTimeout(() => $("f-title").focus(), 50);
}
function closeModal() { modal.classList.add("hidden"); }

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = $("f-title").value.trim();
  const description = $("f-desc").value.trim();
  if (title.length < 3) { toast("Title is too short", true); return; }

  const submitBtn = $("f-submit");
  submitBtn.disabled = true; submitBtn.textContent = "Submitting…";
  try {
    await addDoc(collection(db, "feedback"), {
      authorId: currentUser.uid,
      title,
      description,
      category: pendingCategory,
      status: "reviewing",
      voteCount: 0,
      createdAt: serverTimestamp(),
    });
    closeModal();
    toast("Thanks! Your feedback is live 🎉");
  } catch (err) {
    console.error("Submit failed:", err);
    toast("Couldn’t submit — please try again", true);
  } finally {
    submitBtn.disabled = false; submitBtn.textContent = "Submit feedback";
  }
});

// ---------- Helpers ----------
function elem(tag, className) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  return n;
}
let toastTimer = null;
function toast(msg, isError = false) {
  toastEl.textContent = msg;
  toastEl.className = `toast${isError ? " toast--error" : ""}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add("hidden"), 2600);
}

// ---------- Go ----------
bootstrapAuth();
