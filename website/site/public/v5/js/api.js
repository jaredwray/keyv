document.addEventListener('DOMContentLoaded', function() {
  // Toggle operations
  document.querySelectorAll('[data-toggle="operation"]').forEach(function(header) {
    header.addEventListener('click', function() {
      this.closest('.api-operation').classList.toggle('api-operation--collapsed');
    });
  });

  // Toggle sidebar groups
  document.querySelectorAll('.api-sidebar__group-toggle').forEach(function(btn) {
    btn.addEventListener('click', function() {
      this.closest('.api-sidebar__group').classList.toggle('api-sidebar__group--collapsed');
    });
  });

  // Code example tabs
  document.querySelectorAll('.api-code-tabs').forEach(function(tabs) {
    var container = tabs.closest('.api-code-examples');
    tabs.querySelectorAll('.api-code-tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        var target = this.getAttribute('data-tab');
        container.querySelectorAll('.api-code-tab').forEach(function(t) { t.classList.remove('api-code-tab--active'); });
        container.querySelectorAll('.api-code-panel').forEach(function(p) { p.classList.remove('api-code-panel--active'); });
        this.classList.add('api-code-tab--active');
        var panel = container.querySelector('[data-panel="' + target + '"]');
        if (panel) panel.classList.add('api-code-panel--active');
      });
    });
  });

  // Copy to clipboard
  document.querySelectorAll('[data-copy]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var code = this.closest('.api-code-panel').querySelector('code');
      if (code) {
        navigator.clipboard.writeText(code.textContent).then(function() {
          btn.textContent = 'Copied!';
          setTimeout(function() { btn.textContent = 'Copy'; }, 2000);
        });
      }
    });
  });

  // Search
  var searchInput = document.getElementById('api-search');
  if (searchInput) {
    searchInput.addEventListener('input', function() {
      var query = this.value.toLowerCase();
      document.querySelectorAll('.api-sidebar__item').forEach(function(item) {
        var path = (item.getAttribute('data-path') || '').toLowerCase();
        var method = (item.getAttribute('data-method') || '').toLowerCase();
        var text = item.textContent.toLowerCase();
        var match = !query || path.indexOf(query) !== -1 || method.indexOf(query) !== -1 || text.indexOf(query) !== -1;
        item.style.display = match ? '' : 'none';
      });
      document.querySelectorAll('.api-operation').forEach(function(op) {
        var path = (op.querySelector('.api-operation__path') || {}).textContent || '';
        var summary = (op.querySelector('.api-operation__summary') || {}).textContent || '';
        var method = (op.querySelector('.method-badge') || {}).textContent || '';
        var match = !query || path.toLowerCase().indexOf(query) !== -1 || summary.toLowerCase().indexOf(query) !== -1 || method.toLowerCase().indexOf(query) !== -1;
        op.style.display = match ? '' : 'none';
      });
      document.querySelectorAll('.api-group').forEach(function(group) {
        var visible = group.querySelectorAll('.api-operation:not([style*="display: none"])');
        group.style.display = visible.length > 0 || !query ? '' : 'none';
      });
    });
  }

  // Scroll spy
  var sidebarLinks = document.querySelectorAll('.api-sidebar__item');
  if (sidebarLinks.length > 0) {
    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          sidebarLinks.forEach(function(l) { l.classList.remove('api-sidebar__item--active'); });
          var link = document.querySelector('.api-sidebar__item[href="#' + entry.target.id + '"]');
          if (link) link.classList.add('api-sidebar__item--active');
        }
      });
    }, { rootMargin: '-80px 0px -70% 0px' });

    document.querySelectorAll('.api-operation').forEach(function(op) {
      observer.observe(op);
    });
  }

  // Mobile sidebar toggle
  var sidebarToggle = document.getElementById('api-sidebar-toggle');
  var sidebar = document.getElementById('api-sidebar');
  if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener('click', function() {
      sidebar.classList.toggle('api-sidebar--mobile-open');
    });
    sidebar.querySelectorAll('.api-sidebar__item').forEach(function(link) {
      link.addEventListener('click', function() {
        sidebar.classList.remove('api-sidebar--mobile-open');
      });
    });
  }

  // Collapse sidebar groups that have a toggle button (named groups only)
  document.querySelectorAll('.api-sidebar__group').forEach(function(group) {
    if (group.querySelector('.api-sidebar__group-toggle')) {
      group.classList.add('api-sidebar__group--collapsed');
    }
  });

  // Auth type selector: show/hide value input based on OpenAPI securitySchemes
  // IDs are indexed for multi-spec (e.g. api-auth-type-0), so find by class
  var authTypeSelect = document.querySelector('.api-auth__type');
  var authValueInput = document.querySelector('.api-auth__value');
  var cookieStatusEl = document.querySelector('.api-auth__cookie-status');
  if (authTypeSelect && authValueInput) {
    function getSelectedSchemeData() {
      var option = authTypeSelect.options[authTypeSelect.selectedIndex];
      return {
        key: option.value,
        type: option.getAttribute('data-scheme-type'),
        scheme: option.getAttribute('data-scheme-scheme'),
        name: option.getAttribute('data-scheme-name'),
        inLocation: option.getAttribute('data-scheme-in')
      };
    }
    function updateAuthUI() {
      var data = getSelectedSchemeData();
      if (data.key === 'none') {
        authValueInput.classList.add('api-auth__value--hidden');
        authValueInput.value = '';
        if (cookieStatusEl) cookieStatusEl.classList.add('api-auth__cookie-status--hidden');
      } else if (data.type === 'apiKey' && data.inLocation === 'cookie') {
        authValueInput.classList.add('api-auth__value--hidden');
        authValueInput.value = '';
        if (cookieStatusEl) {
          cookieStatusEl.classList.remove('api-auth__cookie-status--hidden');
          var auth = window.__doculaAuth || { loggedIn: false };
          cookieStatusEl.textContent = auth.loggedIn ? 'Logged in' : 'Not logged in — use Login button above';
          cookieStatusEl.className = 'api-auth__cookie-status' + (auth.loggedIn ? ' api-auth__cookie-status--ok' : ' api-auth__cookie-status--warn');
        }
      } else {
        authValueInput.classList.remove('api-auth__value--hidden');
        if (data.type === 'apiKey') {
          authValueInput.placeholder = 'Enter API key...';
        } else if (data.scheme === 'bearer') {
          authValueInput.placeholder = 'Enter bearer token...';
        } else {
          authValueInput.placeholder = 'Enter value...';
        }
        if (cookieStatusEl) cookieStatusEl.classList.add('api-auth__cookie-status--hidden');
      }
    }
    var savedAuth = localStorage.getItem('docula-api-auth-type');
    if (savedAuth) {
      for (var i = 0; i < authTypeSelect.options.length; i++) {
        if (authTypeSelect.options[i].value === savedAuth) {
          authTypeSelect.selectedIndex = i;
          break;
        }
      }
    }
    authTypeSelect.addEventListener('change', function() {
      localStorage.setItem('docula-api-auth-type', authTypeSelect.value);
      updateAuthUI();
    });
    document.addEventListener('docula-auth-change', updateAuthUI);
    updateAuthUI();
  }

  // Helper: expand an operation and its corresponding sidebar group
  function expandOperationAndGroup(operationEl) {
    if (!operationEl) return;
    operationEl.classList.remove('api-operation--collapsed');
    var contentGroup = operationEl.closest('.api-group');
    if (contentGroup) {
      var groupId = contentGroup.id.replace(/^group-/, '');
      var sidebarGroup = document.querySelector('.api-sidebar__group[data-group="' + groupId + '"]');
      if (sidebarGroup) sidebarGroup.classList.remove('api-sidebar__group--collapsed');
    }
  }

  // Expand operation via hash, or expand the first operation by default
  if (window.location.hash) {
    var target = document.querySelector(window.location.hash);
    if (target && target.classList.contains('api-operation')) {
      expandOperationAndGroup(target);
    }
  } else {
    expandOperationAndGroup(document.querySelector('.api-operation'));
  }

  window.addEventListener('hashchange', function() {
    if (window.location.hash) {
      var target = document.querySelector(window.location.hash);
      if (target && target.classList.contains('api-operation')) {
        expandOperationAndGroup(target);
      }
    }
  });

  // Try It - Response tab switching
  document.querySelectorAll('.api-try-it__response-tabs').forEach(function(tabs) {
    var container = tabs.closest('.api-try-it__response');
    tabs.querySelectorAll('.api-try-it__rtab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        var target = this.getAttribute('data-try-rtab');
        container.querySelectorAll('.api-try-it__rtab').forEach(function(t) { t.classList.remove('api-try-it__rtab--active'); });
        container.querySelectorAll('.api-try-it__rpanel').forEach(function(p) { p.classList.remove('api-try-it__rpanel--active'); });
        this.classList.add('api-try-it__rtab--active');
        var panel = container.querySelector('[data-try-rpanel="' + target + '"]');
        if (panel) panel.classList.add('api-try-it__rpanel--active');
      });
    });
  });

  // Try It - Helpers
  function getStatusClass(status) {
    if (status >= 200 && status < 300) return '2xx';
    if (status >= 300 && status < 400) return '3xx';
    if (status >= 400 && status < 500) return '4xx';
    if (status >= 500) return '5xx';
    return 'error';
  }

  function formatBody(text, contentType) {
    if (contentType && contentType.indexOf('json') !== -1) {
      try { return JSON.stringify(JSON.parse(text), null, 2); } catch(e) { /* ignore */ }
    }
    return text;
  }

  function resetResponseTabs(responseArea) {
    var tabs = responseArea.querySelectorAll('.api-try-it__rtab');
    var panels = responseArea.querySelectorAll('.api-try-it__rpanel');
    tabs.forEach(function(t) { t.classList.remove('api-try-it__rtab--active'); });
    panels.forEach(function(p) { p.classList.remove('api-try-it__rpanel--active'); });
    tabs[0].classList.add('api-try-it__rtab--active');
    panels[0].classList.add('api-try-it__rpanel--active');
  }

  // Try It - Send request
  document.querySelectorAll('[data-try-send]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var tryIt = this.closest('.api-try-it');
      var method = tryIt.getAttribute('data-method');
      var pathTemplate = tryIt.getAttribute('data-path');
      var serverSelect = tryIt.querySelector('[data-try-server]');
      var baseUrl = serverSelect ? serverSelect.value : '';

      // Substitute path params
      var path = pathTemplate;
      tryIt.querySelectorAll('[data-param-in="path"]').forEach(function(row) {
        var name = row.getAttribute('data-param-name');
        var value = row.querySelector('[data-try-param]').value;
        if (value) {
          path = path.replace('{' + name + '}', encodeURIComponent(value));
        }
      });

      // Build query string
      var queryParts = [];
      tryIt.querySelectorAll('[data-param-in="query"]').forEach(function(row) {
        var name = row.getAttribute('data-param-name');
        var value = row.querySelector('[data-try-param]').value;
        if (value) queryParts.push(encodeURIComponent(name) + '=' + encodeURIComponent(value));
      });
      var queryString = queryParts.length ? '?' + queryParts.join('&') : '';

      // Build headers
      var headers = {};
      tryIt.querySelectorAll('[data-param-in="header"]').forEach(function(row) {
        var name = row.getAttribute('data-param-name');
        var value = row.querySelector('[data-try-param]').value;
        if (value) headers[name] = value;
      });

      // Inject global auth header from selected security scheme
      var authType = document.querySelector('.api-auth__type');
      var authValue = document.querySelector('.api-auth__value');
      var useCookieAuth = false;
      if (authType && authType.value !== 'none') {
        var authOption = authType.options[authType.selectedIndex];
        var schemeType = authOption.getAttribute('data-scheme-type');
        var schemeName = authOption.getAttribute('data-scheme-name');
        var schemeIn = authOption.getAttribute('data-scheme-in');
        var schemeScheme = authOption.getAttribute('data-scheme-scheme');
        if (schemeType === 'apiKey' && schemeIn === 'cookie') {
          useCookieAuth = true;
        } else if (authValue && authValue.value.trim()) {
          var authVal = authValue.value.trim();
          if (schemeType === 'apiKey' && schemeIn === 'header' && schemeName) {
            headers[schemeName] = authVal;
          } else if (schemeType === 'http' && schemeScheme === 'bearer') {
            headers['Authorization'] = 'Bearer ' + authVal;
          } else if (schemeType === 'apiKey' && schemeIn === 'query' && schemeName) {
            queryParts.push(encodeURIComponent(schemeName) + '=' + encodeURIComponent(authVal));
            queryString = '?' + queryParts.join('&');
          }
        }
      }

      // Body
      var bodyTextarea = tryIt.querySelector('[data-try-body]');
      var body = bodyTextarea ? bodyTextarea.value.trim() : '';
      if (body && !headers['Content-Type']) {
        headers['Content-Type'] = tryIt.getAttribute('data-content-type') || 'application/json';
      }

      var url = baseUrl + path + queryString;
      var fetchOptions = { method: method, headers: headers };
      if (useCookieAuth) {
        fetchOptions.credentials = 'include';
      }
      if (body && method !== 'GET' && method !== 'HEAD') {
        fetchOptions.body = body;
      }

      // Loading state
      btn.disabled = true;
      btn.textContent = 'Sending...';
      var startTime = performance.now();

      var responseArea = tryIt.querySelector('[data-try-response]');
      var statusEl = tryIt.querySelector('[data-try-status]');
      var timeEl = tryIt.querySelector('[data-try-time]');
      var bodyEl = tryIt.querySelector('[data-try-response-body]');
      var headersEl = tryIt.querySelector('[data-try-response-headers]');

      fetch(url, fetchOptions).then(function(response) {
        var elapsed = Math.round(performance.now() - startTime);
        var statusClass = getStatusClass(response.status);

        statusEl.textContent = response.status + ' ' + response.statusText;
        statusEl.className = 'api-try-it__response-status api-try-it__response-status--' + statusClass;
        timeEl.textContent = elapsed + 'ms';

        // Collect response headers
        var headerLines = [];
        response.headers.forEach(function(value, key) {
          headerLines.push(key + ': ' + value);
        });
        headersEl.textContent = headerLines.join('\n') || 'No headers';

        var ct = response.headers.get('content-type') || '';
        return response.text().then(function(text) {
          bodyEl.textContent = formatBody(text, ct);
          responseArea.classList.remove('api-try-it__response--hidden');
          resetResponseTabs(responseArea);
        });
      }).catch(function(err) {
        statusEl.textContent = 'Error';
        statusEl.className = 'api-try-it__response-status api-try-it__response-status--error';
        timeEl.textContent = '';
        headersEl.textContent = '';
        bodyEl.textContent = 'Request failed: ' + err.message + '\n\nThis may be caused by CORS restrictions. The API server must include appropriate CORS headers to allow browser requests.';
        responseArea.classList.remove('api-try-it__response--hidden');
        resetResponseTabs(responseArea);
      }).finally(function() {
        btn.disabled = false;
        btn.textContent = 'Send Request';
      });
    });
  });
});
