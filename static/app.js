// ===== Imports (Firebase v12) =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/12.2.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  getDocs,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.2.0/firebase-firestore.js";

// =================== Global State ===================
let APP_ID = "meditrack";
let FIREBASE_CONFIG = null;

let app, auth, db;
let dataLayer = null;          // unified data access (firestore or local)
let reminderIntervalId = null; // due-checker interval

let totalReminders = 0;
let completedReminders = 0;
let reminderChart = null;
let trendChart = null;

// =================== DOM Elements ===================
const chatInput = document.getElementById("chat-input");
const chatLog = document.getElementById("chat-log");
const chatSendBtn = document.getElementById("chat-send");

const medicineInput = document.getElementById("medicine-input");
const medicineBtn = document.getElementById("medicine-btn");
const medicineResult = document.getElementById("medicine-result");

const remindersList = document.getElementById("reminders");
const medForm = document.getElementById("med-form");

const pointsElement = document.getElementById("points");
const progressBar = document.getElementById("progress-bar");
const newMedicinesContainer = document.getElementById("new-medicines");

// =================== Flash Popup ===================
let flashPopup = document.getElementById("flashPopup");
if (!flashPopup) {
  flashPopup = document.createElement("div");
  flashPopup.id = "flashPopup";
  flashPopup.style.cssText = `
    display:none; position:fixed; top:50%; left:50%;
    transform:translate(-50%,-50%); background:#2c786c; color:#fff;
    padding:20px 30px; border-radius:12px; font-size:16px; z-index:9999;
    box-shadow:0 8px 30px rgba(0,0,0,0.3);
  `;
  document.body.appendChild(flashPopup);
}
function showFlash(msg, duration = 2500) {
  if (!flashPopup) return;
  flashPopup.textContent = msg;
  flashPopup.style.display = "block";
  setTimeout(() => (flashPopup.style.display = "none"), duration);
}


