// ─── Storage & Firebase Cloud Sync ───────────────────────────────────────────

const STORE_KEY = "tapli_v3";
let db = null;
let isFirebaseActive = false;

// Check if Firebase is configured
if (
  typeof firebase !== "undefined" &&
  typeof FIREBASE_CONFIG !== "undefined" &&
  FIREBASE_CONFIG.projectId
) {
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.firestore();
    isFirebaseActive = true;
  } catch (e) {
    console.warn("Firebase initialization failed, falling back to local:", e);
  }
}

function migrate(f) {
  if (f.photo && !f.photos) { f.photos = [f.photo]; delete f.photo; }
  if (!Array.isArray(f.photos)) f.photos = [];
  if (typeof f.count !== "number") f.count = 0;
  if (typeof f._last !== "number") f._last = -1;
  return f;
}

function loadLocalFriends() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    if (Array.isArray(saved) && saved.length) return saved.map(migrate);
  } catch {}
  return [];
}

function saveLocalFriends() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(friends)); } catch {}
}

let friends = loadLocalFriends();
let currentId = friends[0]?.id ?? null;

function currentFriend() {
  return friends.find(f => f.id === currentId) ?? friends[0] ?? null;
}

function pickReaction(friend) {
  const p = friend.photos;
  if (!p || !p.length) return null;
  if (p.length === 1) return p[0];
  const pool = p.map((_, i) => i).filter(i => i !== friend._last);
  const idx = pool[Math.floor(Math.random() * pool.length)];
  friend._last = idx;
  return p[idx];
}

// Real-time Cloud Sync across all devices
if (isFirebaseActive && db) {
  db.collection("friends").orderBy("createdAt", "asc").onSnapshot(snapshot => {
    const remote = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      remote.push(migrate({ id: doc.id, ...data }));
    });
    if (remote.length > 0) {
      friends = remote;
      saveLocalFriends();
      if (!currentId || !friends.find(f => f.id === currentId)) {
        currentId = friends[0]?.id ?? null;
      }
      updateMainDropdown();
      showBasePhoto();
    }
  }, err => {
    console.warn("Firestore sync error:", err);
  });
}

// ─── DOM Elements ────────────────────────────────────────────────────────────

const personSelect = document.getElementById("personSelect");
const uploadBtn = document.getElementById("uploadBtn");
const avatar = document.getElementById("avatar");
const countEl = document.getElementById("count");

const modal = document.getElementById("modal");
const modalPersonSelect = document.getElementById("modalPersonSelect");
const nameInput = document.getElementById("nameInput");
const fileInput = document.getElementById("fileInput");
const photoGrid = document.getElementById("photoGrid");
const saveBtn = document.getElementById("saveBtn");
const closeBtn = document.getElementById("closeBtn");
const deleteBtn = document.getElementById("deleteBtn");

const fxCanvas = document.getElementById("fx");
const flashEl = document.getElementById("flash");
const comboEl = document.getElementById("combo");
const ctx = fxCanvas.getContext("2d");

// ─── Main Dropdown & Avatar ──────────────────────────────────────────────────

function updateMainDropdown() {
  personSelect.innerHTML = "";
  if (!friends.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No one yet — Click + Upload";
    personSelect.appendChild(opt);
    avatar.src = "";
    countEl.textContent = "0";
    return;
  }

  friends.forEach(f => {
    const opt = document.createElement("option");
    opt.value = f.id;
    opt.textContent = f.name; // Clean name without slap count
    if (f.id === currentId) opt.selected = true;
    personSelect.appendChild(opt);
  });
}

function showBasePhoto() {
  const f = currentFriend();
  if (!f || !f.photos.length) {
    avatar.src = "";
    countEl.textContent = "0";
    return;
  }
  avatar.src = f.photos[0];
  countEl.textContent = f.count;
}

personSelect.addEventListener("change", () => {
  currentId = personSelect.value;
  showBasePhoto();
});

// ─── Upload / Manage Modal ───────────────────────────────────────────────────

let modalWorkingPhotos = [];

