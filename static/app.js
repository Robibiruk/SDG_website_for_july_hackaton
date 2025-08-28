// Ask for notification permission ONCE when page loads
if ("Notification" in window && Notification.permission !== "granted") {
    Notification.requestPermission();
}

let totalReminders = 0;
let completedReminders = 0;

function updateProgress() {
    const progress = totalReminders === 0 ? 0 : (completedReminders / totalReminders) * 100;
    document.getElementById("progress-bar").style.width = progress + "%";
    document.getElementById("points").textContent = completedReminders * 10; // 10 points per completion
}

document.getElementById("med-form").addEventListener("submit", function (e) {
    e.preventDefault();

    const name = document.getElementById("name").value.trim();
    const medication = document.getElementById("medication").value.trim();
    const time = document.getElementById("time").value;
    if (!name || !medication || !time) return;

    totalReminders++;

    // Create list item
    const li = document.createElement("li");
    li.innerHTML = `
        <span>${name} - Take <strong>${medication}</strong> at <em>${time}</em></span>
        <label style="margin-left:10px;">
            <input type="checkbox" class="taken-checkbox"> Taken
        </label>
        <button class="delete-btn">❌</button>
    `;
    document.getElementById("reminders").appendChild(li);

    // Checkbox functionality
    const checkbox = li.querySelector(".taken-checkbox");
    checkbox.addEventListener("change", function () {
        if (this.checked) {
            li.style.textDecoration = "line-through";
            li.style.opacity = "0.6";
            completedReminders++;
        } else {
            li.style.textDecoration = "none";
            li.style.opacity = "1";
            completedReminders--;
        }
        updateProgress();
    });

    // Delete button functionality
    const deleteBtn = li.querySelector(".delete-btn");
    deleteBtn.addEventListener("click", function () {
        if (checkbox.checked) completedReminders--; // adjust points if a completed reminder is deleted
        totalReminders--;
        li.remove();
        updateProgress();
    });

    // Save reminder to backend
    fetch("/add_reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, medication, time })
    });

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
                checkbox.checked = true;
                checkbox.dispatchEvent(new Event('change')); // visually mark taken
            }
        }, delay);
    }

    updateProgress();
});
