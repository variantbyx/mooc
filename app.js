/**
 * Conservation Geography MCQ Portal - Application Controller
 * Features:
 * - Instant answer validation on option click (highlighting correct / wrong)
 * - Week-wise practice (Weeks 1 to 12)
 * - All weeks combined in serial order (1 to 120)
 * - All weeks combined in random / jumbled order
 * - Single-card view with keyboard shortcuts
 * - All-in-one scrollable list view with search & filtering
 * - Interactive Question Navigator Matrix with real-time color coding
 * - Performance Scorecard with week-by-week breakdown & Missed Questions Retake
 * - Synthesized Audio feedback (Web Audio API) with mute toggle
 * - LocalStorage persistence for progress and settings
 */

(function () {
  'use strict';

  // Topic titles for each week in Conservation Geography
  const WEEK_TOPICS = {
    1: 'Ecology & Animal Movement',
    2: 'Earth Sciences & Volcanism',
    3: 'Rocks, Minerals & Stratigraphy',
    4: 'Atmosphere, Climate & Carbon',
    5: 'Oceanography & Marine Systems',
    6: 'Hydrology & River Basins',
    7: 'Soils, Arid Zones & Biomes',
    8: 'Biodiversity & Conservation',
    9: 'Human Geography & Demography',
    10: 'Forests, Resources & Nitrogen',
    11: 'Linear Infrastructure & Wildlife',
    12: 'Hazards, LiDAR, GIS & Photogrammetry'
  };

  // State
  const state = {
    allQuestions: [],
    currentMode: 'weekwise', // 'weekwise' | 'serial' | 'jumbled' | 'missed'
    selectedWeek: 1,
    currentQuestions: [],
    currentIndex: 0,
    currentView: 'card', // 'card' | 'list'
    userAnswers: {}, // questionId -> { selectedIndex, isCorrect, timestamp }
    streak: 0,
    maxStreak: 0,
    soundEnabled: true,
    theme: 'dark',
    filter: 'all',
    searchQuery: ''
  };

  // Web Audio Context for synthesized sound feedback
  let audioCtx = null;
  function getAudioContext() {
    if (!audioCtx) {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (AudioCtxClass) {
        audioCtx = new AudioCtxClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playSound(type) {
    if (!state.soundEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      if (type === 'correct') {
        // Cheerful rising chime (E5 -> A5)
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(659.25, now); // E5
        osc.frequency.exponentialRampToValueAtTime(880.0, now + 0.12); // A5

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.18, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.3);
      } else if (type === 'wrong') {
        // Low soft thud / buzz
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(140, now + 0.2);

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.18, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.26);
      } else if (type === 'complete') {
        // Fanfare chord
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = freq;
          const startTime = now + i * 0.08;
          gain.gain.setValueAtTime(0.001, startTime);
          gain.gain.linearRampToValueAtTime(0.12, startTime + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.4);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(startTime);
          osc.stop(startTime + 0.45);
        });
      }
    } catch (e) {
      console.warn('Audio playback error:', e);
    }
  }

  // Toast Notification
  function showToast(message, icon = 'ℹ️') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 3000);
  }

  // Local Storage Persistence
  const STORAGE_KEY = 'conservation_mcq_data_v1';
  function loadPersistedState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.userAnswers) state.userAnswers = parsed.userAnswers;
        if (parsed.streak) state.streak = parsed.streak;
        if (parsed.maxStreak) state.maxStreak = parsed.maxStreak;
        if (typeof parsed.soundEnabled === 'boolean') state.soundEnabled = parsed.soundEnabled;
        if (parsed.theme) state.theme = parsed.theme;
        if (parsed.selectedWeek) state.selectedWeek = parsed.selectedWeek;
        if (parsed.currentMode) state.currentMode = parsed.currentMode;
      }
    } catch (e) {
      console.warn('Could not load localStorage:', e);
    }
  }

  function savePersistedState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        userAnswers: state.userAnswers,
        streak: state.streak,
        maxStreak: state.maxStreak,
        soundEnabled: state.soundEnabled,
        theme: state.theme,
        selectedWeek: state.selectedWeek,
        currentMode: state.currentMode
      }));
    } catch (e) {
      console.warn('Could not save localStorage:', e);
    }
  }

  // Initialize Data
  function initData() {
    if (typeof QUESTIONS_DATA !== 'undefined' && Array.isArray(QUESTIONS_DATA) && QUESTIONS_DATA.length > 0) {
      state.allQuestions = QUESTIONS_DATA;
      setupApplication();
    } else {
      // Fallback: fetch from questions.json
      fetch('questions.json')
        .then(res => res.json())
        .then(data => {
          state.allQuestions = data;
          setupApplication();
        })
        .catch(err => {
          console.error('Failed to load questions:', err);
          document.getElementById('cardQuestionText').textContent = 'Error loading questions data. Please ensure questions.js or questions.json is available.';
        });
    }
  }

  // Setup DOM and Event Listeners
  function setupApplication() {
    loadPersistedState();
    applyTheme(state.theme);
    updateSoundButtonUI();

    // Generate Week Selection Chips (Weeks 1 to 12)
    renderWeekChips();

    // Set initial mode & questions
    setMode(state.currentMode, state.selectedWeek, false);

    // Attach Event Listeners
    attachEventListeners();

    // Update stats
    updateGlobalStats();
  }

  // Week Chips Generator
  function renderWeekChips() {
    const container = document.getElementById('weekChipsContainer');
    if (!container) return;
    container.innerHTML = '';

    for (let w = 1; w <= 12; w++) {
      const btn = document.createElement('button');
      btn.className = `week-chip ${w === state.selectedWeek ? 'active' : ''}`;
      btn.id = `weekChip_${w}`;
      
      // Calculate completion for this week
      const weekQs = state.allQuestions.filter(q => q.week === w);
      const answered = weekQs.filter(q => state.userAnswers[q.id] !== undefined).length;
      if (answered === weekQs.length && weekQs.length > 0) {
        btn.classList.add('completed');
      }

      btn.innerHTML = `<span>Week ${w}</span>`;
      btn.title = `Week ${w}: ${WEEK_TOPICS[w] || ''} (${answered}/${weekQs.length} done)`;
      btn.addEventListener('click', () => {
        setMode('weekwise', w);
      });
      container.appendChild(btn);
    }
  }

  // Mode Switching
  function setMode(mode, weekNumber = 1, resetIndex = true) {
    state.currentMode = mode;
    state.selectedWeek = weekNumber;

    // Update Mode Tabs UI
    document.querySelectorAll('.mode-tab').forEach(tab => {
      const isTarget = tab.dataset.mode === mode;
      tab.classList.toggle('active', isTarget);
      tab.setAttribute('aria-selected', isTarget);
    });

    const weekSelectorBar = document.getElementById('weekSelectorBar');
    const reshuffleBtn = document.getElementById('reshuffleBtn');
    const weekwiseBadge = document.getElementById('weekwiseBadge');

    if (mode === 'weekwise') {
      weekSelectorBar.style.display = 'block';
      reshuffleBtn.style.display = 'none';
      weekwiseBadge.textContent = `Week ${weekNumber}`;
      state.currentQuestions = state.allQuestions.filter(q => q.week === weekNumber);
      document.getElementById('activeModeTag').textContent = `Week ${weekNumber} MCQs • ${WEEK_TOPICS[weekNumber] || ''}`;
      document.getElementById('sideModeText').textContent = `Week ${weekNumber}`;
    } else if (mode === 'serial') {
      weekSelectorBar.style.display = 'none';
      reshuffleBtn.style.display = 'none';
      // Serial order: Week 1 Q1 to Week 12 Q10
      state.currentQuestions = [...state.allQuestions].sort((a, b) => {
        if (a.week !== b.week) return a.week - b.week;
        return a.questionNumber - b.questionNumber;
      });
      document.getElementById('activeModeTag').textContent = 'All Weeks Combined • Serial Order (120 Qs)';
      document.getElementById('sideModeText').textContent = 'All Serial';
    } else if (mode === 'jumbled') {
      weekSelectorBar.style.display = 'none';
      reshuffleBtn.style.display = 'inline-flex';
      // Jumbled order (Fisher-Yates shuffle)
      state.currentQuestions = shuffleArray([...state.allQuestions]);
      document.getElementById('activeModeTag').textContent = 'All Weeks Combined • Jumbled / Random (120 Qs)';
      document.getElementById('sideModeText').textContent = 'All Jumbled';
    } else if (mode === 'missed') {
      weekSelectorBar.style.display = 'none';
      reshuffleBtn.style.display = 'none';
      // Only questions where answer was incorrect
      state.currentQuestions = state.allQuestions.filter(q => {
        const ans = state.userAnswers[q.id];
        return ans && ans.isCorrect === false;
      });
      document.getElementById('activeModeTag').textContent = `Practice Missed Questions (${state.currentQuestions.length} Qs)`;
      document.getElementById('sideModeText').textContent = 'Missed Only';
    }

    // Update week chip active state
    document.querySelectorAll('.week-chip').forEach(chip => {
      const chipWeek = parseInt(chip.id.replace('weekChip_', ''), 10);
      chip.classList.toggle('active', chipWeek === state.selectedWeek && state.currentMode === 'weekwise');
    });

    if (resetIndex) {
      state.currentIndex = 0;
    } else if (state.currentIndex >= state.currentQuestions.length) {
      state.currentIndex = Math.max(0, state.currentQuestions.length - 1);
    }

    savePersistedState();
    renderCurrentView();
    renderNavigatorMatrix();
  }

  // Fisher-Yates Shuffle
  function shuffleArray(arr) {
    const array = [...arr];
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  // Render Card or List View
  function renderCurrentView() {
    if (state.currentView === 'card') {
      document.getElementById('cardViewSection').style.display = 'block';
      document.getElementById('listViewSection').style.display = 'none';
      renderCardQuestion();
    } else {
      document.getElementById('cardViewSection').style.display = 'none';
      document.getElementById('listViewSection').style.display = 'block';
      renderListView();
    }
    updateProgressUI();
  }

  // =========================================================================
  // CARD VIEW RENDERING & INSTANT ANSWER CHECK
  // =========================================================================

  function renderCardQuestion() {
    const list = state.currentQuestions;
    if (list.length === 0) {
      document.getElementById('cardQuestionText').textContent = 'No questions available in this mode.';
      document.getElementById('cardOptionsContainer').innerHTML = '';
      document.getElementById('cardFeedbackBanner').style.display = 'none';
      return;
    }

    const q = list[state.currentIndex];
    const userAnswer = state.userAnswers[q.id];

    // Card Header Info
    document.getElementById('cardWeekBadge').textContent = `Week ${q.week}`;
    document.getElementById('cardQNumBadge').textContent = `Q. ${q.questionNumber} (#${q.id})`;

    const statusBadge = document.getElementById('cardStatusBadge');
    if (!userAnswer) {
      statusBadge.textContent = 'Unanswered';
      statusBadge.className = 'badge status-badge';
    } else if (userAnswer.isCorrect) {
      statusBadge.textContent = '✓ Correct';
      statusBadge.className = 'badge status-badge status-correct';
    } else {
      statusBadge.textContent = '✗ Incorrect';
      statusBadge.className = 'badge status-badge status-wrong';
    }

    // Question Prompt
    document.getElementById('cardQuestionText').textContent = q.question;

    // Options Container
    const optContainer = document.getElementById('cardOptionsContainer');
    optContainer.innerHTML = '';

    q.options.forEach((opt, optIdx) => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      btn.dataset.optIndex = optIdx;

      let statusIconHtml = '';

      // Instant Answer Feedback Styling
      if (userAnswer) {
        btn.disabled = true;
        if (optIdx === q.correctIndex) {
          // This option is the correct answer (the bold option in PDF)
          if (userAnswer.selectedIndex === optIdx) {
            btn.classList.add('opt-correct');
            statusIconHtml = '<span class="option-status-icon">✓</span>';
          } else {
            btn.classList.add('opt-reveal-correct');
            statusIconHtml = '<span class="option-status-icon">✓</span>';
          }
        } else if (userAnswer.selectedIndex === optIdx) {
          // User chose this option, and it's wrong
          btn.classList.add('opt-wrong');
          statusIconHtml = '<span class="option-status-icon">✗</span>';
        }
      }

      btn.innerHTML = `
        <span class="option-letter">${opt.letter}</span>
        <span class="option-text">${opt.text}</span>
        ${statusIconHtml}
      `;

      btn.addEventListener('click', () => {
        handleOptionSelect(q, optIdx);
      });

      optContainer.appendChild(btn);
    });

    // Feedback Banner
    const feedbackBanner = document.getElementById('cardFeedbackBanner');
    const feedbackIcon = document.getElementById('feedbackIcon');
    const feedbackTitle = document.getElementById('feedbackTitle');
    const feedbackDesc = document.getElementById('feedbackDesc');

    if (!userAnswer) {
      feedbackBanner.style.display = 'none';
    } else {
      feedbackBanner.style.display = 'flex';
      if (userAnswer.isCorrect) {
        feedbackBanner.className = 'feedback-banner feedback-correct';
        feedbackIcon.textContent = '🎉';
        feedbackTitle.textContent = 'Spot on! Correct answer.';
        feedbackDesc.textContent = `Option (${q.correctLetter}): ${q.correctAnswer}`;
      } else {
        feedbackBanner.className = 'feedback-banner feedback-wrong';
        feedbackIcon.textContent = '💡';
        feedbackTitle.textContent = 'Not quite. Here is the correct answer:';
        feedbackDesc.textContent = `Correct option is (${q.correctLetter}): ${q.correctAnswer} (marked bold in PDF).`;
      }
    }

    // Nav Buttons disabled states
    document.getElementById('btnPrevQ').disabled = state.currentIndex === 0;
    document.getElementById('btnNextQ').disabled = state.currentIndex === list.length - 1;

    // Tracker text
    document.getElementById('questionTracker').textContent = `Question ${state.currentIndex + 1} of ${list.length}`;
  }

  // Handle Instant Answer Check
  function handleOptionSelect(question, selectedIndex) {
    if (state.userAnswers[question.id]) {
      return; // Already answered
    }

    const isCorrect = selectedIndex === question.correctIndex;
    state.userAnswers[question.id] = {
      selectedIndex: selectedIndex,
      isCorrect: isCorrect,
      timestamp: Date.now()
    };

    if (isCorrect) {
      state.streak += 1;
      if (state.streak > state.maxStreak) {
        state.maxStreak = state.streak;
      }
      playSound('correct');
      if (state.streak >= 5 && state.streak % 5 === 0) {
        showToast(`🔥 Hot streak! ${state.streak} correct in a row!`, '🔥');
      }
    } else {
      state.streak = 0;
      playSound('wrong');
    }

    savePersistedState();
    updateGlobalStats();
    renderCurrentView();
    renderNavigatorMatrix();
    renderWeekChips(); // refresh completion dots

    // Check if entire set is finished
    checkCompletion();
  }

  function resetCurrentQuestion() {
    const list = state.currentQuestions;
    if (list.length === 0) return;
    const q = list[state.currentIndex];
    if (state.userAnswers[q.id]) {
      delete state.userAnswers[q.id];
      savePersistedState();
      updateGlobalStats();
      renderCurrentView();
      renderNavigatorMatrix();
      renderWeekChips();
      showToast('Question reset. Try again!', '🔄');
    }
  }

  function checkCompletion() {
    const list = state.currentQuestions;
    const answeredCount = list.filter(q => state.userAnswers[q.id] !== undefined).length;
    if (answeredCount === list.length && list.length > 0) {
      playSound('complete');
      const correctCount = list.filter(q => state.userAnswers[q.id] && state.userAnswers[q.id].isCorrect).length;
      const pct = Math.round((correctCount / list.length) * 100);
      showToast(`Completed! Score: ${correctCount}/${list.length} (${pct}%)`, '🏆');
    }
  }

  // =========================================================================
  // LIST VIEW RENDERING (ALL QUESTIONS ON ONE SCROLLABLE PAGE)
  // =========================================================================

  function renderListView() {
    const container = document.getElementById('questionsListStream');
    if (!container) return;
    container.innerHTML = '';

    const query = state.searchQuery.toLowerCase().trim();
    let filtered = state.currentQuestions.filter(q => {
      // Filter by chip status
      const ans = state.userAnswers[q.id];
      if (state.filter === 'unanswered' && ans) return false;
      if (state.filter === 'correct' && (!ans || !ans.isCorrect)) return false;
      if (state.filter === 'wrong' && (!ans || ans.isCorrect)) return false;

      // Filter by search query
      if (query) {
        const matchesQ = q.question.toLowerCase().includes(query);
        const matchesOpts = q.options.some(o => o.text.toLowerCase().includes(query));
        const matchesWeek = `week ${q.week}`.includes(query);
        if (!matchesQ && !matchesOpts && !matchesWeek) return false;
      }
      return true;
    });

    // Update filter counts
    updateListFilterCounts();

    if (filtered.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🔍</div>
          <div style="font-weight: 600; font-size: 1.1rem; color: var(--text-secondary);">No questions matched your criteria</div>
          <p style="font-size: 0.85rem; margin-top: 0.35rem;">Try adjusting your filter or search keywords.</p>
        </div>
      `;
      return;
    }

    filtered.forEach((q, idx) => {
      const userAnswer = state.userAnswers[q.id];
      const card = document.createElement('div');
      card.className = 'list-question-card';
      card.id = `listQ_${q.id}`;

      // Status badge
      let badgeHtml = '<span class="badge status-badge">Unanswered</span>';
      if (userAnswer) {
        if (userAnswer.isCorrect) {
          badgeHtml = '<span class="badge status-badge status-correct">✓ Correct</span>';
        } else {
          badgeHtml = '<span class="badge status-badge status-wrong">✗ Incorrect</span>';
        }
      }

      // Card Header
      const headerHtml = `
        <div class="list-card-header">
          <div class="card-tags">
            <span class="badge week-badge">Week ${q.week}</span>
            <span class="badge qnum-badge">Q. ${q.questionNumber} (#${q.id})</span>
            ${badgeHtml}
          </div>
          <button class="card-action-icon list-reset-btn" data-qid="${q.id}" title="Reset this question">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
            <span>Reset</span>
          </button>
        </div>
        <div class="list-card-prompt">${q.question}</div>
      `;

      card.innerHTML = headerHtml;

      // Options
      const optionsBox = document.createElement('div');
      optionsBox.className = 'list-card-options';

      q.options.forEach((opt, optIdx) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        let statusIconHtml = '';

        if (userAnswer) {
          btn.disabled = true;
          if (optIdx === q.correctIndex) {
            if (userAnswer.selectedIndex === optIdx) {
              btn.classList.add('opt-correct');
              statusIconHtml = '<span class="option-status-icon">✓</span>';
            } else {
              btn.classList.add('opt-reveal-correct');
              statusIconHtml = '<span class="option-status-icon">✓</span>';
            }
          } else if (userAnswer.selectedIndex === optIdx) {
            btn.classList.add('opt-wrong');
            statusIconHtml = '<span class="option-status-icon">✗</span>';
          }
        }

        btn.innerHTML = `
          <span class="option-letter">${opt.letter}</span>
          <span class="option-text">${opt.text}</span>
          ${statusIconHtml}
        `;

        btn.addEventListener('click', () => {
          handleOptionSelect(q, optIdx);
        });

        optionsBox.appendChild(btn);
      });

      card.appendChild(optionsBox);

      // Feedback if answered
      if (userAnswer) {
        const fb = document.createElement('div');
        fb.className = `feedback-banner ${userAnswer.isCorrect ? 'feedback-correct' : 'feedback-wrong'}`;
        fb.style.marginBottom = '0';
        fb.innerHTML = `
          <div class="feedback-icon">${userAnswer.isCorrect ? '✓' : '💡'}</div>
          <div class="feedback-content">
            <div class="feedback-title">${userAnswer.isCorrect ? 'Correct!' : 'Correct Answer:'}</div>
            <div class="feedback-desc">Option (${q.correctLetter}): ${q.correctAnswer}</div>
          </div>
        `;
        card.appendChild(fb);
      }

      container.appendChild(card);
    });

    // Reset button events
    container.querySelectorAll('.list-reset-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const qid = parseInt(btn.dataset.qid, 10);
        if (state.userAnswers[qid]) {
          delete state.userAnswers[qid];
          savePersistedState();
          updateGlobalStats();
          renderCurrentView();
          renderNavigatorMatrix();
          renderWeekChips();
          showToast('Question reset.', '🔄');
        }
      });
    });
  }

  function updateListFilterCounts() {
    const list = state.currentQuestions;
    const total = list.length;
    let unanswered = 0;
    let correct = 0;
    let wrong = 0;

    list.forEach(q => {
      const a = state.userAnswers[q.id];
      if (!a) unanswered++;
      else if (a.isCorrect) correct++;
      else wrong++;
    });

    const setEl = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    setEl('countAll', total);
    setEl('countUnanswered', unanswered);
    setEl('countCorrect', correct);
    setEl('countWrong', wrong);
  }

  // =========================================================================
  // QUESTION NAVIGATOR MATRIX (RIGHT SIDEBAR)
  // =========================================================================

  function renderNavigatorMatrix() {
    const grid = document.getElementById('questionMatrixGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const list = state.currentQuestions;
    document.getElementById('navigatorCountBadge').textContent = `${list.length} Qs`;

    list.forEach((q, idx) => {
      const btn = document.createElement('button');
      btn.className = 'matrix-btn';
      btn.textContent = idx + 1;
      btn.title = `Q. ${q.questionNumber} (Week ${q.week})`;

      const ans = state.userAnswers[q.id];
      if (ans) {
        if (ans.isCorrect) {
          btn.classList.add('matrix-correct');
        } else {
          btn.classList.add('matrix-wrong');
        }
      }

      if (state.currentView === 'card' && idx === state.currentIndex) {
        btn.classList.add('matrix-active');
      }

      btn.addEventListener('click', () => {
        state.currentIndex = idx;
        if (state.currentView === 'card') {
          renderCardQuestion();
          updateProgressUI();
          renderNavigatorMatrix();
        } else {
          // Scroll to question in list view
          const el = document.getElementById(`listQ_${q.id}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.style.borderColor = 'var(--primary)';
            setTimeout(() => { el.style.borderColor = ''; }, 1500);
          }
        }
      });

      grid.appendChild(btn);
    });

    // Sidebar footer stats
    const answered = list.filter(q => state.userAnswers[q.id] !== undefined).length;
    const correct = list.filter(q => state.userAnswers[q.id] && state.userAnswers[q.id].isCorrect).length;
    const pct = list.length > 0 ? Math.round((answered / list.length) * 100) : 0;

    document.getElementById('sideScoreText').textContent = `${correct} / ${list.length}`;
    document.getElementById('sideProgressText').textContent = `${pct}%`;
  }

  // =========================================================================
  // PROGRESS BAR & HEADER STATS
  // =========================================================================

  function updateProgressUI() {
    const list = state.currentQuestions;
    if (list.length === 0) return;

    const answeredCount = list.filter(q => state.userAnswers[q.id] !== undefined).length;
    const progressPct = Math.round((answeredCount / list.length) * 100);

    const progressFill = document.getElementById('progressFill');
    if (progressFill) progressFill.style.width = `${progressPct}%`;

    const progressPctEl = document.getElementById('progressPercent');
    if (progressPctEl) progressPctEl.textContent = `${progressPct}% Completed (${answeredCount}/${list.length})`;
  }

  function updateGlobalStats() {
    const totalQuestions = state.allQuestions.length; // 120
    let totalAnswered = 0;
    let totalCorrect = 0;
    let totalWrong = 0;

    state.allQuestions.forEach(q => {
      const ans = state.userAnswers[q.id];
      if (ans) {
        totalAnswered++;
        if (ans.isCorrect) totalCorrect++;
        else totalWrong++;
      }
    });

    const accuracy = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;

    document.getElementById('statAccuracy').textContent = `${accuracy}%`;
    document.getElementById('statCorrect').textContent = totalCorrect;
    document.getElementById('statWrong').textContent = totalWrong;
    document.getElementById('statStreak').textContent = `${state.streak} 🔥`;
  }

  // =========================================================================
  // SCORECARD & PERFORMANCE MODAL
  // =========================================================================

  function openScorecardModal() {
    const modal = document.getElementById('scorecardModal');
    if (!modal) return;

    let totalAnswered = 0;
    let totalCorrect = 0;
    let totalWrong = 0;

    state.allQuestions.forEach(q => {
      const ans = state.userAnswers[q.id];
      if (ans) {
        totalAnswered++;
        if (ans.isCorrect) totalCorrect++;
        else totalWrong++;
      }
    });

    const accuracy = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;

    document.getElementById('modalAccuracy').textContent = `${accuracy}%`;
    document.getElementById('modalTotalAttempted').textContent = `${totalAnswered} / ${state.allQuestions.length}`;
    document.getElementById('modalTotalCorrect').textContent = totalCorrect;
    document.getElementById('modalTotalWrong').textContent = totalWrong;
    document.getElementById('modalMaxStreak').textContent = `${state.maxStreak} 🔥`;
    document.getElementById('modalMissedCount').textContent = totalWrong;

    // Week by week table
    const tbody = document.getElementById('weekPerfTableBody');
    tbody.innerHTML = '';

    for (let w = 1; w <= 12; w++) {
      const weekQs = state.allQuestions.filter(q => q.week === w);
      const weekAns = weekQs.filter(q => state.userAnswers[q.id] !== undefined);
      const weekCorrect = weekQs.filter(q => state.userAnswers[q.id] && state.userAnswers[q.id].isCorrect).length;
      const weekAcc = weekAns.length > 0 ? Math.round((weekCorrect / weekAns.length) * 100) : 0;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>Week ${w}</strong></td>
        <td><small>${WEEK_TOPICS[w] || ''}</small></td>
        <td>${weekAns.length} / ${weekQs.length}</td>
        <td><strong class="text-success">${weekCorrect}</strong></td>
        <td>${weekAns.length > 0 ? `${weekAcc}%` : '-'}</td>
        <td>
          <button class="practice-week-btn" data-week="${w}">Practice Week ${w}</button>
        </td>
      `;
      tbody.appendChild(tr);
    }

    tbody.querySelectorAll('.practice-week-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const w = parseInt(btn.dataset.week, 10);
        closeScorecardModal();
        setMode('weekwise', w);
      });
    });

    modal.style.display = 'flex';
  }

  function closeScorecardModal() {
    const modal = document.getElementById('scorecardModal');
    if (modal) modal.style.display = 'none';
  }

  // =========================================================================
  // THEME & SOUND CONTROLS
  // =========================================================================

  function applyTheme(theme) {
    state.theme = theme;
    if (theme === 'light') {
      document.body.classList.remove('dark-theme');
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
      document.body.classList.add('dark-theme');
    }
    savePersistedState();
  }

  function toggleTheme() {
    const nextTheme = state.theme === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
    showToast(`Switched to ${nextTheme} mode`, nextTheme === 'light' ? '☀️' : '🌙');
  }

  function updateSoundButtonUI() {
    const onIcon = document.querySelector('.sound-icon-on');
    const offIcon = document.querySelector('.sound-icon-off');
    if (onIcon && offIcon) {
      if (state.soundEnabled) {
        onIcon.style.display = 'inline';
        offIcon.style.display = 'none';
      } else {
        onIcon.style.display = 'none';
        offIcon.style.display = 'inline';
      }
    }
  }

  function toggleSound() {
    state.soundEnabled = !state.soundEnabled;
    updateSoundButtonUI();
    savePersistedState();
    showToast(`Sound ${state.soundEnabled ? 'enabled' : 'muted'}`, state.soundEnabled ? '🔔' : '🔕');
    if (state.soundEnabled) playSound('correct');
  }

  // =========================================================================
  // ATTACH EVENT LISTENERS
  // =========================================================================

  function attachEventListeners() {
    // Mode tabs
    document.getElementById('tabWeekwise').addEventListener('click', () => {
      setMode('weekwise', state.selectedWeek);
    });
    document.getElementById('tabAllSerial').addEventListener('click', () => {
      setMode('serial');
    });
    document.getElementById('tabAllJumbled').addEventListener('click', () => {
      setMode('jumbled');
    });

    // Reshuffle button
    document.getElementById('reshuffleBtn').addEventListener('click', () => {
      setMode('jumbled', 1, true);
      showToast('Questions reshuffled in random order!', '🔀');
    });

    // View toggle buttons (Card vs List)
    document.getElementById('viewCardBtn').addEventListener('click', () => {
      state.currentView = 'card';
      document.getElementById('viewCardBtn').classList.add('active');
      document.getElementById('viewListBtn').classList.remove('active');
      renderCurrentView();
      renderNavigatorMatrix();
    });
    document.getElementById('viewListBtn').addEventListener('click', () => {
      state.currentView = 'list';
      document.getElementById('viewListBtn').classList.add('active');
      document.getElementById('viewCardBtn').classList.remove('active');
      renderCurrentView();
      renderNavigatorMatrix();
    });

    // Card navigation buttons
    document.getElementById('btnPrevQ').addEventListener('click', () => {
      if (state.currentIndex > 0) {
        state.currentIndex--;
        renderCardQuestion();
        updateProgressUI();
        renderNavigatorMatrix();
      }
    });
    document.getElementById('btnNextQ').addEventListener('click', () => {
      if (state.currentIndex < state.currentQuestions.length - 1) {
        state.currentIndex++;
        renderCardQuestion();
        updateProgressUI();
        renderNavigatorMatrix();
      }
    });

    // Card Reset question
    document.getElementById('cardResetBtn').addEventListener('click', resetCurrentQuestion);

    // List search & filters
    const searchInput = document.getElementById('listSearchInput');
    const clearSearch = document.getElementById('clearSearchBtn');
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      clearSearch.style.display = state.searchQuery ? 'block' : 'none';
      renderListView();
    });
    clearSearch.addEventListener('click', () => {
      searchInput.value = '';
      state.searchQuery = '';
      clearSearch.style.display = 'none';
      renderListView();
    });

    document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        state.filter = chip.dataset.filter;
        renderListView();
      });
    });

    // Sidebar Reset buttons
    document.getElementById('sideResetCurrentBtn').addEventListener('click', () => {
      if (confirm('Reset answers for the current set?')) {
        state.currentQuestions.forEach(q => {
          delete state.userAnswers[q.id];
        });
        savePersistedState();
        updateGlobalStats();
        renderCurrentView();
        renderNavigatorMatrix();
        renderWeekChips();
        showToast('Current set progress reset.', '🔄');
      }
    });

    document.getElementById('sideResetAllBtn').addEventListener('click', () => {
      if (confirm('Are you sure you want to reset ALL 120 questions across all weeks?')) {
        state.userAnswers = {};
        state.streak = 0;
        state.maxStreak = 0;
        savePersistedState();
        updateGlobalStats();
        renderCurrentView();
        renderNavigatorMatrix();
        renderWeekChips();
        showToast('All progress reset.', '🧹');
      }
    });

    // Header Controls
    document.getElementById('themeToggleBtn').addEventListener('click', toggleTheme);
    document.getElementById('soundToggleBtn').addEventListener('click', toggleSound);
    document.getElementById('scorecardBtn').addEventListener('click', openScorecardModal);

    // Scorecard Modal events
    document.getElementById('closeScorecardBtn').addEventListener('click', closeScorecardModal);
    document.getElementById('modalDoneBtn').addEventListener('click', closeScorecardModal);
    document.getElementById('retryIncorrectBtn').addEventListener('click', () => {
      closeScorecardModal();
      setMode('missed');
      showToast('Loaded missed questions for practice!', '🎯');
    });

    // Close modal on background click
    document.getElementById('scorecardModal').addEventListener('click', (e) => {
      if (e.target.id === 'scorecardModal') {
        closeScorecardModal();
      }
    });

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      // Don't trigger shortcuts if focus is in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (state.currentView === 'card' && state.currentQuestions.length > 0) {
        const q = state.currentQuestions[state.currentIndex];
        
        // Option selection: 1-4 or A-D
        const key = e.key.toUpperCase();
        const numKey = parseInt(e.key, 10);
        if (numKey >= 1 && numKey <= 4) {
          handleOptionSelect(q, numKey - 1);
        } else if (['A', 'B', 'C', 'D'].includes(key)) {
          const map = { 'A': 0, 'B': 1, 'C': 2, 'D': 3 };
          handleOptionSelect(q, map[key]);
        } else if (e.key === 'ArrowLeft') {
          if (state.currentIndex > 0) {
            state.currentIndex--;
            renderCardQuestion();
            updateProgressUI();
            renderNavigatorMatrix();
          }
        } else if (e.key === 'ArrowRight' || e.key === ' ') {
          if (state.currentIndex < state.currentQuestions.length - 1) {
            e.preventDefault();
            state.currentIndex++;
            renderCardQuestion();
            updateProgressUI();
            renderNavigatorMatrix();
          }
        }
      }

      if (e.key === 'Escape') {
        closeScorecardModal();
      }
    });
  }

  // Start initialization when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initData);
  } else {
    initData();
  }

})();