function openModal(targetId = null) {
  modalPersonSelect.innerHTML = "";

  const newOpt = document.createElement("option");
  newOpt.value = "NEW";
  newOpt.textContent = "+ New Person";
  modalPersonSelect.appendChild(newOpt);

  friends.forEach(f => {
    const opt = document.createElement("option");
    opt.value = f.id;
    opt.textContent = f.name;
    modalPersonSelect.appendChild(opt);
  });

  const selectTarget = targetId || currentId || "NEW";
  modalPersonSelect.value = selectTarget;
  loadModalPerson(selectTarget);

  modal.classList.remove("hidden");
}

function loadModalPerson(id) {
  fileInput.value = "";
  if (id === "NEW") {
    nameInput.value = "";
    nameInput.placeholder = "Enter name";
    modalWorkingPhotos = [];
    deleteBtn.classList.add("hidden");
  } else {
    const f = friends.find(x => x.id === id);
    if (f) {
      nameInput.value = f.name;
      modalWorkingPhotos = [...f.photos];
      deleteBtn.classList.remove("hidden");
    }
  }
  renderPhotoGrid();
}

modalPersonSelect.addEventListener("change", () => {
  loadModalPerson(modalPersonSelect.value);
});

function renderPhotoGrid() {
  photoGrid.innerHTML = "";
  modalWorkingPhotos.forEach((src, i) => {
    const wrap = document.createElement("div");
    wrap.className = "photoThumb" + (i === 0 ? " main-photo" : "");

    const img = document.createElement("img");
    img.src = src;

    const rm = document.createElement("button");
    rm.className = "removePhotoBtn";
    rm.type = "button";
    rm.textContent = "×";
    rm.addEventListener("click", e => {
      e.stopPropagation();
      modalWorkingPhotos.splice(i, 1);
      renderPhotoGrid();
    });

    wrap.append(img, rm);
    photoGrid.appendChild(wrap);
  });
}

