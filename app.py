from flask import Flask, request, jsonify, render_template
import sqlite3

app = Flask(__name__)


# Create DB table and ensure 'is_taken' column exists
def init_db():
    conn = None
    try:
        conn = sqlite3.connect("reminders.db")
        c = conn.cursor()
        c.execute(
            """CREATE TABLE IF NOT EXISTS reminders (
                id INTEGER PRIMARY KEY,
                name TEXT,
                medication TEXT,
                time TEXT,
                is_taken INTEGER DEFAULT 0
            )"""
        )
        # Ensure migration for existing DBs without is_taken
        c.execute("PRAGMA table_info(reminders)")
        existing_columns = [row[1] for row in c.fetchall()]
        if "is_taken" not in existing_columns:
            c.execute("ALTER TABLE reminders ADD COLUMN is_taken INTEGER DEFAULT 0")
        conn.commit()
    finally:
        if conn:
            conn.close()

@app.before_first_request
def _ensure_db():
    # Ensure DB schema exists when running via Flask CLI
    init_db()


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/add_reminder", methods=["POST"])
def add_reminder():
    try:
        data = request.json or {}
        name = data["name"]
        medication = data["medication"]
        time = data["time"]

        conn = sqlite3.connect("reminders.db")
        c = conn.cursor()
        c.execute(
            "INSERT INTO reminders (name, medication, time, is_taken) VALUES (?, ?, ?, 0)",
            (name, medication, time),
        )
        conn.commit()
        new_id = c.lastrowid
        return jsonify({"status": "success", "id": new_id}), 201
    except Exception:
        return jsonify({"status": "error"}), 400
    finally:
        try:
            conn.close()
        except Exception:
            pass


@app.route("/get_reminders", methods=["GET"])
def get_reminders():
    try:
        conn = sqlite3.connect("reminders.db")
        c = conn.cursor()
        c.execute("SELECT id, name, medication, time, is_taken FROM reminders")
        rows = c.fetchall()
        reminders = [
            {
                "id": row[0],
                "name": row[1],
                "medication": row[2],
                "time": row[3],
                "is_taken": row[4],
            }
            for row in rows
        ]
        return jsonify(reminders), 200
    except Exception:
        return jsonify([]), 200
    finally:
        try:
            conn.close()
        except Exception:
            pass


@app.route("/update_status", methods=["POST"])
def update_status():
    try:
        data = request.json or {}
        reminder_id = data["id"]
        is_taken = int(data.get("is_taken", 0))
        conn = sqlite3.connect("reminders.db")
        c = conn.cursor()
        c.execute("UPDATE reminders SET is_taken = ? WHERE id = ?", (is_taken, reminder_id))
        conn.commit()
        return jsonify({"status": "success"}), 200
    except Exception:
        return jsonify({"status": "error"}), 400
    finally:
        try:
            conn.close()
        except Exception:
            pass


@app.route("/send_sms", methods=["POST"])
def send_sms():
    # Placeholder: integrate an SMS provider here
    data = request.json or {}
    return jsonify({"status": "ok", "echo": data}), 200


@app.route("/chatbot", methods=["POST"])
def chatbot():
    data = request.json or {}
    msg = (data.get("message") or "").lower()
    if "hello" in msg:
        reply = "Hi there! How can I help you today? 😊"
    elif "reminder" in msg:
        reply = "I can help you set reminders for your medicines!"
    else:
        reply = "I'm a simple demo bot 🤖. Ask me about medicines or reminders!"
    return jsonify({"reply": reply}), 200


@app.route("/medicine_search", methods=["POST"])
def medicine_search():
    data = request.json or {}
    medicine = (data.get("medicine") or "").strip().lower()
    info = {
        "lisinopril": "ACE inhibitor used for hypertension and heart failure.",
        "metformin": "Oral medicine for type 2 diabetes.",
        "amoxicillin": "Antibiotic for bacterial infections.",
    }.get(medicine, "Sorry, I don’t have information about this medicine.")
    return jsonify({"info": info}), 200


if __name__ == "__main__":
    init_db()
    app.run(debug=True)
