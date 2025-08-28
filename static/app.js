// Ask for notification permission ONCE when page loads
if ("Notification" in window && Notification.permission !== "granted") {
    Notification.requestPermission();
}

let totalReminders = 0;
let completedReminders = 0;

// Track completions per day (simple in-memory for charts/points if needed)
const dailyStats = {};

function updateProgress() {
    const progress = totalReminders === 0 ? 0 : (completedReminders / totalReminders) * 100;
    const bar = document.getElementById("progress-bar");
    const points = document.getElementById("points");
    if (bar) bar.style.width = progress + "%";
    if (points) points.textContent = completedReminders * 10;
}

function createReminderListItem(reminder) {
    const li = document.createElement("li");
    li.dataset.id = reminder.id;
    li.innerHTML = `
        <span>${reminder.name} - Take <strong>${reminder.medication}</strong> at <em>${reminder.time}</em></span>
        <label style="margin-left:10px;">
            <input type="checkbox" class="taken-checkbox"> Taken
        </label>
        <button class="delete-btn">❌</button>
    `;

    const checkbox = li.querySelector(".taken-checkbox");
    if (Number(reminder.is_taken) === 1) {
        checkbox.checked = true;
        li.style.textDecoration = "line-through";
        li.style.opacity = "0.6";
        completedReminders++;
    }

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

        // Persist status
        fetch("/update_status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: reminder.id, is_taken: isChecked ? 1 : 0 })
        });
    });

    const deleteBtn = li.querySelector(".delete-btn");
    deleteBtn.addEventListener("click", function () {
        if (checkbox.checked) {
            completedReminders--;
            const today = new Date().toISOString().split("T")[0];
            dailyStats[today] = Math.max(0, (dailyStats[today] || 0) - 1);
        }
        totalReminders--;
        li.remove();
        updateProgress();
    });

    return li;
}

function loadReminders() {
    fetch("/get_reminders")
        .then(res => res.json())
        .then(reminders => {
            if (!Array.isArray(reminders)) return;
            const list = document.getElementById("reminders");
            if (!list) return;
            list.innerHTML = "";
            totalReminders = reminders.length;
            completedReminders = 0;
            reminders.forEach(r => {
                const li = createReminderListItem(r);
                list.appendChild(li);
            });
            updateProgress();
        })
        .catch(() => {});
}

function onSubmit(e) {
    e.preventDefault();
    const name = document.getElementById("name").value.trim();
    const medication = document.getElementById("medication").value.trim();
    const time = document.getElementById("time").value;
    if (!name || !medication || !time) return;

    fetch("/add_reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, medication, time })
    })
        .then(res => res.json())
        .then(data => {
            if (!data || data.status !== "success") return;
            const newReminder = { id: data.id, name, medication, time, is_taken: 0 };
            const li = createReminderListItem(newReminder);
            const list = document.getElementById("reminders");
            if (list) list.appendChild(li);
            totalReminders++;
            updateProgress();
        })
        .catch(() => {});

    // Optional alarm
    const alarmSound = new Audio("https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg");
    const now = new Date();
    const reminderTime = new Date();
    const [hours, minutes] = time.split(":");
    reminderTime.setHours(hours, minutes, 0, 0);
    const delay = reminderTime - now;
    if (delay > 0) {
        setTimeout(() => {
            alarmSound.play();
        }, delay);
    }
}

document.addEventListener("DOMContentLoaded", function () {
    loadReminders();
    const form = document.getElementById("med-form");
    if (form) form.addEventListener("submit", onSubmit);
});