// Compress preserving aspect ratio (max dimension 650px for fast cloud sync)
function processImageFile(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 650;
        let w = img.width;
        let h = img.height;
        if (w > MAX_DIM || h > MAX_DIM) {
          if (w > h) {
            h = Math.round((h * MAX_DIM) / w);
            w = MAX_DIM;
          } else {
            w = Math.round((w * MAX_DIM) / h);
            h = MAX_DIM;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const c = canvas.getContext("2d");
        c.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

fileInput.addEventListener("change", async () => {
  const files = Array.from(fileInput.files);
  if (!files.length) return;
  for (const f of files) {
    const b64 = await processImageFile(f);
    modalWorkingPhotos.push(b64);
  }
  fileInput.value = "";
  renderPhotoGrid();
});

saveBtn.addEventListener("click", async () => {
  const name = nameInput.value.trim() || "Buddy";
  if (!modalWorkingPhotos.length) {
    nameInput.placeholder = "Add at least one photo!";
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = "Saving...";

  const selectedTarget = modalPersonSelect.value;
  let targetPersonId = selectedTarget;

  if (selectedTarget === "NEW") {
    targetPersonId = "p_" + Date.now();
    const newPerson = {
      id: targetPersonId,
      name,
      photos: [...modalWorkingPhotos],
      count: 0,
      _last: -1,
      createdAt: Date.now()
    };
    friends.push(newPerson);
    currentId = newPerson.id;

    if (isFirebaseActive && db) {
      try {
        await db.collection("friends").doc(targetPersonId).set({
          name: newPerson.name,
          photos: newPerson.photos,
          count: newPerson.count,
          createdAt: newPerson.createdAt
        });
      } catch (e) {
        console.warn("Could not save to Firebase:", e);
      }
    }
  } else {
    const f = friends.find(x => x.id === selectedTarget);
    if (f) {
      f.name = name;
      f.photos = [...modalWorkingPhotos];
      if (isFirebaseActive && db) {
        try {
          await db.collection("friends").doc(selectedTarget).update({
            name: f.name,
            photos: f.photos
          });
        } catch (e) {
          console.warn("Could not update Firebase:", e);
        }
      }
    }
  }

  saveLocalFriends();
  updateMainDropdown();
  showBasePhoto();

  saveBtn.disabled = false;
  saveBtn.textContent = "Save";
  modal.classList.add("hidden");
});

deleteBtn.addEventListener("click", async () => {
  const targetId = modalPersonSelect.value;
  if (targetId === "NEW") return;
  if (!confirm("Delete this person?")) return;

  friends = friends.filter(x => x.id !== targetId);
  currentId = friends[0]?.id ?? null;

  if (isFirebaseActive && db) {
    try {
      await db.collection("friends").doc(targetId).delete();
    } catch (e) {
      console.warn("Could not delete from Firebase:", e);
    }
  }

  saveLocalFriends();
  updateMainDropdown();
  showBasePhoto();
  modal.classList.add("hidden");
});

uploadBtn.addEventListener("click", () => openModal(currentId));
closeBtn.addEventListener("click", () => modal.classList.add("hidden"));
modal.addEventListener("click", e => {
  if (e.target === modal) modal.classList.add("hidden");
});

// ─── Canvas Visual FX ────────────────────────────────────────────────────────

let FW = 0, FH = 0, particles = [], rings = [], trail = [], raf = 0, lastT = 0;

function resizeCanvas() {
  const d = Math.min(2, window.devicePixelRatio || 1);
  FW = window.innerWidth;
  FH = window.innerHeight;
  fxCanvas.width = FW * d;
  fxCanvas.height = FH * d;
  ctx.setTransform(d, 0, 0, d, 0, 0);
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

function kick() {
  if (!raf) raf = requestAnimationFrame(loop);
}

function drawStar(x, y, r, rot) {
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = rot + (k * Math.PI) / 5;
    const q = k % 2 ? r * 0.44 : r;
    ctx.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q);
  }
  ctx.closePath();
  ctx.fill();
}

function loop(now) {
  raf = 0;
  const dt = Math.min(0.033, (now - lastT) / 1000 || 0.016);
  lastT = now;
  ctx.clearRect(0, 0, FW, FH);
  const tn = performance.now();

  trail = trail.filter(p => tn - p.t < 260);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let k = 1; k < trail.length; k++) {
    const a = 1 - (tn - trail[k].t) / 260;
    ctx.strokeStyle = `rgba(255,170,40,${0.75 * a})`;
    ctx.lineWidth = 2 + 11 * a;
    ctx.beginPath();
    ctx.moveTo(trail[k - 1].x, trail[k - 1].y);
    ctx.lineTo(trail[k].x, trail[k].y);
    ctx.stroke();
  }

  for (let k = rings.length - 1; k >= 0; k--) {
    const r = rings[k];
    r.age += dt;
    const q = r.age / r.life;
    if (q >= 1) {
      rings.splice(k, 1);
      continue;
    }
    ctx.globalAlpha = 1 - q;
    ctx.strokeStyle = r.color;
    ctx.lineWidth = 9 * (1 - q) + 1;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - q, 3)), 0, Math.PI * 2);
    ctx.stroke();
  }

  for (let k = particles.length - 1; k >= 0; k--) {
    const p = particles[k];
    p.age += dt;
    const q = p.age / p.life;
    if (q >= 1 || p.y > FH + 40) {
      particles.splice(k, 1);
      continue;
    }
    p.vy += p.g * dt;
    p.vx *= Math.max(0, 1 - 1.5 * dt);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
    ctx.globalAlpha = Math.max(0, 1 - q * q);
    ctx.fillStyle = p.color;
    if (p.shape === "star") drawStar(p.x, p.y, p.size * (1 - q * 0.4), p.rot);
    else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1 - q * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.globalAlpha = 1;
  if (particles.length || rings.length || trail.length) kick();
}

const rnd = (a, b) => a + Math.random() * (b - a);
const COLS = ["#ffd23f", "#ff8a00", "#ff3b1f", "#ffffff"];

function burst(x, y, pw, nx, ny) {
  const n = Math.round(15 * pw);
  const base = Math.atan2(ny, nx);
  for (let k = 0; k < n; k++) {
    const a = base + rnd(-1.15, 1.15);
    const sp = rnd(180, 520) * pw;
    particles.push({
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      size: rnd(7, 14) * pw,
      color: COLS[k % COLS.length],
      shape: "star",
      life: rnd(0.5, 0.9),
      g: 500,
      vr: rnd(-10, 10),
      rot: Math.random() * 6,
      age: 0
    });
  }
  rings.push({ x, y, r0: 10, r1: 60 + 90 * pw, age: 0, life: 0.45, color: COLS[0] });
  kick();
}

