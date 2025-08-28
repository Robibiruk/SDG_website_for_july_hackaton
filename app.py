from flask import Flask, request, jsonify, render_template
import sqlite3

app = Flask(__name__)

# Create DB table if not exists
def init_db():
    conn = None
    try:
        conn = sqlite3.connect("reminders.db")
        c = conn.cursor()
        c.execute('''CREATE TABLE IF NOT EXISTS reminders
                     (id INTEGER PRIMARY KEY, name TEXT, medication TEXT, time TEXT)''')
        conn.commit()
    except sqlite3.Error as e:
        print(f"Database error: {e}")
    finally:
        if conn:
            conn.close()

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/add_reminder", methods=["POST"])
def add_reminder():
    try:
        data = request.json
        name = data["name"]
        medication = data["medication"]
        time = data["time"]

        conn = sqlite3.connect("reminders.db")
        c = conn.cursor()
        c.execute("INSERT INTO reminders (name, medication, time) VALUES (?, ?, ?)",
                  (name, medication, time))
        conn.commit()
        return jsonify({"status": "success"}), 201  # 201 Created
    except (sqlite3.Error, KeyError) as e:
        print(f"Error adding reminder: {e}")
        return jsonify({"status": "error", "message": "Invalid request or database error."}), 400

@app.route("/get_reminders", methods=["GET"])
def get_reminders():
    try:
        conn = sqlite3.connect("reminders.db")
        c = conn.cursor()
        c.execute("SELECT * FROM reminders")
        reminders = [{"id": row[0], "name": row[1], "medication": row[2], "time": row[3]} for row in c.fetchall()]
        return jsonify(reminders), 200
    except sqlite3.Error as e:
        print(f"Error getting reminders: {e}")
        return jsonify({"status": "error", "message": "Database error."}), 500


@app.route("/send_sms", methods=["POST"])
def send_sms():
    # This is a placeholder. For a real app, you would integrate a service like Twilio here.
    try:
        data = request.json
        phone = data.get("phone")
        message = data.get("message")
        print(f"📩 Sending SMS to {phone}: {message}")
        return jsonify({"status": "SMS sent", "phone": phone}), 200
    except Exception as e:
        print(f"Error sending SMS: {e}")
        return jsonify({"status": "error", "message": "Failed to process SMS request."}), 400


@app.route("/chatbot", methods=["POST"])
def chatbot():
    data = request.get_json()
    user_message = data.get("message", "").lower()

    if "hello" in user_message:
        reply = "Hi there! How can I help you today? 😊"
    elif "reminder" in user_message:
        reply = "I can help you set reminders for your medicines!"
    else:
        reply = "I'm a simple demo bot 🤖. Ask me about medicines or reminders!"

    return jsonify({"reply": reply}), 200

