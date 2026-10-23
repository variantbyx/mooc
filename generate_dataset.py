import fitz
import re
import json

doc = fitz.open('Conservation_Geography.pdf')

def clean_text(t):
    t = t.replace('\u2018', "'").replace('\u2019', "'")
    t = t.replace('\u201c', '"').replace('\u201d', '"')
    t = t.replace('\u2013', '-').replace('\u2014', '--')
    t = t.replace('\xa0', ' ')
    t = re.sub(r'\s+', ' ', t)
    return t.strip()

pages_data = []

for p_no in range(len(doc)):
    page = doc[p_no]
    blocks = page.get_text("dict").get("blocks", [])
    for b in blocks:
        if "lines" not in b:
            continue
        for l in b["lines"]:
            spans_info = []
            for s in l["spans"]:
                txt = s["text"]
                if not txt:
                    continue
                is_bold = bool(s["flags"] & 2) or ("bold" in s["font"].lower())
                spans_info.append({
                    "text": txt,
                    "bold": is_bold,
                    "size": s["size"],
                    "font": s["font"]
                })
            line_text = "".join(s["text"] for s in spans_info).strip()
            if line_text:
                pages_data.append({
                    "page": p_no + 1,
                    "text": line_text,
                    "spans": spans_info
                })

weeks = {}
current_week = None

for item in pages_data:
    txt = clean_text(item["text"])
    m_w = re.search(r'Week\s+(\d+)\s+Assignment\s+Solutions', txt, re.IGNORECASE)
    if m_w:
        current_week = int(m_w.group(1))
        weeks[current_week] = []
        continue
    if current_week is not None:
        if txt == "Conservation Geography" or "Assignment Solutions" in txt:
            continue
        weeks[current_week].append(item)

def parse_question_block(items, q_num, initial_text):
    q_lines = []
    if initial_text:
        q_lines.append(initial_text)
        
    options = []
    curr_opt = None
    opt_regex = re.compile(r'^\(?([a-d])[\.\)]\s*(.*)$', re.IGNORECASE)
    
    for it in items:
        t = clean_text(it["text"])
        m = opt_regex.match(t)
        line_bold = any(s["bold"] for s in it["spans"])
        
        if m:
            letter = m.group(1).lower()
            rest = m.group(2).strip()
            rest_bold = False
            for s in it["spans"]:
                if s["bold"] and clean_text(s["text"]) in rest:
                    rest_bold = True
            curr_opt = {
                "letter": letter,
                "text": rest,
                "bold": rest_bold if rest else False
            }
            options.append(curr_opt)
        else:
            if curr_opt is None:
                q_lines.append(t)
            else:
                if curr_opt["text"]:
                    curr_opt["text"] += " " + t
                else:
                    curr_opt["text"] = t
                if line_bold:
                    curr_opt["bold"] = True

    question_text = clean_text(" ".join(q_lines))
    return {
        "question_num": q_num,
        "question": question_text,
        "options": options
    }

all_questions = []
id_counter = 1

for w_num in sorted(weeks.keys()):
    items = weeks[w_num]
    q_indices = []
    for i, it in enumerate(items):
        t = clean_text(it["text"])
        m1 = re.match(r'^(\d{1,2})\s*$', t)
        m2 = re.match(r'^(\d{1,2})\.\s*(.*)$', t)
        expected_q = len(q_indices) + 1
        if m1 and int(m1.group(1)) == expected_q:
            q_indices.append((i, expected_q, ""))
        elif m2 and int(m2.group(1)) == expected_q:
            q_indices.append((i, expected_q, m2.group(2)))

    for idx, (start_i, q_num, init_txt) in enumerate(q_indices):
        end_i = q_indices[idx + 1][0] if idx + 1 < len(q_indices) else len(items)
        block_items = items[start_i + 1: end_i]
        q_data = parse_question_block(block_items, q_num, init_txt)
        
        # Determine correct answer
        correct_index = -1
        correct_letter = ""
        correct_text = ""
        formatted_options = []
        for opt_idx, opt in enumerate(q_data["options"]):
            formatted_options.append({
                "letter": opt["letter"].upper(),
                "text": opt["text"]
            })
            if opt["bold"]:
                correct_index = opt_idx
                correct_letter = opt["letter"].upper()
                correct_text = opt["text"]
                
        all_questions.append({
            "id": id_counter,
            "week": w_num,
            "questionNumber": q_num,
            "question": q_data["question"],
            "options": formatted_options,
            "correctIndex": correct_index,
            "correctLetter": correct_letter,
            "correctAnswer": correct_text
        })
        id_counter += 1

print(f"Generated {len(all_questions)} structured questions.")

# Save to questions.json
with open('questions.json', 'w', encoding='utf-8') as f:
    json.dump(all_questions, f, ensure_ascii=False, indent=2)

# Save to questions.js (for direct browser file opening without CORS restrictions)
with open('questions.js', 'w', encoding='utf-8') as f:
    f.write("// Autogenerated questions data from Conservation_Geography.pdf\n")
    f.write("const QUESTIONS_DATA = ")
    json.dump(all_questions, f, ensure_ascii=False, indent=2)
    f.write(";\n")

print("Saved questions.json and questions.js successfully.")