function confetti() {
  const cols = ["#ff5fa2", "#ffd23f", "#4ad1ff", "#7be36b", "#ff8a00"];
  for (let k = 0; k < 80; k++) {
    particles.push({
      x: Math.random() * FW,
      y: -20 - Math.random() * 200,
      vx: (Math.random() - 0.5) * 120,
      vy: 200 + Math.random() * 260,
      g: 120,
      size: rnd(8, 14),
      color: cols[k % 5],
      shape: "star",
      life: 2.6,
      vr: rnd(-14, 14),
      rot: Math.random() * 6,
      age: 0
    });
  }
  kick();
}

function shake(pw, ms) {
  const N = 14, kf = [];
  for (let k = 0; k <= N; k++) {
    const d = Math.pow(1 - k / N, 2) * pw;
    kf.push({
      transform: k === N ? "none" : `translate(${rnd(-10, 10) * d}px,${rnd(-8, 8) * d}px) rotate(${rnd(-0.8, 0.8) * d}deg)`
    });
  }
  document.getElementById("app").animate(kf, { duration: ms, easing: "linear" });
}

// ─── Web Audio API (Synthesised, zero external MP3s) ─────────────────────────

let ac = null, master = null, bus = null, NB = null;

function initAudio() {
  if (ac) {
    if (ac.state === "suspended") ac.resume();
    return;
  }
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    ac = new AudioCtx();
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    master = ac.createGain();
    master.gain.value = 0.9;
    master.connect(comp);
    comp.connect(ac.destination);
    bus = ac.createGain();
    bus.connect(master);

    const len = Math.floor(ac.sampleRate * 0.7);
    const ir = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let k = 0; k < len; k++) d[k] = (Math.random() * 2 - 1) * Math.pow(1 - k / len, 3);
    }
    const verb = ac.createConvolver();
    verb.buffer = ir;
    const vs = ac.createGain();
    vs.gain.value = 0.18;
    bus.connect(vs);
    vs.connect(verb);
    verb.connect(master);
  } catch {
    ac = null;
  }
}

function getNoise() {
  if (!NB && ac) {
    const n = ac.sampleRate, b = ac.createBuffer(1, n, ac.sampleRate), c = b.getChannelData(0);
    for (let k = 0; k < n; k++) c[k] = Math.random() * 2 - 1;
    NB = b;
  }
  return NB;
}

function eg(g, t, a, pk, dur) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(pk, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}

function noise(t, dur, type, freq, q, pk, att) {
  const n = ac.createBufferSource();
  n.buffer = getNoise();
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q || 0.7;
  const g = ac.createGain();
  eg(g, t, att || 0.002, pk, dur);
  n.connect(f).connect(g).connect(bus);
  n.start(t, Math.random() * 0.5);
  n.stop(t + dur + 0.05);
}

function tone(t, f0, f1, dur, type, pk, att) {
  const o = ac.createOscillator();
  o.type = type || "sine";
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ac.createGain();
  eg(g, t, att || 0.003, pk, dur);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function whoosh(pw, pr) {
  const t = ac.currentTime;
  const n = ac.createBufferSource();
  n.buffer = getNoise();
  const f = ac.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = 1.2;
  f.frequency.setValueAtTime(500 * pr, t);
  f.frequency.exponentialRampToValueAtTime(3200 * pr, t + 0.09);
  const g = ac.createGain();
  eg(g, t, 0.03, 0.35 * pw, 0.11);
  n.connect(f).connect(g).connect(bus);
  n.start(t, Math.random() * 0.5);
  n.stop(t + 0.15);
}

function slap(pw, pr) {
  const t = ac.currentTime + 0.05;
  noise(t, 0.06, "highpass", 2600 * pr, 0.7, 0.9 * pw, 0.001);
  noise(t, 0.12, "bandpass", 1100 * pr, 0.9, 1.0 * pw, 0.002);
  noise(t, 0.09, "lowpass", 320, 0.7, 0.9 * pw, 0.002);
  tone(t, 220 * pr, 46, 0.2, "sine", 1.0 * pw, 0.002);
}

const PENT = [0, 2, 4, 7, 9, 12, 14, 16];
function ding(n) {
  const t = ac.currentTime + 0.03;
  const f = 659.25 * Math.pow(2, PENT[Math.min(n - 2, PENT.length - 1)] / 12);
  tone(t, f, f, 0.28, "triangle", 0.28, 0.004);
  tone(t, f * 2, f * 2, 0.2, "sine", 0.12, 0.004);
}

function chime() {
  const t = ac.currentTime + 0.1;
  [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, k) => {
    tone(t + k * 0.085, f, f, 0.45, "triangle", 0.3, 0.004);
    tone(t + k * 0.085, f * 2, f * 2, 0.3, "sine", 0.1, 0.004);
  });
}

