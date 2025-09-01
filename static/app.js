// ===== Imports (Firebase v12) =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.2.0/firebase-auth.js";
import { getFirestore, collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.2.0/firebase-firestore.js";

// ===== Global State =====
let APP_ID = "meditrack";
let FIREBASE_CONFIG = null;
let db, auth, userId, remindersCollectionRef;
let totalReminders = 0, completedReminders = 0;
let reminderChart, trendChart;

// ===== DOM =====
const chatInput = document.getElementById('chat-input');
const chatLog = document.getElementById('chat-log');
const chatSendBtn = document.getElementById('chat-send');
const medicineInput = document.getElementById('medicine-input');
const medicineBtn = document.getElementById('medicine-btn');
const medicineResult = document.getElementById('medicine-result');
const remindersList = document.getElementById('reminders');
const medForm = document.getElementById('med-form');
const pointsElement = document.getElementById('points');
const progressBar = document.getElementById('progress-bar');
const newMedicinesContainer = document.getElementById('new-medicines');
const freeTrialBtn = document.getElementById('free-trial');
const navLogo = document.getElementById("nav-logo"); // navbar logo

// ===== Helpers =====
function displayMessage(message, sender) {
    const msg = document.createElement('div');
    msg.classList.add('message', sender);
    msg.innerHTML = `<p>${message}</p>`;
    chatLog.appendChild(msg);
    chatLog.scrollTop = chatLog.scrollHeight;
}

function showModal(msg, cb=null) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `<div class="modal-content">
        <p>${msg}</p>
        <div class="modal-buttons">
            <button id="modal-ok">OK</button>
        </div>
    </div>`;
    document.body.appendChild(modal);
    document.getElementById('modal-ok').addEventListener('click', () => { modal.remove(); if(cb) cb(); });
}

