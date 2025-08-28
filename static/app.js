// app.js
// Ask for notification permission ONCE when page loads
if ("Notification" in window && Notification.permission !== "granted") {
    Notification.requestPermission();
}

let totalReminders = 0;
let completedReminders = 0;
let reminderChart; // donut
let trendChart;    // line chart

// Track completions per day
let dailyStats = {}; // { "2025-08-26": 3, "2025-08-27": 5, ... }

/* ================= UPDATE PROGRESS + CHARTS ================= */
function updateProgress() {
    const progress = totalReminders === 0 ? 0 : (completedReminders / totalReminders) * 100;
    document.getElementById("progress-bar").style.width = progress + "%";
    document.getElementById("points").textContent = completedReminders * 10; // 10 points per completion
    updateDonutChart();
    updateTrendChart();
}

/* ================== CHART.JS - DONUT ================== */
function updateDonutChart() {
    const ctx = document.getElementById("reminderChart");
    if (!ctx) return;

    if (reminderChart) reminderChart.destroy();

    reminderChart = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels: ["Completed", "Remaining"],
            datasets: [{
                data: [completedReminders, totalReminders - completedReminders],
                backgroundColor: ["#2c786c", "#e0e0e0"],
                borderWidth: 1
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } }
    });
}

/* ================== CHART.JS - TREND LINE ================== */
function updateTrendChart() {
    const ctx = document.getElementById("trendChart");
    if (!ctx) return;

    if (trendChart) trendChart.destroy();

    const labels = Object.keys(dailyStats).sort(); // date labels
    const values = labels.map(d => dailyStats[d]);

    trendChart = new Chart(ctx, {
        type: "line",
        data: {
            labels,
            datasets: [{
                label: "Daily Completed Reminders",
                data: values,
                fill: false,
                borderColor: "#2c786c",
                tension: 0.2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: "top" } },
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}

/* ================== REMINDER LOGIC ================== */
// New function to create a reminder list item
function createReminderListItem(reminder) {
    const li = document.createElement("li");
    li.dataset.id = reminder.id; // Store the reminder ID
    li.innerHTML = `
        <span>${reminder.name} - Take <strong>${reminder.medication}</strong> at <em>${reminder.time}</em></span>
        <label style="margin-left:10px;">
            <input type="checkbox" class="taken-checkbox"> Taken
        </label>
        <button class="delete-btn">❌</button>
    `;

    // Update UI based on saved status
    const checkbox = li.querySelector(".taken-checkbox");
    if (reminder.is_taken) {
        checkbox.checked = true;
        li.style.textDecoration = "line-through";
        li.style.opacity = "0.6";
        completedReminders++;
    }

    // Checkbox functionality
    checkbox.addEventListener("change", function () {
        const isChecked = this.checked;
        if (isChecked) {
            li.style.textDecoration = "line-through";
            li.style.opacity = "0.6";
            completedReminders++;
            const today = new Date().toISOString().split("T")[0];
            dailyStats[today] = (dailyStats[today] || 0) + 1;
        } else {
            li.style.textDecoration = "none";
            li.style.opacity = "1";
            completedReminders--;
            const today = new Date().toISOString().split("T")[0];
            dailyStats[today] = Math.max(0, (dailyStats[today] || 0) - 1);
        }
        updateProgress();

        // Send the updated status to the backend
        fetch("/update_status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: reminder.id, is_taken: isChecked ? 1 : 0 })
        });
    });

    // Delete button functionality
    const deleteBtn = li.querySelector(".delete-btn");
    deleteBtn.addEventListener("click", function () {
        // TODO: Also needs to delete from the database
        if (checkbox.checked) {
            completedReminders--;
            const today = new Date().toISOString().split("T")[0];
            dailyStats[today] = Math.max(0, (dailyStats[today] || 0) - 1);
        }
        totalReminders--;
        li.remove();
        updateProgress();
    });

    return li; // Return the created list item
}

// New function to load reminders from the database
function loadReminders() {
    fetch("/get_reminders")
        .then(res => res.json())
        .then(reminders => {
            // ✅ FIX: Check if "reminders" is a valid array before trying to loop
            if (Array.isArray(reminders)) {
                totalReminders = reminders.length;
                reminders.forEach(reminder => {
                    const li = createReminderListItem(reminder);
                    document.getElementById("reminders").appendChild(li);
                });
                updateProgress();
            } else {
                console.error("Received invalid data:", reminders);
            }
        })
        .catch(err => console.error("Error loading reminders:", err));
}

document.getElementById("med-form").addEventListener("submit", function (e) {
    e.preventDefault();

    const name = document.getElementById("name").value.trim();
    const medication = document.getElementById("medication").value.trim();
    const time = document.getElementById("time").value;
    const phone = document.getElementById("phone") ? document.getElementById("phone").value.trim() : "";
    const smsToggle = document.getElementById("sms-toggle") ? document.getElementById("sms-toggle").checked : false;

    if (!name || !medication || !time) return;

    // Send reminder to backend to save it
    fetch("/add_reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, medication, time })
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === "success") {
            totalReminders++;
            const newReminder = { id: data.id, name, medication, time, is_taken: 0 };
            const li = createReminderListItem(newReminder); // Create the list item
            document.getElementById("reminders").appendChild(li); // ✅ FIX: Append it to the list
            updateProgress();
        }
    })
    .catch(err => console.error("Error saving reminder:", err));

    // If SMS toggle ON and phone number provided -> send SMS
    if (smsToggle && phone) {
        fetch("/send_sms", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                phone,
                message: `⏰ Reminder: ${name}, time to take your ${medication} at ${time}.`
            })
        })
        .then(res => res.json())
        .then(data => console.log("SMS status:", data))
        .catch(err => console.error("Error sending SMS:", err));
    }

    // Alarm sound & alert logic
    const alarmSound = new Audio("https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg");
    const now = new Date();
    const reminderTime = new Date();
    const [hours, minutes] = time.split(":");
    reminderTime.setHours(hours, minutes, 0, 0);
    const delay = reminderTime - now;

    if (delay > 0) {
        setTimeout(() => {
            alarmSound.play();
            const confirmed = confirm(`⏰ Reminder: ${name}, time to take your ${medication}!\nClick OK if you've taken it.`);
            if (confirmed) {
                const li = document.querySelector(`li > span:contains('${name} - Take ${medication} at ${time}')`).parentNode;
                const checkbox = li.querySelector(".taken-checkbox");
                checkbox.checked = true;
                checkbox.dispatchEvent(new Event('change'));
            }
        }, delay);
    }
});

