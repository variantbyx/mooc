# mooc

## Conservation Geography - Interactive MCQ Practice Portal

Interactive frontend portal for multiple-choice question practice based on **Conservation Geography** (Weeks 1 to 12, 120 questions).

### Features
- **Instant Answer Verification**: Instant feedback upon selecting an option (correct in emerald green, wrong in coral red, highlighting the bold correct answer from the PDF).
- **Practice Modes**:
  - **Week-wise**: Select specific weeks from Week 1 to 12.
  - **All Weeks (Serial Order)**: 120 questions sequentially from Week 1 Q1 to Week 12 Q10.
  - **All Weeks (Random / Jumbled Order)**: Fisher-Yates randomized order with one-click reshuffling.
- **Dual Views**:
  - Flashcard single-question view with keyboard shortcuts (`1`-`4` / `A`-`D`, `←` / `→`, `Space`).
  - All-in-one scrollable list view with live keyword search and status filters.
- **Navigator Matrix & Scorecard**:
  - 120-question navigator grid with color-coded status dots.
  - Performance scorecard modal with week-by-week accuracy breakdown and missed questions practice.
- **Zero Configuration**: Open `index.html` directly in any web browser without needing any build tools or web servers.

### File Structure
- `index.html`: Responsive single-page application structure.
- `style.css`: Clean, modern dark/light mode design system.
- `app.js`: Application state, audio synthesizer, and event handlers.
- `questions.js` & `questions.json`: Structured dataset containing all 120 questions and answers.
- `Conservation_Geography.pdf`: Source PDF.
- `generate_dataset.py`: PDF parsing script.