// ===== Firebase Init =====
async function bootstrap() {
    try {
        const res = await fetch('/config');
        const cfg = await res.json();
        FIREBASE_CONFIG = cfg.firebase_config;
        APP_ID = cfg.app_id || APP_ID;

        const app = initializeApp(FIREBASE_CONFIG);
        auth = getAuth(app);
        db = getFirestore(app);
        await signInAnonymously(auth);
        userId = auth.currentUser?.uid;

        if (!userId) { 
            remindersList.innerHTML = "<li>Authentication failed</li>"; 
            return; 
        }

        remindersCollectionRef = collection(db, `apps/${APP_ID}/users/${userId}/reminders`);
        listenForReminders();

        if("Notification" in window && Notification.permission!=="granted") Notification.requestPermission();
        setInterval(checkDueReminders, 10000);

        // ===== Initialize Charts =====
        const reminderCtx = document.getElementById('reminderChart').getContext('2d');
        reminderChart = new Chart(reminderCtx, {
            type: 'doughnut',
            data: {
                labels: ['Taken', 'Missed'],
                datasets: [{
                    label: 'Reminders',
                    data: [completedReminders, totalReminders - completedReminders],
                    backgroundColor: ['#2c786c', '#e74c3c']
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });

        const trendCtx = document.getElementById('trendChart').getContext('2d');
        trendChart = new Chart(trendCtx, {
            type: 'line',
            data: {
                labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                datasets: [{
                    label: 'Reminders Completed',
                    data: [0,0,0,0,0,0,0],
                    borderColor: '#2c786c',
                    backgroundColor: 'rgba(44,120,108,0.2)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });

        // ===== Fetch New Medicines on Bootstrap =====
        fetchNewMedicines();

    } catch(e) {
        console.error("Bootstrap error:", e);
    }
}

// ===== Fetch Latest Medicines =====
async function fetchNewMedicines(limit=5) {
    if (!newMedicinesContainer) return;
    newMedicinesContainer.innerHTML = "<p class='text-gray-500'>Loading latest medicines...</p>";

    try {
        const res = await fetch(`/new_medicines?limit=${limit}`);
        const data = await res.json();

        if (data.medicines && data.medicines.length) {
            newMedicinesContainer.innerHTML = '';
            data.medicines.forEach(med => {
                const div = document.createElement('div');
                div.className = 'medicine-item';
                div.innerHTML = `<strong>${med.name}</strong> (${med.category})<br>${med.description}`;
                newMedicinesContainer.appendChild(div);
            });
        } else {
            newMedicinesContainer.innerHTML = "<p>No new medicines found.</p>";
        }
    } catch (e) {
        newMedicinesContainer.innerHTML = "<p>Error fetching new medicines.</p>";
        console.error("Fetch new medicines error:", e);
    }
}

// ===== Firestore CRUD =====
async function addReminder(data){ 
    try{ await addDoc(remindersCollectionRef,data);} 
    catch(e){showModal("Error saving reminder");} 
}
async function deleteReminder(id){ 
    try{ await deleteDoc(doc(db, remindersCollectionRef.path, id));} 
    catch(e){showModal("Error deleting reminder");} 
}
async function updateReminderStatus(id,status){ 
    try{ await updateDoc(doc(db, remindersCollectionRef.path,id), {is_taken:status});} 
    catch(e){} 
}

// ===== Reminder Listener =====
function listenForReminders(){
    onSnapshot(remindersCollectionRef, snapshot=>{
        remindersList.innerHTML=''; totalReminders=snapshot.docs.length; completedReminders=0;
        snapshot.forEach(d=>{
            const r={...d.data(), id:d.id};
            const li=createReminderListItem(r);
            remindersList.appendChild(li);
        });
        updateProgress();
    },err=>{
        console.error(err); 
        remindersList.innerHTML="<li>Could not fetch reminders</li>";
    });
}

// ===== Reminder UI =====
function createReminderListItem(reminder){
    const li=document.createElement('li'); li.dataset.id=reminder.id; li.className='reminder-item';
    li.innerHTML = `<span><strong>${reminder.name}</strong> - Take <strong>${reminder.medication}</strong> at <em>${reminder.time}</em></span>
        <div class="reminder-actions">
            <input type="checkbox" class="taken-checkbox" data-id="${reminder.id}" ${reminder.is_taken?'checked':''}>
            <button class="delete-btn">❌</button>
        </div>`;
    if(reminder.is_taken){ li.style.textDecoration="line-through"; li.style.opacity="0.6"; completedReminders++; }
    return li;
}

// ===== Reminder Notifications =====
function checkDueReminders(){
    if(!remindersCollectionRef) return;
    const now=new Date();
    const currentTime=`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    getDocs(remindersCollectionRef).then(snapshot=>{
        snapshot.forEach(d=>{
            const r=d.data();
            if(r.time===currentTime && !r.is_taken){ playAlarmAndNotify({...r,id:d.id}); }
        });
    }).catch(err=>console.error(err));
}

function playAlarmAndNotify(reminder){
    try{ new Audio("https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg").play().catch(()=>{});}catch(e){}
    if("Notification" in window && Notification.permission==="granted"){
        const n=new Notification("⏰ Medication Reminder",{body:`Time to take ${reminder.medication} — ${reminder.name}`,tag:`reminder-${reminder.id}`,renotify:true});
        n.onclick=()=>{window.focus(); highlightReminder(reminder.id);}
        return;
    }
    showReminderPopup(reminder);
}

function highlightReminder(id){
    const el=document.querySelector(`li[data-id="${id}"]`);
    if(!el) return; el.scrollIntoView({behavior:'smooth',block:'center'});
    el.style.boxShadow='0 6px 18px rgba(44,120,108,0.18)'; el.style.transform='scale(1.01)';
    setTimeout(()=>{el.style.boxShadow=''; el.style.transform='';},1200);
}

function showReminderPopup(reminder){
    const existing=document.getElementById('reminder-popup'); if(existing) existing.remove();
    const popup=document.createElement('div'); popup.id='reminder-popup'; popup.className='reminder-popup';
    popup.innerHTML=`<div class="popup-left"><strong>⏰ Reminder</strong><div class="popup-msg">Time to take <em>${reminder.medication}</em> — ${reminder.name}</div></div>
    <div class="popup-actions">
        <button class="popup-btn popup-taken">Mark taken</button>
        <button class="popup-btn popup-dismiss">Dismiss</button>
    </div>`;
    (document.getElementById('reminders')?.parentElement||document.body).appendChild(popup);

    popup.querySelector('.popup-taken').addEventListener('click',async()=>{
        await updateReminderStatus(reminder.id,true); popup.remove(); highlightReminder(reminder.id); showModal("Marked as taken ✅");
    });
    popup.querySelector('.popup-dismiss').addEventListener('click',()=>popup.remove());
    setTimeout(()=>{const p=document.getElementById('reminder-popup');if(p)p.remove();},45000);
}

// ===== Progress =====
function updateProgress() {
    const pct = totalReminders ? Math.round((completedReminders / totalReminders) * 100) : 0;
    progressBar.style.width = `${pct}%`;
    pointsElement.textContent = completedReminders * 10;

    if(reminderChart){
        reminderChart.data.datasets[0].data = [completedReminders, totalReminders - completedReminders];
        reminderChart.update();
    }

    if(trendChart){
        const todayIndex = (new Date().getDay()+6)%7; // Mon=0
        trendChart.data.datasets[0].data[todayIndex] = completedReminders;
        trendChart.update();
    }
}

// ===== Form submit =====
medForm.addEventListener('submit',async(e)=>{
    e.preventDefault();
    const data={
        name: medForm.name.value.trim(),
        medication: medForm.medication.value.trim(),
        time: medForm.time.value,
        phone: medForm.phone.value,
        sms: medForm['sms-toggle'].checked,
        is_taken:false,
        timestamp: serverTimestamp()
    };
    await addReminder(data);
    medForm.reset();
});

// ===== Checkbox / delete events =====
remindersList.addEventListener('change', async(e)=>{
    if(e.target.classList.contains('taken-checkbox')){
        const id=e.target.dataset.id; const status=e.target.checked;
        await updateReminderStatus(id,status); updateProgress();
    }
});
remindersList.addEventListener('click', async(e)=>{
    if(e.target.classList.contains('delete-btn')){
        const li=e.target.closest('li'); await deleteReminder(li.dataset.id);
    }
});

// ===== Chatbot (Premium Message) =====
chatSendBtn.addEventListener('click', sendChat);
chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
function sendChat() {
    const q = chatInput.value.trim(); 
    if (!q) return;
    displayMessage(q, 'user'); 
    chatInput.value = '';
    displayMessage("🤖 Pay the premium to get access to 24/7 AI consulting.", 'bot');
}

// ===== Medicine Info Lookup =====
function markdownToHtml(text) {
    let html = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\n\n/g, '<br><br>');
    return html;
}

medicineBtn.addEventListener('click', async () => {
    const med = medicineInput.value.trim();
    if (!med) {
        medicineResult.textContent = 'Please enter a medicine name.';
        return;
    }
    medicineResult.innerHTML = '<span class="text-gray-500">Searching...</span>';

    try {
        const res = await fetch(`/medicine_lookup?q=${encodeURIComponent(med)}`);
        const data = await res.json();

        if (data.answer) {
            medicineResult.innerHTML = markdownToHtml(data.answer);
        } else if (data.error) {
            medicineResult.textContent = 'Error: ' + data.error;
        } else {
            medicineResult.textContent = 'An unexpected error occurred.';
        }
    } catch (e) {
        medicineResult.textContent = 'Error fetching medicine info. Please check your network connection.';
        console.error("Medicine lookup error:", e);
    }
});

// ===== Contact Form =====
const contactForm = document.getElementById("contact-form");
contactForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    alert("Message submitted successfully!");
    contactForm.reset();
});

// ===== Paga Payment =====
function payWithPaga(itemName, amount) {
    alert("Redirecting to Paga payment for " + itemName + " (₦" + amount + ")");
    window.location.href = "https://mypaga.com/paga-webservices/rest/express-checkout?amount=" + amount + "&item=" + encodeURIComponent(itemName);
}

// ===== Dark/Light Mode =====
const themeToggleBtn = document.createElement("button");
themeToggleBtn.id = "theme-toggle";
themeToggleBtn.textContent = "🌙"; // Default icon
themeToggleBtn.style.position = "fixed";
themeToggleBtn.style.bottom = "20px";
themeToggleBtn.style.right = "20px";
themeToggleBtn.style.padding = "10px 15px";
themeToggleBtn.style.borderRadius = "50%";
themeToggleBtn.style.border = "none";
themeToggleBtn.style.cursor = "pointer";
themeToggleBtn.style.fontSize = "18px";
themeToggleBtn.style.zIndex = "9999";
themeToggleBtn.style.backgroundColor = "#001f3f"; // navy
themeToggleBtn.style.color = "#fff";
document.body.appendChild(themeToggleBtn);

// Load saved theme
function loadTheme() {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "dark") {
        document.body.classList.add("dark-mode");
        themeToggleBtn.textContent = "☀️";
        themeToggleBtn.style.backgroundColor = "#001f3f";
        if (navLogo) navLogo.src = "https://thumbs.dreamstime.com/b/medicine-icon-black-background-black-flat-style-vector-illustration-medicine-icon-black-background-black-flat-style-vector-168422030.jpg";
    } else {
        document.body.classList.remove("dark-mode");
        themeToggleBtn.textContent = "🌙";
        themeToggleBtn.style.backgroundColor = "#001f3f";
        if (navLogo) navLogo.src = "your-light-logo.png"; // replace with original
    }
}
loadTheme();

// Toggle theme
themeToggleBtn.addEventListener("click", () => {
    if (document.body.classList.contains("dark-mode")) {
        document.body.classList.remove("dark-mode");
        localStorage.setItem("theme", "light");
        themeToggleBtn.textContent = "🌙";
        if (navLogo) navLogo.src = "your-light-logo.png"; // light
    } else {
        document.body.classList.add("dark-mode");
        localStorage.setItem("theme", "dark");
        themeToggleBtn.textContent = "☀️";
        if (navLogo) navLogo.src = "https://thumbs.dreamstime.com/b/medicine-icon-black-background-black-flat-style-vector-illustration-medicine-icon-black-background-black-flat-style-vector-168422030.jpg"; // dark logo
    }
});

// ===== Bootstrap =====
bootstrap();
