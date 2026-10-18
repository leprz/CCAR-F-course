/* teach-me shared front-end. Vanilla JS, no deps, no build.
   One script serves four pages:
     - #library-root  -> the library index (reads library.json)
     - #quiz-root     -> the quiz renderer (reads lectures/<slug>/questions.json)
     - #notes-root    -> the lecture viewer (reads lectures/<slug>/lecture.md)
     - #exam-root     -> the mock exam (library.json + every questions.json)
   Data is always loaded over HTTP as JSON; nothing is embedded in the HTML.
   Question types: multiple-choice and true-false (both auto-graded).
   Questions may carry `objectives: ["O01", ...]`; results are then broken down
   per objective and stored in localStorage for "Export progress".
   The pure helpers (sampling, breakdown, aggregation) are also exported via
   module.exports so they can be tested in node without a DOM. */
(function () {
  'use strict';

  // ---- helpers ---------------------------------------------------------
  function qsParam(name) {
    return new URLSearchParams(location.search).get(name);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Escape, then turn `inline code` (markdown backticks) into <code> spans.
  // Used as a fallback when marked is unavailable.
  function code(s) {
    return esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  // Block-level markdown (fenced ``` code blocks -> <pre><code>, paragraphs, etc.)
  function mdBlock(s) {
    return window.marked ? window.marked.parse(String(s == null ? '' : s)) : '<p>' + code(s) + '</p>';
  }

  // Inline markdown only (no block elements) — for option labels and short notes.
  function mdInline(s) {
    s = String(s == null ? '' : s);
    return (window.marked && window.marked.parseInline) ? window.marked.parseInline(s) : code(s);
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) {
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  // Run highlight.js over fenced code blocks (<pre><code>) only, if the lib is
  // loaded. Inline `code` (single backticks) is left as a plain <code> span so
  // it isn't syntax-colored. Mermaid blocks are skipped (renderMermaid replaces
  // them with <div class="mermaid"> before this runs, so they no longer match).
  function highlightWithin(node) {
    if (!window.hljs) return;
    Array.prototype.forEach.call(node.querySelectorAll('pre code'), function (c) {
      if (c.classList && c.classList.contains('language-mermaid')) return;
      try { window.hljs.highlightElement(c); } catch (e) {}
    });
  }

  // Initialize mermaid once, matching the page's light/dark theme.
  var mermaidReady = false;
  function ensureMermaid() {
    if (mermaidReady || !window.mermaid) return mermaidReady;
    try {
      var dark = (document.documentElement.getAttribute('data-theme') || '').indexOf('dark') !== -1;
      window.mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'loose',
        theme: dark ? 'dark' : 'default'
      });
      mermaidReady = true;
    } catch (e) {}
    return mermaidReady;
  }

  // Turn ```mermaid fenced blocks into rendered SVG diagrams. MUST run BEFORE
  // highlightWithin so highlight.js never touches the diagram source. Rendering
  // is async; a malformed diagram is suppressed rather than breaking the page.
  function renderMermaid(node) {
    if (!ensureMermaid()) return;
    var blocks = Array.prototype.slice.call(node.querySelectorAll('code.language-mermaid'));
    if (!blocks.length) return;
    var containers = blocks.map(function (codeEl) {
      var host = (codeEl.closest && codeEl.closest('pre')) || codeEl.parentNode || codeEl;
      var div = el('div', { class: 'mermaid' });
      div.textContent = codeEl.textContent;
      host.parentNode.replaceChild(div, host);
      return div;
    });
    try {
      window.mermaid.run({ nodes: containers, suppressErrors: true });
    } catch (e) {}
  }

  function stripFrontMatter(md) {
    var m = /^---\n[\s\S]*?\n---\n?/.exec(md);
    return m ? md.slice(m[0].length) : md;
  }

  function shuffle(arr, rand) {
    rand = rand || Math.random;
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function fileProtocolError(root) {
    root.innerHTML = '';
    root.appendChild(el('article', { class: 'error' }, [
      el('h2', { text: 'Cannot load data from file://' }),
      el('p', { html: 'Browsers block <code>fetch()</code> of local files. Start the local server and open this page over <code>http://localhost</code> instead. Re-run the <code>/teach-me</code> skill, or from the library folder run:' }),
      el('pre', {}, [el('code', { text: 'python3 -m http.server 8765' })])
    ]));
  }

  // ---- objectives: pure helpers (no DOM, no storage) -------------------
  var PASS_MARK = 720;

  // Per-objective tally of answered questions, weakest first.
  // answers: [{ q: { objectives: [...] }, correct: bool }]
  function objectiveBreakdown(answers) {
    var map = {};
    answers.forEach(function (a) {
      ((a.q && a.q.objectives) || []).forEach(function (id) {
        var m = map[id] || (map[id] = { id: id, correct: 0, total: 0 });
        m.total++;
        if (a.correct) m.correct++;
      });
    });
    return Object.keys(map).map(function (id) {
      var m = map[id];
      m.pct = m.total ? Math.round(100 * m.correct / m.total) : 0;
      return m;
    }).sort(function (a, b) {
      return (a.correct / a.total) - (b.correct / b.total) || b.total - a.total || a.id.localeCompare(b.id);
    });
  }

  // ESTIMATE only: linear map of the raw fraction onto the 100-1000 scale.
  // The official exam uses its own (unpublished) scaling.
  function estimateScaledScore(fraction) {
    return Math.round(100 + 900 * fraction);
  }

  // Draw up to n questions spreading them across objectives as evenly as
  // possible: round-robin over objective ids, always serving the least-covered
  // objective next (random tie-break), random question within it. A question
  // tagged with several objectives counts toward all of them. Questions without
  // objectives only fill the slots left once every objective is exhausted.
  // pool items need a unique `uid`. rand defaults to Math.random.
  function sampleExam(pool, n, rand) {
    rand = rand || Math.random;
    var groups = {}, untagged = [], covered = {}, seen = {}, picked = [];
    pool.forEach(function (q) {
      var objs = q.objectives || [];
      if (!objs.length) untagged.push(q);
      objs.forEach(function (id) { (groups[id] = groups[id] || []).push(q); });
    });
    var ids = Object.keys(groups);
    ids.forEach(function (id) { groups[id] = shuffle(groups[id], rand); covered[id] = 0; });

    function take(q) {
      seen[q.uid] = true;
      picked.push(q);
      (q.objectives || []).forEach(function (id) { covered[id] = (covered[id] || 0) + 1; });
    }

    while (picked.length < n) {
      // drop already-picked questions from the head of each group
      ids = ids.filter(function (id) {
        var g = groups[id];
        while (g.length && seen[g[g.length - 1].uid]) g.pop();
        return g.length > 0;
      });
      if (!ids.length) break;
      var min = Infinity;
      ids.forEach(function (id) { if (covered[id] < min) min = covered[id]; });
      var least = ids.filter(function (id) { return covered[id] === min; });
      var pick = least[Math.floor(rand() * least.length)];
      take(groups[pick].pop());
    }
    shuffle(untagged, rand).forEach(function (q) {
      if (picked.length < n && !seen[q.uid]) take(q);
    });
    return shuffle(picked, rand);
  }

  // Merge stored per-objective results into the export shape, keeping the
  // LATEST attempt per objective across all sources.
  // entries: [{ source: 'quiz:<slug>' | 'exam', results: { O01: { correct, total, at } } }]
  function buildProgress(entries, now) {
    var out = {};
    entries.forEach(function (entry) {
      Object.keys(entry.results || {}).forEach(function (id) {
        var r = entry.results[id];
        if (!r || typeof r.total !== 'number') return;
        var cur = out[id];
        if (!cur || String(r.at || '') > cur.lastAttempt) {
          out[id] = { correct: r.correct, total: r.total, lastAttempt: String(r.at || ''), source: entry.source };
        }
      });
    });
    var sorted = {};
    Object.keys(out).sort().forEach(function (id) { sorted[id] = out[id]; });
    return { exportedAt: (now || new Date()).toISOString(), objectives: sorted };
  }

  // Library order: numbered topic lectures (01-foo, 02-bar) first in numeric
  // order, then everything else (e.g. date-prefixed slugs) newest first.
  var DATE_SLUG = /^[0-9]{4}-[0-9]{2}-[0-9]{2}-/;
  var NUMBERED_SLUG = /^[0-9]+-/;
  function compareLectures(a, b) {
    var as = a.slug || '', bs = b.slug || '';
    var an = NUMBERED_SLUG.test(as) && !DATE_SLUG.test(as);
    var bn = NUMBERED_SLUG.test(bs) && !DATE_SLUG.test(bs);
    if (an !== bn) return an ? -1 : 1;
    if (an) return as.localeCompare(bs, undefined, { numeric: true });
    return (b.date || '').localeCompare(a.date || '') || as.localeCompare(bs);
  }

  // ---- localStorage scores --------------------------------------------
  // teach-me:score:<slug>          latest quiz score   { correct, total, at }
  // teach-me:exam:score            latest mock exam    { correct, total, scaled, at }
  // teach-me:objectives:quiz:<slug> per-objective latest results from that quiz
  // teach-me:objectives:exam        per-objective latest results from mock exams
  //   both objective stores: { O01: { correct, total, at }, ... }
  var OBJ_PREFIX = 'teach-me:objectives:';
  var EXAM_SCORE_KEY = 'teach-me:exam:score';

  function scoreKey(slug) { return 'teach-me:score:' + slug; }

  function saveJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  function loadJSON(key) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function saveScore(slug, score) { saveJSON(scoreKey(slug), score); }

  function loadScore(slug) { return loadJSON(scoreKey(slug)); }

  // source: 'quiz:<slug>' or 'exam'. Objectives not in this attempt keep
  // their previous latest result.
  function saveObjectiveResults(source, breakdown, at) {
    if (!breakdown.length) return;
    var store = loadJSON(OBJ_PREFIX + source) || {};
    breakdown.forEach(function (b) {
      store[b.id] = { correct: b.correct, total: b.total, at: at };
    });
    saveJSON(OBJ_PREFIX + source, store);
  }

  function readObjectiveStores() {
    var entries = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key && key.indexOf(OBJ_PREFIX) === 0) {
          entries.push({ source: key.slice(OBJ_PREFIX.length), results: loadJSON(key) || {} });
        }
      }
    } catch (e) {}
    return entries;
  }

  // Download progress.json (latest result per objective across quizzes/exams).
  function exportProgress() {
    var progress = buildProgress(readObjectiveStores(), new Date());
    var blob = new Blob([JSON.stringify(progress, null, 2) + '\n'], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = el('a', { href: url, download: 'progress.json' });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 0);
  }

  function exportButton() {
    var b = el('button', { class: 'btn', type: 'button', title: 'Download progress.json (latest result per objective)' }, ['Export progress']);
    b.addEventListener('click', exportProgress);
    return b;
  }

  // ---- library index page ---------------------------------------------
  function initLibrary(root) {
    if (location.protocol === 'file:') return fileProtocolError(root);
    fetch('library.json', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (lib) { renderLibrary(root, lib); })
      .catch(function () {
        root.innerHTML = '';
        root.appendChild(el('article', { class: 'error' }, [
          el('h2', { text: 'No lectures yet' }),
          el('p', { text: 'library.json could not be loaded. Create a lecture with /teach-me first.' })
        ]));
      });
  }

  function renderLibrary(root, lib) {
    root.innerHTML = '';
    var lectures = (lib && lib.lectures) || [];
    if (!lectures.length) {
      root.appendChild(el('article', {}, [el('p', { text: 'No lectures yet.' })]));
      return;
    }
    lectures.sort(compareLectures);
    lectures.forEach(function (lec) {
      var score = loadScore(lec.slug);
      var objs = lec.objectives || [];
      var meta = [lec.date, (lec.questionCount || 0) + ' questions', lec.depth,
                  objs.length ? 'objectives ' + objs.join(', ') : ''].filter(Boolean).join('  ·  ');
      var tags = (lec.tags || []).map(function (t) { return el('span', { class: 'tag', text: t }); });
      var badge = score
        ? el('span', { class: 'badge', text: 'Last: ' + score.correct + '/' + score.total })
        : el('span', { class: 'badge badge-empty', text: 'Not taken' });

      root.appendChild(el('article', { class: 'lecture' }, [
        el('div', { class: 'lecture-head' }, [
          el('h2', { text: lec.title || lec.slug }),
          badge
        ]),
        el('p', { class: 'topic', text: lec.topic || '' }),
        el('p', { class: 'meta', text: meta }),
        el('div', { class: 'tags' }, tags),
        el('div', { class: 'actions' }, [
          el('a', { class: 'btn', role: 'button', href: 'notes.html?lecture=' + encodeURIComponent(lec.slug) }, ['Read notes']),
          el('a', { class: 'btn btn-primary', role: 'button', href: lec.quizUrl || ('quiz.html?lecture=' + encodeURIComponent(lec.slug)) }, ['Take quiz'])
        ])
      ]));
    });
  }

  // ---- notes viewer page ----------------------------------------------
  function initNotes(root) {
    if (location.protocol === 'file:') return fileProtocolError(root);
    var slug = qsParam('lecture');
    if (!slug) {
      root.appendChild(el('article', { class: 'error' }, [
        el('h2', { text: 'No lecture specified' }),
        el('p', { html: 'Open this page as <code>notes.html?lecture=&lt;slug&gt;</code>.' })
      ]));
      return;
    }
    fetch('lectures/' + slug + '/lecture.md', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then(function (md) {
        var body = stripFrontMatter(md);
        var article = el('article', { class: 'notes' });
        article.innerHTML = window.marked ? window.marked.parse(body) : esc(body);
        renderMermaid(article);
        highlightWithin(article);
        root.innerHTML = '';
        root.appendChild(article);
        root.appendChild(el('div', { class: 'actions center' }, [
          el('a', { class: 'btn btn-primary', role: 'button', href: 'quiz.html?lecture=' + encodeURIComponent(slug) }, ['Take the quiz']),
          el('a', { class: 'btn', role: 'button', href: 'index.html' }, ['Back to library'])
        ]));
        var h1 = article.querySelector('h1');
        document.title = (h1 ? h1.textContent : 'Notes') + ' — teach-me';
      })
      .catch(function () {
        root.innerHTML = '';
        root.appendChild(el('article', { class: 'error' }, [
          el('h2', { text: 'Could not load notes' }),
          el('p', { text: 'lecture.md for "' + slug + '" failed to load.' })
        ]));
      });
  }

  // ---- quiz page -------------------------------------------------------
  function initQuiz(root) {
    if (location.protocol === 'file:') return fileProtocolError(root);
    var slug = qsParam('lecture');
    if (!slug) {
      root.appendChild(el('article', { class: 'error' }, [
        el('h2', { text: 'No lecture specified' }),
        el('p', { html: 'Open this page as <code>quiz.html?lecture=&lt;slug&gt;</code>.' })
      ]));
      return;
    }
    fetch('lectures/' + slug + '/questions.json', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (data) { new Quiz(root, data).start(); })
      .catch(function () {
        root.innerHTML = '';
        root.appendChild(el('article', { class: 'error' }, [
          el('h2', { text: 'Could not load quiz' }),
          el('p', { text: 'questions.json for "' + slug + '" failed to load.' })
        ]));
      });
  }

  // ---- mock exam page --------------------------------------------------
  // Loads library.json, then every lecture's questions.json, pools them and
  // draws a sample with sampleExam(). Answering reuses the Quiz renderer.
  function initExam(root) {
    if (location.protocol === 'file:') return fileProtocolError(root);
    var n = parseInt(qsParam('n'), 10);
    if (!(n > 0)) n = 40;

    function fail(title, msg) {
      root.innerHTML = '';
      root.appendChild(el('article', { class: 'error' }, [el('h2', { text: title }), el('p', { text: msg })]));
    }

    fetch('library.json', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (lib) {
        var lectures = (lib && lib.lectures) || [];
        return Promise.all(lectures.map(function (lec) {
          return fetch('lectures/' + lec.slug + '/questions.json', { cache: 'no-store' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (data) { return data ? { lec: lec, data: data } : null; })
            .catch(function () { return null; });
        }));
      })
      .then(function (results) {
        var pool = [];
        results.forEach(function (res) {
          if (!res) return;
          (res.data.questions || []).forEach(function (q) {
            var copy = {};
            Object.keys(q).forEach(function (k) { copy[k] = q[k]; });
            copy.uid = res.lec.slug + '#' + q.id;
            copy.lectureSlug = res.lec.slug;
            copy.lectureTitle = res.data.title || res.lec.title || res.lec.slug;
            pool.push(copy);
          });
        });
        if (!pool.length) return fail('No questions yet', 'No lecture has a questions.json to draw from.');
        renderExamIntro(root, pool, n);
      })
      .catch(function () {
        fail('Could not load the library', 'library.json could not be loaded. Create a lecture with /teach-me first.');
      });
  }

  function renderExamIntro(root, pool, n) {
    var objs = {}, lectures = {};
    pool.forEach(function (q) {
      lectures[q.lectureSlug] = true;
      (q.objectives || []).forEach(function (id) { objs[id] = true; });
    });
    var count = Math.min(n, pool.length);
    function begin() {
      var sample = sampleExam(pool, n);
      new Quiz(root, { title: 'Mock exam', questions: sample },
               { mode: 'exam', source: 'exam', resample: begin }).start();
    }
    var start = el('button', { class: 'btn btn-primary', type: 'button' }, ['Start mock exam']);
    start.addEventListener('click', begin);
    var last = loadJSON(EXAM_SCORE_KEY);

    root.innerHTML = '';
    document.title = 'Mock exam — teach-me';
    root.appendChild(el('article', { class: 'exam-intro' }, [
      el('h1', { text: 'Mock exam' }),
      el('p', { text: count + ' questions drawn from ' + pool.length + ' in ' + Object.keys(lectures).length +
        ' lecture(s), spread evenly over ' + Object.keys(objs).length + ' objective(s).' }),
      el('p', { class: 'meta', html: 'Change the length with <code>exam.html?n=60</code>. ' +
        'The scaled score shown at the end is an estimate, not the official scoring formula.' }),
      last ? el('p', { class: 'meta', text: 'Last attempt: ' + last.correct + '/' + last.total +
        ' (est. ' + last.scaled + '/1000) on ' + String(last.at || '').slice(0, 10) }) : el('span'),
      el('div', { class: 'actions' }, [start, el('a', { class: 'btn', role: 'button', href: 'index.html' }, ['Back to library'])])
    ]));
  }

  // ---- quiz renderer (shared by quiz.html and exam.html) ----------------
  // opts.mode: 'quiz' (default) or 'exam'
  // opts.source: objective-store source id ('quiz:<slug>' or 'exam')
  // opts.resample: exam only — draws a fresh sample for "New exam"
  function Quiz(root, data, opts) {
    this.root = root;
    this.data = data;
    this.slug = data.lectureSlug;
    this.opts = opts || {};
    this.mode = this.opts.mode || 'quiz';
    this.source = this.opts.source || ('quiz:' + this.slug);
    this.prepare();
  }

  // Build a fresh run: question order is left as-authored, but MC options are
  // shuffled and the correct index recomputed.
  Quiz.prototype.prepare = function () {
    this.answers = [];
    this.index = 0;
    this.questions = (this.data.questions || []).map(function (q) {
      var copy = { id: q.id, type: q.type, prompt: q.prompt, difficulty: q.difficulty,
                   explanation: q.explanation, correct: q.correct,
                   objectives: q.objectives || [], lectureSlug: q.lectureSlug, lectureTitle: q.lectureTitle };
      if (q.type === 'multiple-choice') {
        var correctText = q.options[q.correctIndex];
        copy.options = shuffle(q.options);
        copy.correctIndex = copy.options.indexOf(correctText);
      }
      return copy;
    });
  };

  Quiz.prototype.start = function () {
    document.title = (this.data.title || 'Quiz') + ' — teach-me';
    this.renderQuestion();
  };

  Quiz.prototype.renderQuestion = function () {
    var self = this;
    var q = this.questions[this.index];
    this.root.innerHTML = '';

    this.root.appendChild(el('div', { class: 'quiz-head' }, [
      el('h1', { text: this.data.title || 'Quiz' }),
      el('div', { class: 'progress', text: 'Question ' + (this.index + 1) + ' of ' + this.questions.length })
    ]));

    var card = el('article', { class: 'question' });
    card.appendChild(el('div', { class: 'prompt', html: mdBlock(q.prompt) }));

    var feedback = el('div', { class: 'feedback' });
    var opts = el('div', { class: 'options' });

    if (q.type === 'multiple-choice') {
      q.options.forEach(function (opt, i) {
        var b = el('button', { class: 'option', type: 'button', html: mdInline(opt) });
        b.addEventListener('click', function () { self.answerChoice(q, i, opts, feedback); });
        opts.appendChild(b);
      });
    } else { // true-false
      [['True', true], ['False', false]].forEach(function (pair) {
        var b = el('button', { class: 'option', type: 'button' }, [pair[0]]);
        b.addEventListener('click', function () { self.answerBool(q, pair[1], opts, feedback); });
        opts.appendChild(b);
      });
    }

    card.appendChild(opts);
    card.appendChild(feedback);
    this.root.appendChild(card);
    highlightWithin(card);
  };

  Quiz.prototype.lockOptions = function (container) {
    Array.prototype.forEach.call(container.querySelectorAll('.option'), function (b) {
      b.disabled = true;
    });
  };

  Quiz.prototype.showExplanation = function (feedback, q) {
    if (q.explanation) {
      feedback.appendChild(el('p', { class: 'explanation', html: '<strong>Why:</strong> ' + mdInline(q.explanation) }));
    }
    highlightWithin(feedback);
    feedback.appendChild(this.nextButton());
  };

  Quiz.prototype.nextButton = function () {
    var self = this;
    var last = this.index === this.questions.length - 1;
    var b = el('button', { class: 'btn btn-primary next', type: 'button' }, [last ? 'See results' : 'Next']);
    b.addEventListener('click', function () {
      self.index++;
      if (self.index >= self.questions.length) self.renderResults();
      else self.renderQuestion();
    });
    return b;
  };

  Quiz.prototype.answerChoice = function (q, chosen, container, feedback) {
    var correct = chosen === q.correctIndex;
    var buttons = container.querySelectorAll('.option');
    buttons[q.correctIndex].classList.add('correct');
    if (!correct) buttons[chosen].classList.add('incorrect');
    this.lockOptions(container);
    this.answers.push({ q: q, correct: correct, given: q.options[chosen] });
    feedback.appendChild(el('p', { class: correct ? 'verdict ok' : 'verdict no',
      text: correct ? 'Correct' : 'Not quite' }));
    this.showExplanation(feedback, q);
  };

  Quiz.prototype.answerBool = function (q, chosen, container, feedback) {
    var correct = chosen === q.correct;
    var buttons = container.querySelectorAll('.option'); // [True, False]
    buttons[q.correct ? 0 : 1].classList.add('correct');
    if (!correct) buttons[chosen ? 0 : 1].classList.add('incorrect');
    this.lockOptions(container);
    this.answers.push({ q: q, correct: correct, given: chosen ? 'True' : 'False' });
    feedback.appendChild(el('p', { class: correct ? 'verdict ok' : 'verdict no',
      text: correct ? 'Correct' : 'Not quite' }));
    this.showExplanation(feedback, q);
  };

  Quiz.prototype.tally = function () {
    return {
      correct: this.answers.filter(function (a) { return a.correct; }).length,
      total: this.answers.length
    };
  };

  Quiz.prototype.renderResults = function () {
    var t = this.tally();
    var at = new Date().toISOString();
    var breakdown = objectiveBreakdown(this.answers);
    var fraction = t.total ? t.correct / t.total : 0;
    var scaled = estimateScaledScore(fraction);

    if (this.mode === 'exam') {
      saveJSON(EXAM_SCORE_KEY, { correct: t.correct, total: t.total, scaled: scaled, at: at });
    } else {
      saveScore(this.slug, { correct: t.correct, total: t.total, at: at });
    }
    saveObjectiveResults(this.source, breakdown, at);

    this.root.innerHTML = '';
    this.root.appendChild(this.mode === 'exam'
      ? renderExamScore(t, fraction, scaled)
      : el('article', { class: 'results' }, [
          el('h1', { text: 'Results' }),
          el('p', { class: 'score', text: t.correct + ' / ' + t.total + ' correct' })
        ]));
    if (breakdown.length) this.root.appendChild(renderObjectiveBreakdown(breakdown));

    var review = renderReview(this.answers, this.mode === 'exam');
    this.root.appendChild(review);
    highlightWithin(review);
    this.root.appendChild(this.resultActions());
  };

  Quiz.prototype.resultActions = function () {
    var self = this;
    var retake = el('button', { class: 'btn btn-primary', type: 'button' },
      [this.opts.resample ? 'New exam (resample)' : 'Retake (shuffle)']);
    retake.addEventListener('click', function () {
      if (self.opts.resample) return self.opts.resample();
      self.prepare(); self.start();
    });
    var back = el('a', { class: 'btn', role: 'button', href: 'index.html' }, ['Back to library']);
    return el('div', { class: 'actions center' }, [retake, exportButton(), back]);
  };

  function pct(correct, total) {
    return total ? Math.round(100 * correct / total) : 0;
  }

  function renderExamScore(t, fraction, scaled) {
    var pass = scaled >= PASS_MARK;
    return el('article', { class: 'results' }, [
      el('h1', { text: 'Mock exam results' }),
      el('p', { class: 'score', text: t.correct + ' / ' + t.total + ' correct (' + pct(t.correct, t.total) + '%)' }),
      el('div', { class: 'estimate ' + (pass ? 'ok' : 'no') }, [
        el('div', { class: 'estimate-num', text: scaled + ' / 1000' }),
        el('div', { class: 'estimate-verdict', text: (pass ? 'At or above' : 'Below') + ' the ' + PASS_MARK + ' pass mark' }),
        el('p', { class: 'estimate-note', text: 'Estimated scaled score = round(100 + 900 × fraction correct). ' +
          'Estimate — not the official scoring formula.' })
      ])
    ]);
  }

  // Table of objectives, weakest first. Rows under the pass ratio are flagged.
  function renderObjectiveBreakdown(breakdown) {
    var rows = breakdown.map(function (b) {
      return el('tr', { class: b.pct * 10 < PASS_MARK ? 'weak' : '' }, [
        el('td', { text: b.id }),
        el('td', { text: b.correct + ' / ' + b.total }),
        el('td', { text: b.pct + '%' })
      ]);
    });
    return el('article', { class: 'objectives' }, [
      el('h2', { text: 'By objective' }),
      el('p', { class: 'meta', text: 'Weakest first. Saved for "Export progress".' }),
      el('table', { class: 'objective-table' }, [
        el('thead', {}, [el('tr', {}, [el('th', { text: 'Objective' }), el('th', { text: 'Correct' }), el('th', { text: '%' })])]),
        el('tbody', {}, rows)
      ])
    ]);
  }

  function renderReview(answers, showSource) {
    var review = el('article', { class: 'review' }, [el('h2', { text: 'Review' })]);
    answers.forEach(function (a, i) {
      var item = el('div', { class: 'review-item ' + (a.correct ? 'ok' : 'no') });
      item.appendChild(el('div', { class: 'review-q', html: '<span class="review-num">' + (i + 1) + '.</span> ' + mdBlock(a.q.prompt) }));
      item.appendChild(el('p', { class: 'review-given', html: '<strong>Your answer:</strong> ' + mdInline(a.given || '(blank)') }));
      var correctAns = a.q.type === 'multiple-choice'
        ? a.q.options[a.q.correctIndex]
        : (a.q.correct ? 'True' : 'False');
      item.appendChild(el('p', { class: 'review-correct', html: '<strong>Correct:</strong> ' + mdInline(correctAns) }));
      if (a.q.explanation) item.appendChild(el('p', { class: 'review-exp', html: '<strong>Why:</strong> ' + mdInline(a.q.explanation) }));
      var meta = [];
      if (a.q.objectives && a.q.objectives.length) meta.push(a.q.objectives.join(', '));
      if (showSource && a.q.lectureSlug) {
        meta.push('<a href="notes.html?lecture=' + encodeURIComponent(a.q.lectureSlug) + '">' + esc(a.q.lectureTitle || a.q.lectureSlug) + '</a>');
      }
      if (meta.length) item.appendChild(el('p', { class: 'review-meta', html: meta.join('  ·  ') }));
      review.appendChild(item);
    });
    return review;
  }

  // ---- exports (node tests) + boot -------------------------------------
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      sampleExam: sampleExam,
      objectiveBreakdown: objectiveBreakdown,
      estimateScaledScore: estimateScaledScore,
      buildProgress: buildProgress,
      compareLectures: compareLectures,
      shuffle: shuffle,
      PASS_MARK: PASS_MARK
    };
  }
  if (typeof document === 'undefined') return;

  document.addEventListener('DOMContentLoaded', function () {
    var lib = document.getElementById('library-root');
    var quiz = document.getElementById('quiz-root');
    var notes = document.getElementById('notes-root');
    var exam = document.getElementById('exam-root');
    if (lib) initLibrary(lib);
    if (quiz) initQuiz(quiz);
    if (notes) initNotes(notes);
    if (exam) initExam(exam);
    Array.prototype.forEach.call(document.querySelectorAll('[data-action="export-progress"]'), function (b) {
      b.addEventListener('click', exportProgress);
    });
  });
})();
