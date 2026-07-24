/**
 * Boot-time + runtime failure UI — copy/paste friendly error panel.
 * Loaded as a classic script before `main.js` so import parse errors are caught.
 */
(function () {
  let bootReported = false;

  function formatError(err, extra) {
    const parts = [];
    if (extra) parts.push(extra);
    if (err == null) return parts.join('\n\n') || 'Unknown error';
    if (typeof err === 'string') {
      parts.push(err);
      return parts.join('\n\n');
    }
    if (err.message) parts.push(String(err.message));
    if (err.stack) parts.push(String(err.stack));
    else if (err.toString && err.toString() !== '[object Object]') parts.push(String(err));
    return parts.filter(Boolean).join('\n\n');
  }

  function formatWindowError(event) {
    const parts = [];
    if (event?.message) parts.push(String(event.message));
    if (event?.filename) {
      parts.push(
        `File: ${event.filename}:${event.lineno || 0}:${event.colno || 0}`
      );
    }
    if (event?.error) {
      const nested = formatError(event.error);
      if (nested && !parts.includes(nested)) parts.push(nested);
    }
    return parts.filter(Boolean).join('\n\n') || 'Unknown error';
  }

  function ensureOverlay() {
    let root = document.getElementById('load-error-overlay');
    if (root) return root;

    root = document.createElement('div');
    root.id = 'load-error-overlay';
    root.className = 'load-error-overlay hidden';
    root.setAttribute('role', 'alertdialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'load-error-title');
    root.innerHTML =
      '<div class="load-error-card">' +
      '<header class="load-error-header">' +
      '<h2 id="load-error-title">Hyperdrift failed to load</h2>' +
      '<button type="button" id="load-error-dismiss" class="load-error-btn">Dismiss</button>' +
      '</header>' +
      '<p class="load-error-hint">Copy the text below and paste it into your bug report or chat.</p>' +
      '<textarea id="load-error-text" class="load-error-text" readonly spellcheck="false"></textarea>' +
      '<div class="load-error-actions">' +
      '<button type="button" id="load-error-copy" class="load-error-btn load-error-btn-primary">Copy error</button>' +
      '<button type="button" id="load-error-select" class="load-error-btn">Select all</button>' +
      '</div>' +
      '</div>';
    document.body.appendChild(root);

    const textEl = root.querySelector('#load-error-text');
    root.querySelector('#load-error-dismiss')?.addEventListener('click', () => {
      root.classList.add('hidden');
    });
    root.querySelector('#load-error-select')?.addEventListener('click', () => {
      textEl?.focus();
      textEl?.select();
    });
    root.querySelector('#load-error-copy')?.addEventListener('click', async () => {
      const text = textEl?.value || '';
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          textEl?.focus();
          textEl?.select();
          document.execCommand('copy');
        }
        const copyBtn = root.querySelector('#load-error-copy');
        if (copyBtn) {
          const prev = copyBtn.textContent;
          copyBtn.textContent = 'Copied!';
          setTimeout(() => {
            copyBtn.textContent = prev;
          }, 1400);
        }
      } catch {
        textEl?.focus();
        textEl?.select();
      }
    });

    return root;
  }

  function showFailure(title, detail, { alertUser = false, once = false } = {}) {
    if (once && bootReported) return;
    if (once) bootReported = true;

    const stamp = new Date().toISOString();
    const body = `[${stamp}] ${title}\n\n${detail}`;
    const root = ensureOverlay();
    const textEl = root.querySelector('#load-error-text');
    const titleEl = root.querySelector('#load-error-title');
    if (titleEl) titleEl.textContent = title || 'Hyperdrift error';
    if (textEl) {
      textEl.value = body;
      textEl.scrollTop = 0;
    }
    root.classList.remove('hidden');
    textEl?.focus();
    textEl?.select();

    if (alertUser) {
      try {
        window.alert(
          'Hyperdrift failed to load.\n\nAn error panel is open with the full message — use Copy error and paste it into chat.'
        );
      } catch {
        /* ignore */
      }
    }
  }

  window.__hyperdriftReportLoadError = function (title, err, extra) {
    showFailure(title || 'Hyperdrift failed to load', formatError(err, extra), {
      alertUser: true,
      once: true,
    });
  };

  window.__hyperdriftReportRuntimeError = function (context, err, extra) {
    showFailure(context || 'Hyperdrift runtime error', formatError(err, extra), {
      alertUser: false,
      once: false,
    });
  };

  window.__hyperdriftMarkBootOk = function () {
    window.__hyperdriftBootComplete = true;
  };

  window.addEventListener(
    'error',
    function (event) {
      if (window.__hyperdriftBootComplete) {
        window.__hyperdriftReportRuntimeError(
          'Uncaught script error',
          formatWindowError(event)
        );
        return;
      }
      const tag = event.target?.tagName;
      if (tag && tag !== 'SCRIPT') return;
      showFailure('Module / script error', formatWindowError(event), {
        alertUser: true,
        once: true,
      });
    },
    true
  );

  window.addEventListener('unhandledrejection', function (event) {
    if (window.__hyperdriftBootComplete) {
      window.__hyperdriftReportRuntimeError(
        'Unhandled promise rejection',
        formatError(event.reason)
      );
      return;
    }
    showFailure(
      'Unhandled promise rejection during load',
      formatError(event.reason),
      { alertUser: true, once: true }
    );
  });
})();