function playSlapSfx(pw, cmb) {
  if (!ac) return;
  const pr = Math.pow(2, (Math.min(cmb - 1, 7) * 1.4 + (Math.random() * 1.6 - 0.8)) / 12);
  try {
    whoosh(pw, pr);
    slap(pw, pr);
    if (cmb >= 2) ding(cmb);
  } catch {}
}

function buzz() {
  try {
    navigator.vibrate?.([40, 30, 60]);
  } catch {}
}

// ─── Comic Words & Flash ─────────────────────────────────────────────────────

const WORDS = ["TAPLI!", "WHAM!", "CHATAXA!", "FATTAAK!", "KHENCH KE!", "SMACK!", "POW!", "OWW!", "THWACK!"];

function showComicWord(x, y, text, pw) {
  const d = document.createElement("div");
  d.className = "word";
  d.textContent = text;
  d.style.left = Math.max(90, Math.min(FW - 90, x)) + "px";
  d.style.top = Math.max(110, Math.min(FH - 160, y)) + "px";
  document.body.appendChild(d);
  const r = (Math.random() * 2 - 1) * 14;
  const s = 0.9 + pw * 0.25;
  const a = d.animate(
    [
      { transform: `translate(-50%,-50%) rotate(${r - 12}deg) scale(.2)`, opacity: 0 },
      { transform: `translate(-50%,-50%) rotate(${r}deg) scale(${s * 1.2})`, opacity: 1, offset: 0.18 },
      { transform: `translate(-50%,-50%) rotate(${r}deg) scale(${s})`, opacity: 1, offset: 0.6 },
      { transform: `translate(-50%,-85%) rotate(${r}deg) scale(${s * 0.9})`, opacity: 0 }
    ],
    { duration: 870, easing: "ease-out" }
  );
  a.onfinish = () => d.remove();
}

let comboTimer = 0;
function showCombo(n) {
  if (n < 2) {
    comboEl.style.opacity = 0;
    return;
  }
  comboEl.textContent = "COMBO x" + n;
  comboEl.style.opacity = 1;
  comboEl.animate(
    [{ transform: "scale(1.7) rotate(-8deg)" }, { transform: "scale(1) rotate(-3deg)" }],
    { duration: 260, easing: "cubic-bezier(.2,1.6,.4,1)" }
  );
  clearTimeout(comboTimer);
  comboTimer = setTimeout(() => (comboEl.style.opacity = 0), 1500);
}

function flashScreen(pw) {
  flashEl.style.background = "radial-gradient(circle at 50% 45%,rgba(255,40,20,0) 25%,rgba(255,40,20,.55) 100%)";
  flashEl.animate(
    [{ opacity: 0 }, { opacity: Math.min(1, 0.5 + pw * 0.3), offset: 0.12 }, { opacity: 0 }],
    { duration: 480, easing: "ease-out" }
  );
}

function springAvatar(nx, ny, pw) {
  const N = 24, kf = [];
  const k0 = Math.min(65, 24 * pw + 16);
  const rotMax = (nx || (Math.random() < 0.5 ? -0.4 : 0.4)) * 11 * pw;
  for (let k = 0; k <= N; k++) {
    const t = k / N;
    const d = Math.exp(-3.6 * t);
    const o = Math.cos(t * Math.PI * 5);
    const sx = 1 + 0.06 * pw * d * Math.cos(t * Math.PI * 6);
    kf.push({
      offset: t,
      transform: `translate(${nx * k0 * d * o}px,${ny * k0 * d * o * 0.7}px) rotate(${rotMax * d * o}deg) scale(${sx},${1 / sx})`
    });
  }
  avatar.animate(kf, { duration: 920, easing: "linear" });
  avatar.animate(
    [{ filter: "brightness(1.55) saturate(1.3)" }, { filter: "none" }],
    { duration: 160, easing: "ease-out" }
  );
}

