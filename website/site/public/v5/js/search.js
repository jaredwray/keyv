/**
 * Docula client-side search.
 *
 * Loads the build-generated search-index.json on first open and powers a
 * keyboard-navigable search modal (Cmd/Ctrl+K to open, arrows to navigate,
 * Enter to select, Esc to close). No external dependencies.
 */
(function () {
  "use strict";

  var config = window.__doculaSearch || {};
  var indexUrl = config.indexUrl || "/search-index.json";

  var button = document.getElementById("search-button");
  var modal = document.getElementById("search-modal");
  var input = document.getElementById("search-input");
  var resultsEl = document.getElementById("search-results");
  var emptyEl = document.getElementById("search-empty");
  var emptyQueryEl = document.getElementById("search-empty-query");
  var initialEl = document.getElementById("search-initial");
  var clearBtn = document.getElementById("search-clear");

  if (!modal || !input || !resultsEl) {
    return;
  }

  var MAX_RESULTS = 12;
  var FILE_ICON =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>';
  var HASH_ICON =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>';

  var records = null;
  var loadingPromise = null;
  var currentResults = [];
  var activeIndex = -1;
  var debounceTimer = null;

  function loadIndex() {
    if (records) {
      return Promise.resolve(records);
    }
    if (loadingPromise) {
      return loadingPromise;
    }
    loadingPromise = fetch(indexUrl)
      .then(function (response) {
        return response.ok ? response.json() : { records: [] };
      })
      .then(function (data) {
        records = (data && data.records) || [];
        return records;
      })
      .catch(function () {
        records = [];
        return records;
      });
    return loadingPromise;
  }

  function isOpen() {
    return !modal.hasAttribute("hidden");
  }

  function openModal() {
    if (isOpen()) {
      return;
    }
    modal.removeAttribute("hidden");
    document.body.classList.add("search-open");
    loadIndex().then(function () {
      if (input.value) {
        runSearch(input.value);
      }
    });
    requestAnimationFrame(function () {
      input.focus();
      input.select();
    });
  }

  function closeModal() {
    if (!isOpen()) {
      return;
    }
    modal.setAttribute("hidden", "");
    document.body.classList.remove("search-open");
    if (button) {
      button.focus();
    }
  }

  function tokenize(query) {
    return query.toLowerCase().split(/\s+/).filter(Boolean);
  }

  function scoreRecord(record, tokens) {
    var title = (record.title || "").toLowerCase();
    var breadcrumb = (record.titles || []).join(" ").toLowerCase();
    var text = (record.text || "").toLowerCase();
    var haystack = title + " " + breadcrumb + " " + text;
    var score = 0;

    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];
      // AND semantics: every token must appear somewhere in the record.
      if (haystack.indexOf(token) === -1) {
        return 0;
      }
      if (title.indexOf(token) === 0) {
        score += 6;
      }
      if (title.indexOf(token) !== -1) {
        score += 10;
      }
      if (breadcrumb.indexOf(token) !== -1) {
        score += 4;
      }
      if (text.indexOf(token) !== -1) {
        score += 2;
      }
    }

    var phrase = tokens.join(" ");
    if (title.indexOf(phrase) !== -1) {
      score += 12;
    }
    if (text.indexOf(phrase) !== -1) {
      score += 3;
    }
    return score;
  }

  function search(query) {
    var tokens = tokenize(query);
    if (tokens.length === 0 || !records) {
      return [];
    }

    var scored = [];
    for (var i = 0; i < records.length; i++) {
      var score = scoreRecord(records[i], tokens);
      if (score > 0) {
        scored.push({ record: records[i], score: score });
      }
    }

    scored.sort(function (a, b) {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return (a.record.title || "").length - (b.record.title || "").length;
    });

    return scored.slice(0, MAX_RESULTS).map(function (item) {
      return item.record;
    });
  }

  function makeSnippet(text, tokens) {
    if (!text) {
      return "";
    }
    var lower = text.toLowerCase();
    var pos = -1;
    for (var i = 0; i < tokens.length; i++) {
      var found = lower.indexOf(tokens[i]);
      if (found !== -1 && (pos === -1 || found < pos)) {
        pos = found;
      }
    }

    var radius = 60;
    var anchor = pos === -1 ? 0 : pos;
    var start = Math.max(0, anchor - radius);
    var end = Math.min(text.length, anchor + radius * 2);
    var snippet = text.slice(start, end);
    if (start > 0) {
      snippet = "… " + snippet;
    }
    if (end < text.length) {
      snippet = snippet + " …";
    }
    return snippet;
  }

  function appendHighlighted(parent, text, tokens) {
    if (!text) {
      return;
    }
    if (!tokens.length) {
      parent.appendChild(document.createTextNode(text));
      return;
    }

    var escaped = tokens.map(function (token) {
      return token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    });
    var pattern = new RegExp("(" + escaped.join("|") + ")", "gi");
    var lastIndex = 0;
    var match = pattern.exec(text);
    while (match !== null) {
      if (match.index > lastIndex) {
        parent.appendChild(
          document.createTextNode(text.slice(lastIndex, match.index)),
        );
      }
      var mark = document.createElement("mark");
      mark.className = "search-result__mark";
      mark.textContent = match[0];
      parent.appendChild(mark);
      lastIndex = match.index + match[0].length;
      if (match.index === pattern.lastIndex) {
        pattern.lastIndex++;
      }
      match = pattern.exec(text);
    }
    if (lastIndex < text.length) {
      parent.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
  }

  function createResultItem(record, index, tokens) {
    var item = document.createElement("li");
    item.className = "search-result";
    item.id = "search-result-" + index;
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", "false");

    var link = document.createElement("a");
    link.className = "search-result__link";
    link.href = record.url;
    link.tabIndex = -1;

    var icon = document.createElement("span");
    icon.className = "search-result__icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML =
      record.url && record.url.indexOf("#") !== -1 ? HASH_ICON : FILE_ICON;
    link.appendChild(icon);

    var content = document.createElement("div");
    content.className = "search-result__content";

    if (record.titles && record.titles.length) {
      var breadcrumb = document.createElement("div");
      breadcrumb.className = "search-result__breadcrumb";
      breadcrumb.textContent = record.titles.join(" › ");
      content.appendChild(breadcrumb);
    }

    var title = document.createElement("div");
    title.className = "search-result__title";
    appendHighlighted(title, record.title || "Untitled", tokens);
    content.appendChild(title);

    var snippet = makeSnippet(record.text, tokens);
    if (snippet) {
      var textEl = document.createElement("div");
      textEl.className = "search-result__text";
      appendHighlighted(textEl, snippet, tokens);
      content.appendChild(textEl);
    }

    link.appendChild(content);
    item.appendChild(link);

    item.addEventListener("mousemove", function () {
      setActive(index);
    });
    link.addEventListener("click", function () {
      closeModal();
    });

    return item;
  }

  function render(resultList, tokens) {
    resultsEl.textContent = "";
    currentResults = resultList;
    activeIndex = resultList.length ? 0 : -1;

    for (var i = 0; i < resultList.length; i++) {
      resultsEl.appendChild(createResultItem(resultList[i], i, tokens));
    }
    updateActive();
  }

  function setActive(index) {
    if (index === activeIndex) {
      return;
    }
    activeIndex = index;
    updateActive();
  }

  function updateActive() {
    var items = resultsEl.children;
    for (var i = 0; i < items.length; i++) {
      var selected = i === activeIndex;
      items[i].setAttribute("aria-selected", selected ? "true" : "false");
      items[i].classList.toggle("search-result--active", selected);
    }
    if (activeIndex >= 0 && items[activeIndex]) {
      input.setAttribute("aria-activedescendant", items[activeIndex].id);
      items[activeIndex].scrollIntoView({ block: "nearest" });
    } else {
      input.setAttribute("aria-activedescendant", "");
    }
  }

  function showState(state, query) {
    if (initialEl) {
      initialEl.toggleAttribute("hidden", state !== "initial");
    }
    if (emptyEl) {
      emptyEl.toggleAttribute("hidden", state !== "empty");
    }
    resultsEl.toggleAttribute("hidden", state !== "results");
    if (state === "empty" && emptyQueryEl) {
      emptyQueryEl.textContent = query;
    }
  }

  function runSearch(query) {
    var trimmed = query.trim();
    if (clearBtn) {
      clearBtn.toggleAttribute("hidden", trimmed.length === 0);
    }

    if (!trimmed) {
      render([], []);
      showState("initial");
      return;
    }

    // Index may still be loading; the open handler re-runs once it resolves.
    if (!records) {
      return;
    }

    var tokens = tokenize(trimmed);
    var resultList = search(trimmed);
    render(resultList, tokens);
    showState(resultList.length ? "results" : "empty", trimmed);
  }

  function navigate(url) {
    closeModal();
    window.location.assign(url);
  }

  input.addEventListener("input", function () {
    var query = input.value;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function () {
      runSearch(query);
    }, 80);
  });

  input.addEventListener("keydown", function (event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (currentResults.length) {
        setActive((activeIndex + 1) % currentResults.length);
      }
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (currentResults.length) {
        setActive(
          (activeIndex - 1 + currentResults.length) % currentResults.length,
        );
      }
    } else if (event.key === "Enter") {
      event.preventDefault();
      // Flush any pending debounced search so Enter acts on the current input
      // rather than stale results when typing then immediately pressing Enter.
      clearTimeout(debounceTimer);
      runSearch(input.value);
      if (activeIndex >= 0 && currentResults[activeIndex]) {
        navigate(currentResults[activeIndex].url);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeModal();
    }
  });

  if (clearBtn) {
    clearBtn.addEventListener("click", function () {
      input.value = "";
      runSearch("");
      input.focus();
    });
  }

  if (button) {
    button.addEventListener("click", openModal);
  }

  modal.addEventListener("click", function (event) {
    var target = event.target;
    if (target && target.hasAttribute && target.hasAttribute("data-search-close")) {
      closeModal();
    }
  });

  document.addEventListener("keydown", function (event) {
    var key = (event.key || "").toLowerCase();
    if ((event.metaKey || event.ctrlKey) && key === "k") {
      event.preventDefault();
      if (isOpen()) {
        closeModal();
      } else {
        openModal();
      }
      return;
    }
    if (key === "escape" && isOpen()) {
      event.preventDefault();
      closeModal();
      return;
    }
    if (key === "/" && !isOpen()) {
      var active = document.activeElement;
      var tag = active ? active.tagName : "";
      var editable = active ? active.isContentEditable : false;
      if (tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT" && !editable) {
        event.preventDefault();
        openModal();
      }
    }
  });

  showState("initial");
})();
