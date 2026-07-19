import type { Router } from "express";
import path from "node:path";

export function registerWebRoutes(router: Router): void {
  router.get("/manifest.json", (_req, res) => res.sendFile(path.resolve("src/web/static/manifest.json")));
  router.get("/sw.js", (_req, res) => res.sendFile(path.resolve("src/web/static/sw.js")));

  router.get("/", (_req, res) => {
    res.type("html").send(renderPage("Dashboard", `
      <div class="dashboard-shell">
        <aside class="dashboard-sidebar">
          <nav id="layout-switcher" class="sidebar-nav dashboard-views" aria-label="Dashboard views">
            <button class="nav-btn" data-layout="overview">Overview</button>
            <button class="nav-btn" data-layout="timeline">Activity Timeline</button>
            <button class="nav-btn" data-layout="explorer">Media Explorer</button>
            <button class="nav-btn" data-layout="people">People</button>
            <button class="nav-btn" data-layout="progress">Progress</button>
          </nav>
          <div class="sidebar-section dashboard-members">
            <h3>Household Members</h3>
            <div id="sidebar-presence"></div>
          </div>
          <div id="sidebar-overview-sections"></div>
        </aside>
        <div class="dashboard-main">
          <header class="dashboard-header">
            <div class="header-titles">
              <h2 id="view-title" tabindex="-1" style="margin:0; font-size:1.8rem;">Overview</h2>
              <p id="view-subtitle" style="margin:4px 0 0; color:var(--text-muted); font-size:0.95rem;">Everything everyone is enjoying.</p>
            </div>
            <div id="stat-ribbon" class="stat-ribbon"></div>
          </header>
          <form id="dashboard-filters" class="dashboard-filters">
            <select name="category">
              <option value="">All Categories</option>
              <option value="movie">Movies</option>
              <option value="tv">TV</option>
              <option value="classic_tv">Classic TV</option>
              <option value="anime">Anime</option>
              <option value="audiobook">Audiobooks</option>
            </select>
            <select name="user"><option value="">All Users</option></select>
            <input type="search" name="search" placeholder="Search title...">
            <button type="submit" class="btn">Apply</button>
            <a id="csv-export" href="/api/dashboard/export.csv" class="btn" download>CSV</a>
          </form>
          <p id="active-filters" class="active-filters"></p>
          <div id="dashboard-content"></div>
        </div>
        <dialog id="detail-dialog" aria-labelledby="detail-workspace-heading" aria-describedby="detail-workspace-subtitle">
          <section class="detail-workspace-shell" data-testid="detail-workspace">
            <header class="detail-workspace-header">
              <div class="detail-workspace-heading-copy">
                <p class="eyebrow" id="detail-workspace-eyebrow">Media detail</p>
                <h2 id="detail-workspace-heading">Loading detail</h2>
                <p id="detail-workspace-subtitle" hidden></p>
              </div>
              <div class="detail-workspace-actions">
                <span class="detail-refresh-status" data-testid="detail-refresh-status" role="status" aria-live="polite"></span>
                <button type="button" class="detail-refresh-button btn" data-detail-refresh aria-label="Refresh from Plex" disabled></button>
                <button type="button" class="dialog-close" aria-label="Close media detail">&times;</button>
              </div>
            </header>
            <div id="detail-content" class="detail-workspace-scroll" data-testid="detail-workspace-scroll"></div>
          </section>
        </dialog>
      </div>
      <script src="/static/dashboard.js?v=3-6-2b-archive-identity-review"></script>
    `));
  });

  router.get("/copy", (_req, res) => {
    res.type("html").send(renderPage("Copy History", `
      <div class="copy-container">
        <!-- Help/Legend Section -->
        <section class="copy-help-section card">
          <details>
            <summary class="help-summary"><strong>💡 Help & Status Legend</strong> (Click to expand)</summary>
            <div class="help-content">
              <p>When running a history sync preview, each item will resolve to one of the following statuses:</p>
              <ul>
                <li><strong>eligible:</strong> The item was watched by the source user, but is <em>not</em> marked as watched in the target user's Plex library.</li>
                <li><strong>already_watched:</strong> The target user has already watched this item in their Plex library.</li>
                <li><strong>already_copied:</strong> The item was successfully synced to the target user via a prior copy job.</li>
                <li><strong>failed (e.g. PLEX_RESTRICTED_MEDIA):</strong> The media item exists on the server, but the target user cannot access it due to library sharing restrictions.</li>
                <li><strong>failed (e.g. PLEX_NO_MATCHING_MEDIA):</strong> The media item could not be found on the server at all.</li>
              </ul>

              <p style="margin-top: 12px; border-top: 1px solid #21262d; padding-top: 12px;"><strong>👉 Selective Sync Instructions:</strong></p>
              <ul>
                <li>To select/deselect an <strong>eligible</strong> item, click anywhere on its row. Selected rows will be highlighted in blue.</li>
                <li>To select a range of items, click on the first row, then hold <strong>Shift</strong> and click on the last row.</li>
                <li>Only highlighted rows will be copied when you click <strong>Apply Copy</strong>. All unselected rows will be marked as skipped.</li>
              </ul>
            </div>
          </details>
        </section>

        <!-- Form/Filters Section -->
        <section class="copy-form-section card">
          <h2>Configure Sync Job</h2>
          <form id="preview-form" class="grid-form">
            <div class="form-row">
              <div class="form-col">
                <label for="sourceUser">Source User</label>
                <select id="sourceUser" name="sourceUser" required>
                  <option value="">Select source user...</option>
                </select>
              </div>
              <div class="form-col">
                <label>Target Users</label>
                <div id="targetUsersContainer" class="checkbox-group">
                  <p class="text-muted">Select a source user first.</p>
                </div>
              </div>
            </div>

            <fieldset>
              <legend>Optional Filters</legend>
              <div class="filter-grid">
                <div class="form-col">
                  <label for="libraryName">Library Name</label>
                  <select id="libraryName" name="libraryName">
                    <option value="">All Libraries</option>
                  </select>
                </div>
                <div class="form-col">
                  <label for="mediaType">Media Type</label>
                  <select id="mediaType" name="mediaType">
                    <option value="">All</option>
                    <option value="movie">Movie</option>
                    <option value="episode">Episode</option>
                  </select>
                </div>
                <div class="form-col" id="showTitleCol" style="display: none;">
                  <label for="showTitle">Show Title</label>
                  <select id="showTitle" name="showTitle" disabled>
                    <option value="">N/A (Select a TV library)</option>
                  </select>
                </div>
                <div class="form-col" id="seasonNumberCol" style="display: none;">
                  <label for="seasonNumber">Season Number</label>
                  <input type="number" id="seasonNumber" name="seasonNumber" min="0" placeholder="e.g. 1">
                </div>
                <div class="form-col">
                  <label for="dateFrom">Date From</label>
                  <input type="date" id="dateFrom" name="dateFrom">
                </div>
                <div class="form-col">
                  <label for="dateTo">Date To</label>
                  <input type="date" id="dateTo" name="dateTo">
                </div>
              </div>
            </fieldset>

            <button type="submit" id="preview-btn" class="btn btn-primary">Generate Preview</button>
          </form>
        </section>

        <!-- Status/Feedback Section -->
        <div id="status-feedback" class="status-feedback alert hidden"></div>

        <!-- Preview Results Section (Initially Hidden) -->
        <section id="preview-results-section" class="copy-results-section card hidden">
          <h2>Job Preview Summary</h2>
          <div class="summary-cards">
            <div class="summary-card eligible">
              <span class="card-count" id="summary-eligible">0</span>
              <span class="card-label">Eligible to Copy</span>
            </div>
            <div class="summary-card watched">
              <span class="card-count" id="summary-watched">0</span>
              <span class="card-label">Already Watched</span>
            </div>
            <div class="summary-card copied">
              <span class="card-count" id="summary-copied">0</span>
              <span class="card-label">Already Copied (DB)</span>
            </div>
            <div class="summary-card failed">
              <span class="card-count" id="summary-failed">0</span>
              <span class="card-label">Unreachable/Failed</span>
            </div>
          </div>

          <div id="apply-action-bar" class="apply-action-bar hidden">
            <p>Review the items below. Click "Apply Copy" to synchronize watched states.</p>
            <button id="apply-btn" class="btn btn-success">Apply Copy</button>
          </div>

          <div class="items-table-container">
            <table class="preview-table">
              <thead>
                <tr>
                  <th>Select</th>
                  <th>Target User</th>
                  <th>Media Type</th>
                  <th>Title</th>
                  <th>Season/Episode</th>
                  <th>Watched At</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody id="preview-items-body">
                <!-- Dynamic rows -->
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <script>
        // Fetch and populate users
        let usersList = [];

        function userLabel(user) {
          return (user && (user.alias || user.plex_username)) || '';
        }
        
        function renderTargets(selectedSource) {
          const targetContainer = document.getElementById('targetUsersContainer');
          if (!selectedSource) {
            targetContainer.innerHTML = '<p class="text-muted">Select a source user first.</p>';
            return;
          }
          
          // Allow targeting any user except the source user
          const targets = usersList.filter(u => u.plex_username !== selectedSource);
          if (targets.length === 0) {
            targetContainer.innerHTML = '<p class="text-muted">No other Plex library users available.</p>';
          } else {
            targetContainer.innerHTML = targets.map(u => {
              const displayName = userLabel(u);
              return '<label class="checkbox-label"><input type="checkbox" name="targetUsers" value="' + u.plex_username + '"> ' + displayName + '</label>';
            }).join('');
          }
        }

        function escapeHtml(str) {
          if (!str) return '';
          return str.replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#039;');
        }

        fetch('/api/dashboard/users')
          .then(r => r.json())
          .then(data => {
            if (data.ok && data.users) {
              usersList = data.users;
              const sourceSelect = document.getElementById('sourceUser');
              
              // Populate source users dropdown with visible dashboard users
              usersList.forEach(u => {
                const opt = document.createElement('option');
                opt.value = u.plex_username;
                opt.textContent = userLabel(u);
                sourceSelect.appendChild(opt);
              });
              
              sourceSelect.addEventListener('change', (e) => {
                renderTargets(e.target.value);
              });
            }
          });

        // Fetch and populate libraries
        fetch('/api/libraries')
          .then(r => r.json())
          .then(data => {
            if (data.ok && data.libraries) {
              const librarySelect = document.getElementById('libraryName');
              data.libraries.forEach(lib => {
                const opt = document.createElement('option');
                opt.value = lib.title;
                opt.textContent = lib.title;
                opt.setAttribute('data-key', lib.key);
                opt.setAttribute('data-type', lib.type);
                librarySelect.appendChild(opt);
              });
            }
          });

        // Handle library change to load shows dynamically
        document.getElementById('libraryName').addEventListener('change', async (e) => {
          const librarySelect = e.target;
          const selectedOption = librarySelect.options[librarySelect.selectedIndex];
          const type = selectedOption ? selectedOption.getAttribute('data-type') : '';
          const title = selectedOption ? selectedOption.value : '';
          const key = selectedOption ? selectedOption.getAttribute('data-key') : '';

          const showTitleSelect = document.getElementById('showTitle');
          const seasonNumberInput = document.getElementById('seasonNumber');
          const mediaTypeSelect = document.getElementById('mediaType');
          const showTitleCol = document.getElementById('showTitleCol');
          const seasonNumberCol = document.getElementById('seasonNumberCol');

          const isTv = type === 'show' || title.toLowerCase().includes('tv') || title.toLowerCase().includes('anime');

          if (isTv && key) {
            showTitleCol.style.display = '';
            seasonNumberCol.style.display = '';
            showTitleSelect.disabled = true;
            showTitleSelect.innerHTML = '<option value="">Loading shows...</option>';
            mediaTypeSelect.value = 'episode';
            
            try {
              const response = await fetch('/api/shows?libraryKey=' + encodeURIComponent(key));
              const result = await response.json();
              if (result.ok && result.shows) {
                showTitleSelect.innerHTML = '<option value="">All Shows</option>' + 
                  result.shows.map(show => '<option value="' + escapeHtml(show) + '">' + escapeHtml(show) + '</option>').join('');
                showTitleSelect.disabled = false;
              } else {
                showTitleSelect.innerHTML = '<option value="">Failed to load shows</option>';
              }
            } catch (err) {
              console.error('Failed to fetch shows:', err);
              showTitleSelect.innerHTML = '<option value="">Error loading shows</option>';
            }
          } else {
            showTitleCol.style.display = 'none';
            seasonNumberCol.style.display = 'none';
            showTitleSelect.innerHTML = '<option value="">N/A (Select a TV library)</option>';
            showTitleSelect.value = '';
            showTitleSelect.disabled = true;
            if (type === 'movie') {
              mediaTypeSelect.value = 'movie';
            } else {
              mediaTypeSelect.value = '';
            }
          }
        });

        let currentJobId = null;
        let lastClickedIndex = -1;

        // Form Submit for Preview
        document.getElementById('preview-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const feedback = document.getElementById('status-feedback');
          feedback.className = 'status-feedback alert hidden';
          feedback.textContent = '';

          const form = e.target;
          const sourceUser = form.sourceUser.value;
          const targetUsers = Array.from(form.querySelectorAll('input[name="targetUsers"]:checked')).map(cb => cb.value);

          if (targetUsers.length === 0) {
            feedback.className = 'status-feedback alert alert-danger';
            feedback.textContent = 'Please select at least one target user.';
            feedback.classList.remove('hidden');
            return;
          }

          const filters = {};
          if (form.showTitle.value) filters.showTitle = form.showTitle.value;
          if (form.seasonNumber.value) filters.seasonNumber = Number(form.seasonNumber.value);
          if (form.libraryName.value) {
            filters.libraryName = form.libraryName.value;
            const selectedLibOption = form.libraryName.options[form.libraryName.selectedIndex];
            if (selectedLibOption && selectedLibOption.getAttribute('data-key')) {
              filters.libraryKey = selectedLibOption.getAttribute('data-key');
            }
          }
          if (form.mediaType.value) filters.mediaType = form.mediaType.value;
          if (form.dateFrom.value) filters.dateFrom = form.dateFrom.value;
          if (form.dateTo.value) filters.dateTo = form.dateTo.value;
          filters.skipAlreadyWatched = true;

          const previewBtn = document.getElementById('preview-btn');
          previewBtn.disabled = true;
          previewBtn.textContent = 'Generating Preview...';

          try {
            const response = await fetch('/api/history-copy/preview', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sourceUser, targetUsers, filters })
            });
            const result = await response.json();
            
            if (result.ok) {
              const data = result.data;
              currentJobId = data.jobId;
              lastClickedIndex = -1;

              // Update Summary Cards
              document.getElementById('summary-eligible').textContent = data.summary.eligible;
              document.getElementById('summary-watched').textContent = data.summary.alreadyWatched;
              document.getElementById('summary-copied').textContent = data.summary.alreadyCopied;
              document.getElementById('summary-failed').textContent = data.summary.failed;

              // Populate Items Table
              const tbody = document.getElementById('preview-items-body');
              if (data.items.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center">No history items matched the criteria.</td></tr>';
                document.getElementById('apply-action-bar').classList.add('hidden');
              } else {
                tbody.innerHTML = data.items.map(item => {
                  let statusClass = 'badge-eligible';
                  if (item.status === 'skipped') {
                    statusClass = item.reason === 'already_watched' ? 'badge-watched' : 'badge-copied';
                  } else if (item.status === 'failed') {
                    statusClass = 'badge-failed';
                  }

                  const targetUserObj = usersList.find(u => u.id === item.targetUserId);
                  const targetName = targetUserObj ? userLabel(targetUserObj) : 'User ' + item.targetUserId;
                  const seasonEpisode = item.mediaType === 'episode' ? 'S' + String(item.seasonNumber).padStart(2, '0') + 'E' + String(item.episodeNumber).padStart(2, '0') : '-';
                  const cleanTitle = item.mediaType === 'episode' ? (item.showTitle || '') + ': ' + item.title : item.title;

                  const rowClass = item.status === 'eligible' ? 'class="row-eligible"' : '';
                  const dataIdAttr = item.status === 'eligible' ? ' data-id="' + item.id + '"' : '';
                  const selectCell = item.status === 'eligible'
                    ? '<td class="row-select-cell"><input type="checkbox" class="row-select" aria-label="Select eligible row for ' + escapeHtml(cleanTitle) + '" /></td>'
                    : '<td></td>';

                  return '<tr ' + rowClass + dataIdAttr + '>' +
                    selectCell +
                    '<td>' + escapeHtml(targetName) + '</td>' +
                    '<td><span class="media-type-icon ' + item.mediaType + '">' + item.mediaType + '</span></td>' +
                    '<td>' + escapeHtml(cleanTitle) + '</td>' +
                    '<td>' + escapeHtml(seasonEpisode) + '</td>' +
                    '<td>' + new Date(item.watchedAt).toLocaleString() + '</td>' +
                    '<td><span class="badge ' + statusClass + '">' + (item.reason || item.status) + '</span></td>' +
                    '</tr>';
                }).join('');
                
                if (data.summary.eligible > 0) {
                  document.getElementById('apply-action-bar').classList.remove('hidden');
                } else {
                  document.getElementById('apply-action-bar').classList.add('hidden');
                }
              }

              document.getElementById('preview-results-section').classList.remove('hidden');
            } else {
              feedback.className = 'status-feedback alert alert-danger';
              feedback.textContent = result.message || 'Error generating preview.';
              feedback.classList.remove('hidden');
            }
          } catch (error) {
            feedback.className = 'status-feedback alert alert-danger';
            feedback.textContent = 'Server request failed: ' + error.message;
            feedback.classList.remove('hidden');
          } finally {
            previewBtn.disabled = false;
            previewBtn.textContent = 'Generate Preview';
          }
        });

        // Handle Row click highlight toggle
        document.getElementById('preview-items-body').addEventListener('click', (e) => {
          const row = e.target.closest('tr');
          if (!row || !row.classList.contains('row-eligible')) return;
          if (e.target.closest('input.row-select')) return;

          const eligibleRows = Array.from(document.querySelectorAll('.row-eligible'));
          const clickedIndex = eligibleRows.indexOf(row);
          const checkbox = row.querySelector('input.row-select');
          if (!checkbox) return;

          if (e.shiftKey && lastClickedIndex !== -1) {
            // Prevent text selection while shift-clicking
            if (window.getSelection) {
              window.getSelection().removeAllRanges();
            }

            const start = Math.min(lastClickedIndex, clickedIndex);
            const end = Math.max(lastClickedIndex, clickedIndex);
            
            // Toggle the row to determine the target selection state
            checkbox.checked = !checkbox.checked;
            row.classList.toggle('selected', checkbox.checked);
            const targetState = checkbox.checked;

            for (let i = start; i <= end; i++) {
              const itemCheckbox = eligibleRows[i].querySelector('input.row-select');
              if (!itemCheckbox) continue;
              if (targetState) {
                itemCheckbox.checked = true;
                eligibleRows[i].classList.add('selected');
              } else {
                itemCheckbox.checked = false;
                eligibleRows[i].classList.remove('selected');
              }
            }
          } else {
            checkbox.checked = !checkbox.checked;
            row.classList.toggle('selected', checkbox.checked);
          }

          lastClickedIndex = clickedIndex;
        });

        document.getElementById('preview-items-body').addEventListener('change', (e) => {
          const checkbox = e.target.closest('input.row-select');
          if (!checkbox) return;
          const row = checkbox.closest('tr');
          if (row) {
            row.classList.toggle('selected', checkbox.checked);
          }
        });

        // Apply Copy Job
        document.getElementById('apply-btn').addEventListener('click', async () => {
          if (!currentJobId) return;

          const selectedRows = Array.from(document.querySelectorAll('.row-select:checked'));
          if (selectedRows.length === 0) {
            alert('Please select at least one row to copy by clicking on it.');
            return;
          }
          const selectedItemIds = selectedRows.map(row => Number(row.closest('tr').getAttribute('data-id')));

          const applyBtn = document.getElementById('apply-btn');
          const feedback = document.getElementById('status-feedback');
          
          feedback.className = 'status-feedback alert alert-info';
          feedback.textContent = 'Applying copy job... marking Plex states.';
          feedback.classList.remove('hidden');
          applyBtn.disabled = true;

          try {
            const response = await fetch('/api/history-copy/apply', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jobId: currentJobId, confirm: true, itemIds: selectedItemIds })
            });
            const result = await response.json();

            if (result.ok) {
              feedback.className = 'status-feedback alert alert-success';
              feedback.textContent = 'Success! Applied copy job ' + currentJobId + ': ' +
                result.data.copied + ' items copied, ' +
                result.data.skipped + ' skipped, ' +
                result.data.failed + ' failed.';
              
              // Hide action bar
              document.getElementById('apply-action-bar').classList.add('hidden');

              // Refresh job items to show updated statuses
              const jobDetailsResponse = await fetch('/api/history-copy/jobs/' + currentJobId);
              const jobDetails = await jobDetailsResponse.json();
              if (jobDetails.ok && jobDetails.items) {
                const tbody = document.getElementById('preview-items-body');
                tbody.innerHTML = jobDetails.items.map(item => {
                  let statusClass = 'badge-eligible';
                  if (item.status === 'copied') statusClass = 'badge-success';
                  else if (item.status === 'skipped') {
                    statusClass = item.reason === 'already_watched' ? 'badge-watched' : 'badge-copied';
                  } else if (item.status === 'failed') {
                    statusClass = 'badge-failed';
                  }

                  const targetUserObj = usersList.find(u => u.id === item.target_user_id);
                  const targetName = targetUserObj ? userLabel(targetUserObj) : 'User ' + item.target_user_id;
                  const seasonEpisode = item.media_type === 'episode' ? 'S' + String(item.season_number).padStart(2, '0') + 'E' + String(item.episode_number).padStart(2, '0') : '-';
                  const cleanTitle = item.media_type === 'episode' ? (item.show_title || '') + ': ' + item.title : item.title;

                  return '<tr>' +
                    '<td></td>' +
                    '<td>' + escapeHtml(targetName) + '</td>' +
                    '<td><span class="media-type-icon ' + item.media_type + '">' + item.media_type + '</span></td>' +
                    '<td>' + escapeHtml(cleanTitle) + '</td>' +
                    '<td>' + escapeHtml(seasonEpisode) + '</td>' +
                    '<td>' + new Date(item.watched_at).toLocaleString() + '</td>' +
                    '<td><span class="badge ' + statusClass + '">' + (item.reason || item.status) + '</span></td>' +
                    '</tr>';
                }).join('');
              }
            } else {
              feedback.className = 'status-feedback alert alert-danger';
              feedback.textContent = result.message || 'Error applying copy job.';
            }
          } catch (error) {
            feedback.className = 'status-feedback alert alert-danger';
            feedback.textContent = 'Server request failed: ' + error.message;
          } finally {
            applyBtn.disabled = false;
          }
        });
      </script>
    `));
  });

  router.get("/audit", (_req, res) => {
    res.type("html").send(renderPage("Audit Log", `
      <pre id="audit">Loading...</pre>
      <script>
        fetch('/api/audit?days=7').then(r => r.json()).then(data => {
          document.getElementById('audit').textContent = JSON.stringify(data, null, 2);
        });
      </script>
    `));
  });
  router.get("/settings", (_req, res) => {
    res.type("html").send(renderPage("Settings", `
      <section class="band">
        <h2>Application Settings</h2>
        <form id="settings-form" class="job-form">
          <div class="form-group" style="display: flex; align-items: center; gap: 8px;">
            <input type="checkbox" id="prompt_for_audiobooks" name="prompt_for_audiobooks">
            <label for="prompt_for_audiobooks" style="margin: 0; font-weight: normal;">Enable Discord Prompts for Audiobooks</label>
          </div>
          <button type="submit">Save Settings</button>
        </form>
        <div id="settings-message" style="margin-top: 1rem;"></div>
      </section>

      <section class="band">
        <h2>Household Dashboard Members</h2>
        <p class="text-muted" style="margin-bottom: 1rem;">Choose which Plex identities belong in household dashboard intelligence. Excluding an identity hides it from dashboard people, filters, and totals without disabling ingestion or deleting history.</p>
        <form id="users-form" class="job-form">
          <div class="items-table-container">
            <table class="preview-table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Alias</th>
                  <th>Include in household dashboard?</th>
                </tr>
              </thead>
              <tbody id="settings-users-body">
                <tr><td colspan="3">Loading...</td></tr>
              </tbody>
            </table>
          </div>
          <button type="submit" style="margin-top: 1rem;">Save Users</button>
        </form>
        <div id="users-message" style="margin-top: 1rem;"></div>
      </section>
      <script>
        const form = document.getElementById('settings-form');
        const checkbox = document.getElementById('prompt_for_audiobooks');
        const message = document.getElementById('settings-message');

        fetch('/api/settings').then(r => r.json()).then(data => {
          if (data.ok && data.settings) {
            checkbox.checked = data.settings.prompt_for_audiobooks === 'true';
          }
        });

        form.addEventListener('submit', (e) => {
          e.preventDefault();
          message.textContent = 'Saving...';
          fetch('/api/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt_for_audiobooks: checkbox.checked ? 'true' : 'false' })
          }).then(r => r.json()).then(data => {
            if (data.ok) {
              message.textContent = 'Settings saved successfully!';
              message.style.color = 'green';
            } else {
              message.textContent = 'Error: ' + data.error;
              message.style.color = 'red';
            }
          }).catch(err => {
            message.textContent = 'Error saving settings';
            message.style.color = 'red';
          });
        });

        const usersForm = document.getElementById('users-form');
        const usersBody = document.getElementById('settings-users-body');
        const usersMessage = document.getElementById('users-message');
        
        fetch('/api/settings/users').then(r => r.json()).then(data => {
          if (data.ok && data.users) {
            usersBody.innerHTML = data.users.map(u => {
              const safeAlias = (u.alias || '').replace(/"/g, '&quot;');
              const safeUsername = (u.plex_username || '').replace(/"/g, '&quot;');
              return '<tr data-id="' + u.id + '">' +
                '<td>' + safeUsername + '</td>' +
                '<td><input type="text" class="user-alias" value="' + safeAlias + '" placeholder="' + safeUsername + '" style="padding: 4px; width: 100%; box-sizing: border-box;" /></td>' +
                '<td><input type="checkbox" class="user-shown" ' + (u.shown ? 'checked' : '') + ' /></td>' +
              '</tr>';
            }).join('');
          }
        });

        usersForm.addEventListener('submit', (e) => {
          e.preventDefault();
          usersMessage.textContent = 'Saving...';
          
          const updatedUsers = Array.from(usersBody.querySelectorAll('tr')).map(tr => {
            return {
              id: Number(tr.getAttribute('data-id')),
              alias: tr.querySelector('.user-alias').value,
              shown: tr.querySelector('.user-shown').checked
            };
          });

          fetch('/api/settings/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ users: updatedUsers })
          }).then(r => r.json()).then(data => {
            if (data.ok) {
              usersMessage.textContent = 'Users saved successfully!';
              usersMessage.style.color = 'green';
            } else {
              usersMessage.textContent = 'Error: ' + data.error;
              usersMessage.style.color = 'red';
            }
          }).catch(err => {
            usersMessage.textContent = 'Error saving users';
            usersMessage.style.color = 'red';
          });
        });
      </script>
    `));
  });
}

