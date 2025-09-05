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

// ===== Global State =====
let APP_ID = "meditrack";
let FIREBASE_CONFIG = null;
let db, auth, userId, remindersCollectionRef;
let unsubscribeReminders = null;
let reminderIntervalId = null;

let totalReminders = 0,
  completedReminders = 0;
let reminderChart = null,
  trendChart = null;

// ===== DOM Elements =====
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

// ===== Flash popup =====
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

function showFlash(msg, duration = 3000) {
  flashPopup.innerText = msg;
  flashPopup.style.display = "block";
  setTimeout(() => (flashPopup.style.display = "none"), duration);
}

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
    a.pause();
    a.currentTime = 0;
  });
  document.getElementById("reminder-popup")?.remove();
}

// ===== Firebase Init =====
async function bootstrap() {
  try {
    const res = await fetch("/config");
    const cfg = await res.json();
    FIREBASE_CONFIG = cfg.firebase_config;
    APP_ID = cfg.app_id || APP_ID;

    const app = initializeApp(FIREBASE_CONFIG);
    auth = getAuth(app);
    db = getFirestore(app);

    // 🔑 Auth state is now OPTIONAL
    onAuthStateChanged(auth, async (user) => {
      teardownRemindersWatch();
      stopReminderInterval();
      stopAlarmAndPopup();

      if (user) {
        userId = user.uid;
        const name = user.displayName || "User";

        localStorage.setItem(
          "loggedInUser",
          JSON.stringify({ email: user.email, uid: user.uid, name })
        );

        remindersCollectionRef = collection(
          db,
          `apps/${APP_ID}/users/${userId}/reminders`
        );
        listenForReminders();
        startReminderInterval();

        showFlash(`✅ Welcome ${name}!`);
      } else {
        // Guest Mode: Use a shared collection (or skip Firestore entirely)
        remindersCollectionRef = collection(
          db,
          `apps/${APP_ID}/guest/reminders`
        );
        listenForReminders();
        startReminderInterval();
        showFlash("👤 Guest mode active — no login required.");
      }
    });

    if ("Notification" in window && Notification.permission !== "granted") {
      await Notification.requestPermission();
    }

    initCharts();
    fetchNewMedicines();
  } catch (e) {
    console.error("Bootstrap error:", e);
  }
}

// ===== Charts =====
function initCharts() {
  if (typeof Chart === "undefined") return;
  const reminderCtx = document.getElementById("reminderChart")?.getContext("2d");
  if (reminderCtx) {
    reminderChart = new Chart(reminderCtx, {
      type: "doughnut",
      data: {
        labels: ["Taken", "Missed"],
        datasets: [
          { data: [0, 0], backgroundColor: ["#2c786c", "#e74c3c"] },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false },
    });
  }
}

// ===== Reminders CRUD =====
async function addReminder(data) {
  if (!remindersCollectionRef) return;
  await addDoc(remindersCollectionRef, data);
}
async function deleteReminder(id) {
  await deleteDoc(doc(db, remindersCollectionRef.path, id));
}
async function updateReminderStatus(id, status) {
  await updateDoc(doc(db, remindersCollectionRef.path, id), {
    is_taken: status,
  });
}

// ===== Listener =====
function listenForReminders() {
  if (!remindersCollectionRef || !remindersList) return;
  unsubscribeReminders = onSnapshot(remindersCollectionRef, (snapshot) => {
    remindersList.innerHTML = "";
    totalReminders = 0;
    completedReminders = 0;
    snapshot.forEach((d) => {
      const r = { ...d.data(), id: d.id };
      totalReminders++;
      if (r.is_taken) completedReminders++;
      remindersList.appendChild(createReminderListItem(r));
    });
    updateProgress();
  });
}
function teardownRemindersWatch() {
  if (unsubscribeReminders) unsubscribeReminders();
  unsubscribeReminders = null;
}

function createReminderListItem(reminder) {
  const li = document.createElement("li");
  li.dataset.id = reminder.id;
  li.innerHTML = `
    <span><strong>${reminder.name}</strong> - ${reminder.medication} at <em>${reminder.time}</em></span>
    <div>
      <input type="checkbox" class="taken-checkbox" data-id="${reminder.id}" ${
    reminder.is_taken ? "checked" : ""
  }>
      <button class="delete-btn">❌</button>
    </div>`;
  if (reminder.is_taken) li.style.textDecoration = "line-through";
  return li;
}

// ===== Interval Check =====
function startReminderInterval() {
  stopReminderInterval();
  reminderIntervalId = setInterval(checkDueReminders, 10000);
}
function stopReminderInterval() {
  if (reminderIntervalId) clearInterval(reminderIntervalId);
}

function checkDueReminders() {
  if (!remindersCollectionRef) return;
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes()
  ).padStart(2, "0")}`;
  getDocs(remindersCollectionRef).then((snapshot) => {
    snapshot.forEach((d) => {
      const r = d.data();
      if (r.time === currentTime && !r.is_taken) showReminderPopup(r);
    });
  });
}

function showReminderPopup(r) {
  document.getElementById("reminder-popup")?.remove();
  const popup = document.createElement("div");
  popup.id = "reminder-popup";
  popup.innerHTML = `
    <strong>⏰ Time to take ${r.medication}</strong>
    <button class="popup-taken">Mark taken</button>
    <button class="popup-dismiss">Dismiss</button>`;
  document.body.appendChild(popup);
  popup.querySelector(".popup-taken").addEventListener("click", async () => {
    await updateReminderStatus(r.id, true);
    stopAlarmAndPopup();
    showFlash("Marked as taken ✅");
  });
  popup.querySelector(".popup-dismiss").addEventListener("click", stopAlarmAndPopup);
}

// ===== Progress =====
function updateProgress() {
  const pct = totalReminders
    ? Math.round((completedReminders / totalReminders) * 100)
    : 0;
  if (progressBar) progressBar.style.width = `${pct}%`;
  if (pointsElement) pointsElement.textContent = completedReminders * 10;
}

// ===== Form Handling =====
medForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = {
    name: document.getElementById("name").value,
    medication: document.getElementById("medication").value,
    time: document.getElementById("time").value,
    phone: document.getElementById("phone").value,
    is_taken: false,
    timestamp: serverTimestamp(),
  };
  await addReminder(data);
  medForm.reset();
  showFlash("Reminder added ✅");
});

// ===== List Interaction =====
remindersList?.addEventListener("change", (e) => {
  if (e.target.classList.contains("taken-checkbox")) {
    updateReminderStatus(e.target.dataset.id, e.target.checked);
  }
});
remindersList?.addEventListener("click", (e) => {
  if (e.target.classList.contains("delete-btn")) {
    deleteReminder(e.target.closest("li").dataset.id);
  }
});

// ===== Chatbot =====
chatSendBtn?.addEventListener("click", sendChat);
chatInput?.addEventListener("keydown", (e) => e.key === "Enter" && sendChat());
function sendChat() {
  const q = chatInput.value.trim();
  if (!q) return;
  displayMessage(q, "user");
  chatInput.value = "";
  displayMessage("🤖 AI Assistant is premium only.", "bot");
}

// ===== Start =====
bootstrap();
