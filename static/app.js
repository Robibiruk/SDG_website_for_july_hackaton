// ===== Imports (Firebase v12) =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.0/firebase-app.js";
import { getAuth, onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/12.2.0/firebase-auth.js";
import { getFirestore, collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.2.0/firebase-firestore.js";

// ===== Global State =====
let APP_ID = "meditrack";
let FIREBASE_CONFIG = null;
let db, auth, userId, remindersCollectionRef;
let totalReminders = 0, completedReminders = 0;
let reminderChart, trendChart;

// ===== DOM Elements =====
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

// ===== Flash popup =====
const flashPopup = document.createElement('div');
flashPopup.id = "flashPopup";
flashPopup.style.cssText = `
    display:none;
    position:fixed;
    top:50%;
    left:50%;
    transform:translate(-50%,-50%);
    background:#2c786c;
    color:#fff;
    padding:20px 30px;
    border-radius:12px;
    font-size:16px;
    z-index:9999;
    box-shadow:0 8px 30px rgba(0,0,0,0.3);
`;
document.body.appendChild(flashPopup);

// ===== Helpers =====
function showFlash(msg, duration=3000){
    flashPopup.innerText = msg;
    flashPopup.style.display = "block";
    setTimeout(()=>{ flashPopup.style.display = "none"; }, duration);
}

function displayMessage(message, sender){
    const msg = document.createElement('div');
    msg.classList.add('message', sender);
    msg.innerHTML = `<p>${message}</p>`;
    chatLog.appendChild(msg);
    chatLog.scrollTop = chatLog.scrollHeight;
}

function showModal(msg, cb=null){
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `<div class="modal-content">
        <p>${msg}</p>
        <div class="modal-buttons">
            <button id="modal-ok">OK</button>
        </div>
    </div>`;
    document.body.appendChild(modal);
    document.getElementById('modal-ok').addEventListener('click', ()=>{ modal.remove(); if(cb) cb(); });
}

// ===== Firebase Init =====
async function bootstrap(){
    try {
        const res = await fetch('/config');
        const cfg = await res.json();
        FIREBASE_CONFIG = cfg.firebase_config;
        APP_ID = cfg.app_id || APP_ID;

        const app = initializeApp(FIREBASE_CONFIG);
        auth = getAuth(app);
        db = getFirestore(app);

        // ===== Single Auth Listener =====
        onAuthStateChanged(auth, async user => {
            if(user){
                userId = user.uid;

                // Check for displayName or use localStorage newUser
                let name = user.displayName;
                const newUser = JSON.parse(localStorage.getItem('newUser') || '{}');
                if(!name && newUser.firstName){
                    await updateProfile(user, { displayName: newUser.firstName });
                    name = newUser.firstName;
                    localStorage.removeItem('newUser'); // clear after first login
                }

                // Store user info
                localStorage.setItem("loggedInUser", JSON.stringify({
                    email: user.email,
                    uid: user.uid,
                    name: name || "User"
                }));

                remindersCollectionRef = collection(db, `apps/${APP_ID}/users/${userId}/reminders`);
                listenForReminders();

                showFlash(`✅ Welcome ${name || "User"}! Logged in successfully`);
            } else {
                remindersList.innerHTML = "<li>Please log in to view reminders</li>";
                localStorage.removeItem("loggedInUser");
            }
        });

        if("Notification" in window && Notification.permission!=="granted") Notification.requestPermission();
        setInterval(checkDueReminders, 10000);

        initCharts();
        fetchNewMedicines();

    } catch(e){ console.error("Bootstrap error:", e); }
}

// ===== Charts =====
function initCharts(){
    const reminderCtx = document.getElementById('reminderChart')?.getContext('2d');
    if(reminderCtx){
        reminderChart = new Chart(reminderCtx, {
            type: 'doughnut',
            data: { labels:['Taken','Missed'], datasets:[{label:'Reminders', data:[0,0], backgroundColor:['#2c786c','#e74c3c']}] },
            options: { responsive:true, maintainAspectRatio:false }
        });
    }
    const trendCtx = document.getElementById('trendChart')?.getContext('2d');
    if(trendCtx){
        trendChart = new Chart(trendCtx,{
            type:'line',
            data:{ labels:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], datasets:[{label:'Reminders Completed', data:[0,0,0,0,0,0,0], borderColor:'#2c786c', backgroundColor:'rgba(44,120,108,0.2)', fill:true, tension:0.4}]},
            options:{ responsive:true, maintainAspectRatio:false }
        });
    }
}

// ===== Fetch Latest Medicines =====
async function fetchNewMedicines(limit=5){
    if(!newMedicinesContainer) return;
    newMedicinesContainer.innerHTML="<p class='text-gray-500'>Loading latest medicines...</p>";
    try{
        const res = await fetch(`/new_medicines?limit=${limit}`);
        const data = await res.json();
        if(data.medicines && data.medicines.length){
            newMedicinesContainer.innerHTML='';
            data.medicines.forEach(med=>{
                const div = document.createElement('div');
                div.className = 'medicine-item';
                div.innerHTML = `<strong>${med.name}</strong> (${med.category})<br>${med.description}`;
                newMedicinesContainer.appendChild(div);
            });
        } else newMedicinesContainer.innerHTML="<p>No new medicines found.</p>";
    } catch(e){ newMedicinesContainer.innerHTML="<p>Error fetching new medicines.</p>"; console.error(e); }
}

// ===== Firestore CRUD =====
async function addReminder(data){
    if(!remindersCollectionRef){ showModal("You must be logged in to add reminders"); return; }
    try{ await addDoc(remindersCollectionRef, data); }
    catch(e){ showModal("Error saving reminder"); }
}
async function deleteReminder(id){
    if(!remindersCollectionRef) return;
    try{ await deleteDoc(doc(db, remindersCollectionRef.path, id)); }
    catch(e){ showModal("Error deleting reminder"); }
}
async function updateReminderStatus(id,status){
    if(!remindersCollectionRef) return;
    try{ await updateDoc(doc(db, remindersCollectionRef.path, id), {is_taken:status}); }
    catch(e){ console.error(e); }
}

// ===== Reminder Listener =====
function listenForReminders(){
    if(!remindersCollectionRef) return;
    onSnapshot(remindersCollectionRef, snapshot=>{
        remindersList.innerHTML=''; totalReminders=0; completedReminders=0;
        snapshot.forEach(d=>{
            const r={...d.data(), id:d.id};
            totalReminders++;
            if(r.is_taken) completedReminders++;
            const li = createReminderListItem(r);
            remindersList.appendChild(li);
        });
        updateProgress();
    }, err=>{ console.error(err); remindersList.innerHTML="<li>Could not fetch reminders</li>"; });
}

// ===== Reminder UI =====
function createReminderListItem(reminder){
    const li=document.createElement('li');
    li.dataset.id=reminder.id;
    li.className='reminder-item';
    li.innerHTML = `<span><strong>${reminder.name}</strong> - Take <strong>${reminder.medication}</strong> at <em>${reminder.time}</em></span>
        <div class="reminder-actions">
            <input type="checkbox" class="taken-checkbox" data-id="${reminder.id}" ${reminder.is_taken?'checked':''}>
            <button class="delete-btn">❌</button>
        </div>`;
    if(reminder.is_taken){ li.style.textDecoration="line-through"; li.style.opacity="0.6"; }
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
            if(r.time===currentTime && !r.is_taken) showReminderPopup({...r,id:d.id});
        });
    }).catch(err=>console.error(err));
}

