from flask import Flask, request, jsonify, render_template
import sqlite3

app = Flask(__name__)

# Create DB table if not exists
def init_db():
    conn = sqlite3.connect("reminders.db")
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS reminders
                 (id INTEGER PRIMARY KEY, name TEXT, medication TEXT, time TEXT)''')
    conn.commit()
    conn.close()

@app.route("/")
def home():
    return render_template("index.html")

@app.route("/add_reminder", methods=["POST"])
def add_reminder():
    data = request.json
    conn = sqlite3.connect("reminders.db")
    c = conn.cursor()
    c.execute("INSERT INTO reminders (name, medication, time) VALUES (?, ?, ?)",
              (data["name"], data["medication"], data["time"]))
    conn.commit()
    conn.close()
    return jsonify({"status": "success"})

@app.route("/get_reminders", methods=["GET"])
def get_reminders():
    conn = sqlite3.connect("reminders.db")
    c = conn.cursor()
    c.execute("SELECT * FROM reminders")
    reminders = c.fetchall()
    conn.close()
    return jsonify(reminders)

if __name__ == "__main__":
    init_db()
    app.run(debug=True)
