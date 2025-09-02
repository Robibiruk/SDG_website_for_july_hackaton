import os
import json
from flask import Flask, render_template, request, redirect, url_for, flash, jsonify, session
import requests
import sqlite3
import firebase_admin
from firebase_admin import credentials, auth, firestore

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "supersecretkey")

APP_ID = os.getenv("APP_ID", "meditrack")

FIREBASE_CONFIG = {
    "apiKey": os.getenv("FIREBASE_API_KEY", "AIzaSyAO8ScbDEtVlhzlyyw-FNQJSDcufFeM4Lc"),
    "authDomain": os.getenv("FIREBASE_AUTH_DOMAIN", "meditrack-2bff4.firebaseapp.com"),
    "projectId": os.getenv("FIREBASE_PROJECT_ID", "meditrack-2bff4"),
    "storageBucket": os.getenv("FIREBASE_STORAGE_BUCKET", "meditrack-2bff4.appspot.com"),
    "messagingSenderId": os.getenv("FIREBASE_SENDER_ID", "41886528481"),
    "appId": os.getenv("FIREBASE_APP_ID", "1:41886528481:web:7e0c8f99cef6d9266518a0"),
    "measurementId": os.getenv("FIREBASE_MEASUREMENT_ID", "G-JVP5PM8J4N"),
}

# ================= Firebase Admin =================
firebase_key_json = os.getenv("FIREBASE_KEY_JSON")
if firebase_key_json:
    try:
        firebase_creds = json.loads(firebase_key_json)
        cred = credentials.Certificate(firebase_creds)
        initialize_app(cred)
        print("✅ Firebase Admin initialized successfully.")
    except Exception as e:
        print(f"⚠️ Firebase Admin init failed: {e}")
else:
    print("⚠️ No FIREBASE_KEY_JSON found. Admin SDK not initialized.")

# ================= Routes =================
@app.route("/")
def index():
    user = session.get("user")
    return render_template("index.html", user=user)

@app.route("/config")
def config():
    """Provide Firebase config to JS for frontend SDK"""
    return jsonify({
        "firebase_config": FIREBASE_CONFIG,
        "app_id": APP_ID
    })

# ================= Firebase Admin Setup =================
FIREBASE_KEY_PATH = os.environ.get("FIREBASE_KEY_PATH", "firebase_key.json")
if os.path.exists(FIREBASE_KEY_PATH):
    cred = credentials.Certificate(FIREBASE_KEY_PATH)
    firebase_admin.initialize_app(cred)
    db = firestore.client()
    print("✅ Firebase Admin initialized successfully.")
else:
    db = None
    print("⚠️ Firebase key not found. Firebase Admin not initialized.")

# ================= Gemini API =================
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
user_message_count = {}
MAX_MESSAGES = 5

# ================= Paga Collect =================
PAGA_PRINCIPAL = os.environ.get("PAGA_PRINCIPAL", "")
PAGA_CREDENTIALS = os.environ.get("PAGA_CREDENTIALS", "")
PAGA_SECRET = os.environ.get("PAGA_SECRET", "")
PAGA_BASE_URL = "https://beta.mypaga.com/paga-webservices/oauth2"

@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        first = request.form['firstName']
        last = request.form['lastName']
        email = request.form['email']
        password = request.form['password']
        confirm = request.form['confirmPassword']

        if password != confirm:
            flash("Passwords do not match", "error")
            return redirect(url_for('register'))

        db_path = os.path.join(os.path.dirname(__file__), "users.db")
        conn = sqlite3.connect(db_path)
        c = conn.cursor()
        c.execute("""CREATE TABLE IF NOT EXISTS users (
                      id INTEGER PRIMARY KEY, 
                      first TEXT, last TEXT, email TEXT UNIQUE, password TEXT)""")
        try:
            c.execute("INSERT INTO users (first, last, email, password) VALUES (?, ?, ?, ?)",
                      (first, last, email, password))
            conn.commit()
            flash("Registration successful!", "success")
        except sqlite3.IntegrityError:
            flash("Email already exists", "error")
            conn.close()
            return redirect(url_for('register'))

        conn.close()
        return redirect(url_for('login'))

    return render_template("register.html")

@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        email = request.form['email']
        password = request.form['password']

        db_path = os.path.join(os.path.dirname(__file__), "users.db")
        conn = sqlite3.connect(db_path)
        c = conn.cursor()
        c.execute("SELECT * FROM users WHERE email=? AND password=?", (email, password))
        user = c.fetchone()
        conn.close()

        if user:
            session['user'] = {"id": user[0], "first": user[1], "last": user[2], "email": user[3]}
            flash("Login successful!", "success")
            return redirect(url_for('index'))
        else:
            flash("Invalid email or password", "error")
            return redirect(url_for('login'))

    return render_template("login.html")

@app.route("/logout")
def logout():
    session.pop("user", None)
    flash("Logged out", "success")
    return redirect(url_for("index"))

# ================= AI Proxy =================
@app.route("/ai")
def ai_proxy():
    prompt = request.args.get("prompt", "")
    user_ip = request.remote_addr
    count = user_message_count.get(user_ip, 0)

    if count >= MAX_MESSAGES:
        return jsonify({"response": f"⚠️ Demo limit reached. Only {MAX_MESSAGES} messages allowed."})

    if not GEMINI_API_KEY:
        return jsonify({"response": "Gemini API key missing"}), 500

    url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
    headers = {"Content-Type": "application/json", "X-goog-api-key": GEMINI_API_KEY}
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

# ================= Medicine Lookup =================
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
            return jsonify({"answer": "No information found for this medicine."})

    except Exception as e:
        print(f"Error accessing local database: {e}")
        return jsonify({"error": "Database error"}), 500

# ================= Paga Collect =================
@app.route("/pay", methods=["POST"])
def paga_pay():
    try:
        amount = request.json.get("amount", "100")
        currency = "NGN"

        payload = {
            "referenceNumber": "TXN" + os.urandom(4).hex(),
            "amount": amount,
            "currency": currency,
            "payer": {"name": "Demo User", "phoneNumber": "08012345678"},
            "expiryDateTimeUTC": "2030-01-01T00:00:00Z",
            "callBackUrl": request.host_url + "pay/callback"
        }

        headers = {"Content-Type": "application/json", "Accept": "application/json"}

        # Get OAuth Token
        token_url = f"{PAGA_BASE_URL}/token"
        token_resp = requests.post(token_url, data={
            "grant_type": "client_credentials",
            "scope": "MERCHANT_API"
        }, auth=(PAGA_PRINCIPAL, PAGA_CREDENTIALS))
        token_resp.raise_for_status()
        access_token = token_resp.json().get("access_token")

        # Create Collect Payment
        collect_url = "https://beta.mypaga.com/paga-webservices/business-rest/secured/collectPayment"
        resp = requests.post(collect_url, headers={
            **headers,
            "Authorization": f"Bearer {access_token}"
        }, json=payload)
        resp.raise_for_status()
        return jsonify(resp.json())

    except Exception as e:
        return jsonify({"error": f"Paga Collect failed: {e}"}), 500

# ================= Main =================
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