/* ================= CHATBOT LOGIC ================= */
document.getElementById("chat-send").addEventListener("click", sendMessage);

function sendMessage() {
    const input = document.getElementById("chat-input");
    const message = input.value.trim();
    if (!message) return;

    const log = document.getElementById("chat-log");

    // User message
    log.innerHTML += `<div><strong>You:</strong> ${message}</div>`;
    input.value = "";

    // Send to backend chatbot
    fetch("/chatbot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message })
    })
    .then(res => res.json())
    .then(data => {
        log.innerHTML += `<div><strong>Bot:</strong> ${data.reply}</div>`;
        log.scrollTop = log.scrollHeight;
    });
}

/* ================= MEDICINE SEARCH ================= */
document.getElementById("medicine-btn").addEventListener("click", () => {
    const medicine = document.getElementById("medicine-input").value.trim();
    if (!medicine) return;

    document.getElementById("medicine-result").innerHTML = "Searching... ⏳";

    fetch("/medicine_search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ medicine })
    })
    .then(res => res.json())
    .then(data => {
        document.getElementById("medicine-result").innerHTML = `
            <strong>${medicine}</strong><br>
            ${data.info || "No information found."}
        `;
    })
    .catch(err => {
        document.getElementById("medicine-result").innerHTML = "⚠️ Error fetching info.";
        console.error(err);
    });
});

// Load reminders when the page content is fully loaded
document.addEventListener("DOMContentLoaded", loadReminders);