function renderPage(title: string, body: string): string {
  const navItem = (href: string, label: string): string => {
    const active = label === title ? " active" : "";
    return `<a class="topnav-link${active}" href="${href}">${label}</a>`;
  };
  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <meta name="theme-color" content="#e5a00d">
      <link rel="manifest" href="/manifest.json">
      <link rel="icon" href="/static/icon.svg" type="image/svg+xml">
      <link rel="apple-touch-icon" href="/static/icon.svg">
      <title>${title} - Plex Co-Watch Sync</title>
      <link rel="stylesheet" href="/static/styles.css?v=3-2n-6e-2-layout">
      <script>
        if ('serviceWorker' in navigator) {
          window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').catch(err => console.error('SW registration failed:', err));
          });
        }
      </script>
    </head>
    <body>
      <header class="app-topbar">
        <a class="brand-link" href="/" aria-label="Plex Co-Watch Sync home">
          <span class="brand-mark">P</span>
          <span class="brand-copy">
            <strong>Plex Co-Watch Sync</strong>
            <span>${title}</span>
          </span>
        </a>
        <nav class="topnav" aria-label="Primary">
          ${navItem("/", "Dashboard")}
          ${navItem("/copy", "Copy History")}
          ${navItem("/audit", "Audit")}
          ${navItem("/settings", "Settings")}
        </nav>
      </header>
      <main class="app-page"><h1>${title}</h1>${body}</main>
    </body>
  </html>`;
}
