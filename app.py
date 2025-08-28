# app.py
from flask import Flask, request, jsonify, render_template
import sqlite3

app = Flask(__name__)

# Create DB table with the new 'is_taken' column
# Database setup
def create_db():
    conn = sqlite3.connect("reminders.db")
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS reminders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            medication TEXT,
            time TEXT,
            is_taken INTEGER DEFAULT 0
        )
    """)
    conn.commit()
    conn.close()

# Call this function once when the app starts
create_db()

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
        cursor = conn.cursor()
        cursor.execute("INSERT INTO reminders (name, medication, time) VALUES (?, ?, ?)", (name, medication, time))
        new_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        return jsonify({"status": "success", "message": "Reminder added!", "id": new_id})

    except (sqlite3.Error, KeyError) as e:
        print(f"Error adding reminder: {e}")
        return jsonify({"status": "error", "message": "Invalid request or database error."}), 400

@app.route("/get_reminders")
def get_reminders():
    try:
        conn = sqlite3.connect("reminders.db")
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, medication, time, is_taken FROM reminders")
        reminders = [
            {"id": row[0], "name": row[1], "medication": row[2], "time": row[3], "is_taken": row[4]}
            for row in cursor.fetchall()
        ]
        conn.close()
        return jsonify(reminders)
    except sqlite3.Error as e:
        print(f"Error fetching reminders: {e}")
        return jsonify({"status": "error", "message": "Database error."}), 500

# ✅ New route to update the 'is_taken' status in the database
@app.route("/update_status", methods=["POST"])
def update_status():
    try:
        data = request.json
        reminder_id = data["id"]
        is_taken = data["is_taken"]

        conn = sqlite3.connect("reminders.db")
        c = conn.cursor()
        c.execute("UPDATE reminders SET is_taken = ? WHERE id = ?", (is_taken, reminder_id))
        conn.commit()
        return jsonify({"status": "success"}), 200
    except (sqlite3.Error, KeyError) as e:
        print(f"Error updating status: {e}")
        return jsonify({"status": "error", "message": "Invalid request or database error."}), 400

@app.route("/send_sms", methods=["POST"])
def send_sms():
    # Placeholder for SMS service integration
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
            "hydrocodone": "Opioid combination for pain.",
            "ethinyl estradiol": "Oral contraceptive pill.",
            "norgestimate": "Oral contraceptive pill.",
            "tiotropium": "Anticholinergic inhaler for COPD.",
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
            "gabapentin": "Used for nerve pain and seizures.",
            "pregabalin": "Used for nerve pain and seizures.",
            "metoclopramide": "For nausea and gastroparesis.",
            "morphine": "Opioid for severe pain.",
            "fentanyl": "Potent opioid for severe pain.",
            "oxycodone": "Opioid for moderate to severe pain.",
            "hydromorphone": "Potent opioid for severe pain.",
            "buprenorphine": "Opioid for pain and opioid dependence.",
            "methadone": "Opioid for pain and opioid dependence.",
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
            "motrin": "NSAID pain reliever and fever reducer.",
            "aspirin": "Pain reliever, fever reducer, blood thinner.",
            "diphenhydramine": "Antihistamine for allergies and sleep.",
            "benadryl": "Antihistamine for allergies and sleep.",
            "fexofenadine": "Non-drowsy antihistamine.",
            "loratadine": "Non-drowsy antihistamine.",
            "claritin": "Non-drowsy antihistamine.",
            "cetirizine": "Non-drowsy antihistamine.",
            "zyrtec": "Non-drowsy antihistamine.",
            "fexofenadine": "Non-drowsy antihistamine.",
            "ranitidine": "H2 blocker for GERD (withdrawn in many markets).",
            "famotidine": "H2 blocker for GERD.",
            "omeprazole": "PPI for GERD and ulcers.",
            "prilosec": "PPI for GERD and ulcers.",
            "pepcid": "H2 blocker for GERD.",
            "lansoprazole": "PPI for GERD and ulcers.",
            "prevacid": "PPI for GERD and ulcers.",
            "pantoprazole": "PPI for GERD and ulcers.",
            "protonix": "PPI for GERD and ulcers.",
            "esomeprazole": "PPI for GERD and ulcers.",
            "nexium": "PPI for GERD and ulcers.",
            "allegra": "Non-drowsy antihistamine.",
            "albuterol": "Inhaler for asthma and COPD.",
            "ventolin": "Inhaler for asthma and COPD.",
            "proair": "Inhaler for asthma and COPD.",
            "advair": "Combination inhaler for asthma and COPD.",
            "ipratropium": "Inhaler for COPD.",
            "spiriva": "Inhaler for COPD.",
            "theophylline": "Bronchodilator for asthma and COPD.",
            "montelukast": "Leukotriene receptor antagonist for asthma.",
            "singulair": "Leukotriene receptor antagonist for asthma.",
            "tiotropium": "Anticholinergic inhaler for COPD.",
            "atrovent": "Inhaler for COPD.",
            "fluticasone": "Combination inhaler for asthma and COPD.",
            "advair": "Combination inhaler for asthma and COPD.",
            "salmeterol": "Long-acting beta-agonist for asthma and COPD.",
            "formoterol": "Long-acting beta-agonist for asthma and COPD.",
            "fluticasone": "Corticosteroid for allergies and asthma.",
            "flonase": "Nasal spray for allergies.",
            "flovent": "Inhaled corticosteroid for asthma.",
            "mometasone": "Nasal spray for allergies.",
            "nasonex": "Nasal spray for allergies.",
            "budesonide": "Corticosteroid for asthma.",
            "pulmicort": "Inhaled corticosteroid for asthma.",
            "triamcinolone": "Corticosteroid for allergies.",
            "loperamide": "Anti-diarrheal.",
            "metoclopramide": "For nausea and gastroparesis.",
            "prochlorperazine": "For nausea and vertigo.",
            "imodium": "Anti-diarrheal.",
            "bismuth subsalicylate": "For upset stomach and diarrhea.",
            "pepto-bismol": "For upset stomach and diarrhea.",
            "melatonin": "Sleep aid.",
            "guaifenesin": "Expectorant for cough.",
            "mucinex": "Expectorant for cough.",
            "codeine": "Cough suppressant and pain reliever.",
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
            "docusate sodium": "Stool softener.",
            "colace": "Stool softener.",
            "bisacodyl": "Stimulant laxative.",
            "senna": "Laxative.",
            "polyethylene glycol": "Osmotic laxative.",
            "miralax": "Osmotic laxative.",
            "aluminum hydroxide": "Antacid.",
            "simethicone": "Anti-gas.",
            "pepcid ac": "H2 blocker for GERD.",
            "zantac": "H2 blocker for GERD (withdrawn in many markets)."

        }
        info = medicine_db.get(medicine, "Sorry, I don’t have information about this medicine.")
        return jsonify({"info": info}), 200
    except Exception as e:
        print(f"Error searching for medicine: {e}")
        return jsonify({"status": "error", "message": "Failed to process medicine search request."}), 400

if __name__ == "__main__":
    create_db()  # <-- The correct function to call
    app.run(debug=True)