function showReminderPopup(reminder){
    const existing = document.getElementById('reminder-popup');
    if(existing) existing.remove();

    const popup = document.createElement('div');
    popup.id = 'reminder-popup';
    popup.className = 'reminder-popup';
    popup.innerHTML = `
        <div class="popup-left">
            <strong>⏰ Reminder</strong>
            <div class="popup-msg">Time to take <em>${reminder.medication}</em> — ${reminder.name}</div>
        </div>
        <div class="popup-actions">
            <button class="popup-btn popup-taken">Mark taken</button>
            <button class="popup-btn popup-dismiss">Dismiss</button>
        </div>
        <audio id="reminder-sound" autoplay>
            <source src="/static/sounds/alarm.mp3" type="audio/mpeg">
        </audio>
    `;
    (remindersList?.parentElement||document.body).appendChild(popup);

    popup.querySelector('.popup-taken').addEventListener('click', async ()=>{
        await updateReminderStatus(reminder.id,true);
        popup.remove();
        showModal("Marked as taken ✅");
    });
    popup.querySelector('.popup-dismiss').addEventListener('click', ()=>popup.remove());

    setTimeout(()=>{ const p=document.getElementById('reminder-popup'); if(p) p.remove(); },45000);
}

const audio = new Audio('/static/sounds/alarm.mp3');
audio.play();

