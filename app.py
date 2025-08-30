import os
import json
from flask import Flask, render_template, jsonify, request
import requests
import sqlite3  # Added for local database access

app = Flask(__name__)

# ---- App ID (used in Firestore path) ----
APP_ID = os.getenv("APP_ID", "meditrack")

# ---- Firebase Web Config (safe to expose in frontend) ----
FIREBASE_CONFIG = {
    "apiKey": os.getenv("FIREBASE_API_KEY", "AIzaSyAO8ScbDEtVlhzlyyw-FNQJSDcufFeM4Lc"),
    "authDomain": os.getenv("FIREBASE_AUTH_DOMAIN", "meditrack-2bff4.firebaseapp.com"),
    "projectId": os.getenv("FIREBASE_PROJECT_ID", "meditrack-2bff4"),
    "storageBucket": os.getenv("FIREBASE_STORAGE_BUCKET", "meditrack-2bff4.firebasestorage.app"),
    "messagingSenderId": os.getenv("FIREBASE_SENDER_ID", "41886528481"),
    "appId": os.getenv("FIREBASE_APP_ID", "1:41886528481:web:7e0c8f99cef6d9266518a0"),
    "measurementId": os.getenv("FIREBASE_MEASUREMENT_ID", "G-JVP5PM8J4N"),
}

# ---- Gemini API Key (KEEP SECRET) ----
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_API_KEY = "AIzaSyAgXp1rm13e28b---"  # Quick test only

# ---- Track messages per session (IP-based demo) ----
user_message_count = {}
MAX_MESSAGES = 5

# ===== ROUTES =====

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/config")
def config():
    """Frontend fetches this to initialize Firebase without inline JS."""
    return jsonify({"app_id": APP_ID, "firebase_config": FIREBASE_CONFIG})

@app.route("/ai")
def ai_proxy():
    """Demo-limited AI proxy to Gemini API."""
    prompt = request.args.get("prompt", "")
    user_ip = request.remote_addr
    count = user_message_count.get(user_ip, 0)

    if count >= MAX_MESSAGES:
        return jsonify({"response": f"⚠️ Demo limit reached. You can only send {MAX_MESSAGES} messages."})

    if not GEMINI_API_KEY:
        return jsonify({"response": "Gemini API key missing on server."}), 500

    url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
    headers = {
        "Content-Type": "application/json",
        "X-goog-api-key": GEMINI_API_KEY,
    }
    payload = {"contents": [{"parts": [{"text": prompt}]}]}

    try:
        r = requests.post(url, headers=headers, json=payload, timeout=30)
        r.raise_for_status()
        data = r.json()
        answer = (data.get("candidates") or [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
        user_message_count[user_ip] = count + 1
        return jsonify({"response": answer or "No response from AI."})
    except Exception as e:
        return jsonify({"response": f"Error contacting Gemini: {e}"}), 502

# ===== Medicine Info Search (Local SQLite DB) =====
@app.route("/medicine_lookup")
def medicine_lookup():
    query = request.args.get("q", "").strip().lower()
    if not query:
        return jsonify({"error": "No query provided"}), 400

    db_path = os.path.join(os.path.dirname(__file__), "medicine.db")

    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute(
            "SELECT name, description, category FROM medicines WHERE LOWER(name) LIKE ? LIMIT 1",
            (f"%{query}%",)
        )
        result = cursor.fetchone()
        conn.close()

        if result:
            name, description, category = result
            answer = f"**{name}** ({category})\n\n{description}"
            return jsonify({"answer": answer})
        else:
            return jsonify({"answer": "Sorry, no information found for this medicine."})

    except Exception as e:
        print(f"Error accessing local database: {e}")
        return jsonify({"error": "An error occurred while fetching medicine information."}), 500

# ===== MAIN =====
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