// ─── Slap Mechanics ───────────────────────────────────────────────────────────

const MIN_DIST = 38;
const MIN_SPEED = 0.45;
let lockUntil = 0, lastHit = 0, combo = 0, resetTimer = 0;
let gestureStart = null;
let pendingIncrement = 0;
let flushTimer = 0;

function syncTapliCountToCloud(friendId) {
  if (!isFirebaseActive || !db) return;
  pendingIncrement++;
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    if (pendingIncrement > 0) {
      const inc = pendingIncrement;
      pendingIncrement = 0;
      db.collection("friends").doc(friendId).update({
        count: firebase.firestore.FieldValue.increment(inc)
      }).catch(() => {});
    }
  }, 1500);
}

function executeTapli(dx, dy, speed, px, py) {
  const now = performance.now();
  if (now < lockUntil) return;
  lockUntil = now + 360;
  combo = now - lastHit < 1500 ? combo + 1 : 1;
  lastHit = now;

  const f = currentFriend();
  if (!f || !f.photos.length) return;

  const pw = Math.max(0.7, Math.min(1.6, 0.7 + speed / 3.5));
  const len = Math.hypot(dx, dy) || 1;
  const nx = dx / len;
  const ny = dy / len;

  // Reaction photo swap
  const rx = pickReaction(f);
  if (rx) avatar.src = rx;

  f.count++;
  saveLocalFriends();
  countEl.textContent = f.count;
  countEl.classList.remove("pop");
  void countEl.offsetWidth;
  countEl.classList.add("pop");

  // Sync to cloud
  syncTapliCountToCloud(f.id);

  // Audio, Haptics & Visuals
  playSlapSfx(pw, combo);
  buzz();
  springAvatar(nx, ny, pw);
  burst(px, py, pw, nx, ny);
  flashScreen(pw);
  shake(pw, 460);
  showComicWord(px, py, WORDS[Math.floor(Math.random() * WORDS.length)], pw);
  showCombo(combo);

  // Milestone celebration
  if (f.count % 10 === 0) {
    setTimeout(() => {
      try { chime(); } catch {}
      confetti();
      flashScreen(1.4);
      showComicWord(FW / 2, FH * 0.42, f.count + " TAPLIS! 🔥", 1.5);
    }, 220);
  }

  // Return to resting photo after 1100ms
  clearTimeout(resetTimer);
  resetTimer = setTimeout(() => {
    if (f.photos[0]) avatar.src = f.photos[0];
  }, 1100);
}

// ─── Gesture Handlers ────────────────────────────────────────────────────────

const stageEl = document.getElementById("stage");

stageEl.addEventListener("pointerdown", e => {
  if (e.target.closest("#topBar,#modal")) return;
  initAudio();
  gestureStart = { x: e.clientX, y: e.clientY, t: performance.now() };
  trail = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
  e.preventDefault();
}, { passive: false });

stageEl.addEventListener("pointermove", e => {
  if (!gestureStart) return;
  trail.push({ x: e.clientX, y: e.clientY, t: performance.now() });
  kick();
  const dx = e.clientX - gestureStart.x;
  const dy = e.clientY - gestureStart.y;
  const dt = Math.max(1, performance.now() - gestureStart.t);
  const dist = Math.hypot(dx, dy);

  if (dist >= MIN_DIST && dist / dt >= MIN_SPEED) {
    executeTapli(dx, dy, dist / dt, e.clientX, e.clientY);
    gestureStart = null;
  } else if (dt > 260) {
    gestureStart = { x: e.clientX, y: e.clientY, t: performance.now() };
  }
});

stageEl.addEventListener("pointerup", () => (gestureStart = null));
stageEl.addEventListener("pointercancel", () => (gestureStart = null));
document.addEventListener("contextmenu", e => e.preventDefault());

// ─── App Start ───────────────────────────────────────────────────────────────

updateMainDropdown();
showBasePhoto();
if (!friends.length) openModal("NEW");