@app.route("/medicine_search", methods=["POST"])
def medicine_search():
    try:
        data = request.get_json()
        medicine = data.get("medicine", "").lower()

        # ✅ FIXED SYNTAX: This is now a proper dictionary with key-value pairs.
        medicine_db = {
            "lisinopril": "ACE inhibitor used for hypertension and heart failure.",
            "levothyroxine": "Thyroid hormone replacement for hypothyroidism.",
            "atorvastatin": "Statin used to lower cholesterol.",
            "metformin": "Oral medicine for type 2 diabetes.",
            "amlodipine": "Calcium channel blocker for hypertension.",
            "metoprolol": "Beta-blocker used for hypertension and angina.",
            "omeprazole": "PPI used for GERD and ulcers.",
            "simvastatin": "Statin used to lower cholesterol.",
            "losartan": "ARB used for hypertension.",
            "albuterol": "Inhaler for asthma and COPD.",
            "gabapentin": "Used for neuropathic pain and seizures.",
            "hydrochlorothiazide": "Diuretic used for hypertension and edema.",
            "sertraline": "SSRI antidepressant.",
            "montelukast": "Leukotriene receptor antagonist for asthma.",
            "escitalopram": "SSRI antidepressant.",
            "fluticasone": "Corticosteroid nasal spray for allergies.",
            "amoxicillin": "Antibiotic for bacterial infections.",
            "furosemide": "Loop diuretic used for hypertension and edema.",
            "pantoprazole": "PPI for GERD and ulcers.",
            "trazodone": "Antidepressant, often used for insomnia.",
            "pravastatin": "Statin used to lower cholesterol.",
            "rosuvastatin": "Statin used to lower cholesterol.",
            "tramadol": "Opioid-like pain reliever.",
            "warfarin": "Anticoagulant for preventing blood clots.",
            "clopidogrel": "Antiplatelet drug to prevent heart attacks and strokes.",
            "meloxicam": "NSAID for arthritis pain.",
            "prednisone": "Corticosteroid for inflammation.",
            "duloxetine": "SNRI antidepressant, also for nerve pain.",
            "citalopram": "SSRI antidepressant.",
            "alprazolam": "Benzodiazepine for anxiety.",
            "fluoxetine": "SSRI antidepressant.",
            "insulin glargine": "Long-acting insulin for diabetes.",
            "venlafaxine": "SNRI antidepressant.",
            "allopurinol": "Used to prevent gout attacks.",
            "bupropion": "Antidepressant and smoking cessation aid.",
            "oxycodone": "Opioid combination for severe pain.",
            "acetaminophen": "Pain reliever and fever reducer.",
            "hydrocodone": "Opioid combination for pain relief.",
            "ethinyl estradiol": "Oral contraceptive pill.",
            "norgestimate": "Oral contraceptive pill.",
            "cyclobenzaprine": "Muscle relaxant.",
            "cephalexin": "Antibiotic for bacterial infections.",
            "tiotropium": "Anticholinergic inhaler for COPD.",
            "zolpidem": "Sedative-hypnotic for insomnia.",
            "esomeprazole": "PPI for GERD and ulcers.",
            "glipizide": "Sulfonylurea for type 2 diabetes.",
            "carvedilol": "Beta-blocker for heart failure and hypertension.",
            "spironolactone": "Potassium-sparing diuretic.",
            "topiramate": "Antiepileptic, also used for migraines.",
            "diazepam": "Benzodiazepine for anxiety, seizures.",
            "lamotrigine": "Antiepileptic, also for bipolar disorder.",
            "clonazepam": "Benzodiazepine for seizures and anxiety.",
            "apixaban": "Anticoagulant (Factor Xa inhibitor).",
            "rivaroxaban": "Anticoagulant (Factor Xa inhibitor).",
            "ezetimibe": "Cholesterol absorption inhibitor.",
            "quetiapine": "Atypical antipsychotic.",
            "aripiprazole": "Atypical antipsychotic.",
            "buspirone": "Anxiolytic.",
            "hydroxyzine": "Antihistamine, used for anxiety and allergies.",
            "diclofenac": "NSAID for pain and inflammation.",
            "naproxen": "NSAID for pain and inflammation.",
            "morphine": "Opioid for severe pain.",
            "hydrocodone": "Opioid combination for pain.",
            "acetaminophen": "Pain reliever and fever reducer.",
            "codeine": "Opioid for mild to moderate pain.",
            "gabapentin": "Used for nerve pain and seizures.",
            "pioglitazone": "Thiazolidinedione for type 2 diabetes.",
            "sitagliptin": "DPP-4 inhibitor for diabetes.",
            "liraglutide": "GLP-1 agonist for diabetes.",
            "canagliflozin": "SGLT2 inhibitor for diabetes.",
            "empagliflozin": "SGLT2 inhibitor for diabetes.",
            "dapagliflozin": "SGLT2 inhibitor for diabetes.",
            "erythromycin": "Antibiotic.",
            "doxycycline": "Tetracycline antibiotic.",
            "levofloxacin": "Fluoroquinolone antibiotic.",
            "ciprofloxacin": "Fluoroquinolone antibiotic.",
            "azithromycin": "Macrolide antibiotic.",
            "nitrofurantoin": "Antibiotic for UTIs.",
            "trimethoprim": "Antibiotic combination.",
            "sulfamethoxazole": "Antibiotic combination.",
            "bactrim": "Antibiotic combination.",
            "clindamycin": "Lincosamide antibiotic.",
            "vancomycin": "Glycopeptide antibiotic.",
            "linezolid": "Oxazolidinone antibiotic.",
            "mupirocin": "Topical antibiotic.",
            "ketoconazole": "Antifungal.",
            "fluconazole": "Antifungal.",
            "itraconazole": "Antifungal.",
            "voriconazole": "Antifungal.",
            "terbinafine": "Antifungal.",
            "valacyclovir": "Antiviral for herpes viruses.",
            "acyclovir": "Antiviral for herpes viruses.",
            "oseltamivir": "Antiviral for influenza.",
            "methotrexate": "Immunosuppressant, anticancer.",
            "hydroxychloroquine": "Used for malaria and autoimmune diseases.",
            "adalimumab": "Biologic for autoimmune diseases.",
            "etanercept": "Biologic for autoimmune diseases.",
            "infliximab": "Biologic for autoimmune diseases.",
            "beclomethasone": "Inhaled corticosteroid.",
            "budesonide": "Inhaled corticosteroid.",
            "mometasone": "Inhaled corticosteroid.",
            "salmeterol": "Long-acting beta-agonist.",
            "formoterol": "Long-acting beta-agonist.",
            "varenicline": "Smoking cessation aid.",
            "nicotine patch": "Smoking cessation therapy.",
            "baclofen": "Muscle relaxant.",
            "tizanidine": "Muscle relaxant.",
            "phenytoin": "Antiepileptic.",
            "valproic acid": "Antiepileptic, mood stabilizer.",
            "lithium": "Mood stabilizer for bipolar disorder.",
            "haloperidol": "Typical antipsychotic.",
            "chlorpromazine": "Typical antipsychotic.",
            "olanzapine": "Atypical antipsychotic.",
            "risperidone": "Atypical antipsychotic.",
            "acetaminophen": "Pain reliever, fever reducer.",
            "tylenol": "Pain reliever, fever reducer.",
            "ibuprofen": "NSAID pain reliever and fever reducer.",
            "advil": "NSAID pain reliever and fever reducer.",
            "motrin": "NSAID pain reliever and fever reducer.",
            "aspirin": "Pain reliever, fever reducer, blood thinner.",
            "diphenhydramine": "Antihistamine for allergies and sleep.",
            "benadryl": "Antihistamine for allergies and sleep.",
            "loratadine": "Non-drowsy antihistamine.",
            "claritin": "Non-drowsy antihistamine.",
            "cetirizine": "Non-drowsy antihistamine.",
            "zyrtec": "Non-drowsy antihistamine.",
            "fexofenadine": "Non-drowsy antihistamine.",
            "allegra": "Non-drowsy antihistamine.",
            "pseudoephedrine": "Decongestant.",
            "ranitidine": "H2 blocker for GERD (withdrawn in many markets).",
            "famotidine": "H2 blocker for GERD.",
            "pepcid": "H2 blocker for GERD.",
            "loperamide": "Anti-diarrheal.",
            "imodium": "Anti-diarrheal.",
            "bismuth subsalicylate": "For upset stomach and diarrhea.",
            "pepto-bismol": "For upset stomach and diarrhea.",
            "guaifenesin": "Expectorant for cough.",
            "mucinex": "Expectorant for cough.",
            "dextromethorphan": "Cough suppressant.",
            "pseudoephedrine": "Decongestant.",
            "sudafed": "Decongestant.",
            "phenylephrine": "Decongestant.",
            "ondansetron": "Antiemetic for nausea.",
            "meclizine": "Motion sickness and vertigo.",
            "calcium carbonate": "Antacid for heartburn.",
            "tums": "Antacid for heartburn.",
            "magnesium hydroxide": "Antacid and laxative.",
            "milk of magnesia": "Antacid and laxative.",
            "senna": "Laxative.",
            "polyethylene glycol": "Osmotic laxative.",
            "miralax": "Osmotic laxative.",
            "docusate": "Stool softener."
        }

        info = medicine_db.get(medicine, "Sorry, I don’t have information about this medicine.")
        return jsonify({"info": info}), 200
    except Exception as e:
        print(f"Error searching for medicine: {e}")
        return jsonify({"status": "error", "message": "Failed to process medicine search request."}), 400

if __name__ == "__main__":
    init_db()
    app.run(debug=True)