// ===== Progress =====
function updateProgress(){
    const pct = totalReminders ? Math.round((completedReminders/totalReminders)*100):0;
    progressBar.style.width=`${pct}%`;
    pointsElement.textContent=completedReminders*10;
    if(reminderChart){ reminderChart.data.datasets[0].data=[completedReminders,totalReminders-completedReminders]; reminderChart.update(); }
    if(trendChart){
        const todayIndex=(new Date().getDay()+6)%7;
        trendChart.data.datasets[0].data[todayIndex]=completedReminders;
        trendChart.update();
    }
}

// ===== Form Submit =====
medForm?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const data={
        name: medForm.name.value.trim(),
        medication: medForm.medication.value.trim(),
        time: medForm.time.value,
        phone: medForm.phone.value,
        sms: medForm['sms-toggle']?.checked || false,
        is_taken: false,
        timestamp: serverTimestamp()
    };
    await addReminder(data);
    medForm.reset();
    showFlash("Reminder added successfully ✅");
});

// ===== Checkbox / Delete =====
remindersList?.addEventListener('change', async(e)=>{
    if(e.target.classList.contains('taken-checkbox')){
        const id=e.target.dataset.id;
        const status=e.target.checked;
        await updateReminderStatus(id,status);
        updateProgress();
    }
});
remindersList?.addEventListener('click', async(e)=>{
    if(e.target.classList.contains('delete-btn')){
        const li = e.target.closest('li');
        await deleteReminder(li.dataset.id);
    }
});

// ===== Chatbot =====
chatSendBtn?.addEventListener('click', sendChat);
chatInput?.addEventListener('keydown', e=>{ if(e.key==='Enter') sendChat(); });
function sendChat(){
    const q = chatInput.value.trim(); if(!q) return;
    displayMessage(q,'user'); chatInput.value='';
    displayMessage("🤖 Pay the premium to get access to 24/7 AI consulting.",'bot');
}

// ===== Medicine Lookup =====
function markdownToHtml(text){
    let html=text.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>');
    html=html.replace(/\n\n/g,'<br><br>');
    return html;
}
medicineBtn?.addEventListener('click', async ()=>{
    const med=medicineInput.value.trim();
    if(!med){ medicineResult.textContent='Please enter a medicine name.'; return; }
    medicineResult.innerHTML='<span class="text-gray-500">Searching...</span>';
    try{
        const res = await fetch(`/medicine_lookup?q=${encodeURIComponent(med)}`);
        const data = await res.json();
        if(data.answer){ medicineResult.innerHTML = markdownToHtml(data.answer); }
        else if(data.error){ medicineResult.textContent = 'Error: '+data.error; }
        else{ medicineResult.textContent = 'An unexpected error occurred.'; }
    } catch(e){ medicineResult.textContent='Error fetching medicine info.'; console.error(e); }
});

// ===== Dark/Light Mode Toggle =====
const themeToggleBtn = document.createElement("button");
themeToggleBtn.id = "theme-toggle";
themeToggleBtn.textContent="🌙";
themeToggleBtn.style.cssText = `
    position:fixed; bottom:20px; right:20px; padding:10px 15px;
    border-radius:50%; border:none; cursor:pointer; font-size:18px;
    z-index:9999; background-color:#001f3f; color:#fff;
`;
document.body.appendChild(themeToggleBtn);

function loadTheme(){
    const savedTheme = localStorage.getItem("theme");
    if(savedTheme==="dark"){ document.body.classList.add("dark-mode"); themeToggleBtn.textContent="☀️"; }
    else{ document.body.classList.remove("dark-mode"); themeToggleBtn.textContent="🌙"; }
}
loadTheme();
themeToggleBtn.addEventListener("click", ()=>{
    if(document.body.classList.contains("dark-mode")){
        document.body.classList.remove("dark-mode");
        localStorage.setItem("theme","light");
        themeToggleBtn.textContent="🌙";
    } else {
        document.body.classList.add("dark-mode");
        localStorage.setItem("theme","dark");
        themeToggleBtn.textContent="☀️";
    }
});

// ===== Bootstrap =====
bootstrap();