// =================== Helpers ===================
function displayMessage(message, sender) {
  if (!chatLog) return;
  const msg = document.createElement("div");
  msg.classList.add("message", sender);
  msg.innerHTML = `<p>${message}</p>`;
  chatLog.appendChild(msg);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function stopAlarmAndPopup() {
  document.querySelectorAll("#reminder-sound").forEach((a) => {
    try { a.pause(); a.currentTime = 0; } catch {}
  });
  document.getElementById("reminder-popup")?.remove();
}

// =================== Theme Toggle (restored) ===================
(function injectThemeToggle() {
  const btn = document.createElement("button");
  btn.id = "theme-toggle";
  btn.textContent = "🌙";
  btn.title = "Toggle theme";
  btn.style.cssText = `
    position:fixed; bottom:20px; right:20px; padding:10px 15px;
    border-radius:50%; border:none; cursor:pointer; font-size:18px;
    z-index:9999; background-color:#001f3f; color:#fff;
  `;
  document.body.appendChild(btn);

  const saved = localStorage.getItem("theme");
  if (saved === "dark") {
    document.body.classList.add("dark-mode");
    btn.textContent = "☀️";
  }

  btn.addEventListener("click", () => {
    const dark = document.body.classList.toggle("dark-mode");
    localStorage.setItem("theme", dark ? "dark" : "light");
    btn.textContent = dark ? "☀️" : "🌙";
  });
})();

// =================== Data Layers ===================
// -- Firestore-backed layer
function createFirestoreLayer(colRef) {
  let unsubscribe = null;
  return {
    type: "firestore",
    subscribe(cb, errCb) {
      unsubscribe?.();
      unsubscribe = onSnapshot(
        colRef,
        (snap) => {
          const list = [];
          snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
          cb(list);
        },
        (e) => {
          console.error("Firestore snapshot error:", e);
          errCb?.(e);
        }
      );
    },
    unsubscribe() {
      try { unsubscribe?.(); } catch {}
      unsubscribe = null;
    },
    async add(item) {
      await addDoc(colRef, item);
    },
    async update(id, fields) {
      await updateDoc(doc(db, colRef.path, id), fields);
    },
    async remove(id) {
      await deleteDoc(doc(db, colRef.path, id));
    },
    async listOnce() {
      const snap = await getDocs(colRef);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
  };
}

// -- LocalStorage-backed layer (offline/guest fallback)
function createLocalLayer(storageKey = "guest_reminders_v1") {
  const listeners = new Set();

  function read() {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }
  function write(list) {
    localStorage.setItem(storageKey, JSON.stringify(list));
    listeners.forEach((fn) => fn(read()));
  }

  // react to cross-tab changes
  window.addEventListener("storage", (e) => {
    if (e.key === storageKey) {
      listeners.forEach((fn) => fn(read()));
    }
  });

  return {
    type: "local",
    subscribe(cb) {
      listeners.add(cb);
      cb(read()); // initial emit
      return () => listeners.delete(cb);
    },
    unsubscribe() {/* no-op; handled by returned function */},
    async add(item) {
      const list = read();
      const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
      list.push({ id, ...item });
      write(list);
    },
    async update(id, fields) {
      const list = read().map((r) => (r.id === id ? { ...r, ...fields } : r));
      write(list);
    },
    async remove(id) {
      const list = read().filter((r) => r.id !== id);
      write(list);
    },
    async listOnce() {
      return read();
    },
  };
}

// =================== Bootstrap ===================
async function bootstrap() {
  try {
    const res = await fetch("/config");
    const cfg = await res.json();
    FIREBASE_CONFIG = cfg.firebase_config;
    APP_ID = cfg.app_id || APP_ID;

    app = initializeApp(FIREBASE_CONFIG);
    auth = getAuth(app);
    db = getFirestore(app);

    // Ask for notifications (best-effort)
    if ("Notification" in window && Notification.permission !== "granted") {
      try { await Notification.requestPermission(); } catch {}
    }

    initCharts();
    fetchNewMedicines();

    // Start in guest mode with Firestore guest collection; if rules block it → local
    const guestCol = collection(db, `apps/${APP_ID}/guest/reminders`);
    dataLayer = createFirestoreLayer(guestCol);
    attachDataLayer(dataLayer, { announce: "👤 Guest mode — cloud reminders." });

    // Optional auth: if user logs in, switch to private collection
    onAuthStateChanged(auth, async (user) => {
      // Tear down current listeners/intervals before switching layers
      detachDataLayer();

      if (user) {
        // Try to ensure displayName (optional, non-fatal)
        try {
          const newUser = JSON.parse(localStorage.getItem("newUser") || "{}");
          if (!user.displayName && newUser.firstName) {
            await updateProfile(user, { displayName: newUser.firstName });
            localStorage.removeItem("newUser");
          }
        } catch {}

        const userCol = collection(db, `apps/${APP_ID}/users/${user.uid}/reminders`);
        dataLayer = createFirestoreLayer(userCol);
        attachDataLayer(dataLayer, { announce: `✅ Welcome ${user.displayName || "User"}! Personal reminders.` });
      } else {
        // Not logged in — try Firestore guest again; if it errors, we'll fall back to local
        const gCol = collection(db, `apps/${APP_ID}/guest/reminders`);
        dataLayer = createFirestoreLayer(gCol);
        attachDataLayer(dataLayer, { announce: "👤 Guest mode — cloud reminders." });
      }
    });
  } catch (e) {
    console.error("Bootstrap error:", e);
    // Fully offline: use local storage
    dataLayer = createLocalLayer();
    attachDataLayer(dataLayer, { announce: "⚠️ Offline guest mode — local reminders." });
  }
}

function attachDataLayer(layer, { announce } = {}) {
  // Subscribe to list changes
  const onList = (list) => {
    renderReminders(list);
    updateProgressFromList(list);
  };
  const onErr = (err) => {
    console.warn("Listener error; falling back to local storage.", err?.code || err);
    if (layer.type === "firestore") {
      layer.unsubscribe?.();
      dataLayer = createLocalLayer();
      attachDataLayer(dataLayer, { announce: "👤 Guest mode — local reminders." });
      return;
    }
  };

  if (layer.type === "firestore") {
    layer.subscribe(onList, onErr);
  } else {
    // local layer returns an unsubscriber; emulate for symmetry
    const unsub = layer.subscribe(onList);
    layer.unsubscribe = unsub;
  }

  startReminderInterval();
  if (announce) showFlash(announce);
}

function detachDataLayer() {
  try { dataLayer?.unsubscribe?.(); } catch {}
  stopReminderInterval();
  stopAlarmAndPopup();
}

// =================== Charts ===================
function initCharts() {
  if (typeof Chart === "undefined") return;

  const doughnutCtx = document.getElementById("reminderChart")?.getContext("2d");
  if (doughnutCtx) {
    reminderChart = new Chart(doughnutCtx, {
      type: "doughnut",
      data: {
        labels: ["Taken", "Missed"],
        datasets: [
          {
            data: [0, 0],
            backgroundColor: ["#2c786c", "#e74c3c"],
          },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false },
    });
  }

  const trendCtx = document.getElementById("trendChart")?.getContext("2d");
  if (trendCtx) {
    trendChart = new Chart(trendCtx, {
      type: "line",
      data: {
        labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        datasets: [
          {
            label: "Reminders Completed",
            data: [0, 0, 0, 0, 0, 0, 0],
            borderColor: "#2c786c",
            backgroundColor: "rgba(44,120,108,0.2)",
            fill: true,
            tension: 0.4,
          },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false },
    });
  }
}

function updateProgressFromList(list) {
  totalReminders = list.length;
  completedReminders = list.filter((r) => r.is_taken).length;

  const pct = totalReminders ? Math.round((completedReminders / totalReminders) * 100) : 0;
  if (progressBar) progressBar.style.width = `${pct}%`;
  if (pointsElement) pointsElement.textContent = completedReminders * 10;

  if (reminderChart) {
    reminderChart.data.datasets[0].data = [completedReminders, totalReminders - completedReminders];
    reminderChart.update();
  }
  if (trendChart) {
    const todayIndex = (new Date().getDay() + 6) % 7; // Mon=0..Sun=6
    trendChart.data.datasets[0].data[todayIndex] = completedReminders;
    trendChart.update();
  }
}

// =================== Medicines (optional endpoint) ===================
async function fetchNewMedicines(limit = 5) {
  if (!newMedicinesContainer) return;
  newMedicinesContainer.innerHTML = "<p class='text-gray-500'>Loading latest medicines...</p>";
  try {
    const res = await fetch(`/new_medicines?limit=${limit}`);
    const data = await res.json();
    if (data.medicines?.length) {
      newMedicinesContainer.innerHTML = "";
      data.medicines.forEach((med) => {
        const div = document.createElement("div");
        div.className = "medicine-item";
        div.innerHTML = `<strong>${med.name}</strong> (${med.category})<br>${med.description}`;
        newMedicinesContainer.appendChild(div);
      });
    } else {
      newMedicinesContainer.innerHTML = "<p>No new medicines found.</p>";
    }
  } catch (e) {
    console.error(e);
    newMedicinesContainer.innerHTML = "<p>Error fetching new medicines.</p>";
  }
}

// =================== Reminder UI ===================
function renderReminders(reminders) {
  if (!remindersList) return;
  remindersList.innerHTML = "";
  if (!reminders.length) {
    const li = document.createElement("li");
    li.textContent = "No reminders yet. Add one below!";
    li.style.opacity = "0.8";
    remindersList.appendChild(li);
    return;
  }
  reminders.forEach((r) => {
    remindersList.appendChild(createReminderListItem(r));
  });
}

function createReminderListItem(reminder) {
  const li = document.createElement("li");
  li.className = "reminder-item";
  li.dataset.id = reminder.id;
  li.innerHTML = `
    <span><strong>${reminder.name}</strong> - Take <strong>${reminder.medication}</strong> at <em>${reminder.time}</em></span>
    <div class="reminder-actions">
      <input type="checkbox" class="taken-checkbox" data-id="${reminder.id}" ${reminder.is_taken ? "checked" : ""}>
      <button class="delete-btn" title="Delete">❌</button>
    </div>
  `;
  if (reminder.is_taken) {
    li.style.textDecoration = "line-through";
    li.style.opacity = "0.65";
  }
  return li;
}

// =================== Due Reminders ===================
function startReminderInterval() {
  stopReminderInterval();
  reminderIntervalId = setInterval(checkDueReminders, 10000);
}
function stopReminderInterval() {
  if (reminderIntervalId) clearInterval(reminderIntervalId);
  reminderIntervalId = null;
}

async function checkDueReminders() {
  try {
    const list = await dataLayer.listOnce();
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const currentTime = `${hh}:${mm}`;

    list.forEach((r) => {
      if (r.time === currentTime && !r.is_taken) {
        showReminderPopup({ ...r });
      }
    });
  } catch (e) {
    console.error("Due check failed:", e);
  }
}

function showReminderPopup(reminder) {
  document.getElementById("reminder-popup")?.remove();

  // Create popup
  const popup = document.createElement("div");
  popup.id = "reminder-popup";
  popup.className = "reminder-popup";
  popup.style.cssText = `
    position:fixed; right:20px; bottom:-200px;
    background:#111; color:#fff; padding:14px 16px;
    border-radius:10px; z-index:9999;
    box-shadow:0 10px 25px rgba(0,0,0,0.35);
    display:flex; gap:12px; align-items:center;
    min-width:280px; max-width:320px;
    opacity:0; transition:bottom 0.5s ease, opacity 0.5s ease;
  `;
  popup.innerHTML = `
    <div style="flex:1;">
      <strong>⏰ Reminder</strong>
      <div>Take <em>${reminder.medication}</em> — ${reminder.name}</div>
    </div>
    <div style="display:flex; flex-direction:column; gap:6px;">
      <button class="popup-btn popup-taken" style="padding:6px 10px;border:none;border-radius:8px;background:#2c786c;color:#fff;cursor:pointer;">✔</button>
      <button class="popup-btn popup-dismiss" style="padding:6px 10px;border:none;border-radius:8px;background:#444;color:#fff;cursor:pointer;">✖</button>
    </div>
    <audio id="reminder-sound">
      <source src="/static/sounds/alarm.mp3" type="audio/mpeg">
    </audio>
  `;

  document.body.appendChild(popup);

    // Animate in
  setTimeout(() => {
    popup.style.bottom = "20px";
    popup.style.opacity = "1";
  }, 50)


  // Play sound manually (for browsers that block autoplay)
  const audio = popup.querySelector("#reminder-sound");
  if (audio) {
    audio.play().catch(() => {
      // if autoplay fails, try after slight delay
      setTimeout(() => audio.play().catch(() => console.warn("Alarm blocked by browser")), 500);
    });
  }

  // Button events
  popup.querySelector(".popup-taken").addEventListener("click", async () => {
    try {
      if (reminder.id) await dataLayer.update(reminder.id, { is_taken: true });
      stopAlarmAndPopup();
      showFlash("Marked as taken ✅");
    } catch (e) {
      console.error(e);
    }
  });
  popup.querySelector(".popup-dismiss").addEventListener("click", stopAlarmAndPopup);

  // Auto-hide after 45s
  setTimeout(() => {
    popup.style.opacity = "0";
    popup.style.bottom = "-200px";
    setTimeout(stopAlarmAndPopup, 500);
  }, 45000);
}

// =================== Progress ===================
function updateProgress() {
  // Deprecated: kept for compatibility if called somewhere else
  dataLayer?.listOnce().then(updateProgressFromList).catch(() => {});
}

// =================== Form Handling ===================
medForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const nameEl = document.getElementById("name");
  const medicationEl = document.getElementById("medication");
  const timeEl = document.getElementById("time");
  const phoneEl = document.getElementById("phone");
  const smsToggleEl = document.getElementById("sms-toggle"); // optional

  const data = {
    name: (nameEl?.value || "").trim(),
    medication: (medicationEl?.value || "").trim(),
    time: timeEl?.value || "",
    phone: phoneEl?.value || "",
    sms: !!(smsToggleEl && smsToggleEl.checked),
    is_taken: false,
    timestamp: serverTimestamp?.() || new Date(),
  };

  if (!data.name || !data.medication || !data.time) {
    showFlash("Please fill in name, medication, and time.");
    return;
  }

  try {
    await dataLayer.add(data);
    medForm.reset();
    showFlash("Reminder added ✅");
  } catch (e) {
    console.error("Add reminder failed:", e);
    showFlash("❌ Could not save reminder.");
  }
});

// =================== List Interaction ===================
remindersList?.addEventListener("change", async (e) => {
  const t = e.target;
  if (t.classList.contains("taken-checkbox")) {
    const id = t.dataset.id;
    const status = t.checked;
    try {
      await dataLayer.update(id, { is_taken: status });
      updateProgress();
    } catch (e) {
      console.error("Update failed:", e);
    }
  }
});

remindersList?.addEventListener("click", async (e) => {
  const t = e.target;
  if (t.classList.contains("delete-btn")) {
    const li = t.closest("li");
    if (!li) return;
    const id = li.dataset.id;
    try {
      await dataLayer.remove(id);
    } catch (e) {
      console.error("Delete failed:", e);
    }
  }
});

// =================== Chatbot (placeholder) ===================
chatSendBtn?.addEventListener("click", sendChat);
chatInput?.addEventListener("keydown", (e) => e.key === "Enter" && sendChat());
function sendChat() {
  if (!chatInput) return;
  const q = chatInput.value.trim();
  if (!q) return;
  displayMessage(q, "user");
  chatInput.value = "";
  displayMessage("🤖 Pay the premium to get access to 24/7 AI consulting.", "bot");
}

// =================== Medicine Lookup ===================
function markdownToHtml(text) {
  let html = text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\n\n/g, "<br><br>");
  return html;
}
medicineBtn?.addEventListener("click", fetchMedicine);
medicineInput?.addEventListener("keydown", (e) => e.key === "Enter" && fetchMedicine());
async function fetchMedicine() {
  if (!medicineInput || !medicineResult) return;
  const med = medicineInput.value.trim();
  if (!med) {
    medicineResult.textContent = "Please enter a medicine name.";
    return;
  }
  medicineResult.innerHTML = '<span class="text-gray-500">Searching...</span>';
  try {
    const res = await fetch(`/medicine_lookup?q=${encodeURIComponent(med)}`);
    const data = await res.json();
    if (data.answer) {
      medicineResult.innerHTML = markdownToHtml(data.answer);
    } else if (data.error) {
      medicineResult.textContent = "Error: " + data.error;
    } else {
      medicineResult.textContent = "An unexpected error occurred.";
    }
  } catch (e) {
    console.error(e);
    medicineResult.textContent = "Error fetching medicine info.";
  }
}

// =================== Go! ===================
bootstrap();
