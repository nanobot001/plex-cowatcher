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
            <a href="/prompts" class="nav-btn" style="text-decoration:none; display:flex; align-items:center;">Review Prompts</a>
            <a href="/achievements" class="nav-btn" style="text-decoration:none; display:flex; align-items:center;">Achievements</a>
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
            <select name="user"><option value="">Everyone (All Users)</option></select>
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
      <script src="/static/dashboard.js?v=3-6-6d-caught-up"></script>
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

  router.get("/prompts", (_req, res) => {
    res.type("html").send(renderPage("Review Prompts", `
      <div class="prompts-container copy-container">
        <!-- Header Banner -->
        <section class="card" style="padding:20px 24px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
            <div>
              <h2 style="margin:0 0 6px 0; font-size:1.4rem;">Review Unaddressed Prompts</h2>
              <p style="margin:0; color:var(--text-muted); font-size:0.95rem;">
                Browse co-watch prompts, filter by source streamer or show title, and confirm co-watch credit in bulk or one-by-one.
              </p>
            </div>
            <div id="prompts-stats-bar" style="display:flex; gap:12px; align-items:center;">
              <span class="badge badge-eligible" id="unaddressed-count-badge" style="font-size:0.85rem; padding:8px 16px;">Loading count...</span>
            </div>
          </div>
        </section>

        <!-- Filters Form -->
        <section class="card" style="padding:20px 24px;">
          <form id="prompts-filter-form" class="grid-form">
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:16px;">
              <div class="form-col">
                <label for="filterSourceUser">Source Streamer</label>
                <select id="filterSourceUser" name="user">
                  <option value="">All Source Streamers</option>
                </select>
              </div>
              <div class="form-col">
                <label for="filterShowSearch">Show / Title Search</label>
                <input type="search" id="filterShowSearch" name="search" placeholder="e.g. Daemons, One Piece...">
              </div>
              <div class="form-col">
                <label for="filterSort">Order</label>
                <select id="filterSort" name="sort">
                  <option value="desc" selected>Newest First (Reverse Chronological)</option>
                  <option value="asc">Oldest First</option>
                </select>
              </div>
              <div class="form-col">
                <label for="filterStatus">Prompt Status</label>
                <select id="filterStatus" name="status">
                  <option value="unaddressed" selected>Unaddressed (Pending &amp; Prompted)</option>
                  <option value="prompted">Prompted Only (Sent to Discord)</option>
                  <option value="pending">Pending Only</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="none">No One (Solo)</option>
                  <option value="dismissed">Dismissed</option>
                  <option value="all">All Statuses</option>
                </select>
              </div>
              <div class="form-col">
                <label for="filterGrouping">Grouping</label>
                <select id="filterGrouping" name="grouping">
                  <option value="show" selected>Group by Show &amp; Streamer</option>
                  <option value="none">Flat (No Grouping)</option>
                </select>
              </div>
              <div class="form-col">
                <label for="filterLimit">Page Size</label>
                <select id="filterLimit" name="limit">
                  <option value="50" selected>50 per page</option>
                  <option value="100">100 per page</option>
                  <option value="200">200 per page</option>
                </select>
              </div>
            </div>
            <div style="display:flex; gap:12px; align-items:center; margin-top:8px;">
              <button type="submit" class="btn btn-primary" id="prompts-filter-btn" style="min-width:120px;">Apply Filters</button>
              <button type="button" class="btn" id="prompts-filter-reset">Reset</button>
            </div>
          </form>
        </section>

        <!-- Bulk Action Bar (Sticky on Scroll) -->
        <section class="card sticky-bulk-bar" id="bulk-action-section" style="padding:16px 24px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
            <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
              <label style="display:inline-flex; align-items:center; gap:8px; cursor:pointer; font-weight:600; text-transform:none; font-size:0.95rem; color:var(--text-main);">
                <input type="checkbox" id="master-select-checkbox" style="width:18px; height:18px; accent-color:#06B6D4; cursor:pointer;">
                Select All on Page
              </label>
              <span id="selected-items-count" style="color:var(--text-muted); font-size:0.9rem;">(0 selected)</span>
              <button type="button" class="btn" id="btn-clear-selection" style="display:none; padding:4px 10px; font-size:0.8rem; background:transparent; border:1px solid var(--panel-border); color:var(--text-muted); border-radius:4px; cursor:pointer;">
                Clear Selection
              </button>
            </div>

            <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
              <label style="margin:0; font-size:0.85rem; font-weight:600;">Watched With:</label>

              <div class="watched-with-control" style="position:relative; display:inline-block;">
                <button type="button" id="btn-cowatchers-toggle" class="btn" style="display:inline-flex; align-items:center; justify-content:space-between; gap:12px; background:rgba(0,0,0,0.4); border:1px solid var(--panel-border); color:var(--text-main); padding:10px 14px; border-radius:8px; min-width:220px; font-size:0.9rem; cursor:pointer; text-align:left;">
                  <span id="cowatchers-label" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:180px;">Select Co-Watcher(s)...</span>
                  <span style="font-size:0.75rem; opacity:0.7;">▼</span>
                </button>

                <div id="cowatchers-dropdown" class="cowatchers-dropdown hidden">
                  <div style="padding:6px 10px 8px; border-bottom:1px solid rgba(255,255,255,0.08); display:flex; gap:6px;">
                    <button type="button" id="btn-select-nobody" class="btn" style="flex:1; padding:5px 8px; font-size:0.75rem; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); border-radius:6px; cursor:pointer; color:var(--text-main);">Nobody (Solo)</button>
                    <button type="button" id="btn-select-everyone" class="btn" style="flex:1; padding:5px 8px; font-size:0.75rem; background:rgba(6,182,212,0.15); border:1px solid rgba(6,182,212,0.3); border-radius:6px; cursor:pointer; color:#06B6D4;">Everyone</button>
                    <button type="button" id="btn-clear-cowatchers" class="btn" style="padding:5px 8px; font-size:0.75rem; background:transparent; border:1px solid rgba(255,255,255,0.1); border-radius:6px; cursor:pointer; color:var(--text-muted);" title="Clear selection">Clear</button>
                  </div>
                  <div id="cowatchers-list" style="padding:4px 0;">
                    <!-- User checkboxes populated dynamically -->
                  </div>
                </div>
              </div>

              <!-- Hidden select for compatibility -->
              <select id="targetCoWatcher" style="display:none;">
                <option value="">Select Co-Watcher...</option>
                <option value="none">Nobody (Watched Alone)</option>
              </select>

              <button type="button" class="btn btn-success" id="btn-bulk-confirm" disabled style="background:#10B981; color:#fff; border:none; padding:10px 18px; border-radius:8px; font-weight:600; cursor:pointer;">
                Confirm Selected
              </button>
              <button type="button" class="btn" id="btn-bulk-dismiss" disabled style="background:rgba(244,63,94,0.15); color:#F43F5E; border:1px solid rgba(244,63,94,0.3); padding:10px 18px; border-radius:8px; font-weight:600; cursor:pointer;">
                Dismiss Selected
              </button>

              <!-- Bulk Change Streamer Control -->
              <div class="streamer-action-control" style="display:flex; align-items:center; gap:8px; border-left:1px solid rgba(255,255,255,0.1); padding-left:12px; margin-left:4px;">
                <label style="margin:0; font-size:0.85rem; font-weight:600; white-space:nowrap; color:var(--text-muted);">Change Streamer:</label>
                <select id="bulkChangeStreamerSelect" style="background:rgba(0,0,0,0.4); border:1px solid var(--panel-border); color:var(--text-main); padding:9px 12px; border-radius:8px; font-size:0.85rem; cursor:pointer; max-width:180px;">
                  <option value="">Select Streamer...</option>
                </select>
                <button type="button" class="btn" id="btn-bulk-change-streamer" disabled style="background:rgba(99,102,241,0.2); color:#a5b4fc; border:1px solid rgba(99,102,241,0.4); padding:10px 14px; border-radius:8px; font-weight:600; cursor:pointer;">
                  Apply
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- Status / Feedback Alert -->
        <div id="prompts-feedback" class="status-feedback alert hidden"></div>

        <!-- Change Streamer Modal Dialog -->
        <dialog id="change-streamer-dialog" style="background:#161b22; border:1px solid #30363d; border-radius:12px; padding:24px; color:var(--text-main); max-width:420px; width:100%; box-shadow:0 20px 25px -5px rgba(0,0,0,0.7);">
          <form method="dialog" id="change-streamer-form">
            <h3 style="margin:0 0 8px 0; font-size:1.15rem; color:#fff;">Change Source Streamer</h3>
            <p id="streamer-dialog-subtitle" style="margin:0 0 16px 0; font-size:0.85rem; color:var(--text-muted); line-height:1.4;">
              Select which household member streamed this media on Plex.
            </p>
            <div style="margin-bottom:20px;">
              <label for="streamer-dialog-select" style="display:block; margin-bottom:6px; font-size:0.85rem; font-weight:600;">New Streamer:</label>
              <select id="streamer-dialog-select" style="width:100%; padding:10px 12px; background:rgba(0,0,0,0.5); border:1px solid var(--panel-border); color:var(--text-main); border-radius:8px; font-size:0.9rem;" required>
                <option value="">Select household user...</option>
              </select>
            </div>
            <div style="display:flex; justify-content:flex-end; gap:10px;">
              <button type="button" class="btn" id="streamer-dialog-cancel" style="padding:8px 16px;">Cancel</button>
              <button type="submit" class="btn btn-primary" id="streamer-dialog-submit" style="padding:8px 18px; background:#6366f1; border-color:#6366f1; font-weight:600; color:#fff;">Confirm Change</button>
            </div>
          </form>
        </dialog>

        <!-- Prompts Table Card -->
        <section class="card" style="padding:0; overflow:hidden;">
          <div style="padding:16px 24px; border-bottom:1px solid var(--panel-border); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; background:rgba(0,0,0,0.2);">
            <span id="pagination-info" style="font-weight:600; font-size:0.9rem; color:var(--text-muted);">Showing 0 items</span>
            <div style="display:flex; gap:8px; align-items:center;">
              <button type="button" class="btn" id="btn-page-prev" disabled style="padding:6px 12px; font-size:0.85rem;">&larr; Previous</button>
              <span id="current-page-label" style="font-size:0.85rem; color:var(--text-muted); padding:0 8px;">Page 1</span>
              <button type="button" class="btn" id="btn-page-next" disabled style="padding:6px 12px; font-size:0.85rem;">Next &rarr;</button>
            </div>
          </div>

          <div class="items-table-container" style="overflow-x:auto;">
            <table class="preview-table" style="margin:0;">
              <thead>
                <tr>
                  <th style="width:48px; text-align:center;">Select</th>
                  <th style="width:140px;">Streamer</th>
                  <th>Show / Title</th>
                  <th style="width:100px;">Season / Ep</th>
                  <th style="width:170px;">Watched At</th>
                  <th style="width:120px;">Status</th>
                  <th>Co-Watchers</th>
                  <th style="width:180px; text-align:right;">Actions</th>
                </tr>
              </thead>
              <tbody id="prompts-table-body">
                <tr><td colspan="8" style="text-align:center; padding:40px; color:var(--text-muted);">Loading prompts...</td></tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <script>
        let usersList = [];
        let currentItems = [];
        let currentGroups = [];
        let selectedIds = new Set();
        let lastClickedIndex = -1;
        let currentPage = 1;
        let pageSize = 50;
        let selectedCoWatcherIds = new Set();
        let isSoloSelected = false;

        function updateCoWatcherUI() {
          const labelEl = document.getElementById('cowatchers-label');
          const btnBulkConfirm = document.getElementById('btn-bulk-confirm');
          const targetSelect = document.getElementById('targetCoWatcher');

          if (isSoloSelected) {
            if (labelEl) labelEl.textContent = 'Nobody (Watched Alone)';
            if (targetSelect) targetSelect.value = 'none';
            if (btnBulkConfirm) btnBulkConfirm.textContent = 'Resolve (Watched Alone)';
            document.querySelectorAll('.cowatcher-checkbox').forEach(cb => cb.checked = false);
            return;
          }

          if (selectedCoWatcherIds.size === 0) {
            if (labelEl) labelEl.textContent = 'Select Co-Watcher(s)...';
            if (targetSelect) targetSelect.value = '';
            if (btnBulkConfirm) btnBulkConfirm.textContent = 'Confirm Selected';
            document.querySelectorAll('.cowatcher-checkbox').forEach(cb => cb.checked = false);
            return;
          }

          const selectedNames = [];
          usersList.forEach(u => {
            if (selectedCoWatcherIds.has(Number(u.id))) {
              selectedNames.push(userLabel(u));
            }
          });

          if (selectedCoWatcherIds.size === usersList.length && usersList.length > 1) {
            if (labelEl) labelEl.textContent = 'Everyone (' + selectedCoWatcherIds.size + ')';
            if (btnBulkConfirm) btnBulkConfirm.textContent = 'Confirm with Everyone';
          } else if (selectedNames.length === 1) {
            if (labelEl) labelEl.textContent = selectedNames[0];
            if (btnBulkConfirm) btnBulkConfirm.textContent = 'Confirm with ' + selectedNames[0];
          } else {
            if (labelEl) labelEl.textContent = selectedNames.join(', ');
            if (btnBulkConfirm) btnBulkConfirm.textContent = 'Confirm with ' + selectedCoWatcherIds.size + ' people';
          }

          if (targetSelect) {
            targetSelect.value = selectedCoWatcherIds.size === 1 ? String(Array.from(selectedCoWatcherIds)[0]) : '';
          }

          document.querySelectorAll('.cowatcher-checkbox').forEach(cb => {
            cb.checked = selectedCoWatcherIds.has(Number(cb.value));
          });
        }

        function getSelectedCoWatcherNames() {
          if (isSoloSelected) return 'Nobody (Solo)';
          const names = [];
          usersList.forEach(u => {
            if (selectedCoWatcherIds.has(Number(u.id))) {
              names.push(userLabel(u));
            }
          });
          return names.join(', ');
        }

        function userLabel(user) {
          return (user && (user.alias || user.display_name || user.plex_username)) || '';
        }

        function escapeHtml(str) {
          if (!str) return '';
          return String(str).replace(/&/g, '&amp;')
                            .replace(/</g, '&lt;')
                            .replace(/>/g, '&gt;')
                            .replace(/"/g, '&quot;')
                            .replace(/'/g, '&#039;');
        }

        function formatDate(isoStr) {
          if (!isoStr) return '-';
          try {
            const d = new Date(isoStr);
            return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' +
                   d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
          } catch {
            return isoStr;
          }
        }

        function formatStatusBadge(status) {
          if (status === 'confirmed') return '<span class="badge badge-success">Confirmed</span>';
          if (status === 'dismissed') return '<span class="badge badge-failed">Dismissed</span>';
          if (status === 'prompted') return '<span class="badge badge-copied">Prompted</span>';
          if (status === 'pending') return '<span class="badge badge-eligible">Pending</span>';
          if (status === 'none') return '<span class="badge badge-eligible" title="Answered in Discord as watched alone">No One (Solo)</span>';
          if (status === 'resolved') return '<span class="badge badge-success">Resolved</span>';
          return '<span class="badge">' + escapeHtml(status) + '</span>';
        }

        function buildGroups(items) {
          const map = new Map();
          items.forEach(item => {
            const streamerKey = String(item.source_user_id || item.source_username || 'unknown');
            const streamerName = item.source_display_name || item.source_username || 'Unknown';
            const showTitle = item.show_title || item.title || 'Untitled';
            const groupKey = streamerKey + ':::' + showTitle;

            if (!map.has(groupKey)) {
              map.set(groupKey, {
                groupKey: groupKey,
                streamerKey: streamerKey,
                streamerName: streamerName,
                showTitle: showTitle,
                mediaType: item.media_type,
                items: []
              });
            }
            map.get(groupKey).items.push(item);
          });
          return Array.from(map.values());
        }

        function updateSelectionUI() {
          const count = selectedIds.size;
          document.getElementById('selected-items-count').textContent = '(' + count + ' selected)';
          document.getElementById('btn-bulk-confirm').disabled = count === 0;
          document.getElementById('btn-bulk-dismiss').disabled = count === 0;

          const btnBulkChangeStreamer = document.getElementById('btn-bulk-change-streamer');
          const bulkStreamerSelect = document.getElementById('bulkChangeStreamerSelect');
          if (btnBulkChangeStreamer && bulkStreamerSelect) {
            btnBulkChangeStreamer.disabled = count === 0 || !bulkStreamerSelect.value;
          }

          const btnClear = document.getElementById('btn-clear-selection');
          if (btnClear) btnClear.style.display = count > 0 ? 'inline-block' : 'none';

          const masterCheckbox = document.getElementById('master-select-checkbox');
          const pageCheckboxes = document.querySelectorAll('.prompt-row-select');
          if (pageCheckboxes.length > 0 && Array.from(pageCheckboxes).every(cb => cb.checked)) {
            masterCheckbox.checked = true;
            masterCheckbox.indeterminate = false;
          } else if (count > 0 && Array.from(pageCheckboxes).some(cb => cb.checked)) {
            masterCheckbox.checked = false;
            masterCheckbox.indeterminate = true;
          } else {
            masterCheckbox.checked = false;
            masterCheckbox.indeterminate = false;
          }

          // Update Group Checkboxes
          document.querySelectorAll('.prompt-group-select').forEach(groupCb => {
            const groupKey = groupCb.getAttribute('data-group-key');
            const groupRows = document.querySelectorAll('.prompt-row[data-group-key="' + groupKey + '"]');
            if (groupRows.length === 0) return;
            let checkedCount = 0;
            groupRows.forEach(r => {
              const id = Number(r.getAttribute('data-id'));
              if (selectedIds.has(id)) checkedCount++;
            });
            if (checkedCount === groupRows.length) {
              groupCb.checked = true;
              groupCb.indeterminate = false;
            } else if (checkedCount > 0) {
              groupCb.checked = false;
              groupCb.indeterminate = true;
            } else {
              groupCb.checked = false;
              groupCb.indeterminate = false;
            }
          });
        }

        function showFeedback(type, text) {
          const el = document.getElementById('prompts-feedback');
          el.className = 'status-feedback alert alert-' + type;
          el.textContent = text;
          el.classList.remove('hidden');
        }

        function hideFeedback() {
          const el = document.getElementById('prompts-feedback');
          el.className = 'status-feedback alert hidden';
          el.textContent = '';
        }

        async function loadPrompts() {
          const form = document.getElementById('prompts-filter-form');
          const user = form.user.value;
          const search = form.search.value.trim();
          const sort = form.sort.value;
          const status = form.status.value;
          const grouping = form.grouping ? form.grouping.value : 'show';
          if (form.limit) pageSize = Number(form.limit.value) || 50;

          const offset = (currentPage - 1) * pageSize;

          const params = new URLSearchParams({
            status: status,
            sort: sort,
            limit: String(pageSize),
            offset: String(offset)
          });
          if (user) params.set('user', user);
          if (search) params.set('search', search);

          const tbody = document.getElementById('prompts-table-body');
          tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:40px; color:var(--text-muted);">Loading prompts...</td></tr>';

          try {
            const res = await fetch('/api/dashboard/prompts?' + params.toString());
            const data = await res.json();
            if (!data.ok) {
              tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:40px; color:#F43F5E;">Error: ' + escapeHtml(data.error || 'Failed to load') + '</td></tr>';
              return;
            }

            currentItems = data.items || [];
            currentGroups = buildGroups(currentItems);
            const total = data.total || 0;

            document.getElementById('unaddressed-count-badge').textContent = total.toLocaleString() + ' prompts found';

            const startIdx = total === 0 ? 0 : offset + 1;
            const endIdx = Math.min(offset + currentItems.length, total);
            document.getElementById('pagination-info').textContent = 'Showing ' + startIdx + '–' + endIdx + ' of ' + total.toLocaleString() + ' prompts';
            document.getElementById('current-page-label').textContent = 'Page ' + currentPage + ' of ' + (Math.ceil(total / pageSize) || 1);
            document.getElementById('btn-page-prev').disabled = currentPage <= 1;
            document.getElementById('btn-page-next').disabled = endIdx >= total;

            if (currentItems.length === 0) {
              tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:40px; color:var(--text-muted);">No prompts match the current filters.</td></tr>';
              updateSelectionUI();
              return;
            }

            let rowsHtml = '';
            let globalIdx = 0;

            if (grouping === 'show') {
              currentGroups.forEach(group => {
                const totalInGroup = group.items.length;
                let checkedInGroup = 0;
                group.items.forEach(i => { if (selectedIds.has(i.id)) checkedInGroup++; });
                const isGroupChecked = totalInGroup > 0 && checkedInGroup === totalInGroup;

                // Group Header Row
                rowsHtml += '<tr class="prompt-group-header-row" data-group-key="' + escapeHtml(group.groupKey) + '" style="background:rgba(255,255,255,0.04); border-top:2px solid rgba(255,255,255,0.08); border-bottom:1px solid rgba(255,255,255,0.06);">' +
                  '<td colspan="8" style="padding:10px 16px;">' +
                    '<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">' +
                      '<div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">' +
                        '<label style="display:inline-flex; align-items:center; gap:8px; cursor:pointer; margin:0; font-weight:600;">' +
                          '<input type="checkbox" class="prompt-group-select" data-group-key="' + escapeHtml(group.groupKey) + '" ' +
                            (isGroupChecked ? 'checked ' : '') +
                            'style="width:18px; height:18px; accent-color:#06B6D4; cursor:pointer;">' +
                          '<span style="font-size:0.85rem; color:var(--text-muted);">Select group</span>' +
                        '</label>' +
                        '<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">' +
                          '<span class="badge badge-copied" style="font-size:0.75rem; padding:3px 8px;">' + escapeHtml(group.streamerName) + '</span>' +
                          '<button type="button" class="btn btn-group-streamer" data-group-key="' + escapeHtml(group.groupKey) + '" style="padding:2px 8px; font-size:0.75rem; background:rgba(99,102,241,0.15); color:#a5b4fc; border:1px solid rgba(99,102,241,0.3); border-radius:4px; cursor:pointer;" title="Change streamer for all ' + totalInGroup + ' items in this group">Change Streamer</button>' +
                          '<strong style="font-size:0.95rem; color:var(--text-main);">' + escapeHtml(group.showTitle) + '</strong>' +
                          '<span class="badge badge-eligible" style="font-size:0.75rem; padding:3px 8px;">' + totalInGroup + ' ' + (totalInGroup === 1 ? 'item' : 'episodes') + '</span>' +
                        '</div>' +
                      '</div>' +
                      '<div style="display:flex; align-items:center; gap:8px;">' +
                        '<button type="button" class="btn btn-group-confirm" data-group-key="' + escapeHtml(group.groupKey) + '" style="padding:4px 12px; font-size:0.8rem; background:#10B981; color:#fff; border:none; border-radius:4px; font-weight:600; cursor:pointer;">Confirm Group (' + totalInGroup + ')</button>' +
                        '<button type="button" class="btn btn-group-dismiss" data-group-key="' + escapeHtml(group.groupKey) + '" style="padding:4px 12px; font-size:0.8rem; background:rgba(244,63,94,0.15); color:#F43F5E; border:1px solid rgba(244,63,94,0.3); border-radius:4px; cursor:pointer;">Dismiss Group</button>' +
                      '</div>' +
                    '</div>' +
                  '</td>' +
                '</tr>';

                group.items.forEach(item => {
                  const isChecked = selectedIds.has(item.id);
                  const seasonEp = item.media_type === 'episode'
                    ? 'S' + String(item.season_number ?? 0).padStart(2, '0') + 'E' + String(item.episode_number ?? 0).padStart(2, '0')
                    : '-';
                  const displayTitle = item.show_title
                    ? '<strong>' + escapeHtml(item.show_title) + '</strong><br><small style="color:var(--text-muted);">' + escapeHtml(item.title) + '</small>'
                    : '<strong>' + escapeHtml(item.title) + '</strong>';

                  const confirmations = (item.confirmations || []).map(c => {
                    return '<span class="badge badge-success" style="font-size:0.7rem; padding:3px 8px; margin:2px;">' +
                      escapeHtml(c.targetDisplayName || c.targetUsername) + '</span>';
                  }).join('');

                  const selectGroupBtn = totalInGroup > 1
                    ? ' <button type="button" class="btn-select-group" data-group-key="' + escapeHtml(group.groupKey) + '" style="padding:2px 8px; font-size:0.7rem; background:rgba(6,182,212,0.12); color:#06B6D4; border:1px solid rgba(6,182,212,0.3); border-radius:4px; cursor:pointer; vertical-align:middle;" title="Select all ' + totalInGroup + ' of this show">Select Show (' + totalInGroup + ')</button>'
                    : '';

                  rowsHtml += '<tr class="prompt-row ' + (isChecked ? 'selected' : '') + '" data-id="' + item.id + '" data-idx="' + globalIdx + '" data-group-key="' + escapeHtml(group.groupKey) + '" style="cursor:pointer;">' +
                    '<td style="text-align:center;"><input type="checkbox" class="prompt-row-select" data-id="' + item.id + '" ' + (isChecked ? 'checked' : '') + ' style="width:18px; height:18px; accent-color:#06B6D4; cursor:pointer;"></td>' +
                    '<td><div style="display:flex; align-items:center; gap:6px;"><strong>' + escapeHtml(item.source_display_name || item.source_username) + '</strong><button type="button" class="btn btn-row-streamer" data-id="' + item.id + '" data-current="' + item.source_user_id + '" style="padding:1px 6px; font-size:0.7rem; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.15); border-radius:4px; cursor:pointer; color:var(--text-muted);" title="Change streamer for this prompt">✎</button></div></td>' +
                    '<td>' + displayTitle + selectGroupBtn + '</td>' +
                    '<td>' + escapeHtml(seasonEp) + '</td>' +
                    '<td style="white-space:nowrap; font-size:0.85rem;">' + formatDate(item.watched_at) + '</td>' +
                    '<td>' + formatStatusBadge(item.prompt_status) + '</td>' +
                    '<td>' + (confirmations || '<span style="color:var(--text-muted); font-size:0.8rem;">None</span>') + '</td>' +
                    '<td style="text-align:right; white-space:nowrap;">' +
                      '<button type="button" class="btn btn-row-confirm" data-id="' + item.id + '" style="padding:4px 10px; font-size:0.8rem; background:#10B981; color:#fff; border:none; border-radius:4px; margin-right:6px; cursor:pointer;">Confirm</button>' +
                      '<button type="button" class="btn btn-row-dismiss" data-id="' + item.id + '" style="padding:4px 10px; font-size:0.8rem; background:rgba(244,63,94,0.15); color:#F43F5E; border:1px solid rgba(244,63,94,0.3); border-radius:4px; cursor:pointer;">Dismiss</button>' +
                    '</td>' +
                  '</tr>';
                  globalIdx++;
                });
              });
            } else {
              // Flat View (grouping === 'none')
              currentItems.forEach((item, idx) => {
                const streamerKey = String(item.source_user_id || item.source_username || 'unknown');
                const showTitle = item.show_title || item.title || 'Untitled';
                const groupKey = streamerKey + ':::' + showTitle;
                const group = currentGroups.find(g => g.groupKey === groupKey);
                const totalInGroup = group ? group.items.length : 1;
                const isChecked = selectedIds.has(item.id);
                const seasonEp = item.media_type === 'episode'
                  ? 'S' + String(item.season_number ?? 0).padStart(2, '0') + 'E' + String(item.episode_number ?? 0).padStart(2, '0')
                  : '-';
                const displayTitle = item.show_title
                  ? '<strong>' + escapeHtml(item.show_title) + '</strong><br><small style="color:var(--text-muted);">' + escapeHtml(item.title) + '</small>'
                  : '<strong>' + escapeHtml(item.title) + '</strong>';

                  const confirmations = (item.confirmations || []).map(c => {
                    return '<span class="badge badge-success" style="font-size:0.7rem; padding:3px 8px; margin:2px;">' +
                      escapeHtml(c.targetDisplayName || c.targetUsername) + '</span>';
                  }).join('');

                  const selectGroupBtn = totalInGroup > 1
                    ? ' <button type="button" class="btn-select-group" data-group-key="' + escapeHtml(groupKey) + '" style="padding:2px 8px; font-size:0.7rem; background:rgba(6,182,212,0.12); color:#06B6D4; border:1px solid rgba(6,182,212,0.3); border-radius:4px; cursor:pointer; vertical-align:middle;" title="Select all ' + totalInGroup + ' of this show">Select Show (' + totalInGroup + ')</button>'
                    : '';

                  rowsHtml += '<tr class="prompt-row ' + (isChecked ? 'selected' : '') + '" data-id="' + item.id + '" data-idx="' + idx + '" data-group-key="' + escapeHtml(groupKey) + '" style="cursor:pointer;">' +
                    '<td style="text-align:center;"><input type="checkbox" class="prompt-row-select" data-id="' + item.id + '" ' + (isChecked ? 'checked' : '') + ' style="width:18px; height:18px; accent-color:#06B6D4; cursor:pointer;"></td>' +
                    '<td><div style="display:flex; align-items:center; gap:6px;"><strong>' + escapeHtml(item.source_display_name || item.source_username) + '</strong><button type="button" class="btn btn-row-streamer" data-id="' + item.id + '" data-current="' + item.source_user_id + '" style="padding:1px 6px; font-size:0.7rem; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.15); border-radius:4px; cursor:pointer; color:var(--text-muted);" title="Change streamer for this prompt">✎</button></div></td>' +
                    '<td>' + displayTitle + selectGroupBtn + '</td>' +
                    '<td>' + escapeHtml(seasonEp) + '</td>' +
                    '<td style="white-space:nowrap; font-size:0.85rem;">' + formatDate(item.watched_at) + '</td>' +
                    '<td>' + formatStatusBadge(item.prompt_status) + '</td>' +
                    '<td>' + (confirmations || '<span style="color:var(--text-muted); font-size:0.8rem;">None</span>') + '</td>' +
                  '<td style="text-align:right; white-space:nowrap;">' +
                    '<button type="button" class="btn btn-row-confirm" data-id="' + item.id + '" style="padding:4px 10px; font-size:0.8rem; background:#10B981; color:#fff; border:none; border-radius:4px; margin-right:6px; cursor:pointer;">Confirm</button>' +
                    '<button type="button" class="btn btn-row-dismiss" data-id="' + item.id + '" style="padding:4px 10px; font-size:0.8rem; background:rgba(244,63,94,0.15); color:#F43F5E; border:1px solid rgba(244,63,94,0.3); border-radius:4px; cursor:pointer;">Dismiss</button>' +
                  '</td>' +
                '</tr>';
              });
            }

            tbody.innerHTML = rowsHtml;
            updateSelectionUI();
          } catch (err) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:40px; color:#F43F5E;">Failed to fetch prompts: ' + escapeHtml(err.message) + '</td></tr>';
          }
        }

        // Initialize Users
        fetch('/api/dashboard/users')
          .then(r => r.json())
          .then(data => {
            if (data.ok && data.users) {
              usersList = data.users;
              const sourceSelect = document.getElementById('filterSourceUser');
              const targetSelect = document.getElementById('targetCoWatcher');
              const listContainer = document.getElementById('cowatchers-list');
              const bulkStreamerSelect = document.getElementById('bulkChangeStreamerSelect');
              const dialogStreamerSelect = document.getElementById('streamer-dialog-select');

              if (targetSelect) targetSelect.innerHTML = '<option value="">Select Co-Watcher...</option><option value="none">Nobody (Watched Alone)</option>';
              if (listContainer) listContainer.innerHTML = '';
              if (bulkStreamerSelect) bulkStreamerSelect.innerHTML = '<option value="">Select Streamer...</option>';
              if (dialogStreamerSelect) dialogStreamerSelect.innerHTML = '<option value="">Select household user...</option>';

              usersList.forEach(u => {
                const opt1 = document.createElement('option');
                opt1.value = u.plex_username;
                opt1.textContent = userLabel(u);
                sourceSelect.appendChild(opt1);

                if (targetSelect) {
                  const opt2 = document.createElement('option');
                  opt2.value = String(u.id);
                  opt2.textContent = userLabel(u);
                  targetSelect.appendChild(opt2);
                }

                if (bulkStreamerSelect) {
                  const optB = document.createElement('option');
                  optB.value = String(u.id);
                  optB.textContent = userLabel(u);
                  bulkStreamerSelect.appendChild(optB);
                }

                if (dialogStreamerSelect) {
                  const optD = document.createElement('option');
                  optD.value = String(u.id);
                  optD.textContent = userLabel(u);
                  dialogStreamerSelect.appendChild(optD);
                }

                if (listContainer) {
                  const itemLabel = document.createElement('label');
                  itemLabel.className = 'cowatcher-item';
                  itemLabel.innerHTML = '<input type="checkbox" class="cowatcher-checkbox" value="' + u.id + '"> <span>' + escapeHtml(userLabel(u)) + '</span>';
                  listContainer.appendChild(itemLabel);
                }
              });
            }
            loadPrompts();
          })
          .catch(() => loadPrompts());

        // Dropdown toggle & outside-click close
        const toggleBtn = document.getElementById('btn-cowatchers-toggle');
        const cowatchersDropdown = document.getElementById('cowatchers-dropdown');
        if (toggleBtn && cowatchersDropdown) {
          toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            cowatchersDropdown.classList.toggle('hidden');
          });

          document.addEventListener('click', (e) => {
            if (!e.target.closest('.watched-with-control')) {
              cowatchersDropdown.classList.add('hidden');
            }
          });
        }

        // Quick action buttons in dropdown: Nobody, Everyone, Clear
        document.getElementById('btn-select-nobody')?.addEventListener('click', (e) => {
          e.stopPropagation();
          isSoloSelected = true;
          selectedCoWatcherIds.clear();
          updateCoWatcherUI();
          cowatchersDropdown?.classList.add('hidden');
        });

        document.getElementById('btn-select-everyone')?.addEventListener('click', (e) => {
          e.stopPropagation();
          isSoloSelected = false;
          selectedCoWatcherIds.clear();
          usersList.forEach(u => selectedCoWatcherIds.add(Number(u.id)));
          updateCoWatcherUI();
          cowatchersDropdown?.classList.add('hidden');
        });

        document.getElementById('btn-clear-cowatchers')?.addEventListener('click', (e) => {
          e.stopPropagation();
          isSoloSelected = false;
          selectedCoWatcherIds.clear();
          updateCoWatcherUI();
        });

        // Checkbox selection in co-watchers list
        document.getElementById('cowatchers-list')?.addEventListener('change', (e) => {
          const cb = e.target.closest('.cowatcher-checkbox');
          if (!cb) return;
          const uId = Number(cb.value);
          if (cb.checked) {
            isSoloSelected = false;
            selectedCoWatcherIds.add(uId);
          } else {
            selectedCoWatcherIds.delete(uId);
          }
          updateCoWatcherUI();
        });

        // Filter Form Events
        document.getElementById('prompts-filter-form').addEventListener('submit', (e) => {
          e.preventDefault();
          currentPage = 1;
          selectedIds.clear();
          hideFeedback();
          loadPrompts();
        });

        document.getElementById('prompts-filter-reset').addEventListener('click', () => {
          const form = document.getElementById('prompts-filter-form');
          form.reset();
          currentPage = 1;
          selectedIds.clear();
          hideFeedback();
          loadPrompts();
        });

        // Pagination Events
        document.getElementById('btn-page-prev').addEventListener('click', () => {
          if (currentPage > 1) {
            currentPage--;
            loadPrompts();
          }
        });

        document.getElementById('btn-page-next').addEventListener('click', () => {
          currentPage++;
          loadPrompts();
        });

        // Clear Selection Button
        document.getElementById('btn-clear-selection').addEventListener('click', () => {
          selectedIds.clear();
          document.querySelectorAll('.prompt-row-select').forEach(cb => cb.checked = false);
          document.querySelectorAll('.prompt-row').forEach(r => r.classList.remove('selected'));
          document.querySelectorAll('.prompt-group-select').forEach(cb => { cb.checked = false; cb.indeterminate = false; });
          updateSelectionUI();
        });

        // Master Select Checkbox
        document.getElementById('master-select-checkbox').addEventListener('change', (e) => {
          const checked = e.target.checked;
          const rows = document.querySelectorAll('.prompt-row');
          rows.forEach(row => {
            const id = Number(row.getAttribute('data-id'));
            const cb = row.querySelector('.prompt-row-select');
            if (checked) {
              selectedIds.add(id);
              if (cb) cb.checked = true;
              row.classList.add('selected');
            } else {
              selectedIds.delete(id);
              if (cb) cb.checked = false;
              row.classList.remove('selected');
            }
          });
          updateSelectionUI();
        });

        // Table Body Delegated Events: Group Checkbox, Select Group, Group Confirm/Dismiss, Row Actions, Row Click
        document.getElementById('prompts-table-body').addEventListener('click', async (e) => {
          // 1. Group Checkbox
          const groupCb = e.target.closest('.prompt-group-select');
          if (groupCb) {
            const groupKey = groupCb.getAttribute('data-group-key');
            const shouldCheck = groupCb.checked;
            const groupRows = document.querySelectorAll('.prompt-row[data-group-key="' + groupKey + '"]');
            groupRows.forEach(row => {
              const id = Number(row.getAttribute('data-id'));
              const cb = row.querySelector('.prompt-row-select');
              if (shouldCheck) {
                selectedIds.add(id);
                if (cb) cb.checked = true;
                row.classList.add('selected');
              } else {
                selectedIds.delete(id);
                if (cb) cb.checked = false;
                row.classList.remove('selected');
              }
            });
            updateSelectionUI();
            return;
          }

          // 2. Select Group Button
          const btnSelectGroup = e.target.closest('.btn-select-group');
          if (btnSelectGroup) {
            const groupKey = btnSelectGroup.getAttribute('data-group-key');
            const groupRows = document.querySelectorAll('.prompt-row[data-group-key="' + groupKey + '"]');
            groupRows.forEach(row => {
              const id = Number(row.getAttribute('data-id'));
              const cb = row.querySelector('.prompt-row-select');
              selectedIds.add(id);
              if (cb) cb.checked = true;
              row.classList.add('selected');
            });
            updateSelectionUI();
            return;
          }

          // 2b. Change Streamer for Group
          const btnGroupStreamer = e.target.closest('.btn-group-streamer');
          if (btnGroupStreamer) {
            const groupKey = btnGroupStreamer.getAttribute('data-group-key');
            const group = currentGroups.find(g => g.groupKey === groupKey);
            if (!group || group.items.length === 0) return;
            openChangeStreamerDialog(
              group.items.map(i => i.id),
              group.items[0]?.source_user_id,
              'Change streamer for all ' + group.items.length + ' item(s) of "' + group.showTitle + '"'
            );
            return;
          }

          // 3. Confirm Group Button
          const btnGroupConfirm = e.target.closest('.btn-group-confirm');
          if (btnGroupConfirm) {
            const groupKey = btnGroupConfirm.getAttribute('data-group-key');
            const group = currentGroups.find(g => g.groupKey === groupKey);
            if (!group || group.items.length === 0) return;

            if (!isSoloSelected && selectedCoWatcherIds.size === 0) {
              alert('Please select who watched in the "Watched With" dropdown above first (choose household member(s) or "Nobody (Watched Alone)").');
              document.getElementById('btn-cowatchers-toggle')?.focus();
              return;
            }

            if (isSoloSelected) {
              const resolvableItems = group.items.filter(i => i.prompt_status !== 'none');
              if (resolvableItems.length === 0) {
                alert('All items in this group are already marked as watched alone.');
                return;
              }
              const count = resolvableItems.length;
              if (!confirm('Mark ' + count + ' prompt(s) for "' + group.showTitle + '" as watched alone (nobody)?')) {
                return;
              }
              btnGroupConfirm.disabled = true;
              showFeedback('info', 'Resolving ' + count + ' prompt(s) as watched alone...');
              try {
                const res = await fetch('/api/dashboard/prompts/bulk-resolve', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    watchEventIds: resolvableItems.map(i => i.id),
                    action: 'none'
                  })
                });
                const result = await res.json();
                if (result.ok) {
                  showFeedback('success', 'Successfully marked ' + result.data.successCount + ' item(s) as watched alone.');
                  resolvableItems.forEach(i => selectedIds.delete(i.id));
                  loadPrompts();
                } else {
                  showFeedback('danger', 'Error: ' + (result.message || 'Resolution failed.'));
                }
              } catch (err) {
                showFeedback('danger', 'Server request failed: ' + err.message);
              } finally {
                btnGroupConfirm.disabled = false;
              }
              return;
            }

            const targetNames = getSelectedCoWatcherNames();
            const targetIdsArray = Array.from(selectedCoWatcherIds);
            const unconfirmedItems = group.items.filter(i => i.prompt_status !== 'confirmed');
            if (unconfirmedItems.length === 0) {
              alert('All items in this group are already confirmed.');
              return;
            }

            const count = unconfirmedItems.length;
            if (!confirm('Confirm ' + count + ' prompt(s) for "' + group.showTitle + '" as co-watched with ' + targetNames + '? This will synchronize watched states to Plex.')) {
              return;
            }

            btnGroupConfirm.disabled = true;
            showFeedback('info', 'Synchronizing ' + count + ' co-watch session(s)...');

            try {
              const res = await fetch('/api/dashboard/prompts/bulk-resolve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  watchEventIds: unconfirmedItems.map(i => i.id),
                  action: 'confirm',
                  targetUserIds: targetIdsArray
                })
              });
              const result = await res.json();
              if (result.ok) {
                showFeedback('success', 'Successfully confirmed ' + result.data.successCount + ' item(s) for ' + targetNames + '!');
                unconfirmedItems.forEach(i => selectedIds.delete(i.id));
                loadPrompts();
              } else {
                showFeedback('danger', 'Error: ' + (result.message || 'Group confirmation failed.'));
              }
            } catch (err) {
              showFeedback('danger', 'Server request failed: ' + err.message);
            } finally {
              btnGroupConfirm.disabled = false;
            }
            return;
          }

          // 4. Dismiss Group Button
          const btnGroupDismiss = e.target.closest('.btn-group-dismiss');
          if (btnGroupDismiss) {
            const groupKey = btnGroupDismiss.getAttribute('data-group-key');
            const group = currentGroups.find(g => g.groupKey === groupKey);
            if (!group || group.items.length === 0) return;

            const dismissableItems = group.items.filter(i => i.prompt_status !== 'dismissed');
            if (dismissableItems.length === 0) {
              alert('All items in this group are already dismissed.');
              return;
            }

            const count = dismissableItems.length;
            if (!confirm('Dismiss ' + count + ' prompt(s) for "' + group.showTitle + '"?')) {
              return;
            }

            btnGroupDismiss.disabled = true;
            showFeedback('info', 'Dismissing ' + count + ' prompt(s)...');

            try {
              const res = await fetch('/api/dashboard/prompts/bulk-resolve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  watchEventIds: dismissableItems.map(i => i.id),
                  action: 'dismiss'
                })
              });
              const result = await res.json();
              if (result.ok) {
                showFeedback('success', 'Successfully dismissed ' + result.data.successCount + ' prompt(s).');
                dismissableItems.forEach(i => selectedIds.delete(i.id));
                loadPrompts();
              } else {
                showFeedback('danger', 'Error: ' + (result.message || 'Group dismissal failed.'));
              }
            } catch (err) {
              showFeedback('danger', 'Server request failed: ' + err.message);
            } finally {
              btnGroupDismiss.disabled = false;
            }
            return;
          }

          // 5. Single Row Confirm
          const btnConfirm = e.target.closest('.btn-row-confirm');
          if (btnConfirm) {
            const id = Number(btnConfirm.getAttribute('data-id'));
            if (!isSoloSelected && selectedCoWatcherIds.size === 0) {
              alert('Please select who watched in the "Watched With" dropdown above first (choose household member(s) or "Nobody (Watched Alone)").');
              document.getElementById('btn-cowatchers-toggle')?.focus();
              return;
            }

            if (isSoloSelected) {
              btnConfirm.disabled = true;
              try {
                const res = await fetch('/api/dashboard/prompts/' + id + '/none', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ confirm: true })
                });
                const r = await res.json();
                if (r.ok) {
                  showFeedback('success', 'Marked prompt #' + id + ' as watched alone.');
                  selectedIds.delete(id);
                  loadPrompts();
                } else {
                  alert('Action failed: ' + (r.message || 'Unknown error'));
                }
              } catch (err) {
                alert('Error: ' + err.message);
              } finally {
                btnConfirm.disabled = false;
              }
              return;
            }

            const targetNames = getSelectedCoWatcherNames();
            const targetIdsArray = Array.from(selectedCoWatcherIds);
            btnConfirm.disabled = true;
            try {
              const res = await fetch('/api/prompts/resolve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  watchEventId: id,
                  selectedTargetUserIds: targetIdsArray
                })
              });
              const r = await res.json();
              if (r.ok) {
                showFeedback('success', 'Confirmed watch event #' + id + ' for ' + targetNames + '.');
                selectedIds.delete(id);
                loadPrompts();
              } else {
                alert('Confirmation failed: ' + (r.message || 'Unknown error'));
              }
            } catch (err) {
              alert('Error: ' + err.message);
            } finally {
              btnConfirm.disabled = false;
            }
            return;
          }

          // 6. Single Row Dismiss
          const btnDismiss = e.target.closest('.btn-row-dismiss');
          if (btnDismiss) {
            const id = Number(btnDismiss.getAttribute('data-id'));
            if (!confirm('Dismiss prompt #' + id + '?')) return;
            btnDismiss.disabled = true;
            try {
              const res = await fetch('/api/dashboard/prompts/' + id + '/dismiss', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ confirm: true })
              });
              const r = await res.json();
              if (r.ok) {
                showFeedback('success', 'Dismissed prompt #' + id + '.');
                selectedIds.delete(id);
                loadPrompts();
              } else {
                alert('Dismiss failed: ' + (r.message || 'Unknown error'));
              }
            } catch (err) {
              alert('Error: ' + err.message);
            } finally {
              btnDismiss.disabled = false;
            }
            return;
          }

          // 6b. Single Row Change Streamer
          const btnRowStreamer = e.target.closest('.btn-row-streamer');
          if (btnRowStreamer) {
            const id = Number(btnRowStreamer.getAttribute('data-id'));
            const currentUserId = Number(btnRowStreamer.getAttribute('data-current'));
            const item = currentItems.find(i => i.id === id);
            const title = item ? (item.show_title ? item.show_title + ' - ' + item.title : item.title) : ('prompt #' + id);
            openChangeStreamerDialog([id], currentUserId, 'Change streamer for "' + title + '"');
            return;
          }

          // 7. Row Click & Shift+Click Selection
          const row = e.target.closest('.prompt-row');
          if (!row) return;

          const idx = Number(row.getAttribute('data-idx'));
          const id = Number(row.getAttribute('data-id'));
          const checkbox = row.querySelector('.prompt-row-select');

          if (e.shiftKey && lastClickedIndex !== -1 && lastClickedIndex !== idx) {
            const start = Math.min(lastClickedIndex, idx);
            const end = Math.max(lastClickedIndex, idx);
            const allRows = document.querySelectorAll('.prompt-row');
            const targetState = !selectedIds.has(id);

            for (let i = start; i <= end; i++) {
              const r = allRows[i];
              if (!r) continue;
              const rId = Number(r.getAttribute('data-id'));
              const rCb = r.querySelector('.prompt-row-select');
              if (targetState) {
                selectedIds.add(rId);
                if (rCb) rCb.checked = true;
                r.classList.add('selected');
              } else {
                selectedIds.delete(rId);
                if (rCb) rCb.checked = false;
                r.classList.remove('selected');
              }
            }
          } else {
            if (e.target !== checkbox) {
              checkbox.checked = !checkbox.checked;
            }
            if (checkbox.checked) {
              selectedIds.add(id);
              row.classList.add('selected');
            } else {
              selectedIds.delete(id);
              row.classList.remove('selected');
            }
          }

          lastClickedIndex = idx;
          updateSelectionUI();
        });

        // Bulk Confirm Action
        document.getElementById('btn-bulk-confirm').addEventListener('click', async () => {
          if (!isSoloSelected && selectedCoWatcherIds.size === 0) {
            alert('Please select who watched in the "Watched With" dropdown (choose household member(s) or "Nobody (Watched Alone)").');
            document.getElementById('btn-cowatchers-toggle')?.focus();
            return;
          }
          if (selectedIds.size === 0) return;

          const btn = document.getElementById('btn-bulk-confirm');

          if (isSoloSelected) {
            if (!confirm('Mark ' + selectedIds.size + ' prompt(s) as watched alone (nobody)? This will remove them from the unaddressed queue.')) {
              return;
            }
            btn.disabled = true;
            showFeedback('info', 'Resolving ' + selectedIds.size + ' prompt(s) as watched alone...');
            try {
              const res = await fetch('/api/dashboard/prompts/bulk-resolve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  watchEventIds: Array.from(selectedIds),
                  action: 'none'
                })
              });
              const result = await res.json();
              if (result.ok) {
                showFeedback('success', 'Successfully marked ' + result.data.successCount + ' prompt(s) as watched alone.');
                selectedIds.clear();
                loadPrompts();
              } else {
                showFeedback('danger', 'Error: ' + (result.message || 'Bulk resolution failed.'));
              }
            } catch (err) {
              showFeedback('danger', 'Server request failed: ' + err.message);
            } finally {
              btn.disabled = false;
            }
            return;
          }

          const targetNames = getSelectedCoWatcherNames();
          const targetIdsArray = Array.from(selectedCoWatcherIds);
          if (!confirm('Confirm ' + selectedIds.size + ' prompt(s) as co-watched with ' + targetNames + '? This will synchronize watched states to Plex.')) {
            return;
          }

          btn.disabled = true;
          showFeedback('info', 'Synchronizing ' + selectedIds.size + ' co-watch session(s)...');

          try {
            const res = await fetch('/api/dashboard/prompts/bulk-resolve', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                watchEventIds: Array.from(selectedIds),
                action: 'confirm',
                targetUserIds: targetIdsArray
              })
            });
            const result = await res.json();
            if (result.ok) {
              showFeedback('success', 'Successfully confirmed ' + result.data.successCount + ' prompt(s) for ' + targetNames + '!');
              selectedIds.clear();
              loadPrompts();
            } else {
              showFeedback('danger', 'Error: ' + (result.message || 'Bulk confirmation failed.'));
            }
          } catch (err) {
            showFeedback('danger', 'Server request failed: ' + err.message);
          } finally {
            btn.disabled = false;
          }
        });

        // Bulk Dismiss Action
        document.getElementById('btn-bulk-dismiss').addEventListener('click', async () => {
          if (selectedIds.size === 0) return;
          if (!confirm('Dismiss ' + selectedIds.size + ' prompt(s)? They will no longer appear in the unaddressed queue.')) {
            return;
          }

          const btn = document.getElementById('btn-bulk-dismiss');
          btn.disabled = true;
          showFeedback('info', 'Dismissing ' + selectedIds.size + ' prompt(s)...');

          try {
            const res = await fetch('/api/dashboard/prompts/bulk-resolve', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                watchEventIds: Array.from(selectedIds),
                action: 'dismiss'
              })
            });
            const result = await res.json();
            if (result.ok) {
              showFeedback('success', 'Successfully dismissed ' + result.data.successCount + ' prompt(s).');
              selectedIds.clear();
              loadPrompts();
            } else {
              showFeedback('danger', 'Error: ' + (result.message || 'Bulk dismissal failed.'));
            }
          } catch (err) {
            showFeedback('danger', 'Server request failed: ' + err.message);
          } finally {
            btn.disabled = false;
          }
        });

        // Streamer Change Dialog and Actions
        let pendingStreamerEventIds = [];

        function openChangeStreamerDialog(eventIds, currentUserId, subtitleText) {
          pendingStreamerEventIds = eventIds;
          const dialog = document.getElementById('change-streamer-dialog');
          const select = document.getElementById('streamer-dialog-select');
          const subtitle = document.getElementById('streamer-dialog-subtitle');
          if (subtitle && subtitleText) subtitle.textContent = subtitleText;
          if (select) {
            select.value = currentUserId ? String(currentUserId) : '';
          }
          if (dialog && typeof dialog.showModal === 'function') {
            dialog.showModal();
          }
        }

        document.getElementById('streamer-dialog-cancel')?.addEventListener('click', () => {
          document.getElementById('change-streamer-dialog')?.close();
          pendingStreamerEventIds = [];
        });

        document.getElementById('change-streamer-form')?.addEventListener('submit', async (e) => {
          e.preventDefault();
          const select = document.getElementById('streamer-dialog-select');
          const newUserId = Number(select?.value);
          const dialog = document.getElementById('change-streamer-dialog');
          if (!newUserId || pendingStreamerEventIds.length === 0) {
            dialog?.close();
            return;
          }

          const targetUserObj = usersList.find(u => Number(u.id) === newUserId);
          const targetName = targetUserObj ? userLabel(targetUserObj) : 'User #' + newUserId;
          const submitBtn = document.getElementById('streamer-dialog-submit');
          if (submitBtn) submitBtn.disabled = true;

          try {
            const res = await fetch('/api/dashboard/prompts/change-streamer', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                watchEventIds: pendingStreamerEventIds,
                newSourceUserId: newUserId
              })
            });
            const result = await res.json();
            dialog?.close();
            if (result.ok) {
              showFeedback('success', 'Successfully changed streamer to ' + targetName + ' for ' + result.data.updatedCount + ' prompt(s)!');
              pendingStreamerEventIds.forEach(id => selectedIds.delete(id));
              loadPrompts();
            } else {
              showFeedback('danger', 'Error: ' + (result.message || 'Streamer update failed.'));
            }
          } catch (err) {
            dialog?.close();
            showFeedback('danger', 'Server request failed: ' + err.message);
          } finally {
            if (submitBtn) submitBtn.disabled = false;
            pendingStreamerEventIds = [];
          }
        });

        // Bulk Change Streamer Select Change & Button Click
        document.getElementById('bulkChangeStreamerSelect')?.addEventListener('change', () => {
          updateSelectionUI();
        });

        document.getElementById('btn-bulk-change-streamer')?.addEventListener('click', async () => {
          const bulkStreamerSelect = document.getElementById('bulkChangeStreamerSelect');
          const newUserId = Number(bulkStreamerSelect?.value);
          if (!newUserId || selectedIds.size === 0) return;

          const targetUserObj = usersList.find(u => Number(u.id) === newUserId);
          const targetName = targetUserObj ? userLabel(targetUserObj) : 'User #' + newUserId;

          if (!confirm('Change source streamer to "' + targetName + '" for ' + selectedIds.size + ' selected prompt(s)?')) {
            return;
          }

          const btn = document.getElementById('btn-bulk-change-streamer');
          btn.disabled = true;
          showFeedback('info', 'Updating streamer for ' + selectedIds.size + ' prompt(s)...');

          try {
            const res = await fetch('/api/dashboard/prompts/change-streamer', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                watchEventIds: Array.from(selectedIds),
                newSourceUserId: newUserId
              })
            });
            const result = await res.json();
            if (result.ok) {
              showFeedback('success', 'Successfully changed streamer to ' + targetName + ' for ' + result.data.updatedCount + ' prompt(s)!');
              selectedIds.clear();
              bulkStreamerSelect.value = '';
              loadPrompts();
            } else {
              showFeedback('danger', 'Error: ' + (result.message || 'Streamer update failed.'));
            }
          } catch (err) {
            showFeedback('danger', 'Server request failed: ' + err.message);
          } finally {
            btn.disabled = false;
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

  router.get("/achievements", (_req, res) => {
    res.type("html").send(renderPage("Achievements", `
      <style>
        .app-page > h1 {
          display: none;
        }
        .achievements-container {
          max-width: 1400px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .achievements-hud {
          position: sticky;
          top: 76px;
          z-index: 25;
          background: rgba(22, 27, 34, 0.94);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 14px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
          overflow: hidden;
          transition: all 0.25s ease;
        }
        .hud-main-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: nowrap;
          gap: 10px;
          padding: 6px 14px;
          min-height: 48px;
        }
        @media (max-width: 1100px) {
          .hud-main-bar {
            flex-wrap: wrap;
            gap: 8px;
          }
        }
        .hud-left-group {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }
        .hud-profile-pill {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #0d1117;
          border: 1px solid #30363d;
          border-radius: 10px;
          padding: 4px 10px 4px 5px;
          cursor: pointer;
          color: #f0f6fc;
          transition: all 0.15s ease;
        }
        .hud-profile-pill:hover {
          background: #161b22;
          border-color: #58a6ff;
        }
        .hud-avatar {
          width: 28px;
          height: 28px;
          border-radius: 8px;
          background: #1f6feb;
          color: #fff;
          font-weight: 700;
          font-size: 0.9rem;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(88, 166, 255, 0.4);
          flex-shrink: 0;
        }
        .hud-profile-meta {
          display: flex;
          align-items: center;
          gap: 5px;
        }
        .hud-profile-name {
          font-weight: 700;
          font-size: 0.88rem;
          color: #fff;
          white-space: nowrap;
        }
        .hud-chevron {
          font-size: 0.75rem;
          color: #8b949e;
          transition: transform 0.2s ease;
          display: inline-block;
        }
        .hud-chevron.open {
          transform: rotate(180deg);
        }
        .hud-trophies-badge {
          border-left: 1px solid #30363d;
          padding-left: 8px;
          font-size: 0.8rem;
          font-weight: 700;
          color: #fbbf24;
          white-space: nowrap;
        }
        .hud-quick-stats {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #0d1117;
          border: 1px solid #30363d;
          border-radius: 8px;
          padding: 4px 10px;
          font-size: 0.78rem;
          color: #8b949e;
          white-space: nowrap;
        }
        .hud-quick-stats strong {
          color: #f0f6fc;
        }
        .hud-stat-caughtup {
          color: #34d399 !important;
          font-weight: 600;
        }
        .hud-stat-inprogress {
          color: #fbbf24 !important;
          font-weight: 600;
        }
        .hud-facet-filters {
          display: flex;
          align-items: center;
          gap: 4px;
          background: #0d1117;
          border: 1px solid #30363d;
          border-radius: 10px;
          padding: 3px 4px;
          flex-wrap: nowrap;
        }
        .hud-facet-filters .btn-facet {
          padding: 4px 9px;
          font-size: 0.78rem;
          border-radius: 6px;
          white-space: nowrap;
        }
        .hud-right-group {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }
        .hud-state-filters {
          display: flex;
          align-items: center;
          gap: 3px;
          background: #0d1117;
          border: 1px solid #30363d;
          border-radius: 8px;
          padding: 3px 4px;
        }
        .hud-state-filters .btn-state {
          padding: 4px 8px;
          font-size: 0.74rem;
          border-radius: 5px;
          white-space: nowrap;
        }
        .hud-sort-controls {
          display: flex;
          align-items: center;
        }
        .hud-sort-controls select {
          background: #0d1117;
          color: #f0f6fc;
          border: 1px solid #30363d;
          border-radius: 8px;
          padding: 4px 8px;
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
          outline: none;
          color-scheme: dark;
          max-width: 145px;
          transition: border-color 0.15s ease;
        }
        .hud-sort-controls select:hover {
          border-color: #58a6ff;
        }
        .hud-refresh-btn {
          padding: 4px 9px;
          font-size: 0.82rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #0d1117;
          border: 1px solid #30363d;
          border-radius: 8px;
        }
        .hud-profile-drawer {
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          background: #0d1117;
          padding: 12px 16px;
          animation: drawerSlideDown 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes drawerSlideDown {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .hud-drawer-inner {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .hud-drawer-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 8px;
        }
        .hud-drawer-title {
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--text-muted);
        }
        .hud-user-tabs {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding: 4px 2px 8px 2px;
          scroll-behavior: smooth;
        }
        .hud-drawer-hero {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
          padding: 10px 14px;
          background: rgba(22, 27, 34, 0.7);
          border: 1px solid rgba(99, 102, 241, 0.2);
          border-radius: 10px;
        }
        .hud-drawer-stats {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .hud-mini-stat {
          background: #0d1117;
          border: 1px solid #30363d;
          border-radius: 8px;
          padding: 4px 10px;
          display: flex;
          flex-direction: column;
          align-items: center;
          min-width: 60px;
        }
        .hud-mini-stat-val {
          font-size: 1.05rem;
          font-weight: 700;
          line-height: 1.1;
        }
        .hud-mini-stat-lbl {
          font-size: 0.65rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.04em;
          margin-top: 1px;
        }
        .text-blue { color: #58a6ff; }
        .text-amber { color: #f59e0b; }
        .text-emerald { color: #10b981; }
        .text-muted { color: #8b949e; }
        @media (max-width: 900px) {
          .hud-main-bar {
            flex-direction: column;
            align-items: stretch;
            gap: 8px;
            padding: 8px 10px;
          }
          .hud-left-group, .hud-right-group, .hud-facet-filters {
            justify-content: space-between;
            width: 100%;
          }
        }
        .user-tab {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 18px;
          border-radius: 999px;
          border: 1px solid var(--border-color, #30363d);
          background: var(--bg-card, #161b22);
          color: var(--text-muted, #8b949e);
          cursor: grab;
          transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
          white-space: nowrap;
          user-select: none;
        }
        .user-tab:active {
          cursor: grabbing;
        }
        .user-tab.dragging {
          opacity: 0.35;
          cursor: grabbing;
          border-style: dashed;
        }
        .user-tab.drag-over {
          border-color: #58a6ff;
          box-shadow: 0 0 0 2px rgba(88, 166, 255, 0.4);
          transform: translateY(-2px);
        }
        .user-tab:hover {
          color: var(--text-primary, #f0f6fc);
          border-color: #58a6ff;
        }
        .user-tab.active {
          background: #1f6feb;
          color: #fff;
          border-color: #58a6ff;
          box-shadow: 0 4px 12px rgba(31, 111, 235, 0.35);
        }
        .btn-facet, .btn-state {
          padding: 6px 14px;
          border-radius: 8px;
          font-size: 0.8rem;
          font-weight: 600;
          border: none;
          background: transparent;
          color: var(--text-muted, #8b949e);
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .btn-facet:hover, .btn-state:hover {
          color: var(--text-primary, #f0f6fc);
        }
        .btn-facet.active {
          background: #1f6feb;
          color: #fff;
        }
        .btn-state.active {
          background: #238636;
          color: #fff;
        }
        #sort-controls {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(22, 27, 34, 0.85);
          padding: 6px 12px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.12);
        }
        #sort-badges-select {
          background-color: #0d1117;
          color: #f0f6fc;
          border: 1px solid #30363d;
          border-radius: 8px;
          padding: 6px 12px;
          font-size: 0.82rem;
          font-weight: 600;
          cursor: pointer;
          outline: none;
          color-scheme: dark;
          transition: border-color 0.15s ease;
        }
        #sort-badges-select:hover, #sort-badges-select:focus {
          border-color: #58a6ff;
        }
        #sort-badges-select option {
          background-color: #0d1117;
          color: #f0f6fc;
          padding: 8px 12px;
        }
        .trophy-card {
          display: flex;
          flex-direction: column;
          border-radius: 12px;
          background: var(--bg-card, #161b22);
          border: 1px solid var(--border-color, #30363d);
          overflow: hidden;
          cursor: pointer;
          transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
          position: relative;
        }
        .trophy-card:hover {
          transform: translateY(-4px);
          border-color: #58a6ff;
          box-shadow: 0 12px 24px -6px rgba(0, 0, 0, 0.6);
        }
        .trophy-poster-frame {
          position: relative;
          aspect-ratio: 2/3;
          background: #0d1117;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .trophy-poster-frame img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 0.3s ease;
        }
        .trophy-card:hover .trophy-poster-frame img {
          transform: scale(1.05);
        }
        .trophy-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(to top, rgba(13, 17, 23, 0.95) 0%, rgba(13, 17, 23, 0.6) 40%, transparent 100%);
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          padding: 12px;
          z-index: 2;
        }
        .badge-card {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 16px;
          border-radius: 12px;
          background: var(--bg-card, #161b22);
          border: 1px solid var(--border-color, #30363d);
          cursor: pointer;
          transition: all 0.2s ease;
          gap: 12px;
        }
        .badge-card:hover {
          transform: translateY(-2px);
          border-color: #58a6ff;
          background: #1c2128;
        }
        .tier-ribbon {
          position: absolute;
          top: 8px;
          right: 8px;
          padding: 3px 8px;
          border-radius: 6px;
          font-size: 0.65rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          z-index: 3;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
        }
        .tier-pill {
          position: absolute;
          top: 8px;
          left: 8px;
          padding: 3px 6px;
          border-radius: 4px;
          font-size: 0.65rem;
          font-weight: 700;
          text-transform: uppercase;
          z-index: 3;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(4px);
        }
        .ribbon-bronze { background: #d97706; color: #fff; }
        .ribbon-silver { background: #94a3b8; color: #0f172a; }
        .ribbon-gold { background: #eab308; color: #422006; }
        .ribbon-platinum { background: #38bdf8; color: #082f49; }
        .modal-ep-tab {
          padding: 6px 12px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(22, 27, 34, 0.75);
          color: #94a3b8;
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .modal-ep-tab:hover {
          color: #fff;
          background: rgba(255, 255, 255, 0.08);
        }
        .modal-ep-tab.active {
          color: #fff;
          background: #1f6feb;
          border-color: #388bfd;
        }
        .modal-ep-row {
          display: grid;
          grid-template-columns: 75px minmax(0, 1fr) 55px 95px 95px;
          gap: 8px;
          align-items: center;
          padding: 7px 10px;
          background: #0d1117;
          border: 1px solid #21262d;
          border-radius: 8px;
          font-size: 0.78rem;
          transition: background 0.15s ease;
        }
        .modal-ep-row:hover {
          background: #161b22;
          border-color: #30363d;
        }
        @media (max-width: 600px) {
          .modal-ep-row {
            grid-template-columns: 60px minmax(0, 1fr) 50px 85px;
          }
          .modal-ep-row .hide-mobile {
            display: none;
          }
        }
        .modal-film-row {
          display: grid;
          grid-template-columns: 32px minmax(0, 1fr) 95px 55px 95px;
          gap: 8px;
          align-items: center;
          padding: 7px 10px;
          background: #0d1117;
          border: 1px solid #21262d;
          border-radius: 8px;
          font-size: 0.78rem;
          transition: background 0.15s ease;
        }
        .modal-film-row:hover {
          background: #161b22;
          border-color: #30363d;
        }
        @media (max-width: 600px) {
          .modal-film-row {
            grid-template-columns: 28px minmax(0, 1fr) 50px 85px;
          }
          .modal-film-row .hide-mobile {
            display: none;
          }
        }
        .hud-media-bar {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 6px 14px;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(13, 17, 23, 0.65);
          flex-wrap: wrap;
        }
        .hud-media-label {
          font-size: 0.72rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted);
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .hud-media-filters {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }
        .btn-media {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 8px;
          font-size: 0.76rem;
          font-weight: 600;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(22, 27, 34, 0.7);
          color: var(--text-muted, #8b949e);
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;
        }
        .btn-media:hover {
          color: #fff;
          border-color: rgba(255, 255, 255, 0.25);
          background: rgba(255, 255, 255, 0.06);
        }
        .btn-media.active {
          background: #1f6feb;
          color: #fff;
          border-color: #388bfd;
          box-shadow: 0 2px 8px rgba(31, 111, 235, 0.3);
        }
        .media-count-badge {
          font-size: 0.68rem;
          padding: 1px 5px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.12);
          color: #cbd5e1;
          font-weight: 700;
        }
        .btn-media.active .media-count-badge {
          background: rgba(255, 255, 255, 0.25);
          color: #fff;
        }
      </style>

      <div class="achievements-container">
        <!-- Option 3: Sticky HUD + Expandable Profile Drawer -->
        <section id="achievements-hud" class="achievements-hud">
          <!-- Main Persistent Bar (Height ~52px) -->
          <div class="hud-main-bar">
            <!-- Left: Profile Pill with Drawer Toggle & Quick Stats -->
            <div class="hud-left-group">
              <button type="button" id="btn-toggle-profile-drawer" class="hud-profile-pill" title="Click to switch household profile">
                <div id="user-avatar" class="hud-avatar">?</div>
                <div class="hud-profile-meta">
                  <span id="user-name" class="hud-profile-name">Loading...</span>
                  <span id="drawer-chevron" class="hud-chevron">▼</span>
                </div>
                <div id="hud-pill-trophies" class="hud-trophies-badge">0 🏆</div>
              </button>

              <div id="hud-quick-stats" class="hud-quick-stats">
                <span id="hud-stat-earned-pill" style="cursor: pointer;" title="Filter by Earned"><strong>0</strong> Earned</span>
                <span style="opacity: 0.35;">•</span>
                <span id="hud-stat-caughtup-pill" class="hud-stat-caughtup" style="display: none; cursor: pointer;" title="Filter by Caught Up"><strong>0</strong> Caught Up</span>
                <span id="hud-stat-sep-inprogress" style="opacity: 0.35; display: none;">•</span>
                <span id="hud-stat-inprogress-pill" class="hud-stat-inprogress" style="display: none; cursor: pointer;" title="Filter by In Progress"><strong>0</strong> In Progress</span>
              </div>
            </div>

            <!-- Center: Facet Switcher Tabs -->
            <div id="facet-filters" class="hud-facet-filters">
              <button data-facet="all" class="btn-facet active">All</button>
              <button data-facet="trophy_shelf" class="btn-facet">🏆 Trophies</button>
              <button data-facet="badges" class="btn-facet">🎖️ Badges</button>
              <button data-facet="obsession_spotlight" class="btn-facet">🔥 Obsession</button>
              <button data-facet="taste_affinity" class="btn-facet">📊 Taste</button>
              <button data-facet="cowatch_bond" class="btn-facet">🤝 Bonds</button>
            </div>

            <!-- Right: State Filters, Sort & Actions -->
            <div class="hud-right-group">
              <div id="state-filters" class="hud-state-filters">
                <button data-state="earned" class="btn-state active">Earned</button>
                <button data-state="caught_up" class="btn-state">Caught Up</button>
                <button data-state="in_progress" class="btn-state">In Progress</button>
                <button data-state="all" class="btn-state">All</button>
              </div>

              <div id="sort-controls" class="hud-sort-controls">
                <select id="sort-badges-select" title="Sort badges and trophies">
                  <option value="default">⇅ Default</option>
                  <option value="date-desc">⇅ Date (Newest)</option>
                  <option value="date-asc">⇅ Date (Oldest)</option>
                  <option value="name-asc">⇅ Name (A–Z)</option>
                  <option value="name-desc">⇅ Name (Z–A)</option>
                  <option value="progress-desc">⇅ Progress %</option>
                  <option value="tier-desc">⇅ Tier</option>
                </select>
              </div>

              <button id="btn-refresh-achievements" class="btn hud-refresh-btn" title="Refresh Live Achievements">
                🔄
              </button>
            </div>
          </div>

          <!-- Secondary Media Category Filter Bar -->
          <div class="hud-media-bar">
            <div class="hud-media-label">
              <span>Filter Media:</span>
            </div>
            <div id="media-filters" class="hud-media-filters">
              <button data-media="all" class="btn-media active">All Media <span id="count-media-all" class="media-count-badge">0</span></button>
              <button data-media="tv" class="btn-media">📺 TV Shows <span id="count-media-tv" class="media-count-badge">0</span></button>
              <button data-media="anime" class="btn-media">🎌 Anime <span id="count-media-anime" class="media-count-badge">0</span></button>
              <button data-media="movie" class="btn-media">🎬 Movies <span id="count-media-movie" class="media-count-badge">0</span></button>
              <button data-media="audiobook" class="btn-media">🎧 Audiobooks <span id="count-media-audiobook" class="media-count-badge">0</span></button>
            </div>
          </div>

          <!-- Expandable Slide-Down Drawer (#hud-profile-drawer) -->
          <div id="hud-profile-drawer" class="hud-profile-drawer" style="display: none;">
            <div class="hud-drawer-inner">
              <div class="hud-drawer-header">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span class="hud-drawer-title">Personal Media Passport • Household Profiles</span>
                  <span class="badge" style="font-size: 0.7rem; padding: 2px 8px; background: rgba(99, 102, 241, 0.15); color: #a5b4fc; border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 999px;">
                    ⇄ Drag to reorder
                  </span>
                  <span class="badge" id="live-status-badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); font-weight: 600; font-size: 0.7rem; padding: 2px 8px; border-radius: 999px;">
                    ● Live Engine
                  </span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <button type="button" id="btn-scroll-tabs-left" class="btn" style="padding: 3px 8px; font-size: 0.8rem; line-height: 1; border-radius: 6px;" title="Scroll left">‹</button>
                  <button type="button" id="btn-scroll-tabs-right" class="btn" style="padding: 3px 8px; font-size: 0.8rem; line-height: 1; border-radius: 6px;" title="Scroll right">›</button>
                  <button type="button" id="btn-reset-user-order" class="btn" style="padding: 3px 8px; font-size: 0.72rem; color: var(--text-muted); background: transparent; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; cursor: pointer;" title="Reset profiles to default order">Reset Order</button>
                  <button type="button" id="btn-close-drawer" class="btn" style="padding: 3px 8px; font-size: 0.72rem; color: var(--text-muted); background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; cursor: pointer;">✕ Close</button>
                </div>
              </div>

              <!-- Draggable Profile Bubbles Container -->
              <div id="user-bubbles-container">
                <div id="user-tabs" class="thin-scroll hud-user-tabs">
                  <div style="color: var(--text-muted); font-size: 0.85rem;">Loading household profiles...</div>
                </div>
              </div>

              <!-- Active User Detailed Summary Row & Full Stats Matrix -->
              <div id="user-hero" class="hud-drawer-hero">
                <div style="flex: 1; min-width: 0;">
                  <p id="user-summary" style="margin: 0; color: var(--text-muted); font-size: 0.82rem; line-height: 1.4;"></p>
                </div>
                <div class="hud-drawer-stats">
                  <div class="hud-mini-stat">
                    <span id="stat-earned" class="hud-mini-stat-val text-blue">0</span>
                    <span class="hud-mini-stat-lbl">Earned</span>
                  </div>
                  <div class="hud-mini-stat">
                    <span id="stat-trophies" class="hud-mini-stat-val text-amber">0</span>
                    <span class="hud-mini-stat-lbl">Trophies</span>
                  </div>
                  <div class="hud-mini-stat">
                    <span id="stat-badges" class="hud-mini-stat-val text-indigo" style="color: #818cf8;">0</span>
                    <span class="hud-mini-stat-lbl">Badges</span>
                  </div>
                  <div class="hud-mini-stat">
                    <span id="stat-cowatches" class="hud-mini-stat-val text-emerald">0</span>
                    <span class="hud-mini-stat-lbl">Co-Watches</span>
                  </div>
                  <div class="hud-mini-stat">
                    <span id="stat-inprogress" class="hud-mini-stat-val text-muted">0</span>
                    <span class="hud-mini-stat-lbl">In Progress</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Obsession Spotlight Featured Card -->
        <div id="obsession-container"></div>

        <!-- Trophy Shelf Section -->
        <section id="trophy-section" style="display: flex; flex-direction: column; gap: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <span style="font-size: 1.3rem;">🏆</span>
              <h3 style="margin: 0; font-size: 1.25rem;">The Trophy Shelf</h3>
              <span id="trophy-count-badge" class="badge" style="background: rgba(245, 158, 11, 0.2); color: #fcd34d; border: 1px solid rgba(245, 158, 11, 0.3); font-size: 0.75rem; padding: 2px 8px; border-radius: 999px;">0 Earned</span>
              <button id="trophy-caught-up-badge" class="badge" style="background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); font-size: 0.75rem; padding: 3px 10px; border-radius: 999px; cursor: pointer; display: none; align-items: center; gap: 4px;" title="Filter to caught-up series">
                <span>⚡</span> <span id="trophy-caught-up-text">0 Caught Up</span>
              </button>
            </div>
            <span style="font-size: 0.8rem; color: var(--text-muted);">100% Verified Media &amp; Series Completion</span>
          </div>
          <div id="trophy-caught-up-banner" style="display: none; padding: 10px 14px; background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 10px;"></div>
          <div id="trophy-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px;"></div>
        </section>

        <!-- Badges Section -->
        <section id="badges-section" style="display: flex; flex-direction: column; gap: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <span style="font-size: 1.3rem;">🎖️</span>
              <h3 id="badges-heading" style="margin: 0; font-size: 1.25rem;">Milestones, Devotion &amp; Bonds</h3>
              <span id="badges-count-badge" class="badge" style="background: rgba(99, 102, 241, 0.2); color: #a5b4fc; border: 1px solid rgba(99, 102, 241, 0.3); font-size: 0.75rem; padding: 2px 8px; border-radius: 999px;">0 Earned</span>
            </div>
            <span style="font-size: 0.8rem; color: var(--text-muted);">Platform, Genre &amp; Household Milestones</span>
          </div>
          <div id="badges-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px;"></div>
        </section>
      </div>

      <!-- Detail Modal -->
      <div id="detail-modal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.8); backdrop-filter: blur(4px); z-index: 1000; align-items: center; justify-content: center; padding: 16px;">
        <div style="background: #161b22; border: 1px solid #30363d; border-radius: 16px; max-width: min(640px, 94vw); width: 100%; padding: 24px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); position: relative; display: flex; flex-direction: column; gap: 16px; max-height: 90vh;">
          <button id="modal-close" style="position: absolute; top: 16px; right: 16px; background: none; border: none; color: #8b949e; font-size: 1.5rem; cursor: pointer; line-height: 1; z-index: 2;">&times;</button>
          
          <!-- Modal Header -->
          <div style="display: flex; gap: 16px; align-items: flex-start; padding-right: 28px; flex-shrink: 0;">
            <div id="modal-icon" style="width: 60px; height: 75px; border-radius: 12px; background: #0d1117; display: flex; align-items: center; justify-content: center; font-size: 2rem; border: 1px solid #30363d; flex-shrink: 0; overflow: hidden;"></div>
            <div style="flex: 1; min-width: 0;">
              <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 4px; flex-wrap: wrap;">
                <span id="modal-tier" class="badge" style="text-transform: uppercase; font-size: 0.7rem; font-weight: 700;"></span>
                <span id="modal-state" class="badge" style="font-size: 0.7rem; font-weight: 600;"></span>
              </div>
              <h3 id="modal-title" style="margin: 0; font-size: 1.15rem; color: #fff; word-break: break-word;"></h3>
              <p id="modal-facet" style="margin: 4px 0 0; font-size: 0.8rem; color: #58a6ff; font-weight: 500;"></p>
            </div>
          </div>

          <!-- Modal Scroll Body -->
          <div id="modal-scroll-body" class="thin-scroll" style="flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; padding-right: 4px;">
            <p id="modal-desc" style="margin: 0; font-size: 0.9rem; color: #c9d1d9; line-height: 1.5;"></p>

            <!-- Prominent First Completion Milestone Banner -->
            <div id="modal-first-completion" style="display: none;"></div>

            <!-- Next Medal Progress Card -->
            <div id="modal-next-medal" style="display: none;"></div>

            <!-- Stats Box (Coverage Audit / Generic Progress) -->
            <div id="modal-stats-box" style="background: rgba(13, 17, 23, 0.8); border: 1px solid #30363d; border-radius: 12px; padding: 12px; font-size: 0.85rem;"></div>

            <!-- Episode Repeat Watch Breakdown -->
            <div id="modal-episodes-section" style="display: none;"></div>

            <!-- Evidence Section -->
            <div id="modal-evidence-section">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: #8b949e;">
                <span>Supporting Evidence Trail</span>
                <span id="evidence-count" style="font-weight: 400; color: #6e7681;"></span>
              </div>
              <div id="modal-evidence-list" style="max-height: 180px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; font-size: 0.8rem;" class="thin-scroll"></div>
            </div>
          </div>

          <!-- Modal Footer -->
          <div style="flex-shrink: 0; border-top: 1px solid #30363d; padding-top: 12px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
            <span id="modal-earned-at" style="font-size: 0.75rem; color: #6e7681;"></span>
            <button id="modal-dismiss" class="btn" style="padding: 6px 16px;">Close</button>
          </div>
        </div>
      </div>

      <script>
        let activeUserId = null;
        let activeFacet = 'all';
        let activeState = 'earned';
        let activeMedia = 'all';
        let activeSort = 'default';
        try {
          activeSort = localStorage.getItem('plex_achievements_sort') || 'default';
        } catch {}

        let usersData = [];
        let achievementsStore = {};
        let draggedUserId = null;

        function getItemMediaCategory(item) {
          const statCat = item.badge?.stats?.mediaCategory;
          if (statCat) {
            if (statCat === 'movie_collection' || statCat === 'movie') return 'movie';
            if (statCat === 'tv' || statCat === 'classic_tv') return 'tv';
            if (statCat === 'anime') return 'anime';
            if (statCat === 'audiobook') return 'audiobook';
          }
          const hint = item.badge?.iconHint;
          if (hint === 'anime') return 'anime';
          if (hint === 'audiobook') return 'audiobook';
          if (hint === 'movie') return 'movie';
          if (hint === 'tv' || hint === 'series') return 'tv';
          const rId = item.ruleId || '';
          if (rId.includes('audiobook') || rId.startsWith('book_mastery_')) return 'audiobook';
          if (rId.includes('anime')) return 'anime';
          if (rId.includes('movie') || rId.startsWith('collection_mastery_') || rId.startsWith('movie_favorite_')) return 'movie';
          if (rId.includes('series') || rId.includes('tv') || rId.startsWith('show_mastery_')) return 'tv';
          return 'other';
        }

        function updateMediaCounts() {
          const results = achievementsStore[activeUserId] || [];
          const filteredByState = results.filter(r => {
            if (activeState === 'earned' && r.state !== 'earned') return false;
            if (activeState === 'caught_up' && (r.state === 'earned' || !r.badge?.stats?.isCaughtUpOnPlex)) return false;
            if (activeState === 'in_progress' && (r.state !== 'in_progress' || r.badge?.stats?.isCaughtUpOnPlex)) return false;
            return true;
          });

          const counts = { all: filteredByState.length, tv: 0, anime: 0, movie: 0, audiobook: 0 };
          for (const item of filteredByState) {
            const cat = getItemMediaCategory(item);
            if (cat === 'tv') counts.tv++;
            else if (cat === 'anime') counts.anime++;
            else if (cat === 'movie') counts.movie++;
            else if (cat === 'audiobook') counts.audiobook++;
          }

          const elAll = document.getElementById('count-media-all');
          if (elAll) elAll.textContent = counts.all;
          const elTv = document.getElementById('count-media-tv');
          if (elTv) elTv.textContent = counts.tv;
          const elAnime = document.getElementById('count-media-anime');
          if (elAnime) elAnime.textContent = counts.anime;
          const elMovie = document.getElementById('count-media-movie');
          if (elMovie) elMovie.textContent = counts.movie;
          const elAudiobook = document.getElementById('count-media-audiobook');
          if (elAudiobook) elAudiobook.textContent = counts.audiobook;
        }

        const TIER_COLORS = {
          bronze: { bg: 'rgba(217, 119, 6, 0.15)', border: '#d97706', text: '#f59e0b', ribbon: 'ribbon-bronze', badge: 'border: 1px solid #d97706; color: #f59e0b;' },
          silver: { bg: 'rgba(148, 163, 184, 0.15)', border: '#94a3b8', text: '#cbd5e1', ribbon: 'ribbon-silver', badge: 'border: 1px solid #94a3b8; color: #cbd5e1;' },
          gold: { bg: 'rgba(245, 158, 11, 0.15)', border: '#f59e0b', text: '#fbbf24', ribbon: 'ribbon-gold', badge: 'border: 1px solid #f59e0b; color: #fbbf24;' },
          platinum: { bg: 'rgba(56, 189, 248, 0.15)', border: '#38bdf8', text: '#7dd3fc', ribbon: 'ribbon-platinum', badge: 'border: 1px solid #38bdf8; color: #7dd3fc;' }
        };

        function getItemActivityTimestamp(item) {
          if (item.badge?.stats?.latestWatchedAt) {
            const t = new Date(item.badge.stats.latestWatchedAt).getTime();
            if (!isNaN(t) && t > 0) return t;
          }
          if (item.earnedAt) {
            const t = new Date(item.earnedAt).getTime();
            if (!isNaN(t) && t > 0) return t;
          }
          if (item.badge?.stats?.firstCompletedAt) {
            const t = new Date(item.badge.stats.firstCompletedAt).getTime();
            if (!isNaN(t) && t > 0) return t;
          }
          if (item.badge?.stats?.episodeReplayDetails && item.badge.stats.episodeReplayDetails.length > 0) {
            let maxT = 0;
            for (const ep of item.badge.stats.episodeReplayDetails) {
              const t = ep.lastWatchedAt ? new Date(ep.lastWatchedAt).getTime() : 0;
              if (t > maxT) maxT = t;
            }
            if (maxT > 0) return maxT;
          }
          if (item.supportingEvidence && item.supportingEvidence.length > 0) {
            let maxT = 0;
            for (const ev of item.supportingEvidence) {
              const t = ev.eventTime ? new Date(ev.eventTime).getTime() : 0;
              if (t > maxT) maxT = t;
            }
            if (maxT > 0) return maxT;
          }
          return 0;
        }

        function sortAchievements(items, sortKey) {
          const list = [...items];
          const TIER_ORDER = { platinum: 4, gold: 3, silver: 2, bronze: 1 };
          if (sortKey === 'name-asc') {
            return list.sort((a, b) => (a.badge?.title || '').localeCompare(b.badge?.title || ''));
          }
          if (sortKey === 'name-desc') {
            return list.sort((a, b) => (b.badge?.title || '').localeCompare(a.badge?.title || ''));
          }
          if (sortKey === 'date-desc') {
            return list.sort((a, b) => {
              const timeA = getItemActivityTimestamp(a);
              const timeB = getItemActivityTimestamp(b);
              if (timeB !== timeA) return timeB - timeA;
              return (a.badge?.title || '').localeCompare(b.badge?.title || '');
            });
          }
          if (sortKey === 'date-asc') {
            return list.sort((a, b) => {
              const timeA = getItemActivityTimestamp(a) || Infinity;
              const timeB = getItemActivityTimestamp(b) || Infinity;
              if (timeA !== timeB) return timeA - timeB;
              return (a.badge?.title || '').localeCompare(b.badge?.title || '');
            });
          }
          if (sortKey === 'progress-desc') {
            return list.sort((a, b) => {
              const pctA = a.state === 'earned' ? 100 : (a.progress && a.progress.target ? (a.progress.current / a.progress.target) * 100 : 0);
              const pctB = b.state === 'earned' ? 100 : (b.progress && b.progress.target ? (b.progress.current / b.progress.target) * 100 : 0);
              return pctB - pctA;
            });
          }
          if (sortKey === 'tier-desc') {
            return list.sort((a, b) => {
              const tA = TIER_ORDER[a.badge?.tier] || 0;
              const tB = TIER_ORDER[b.badge?.tier] || 0;
              return tB - tA;
            });
          }
          return list;
        }

        function applySavedUserOrder(users) {
          try {
            const saved = localStorage.getItem('plex_achievements_profile_order');
            if (saved) {
              const orderIds = JSON.parse(saved);
              if (Array.isArray(orderIds) && orderIds.length > 0) {
                const map = new Map();
                users.forEach(u => map.set(Number(u.id), u));
                const ordered = [];
                orderIds.forEach(id => {
                  const u = map.get(Number(id));
                  if (u) {
                    ordered.push(u);
                    map.delete(Number(id));
                  }
                });
                map.forEach(u => ordered.push(u));
                return ordered;
              }
            }
          } catch (e) {}
          return users;
        }

        async function initAchievements() {
          try {
            const userRes = await fetch('/api/dashboard/users');
            const userData = await userRes.json();
            if (userData.ok && userData.users) {
              usersData = applySavedUserOrder(userData.users);
              renderUserTabs();
              const defaultUser = usersData.find(u =>
                (u.alias && u.alias.toLowerCase().includes('tony')) ||
                (u.display_name && u.display_name.toLowerCase().includes('tony')) ||
                (u.plex_username && u.plex_username.toLowerCase().includes('tony'))
              ) || usersData[0];
              if (defaultUser) {
                selectUser(defaultUser.id);
              }
            }
          } catch (e) {
            console.error('Failed to init users:', e);
          }
        }

        function renderUserTabs() {
          const container = document.getElementById('user-tabs');
          container.innerHTML = usersData.map(u => {
            const displayName = u.alias || u.display_name || u.plex_username || ('User ' + u.id);
            const initial = displayName.slice(0, 1).toUpperCase();
            const isActive = u.id === activeUserId;
            return '<button class="user-tab ' + (isActive ? 'active' : '') + '" draggable="true" data-id="' + u.id + '" title="Click to view profile, drag to reorder">' +
              '<span class="drag-grip" style="opacity: 0.35; font-size: 0.8rem; margin-right: -2px; cursor: grab;">⠿</span>' +
              '<span style="width: 26px; height: 26px; border-radius: 999px; background: ' + (isActive ? 'rgba(255,255,255,0.25)' : '#21262d') + '; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.8rem;">' + initial + '</span>' +
              '<span style="font-weight: 600; font-size: 0.85rem;">' + displayName + '</span>' +
            '</button>';
          }).join('');

          container.querySelectorAll('.user-tab').forEach(btn => {
            btn.addEventListener('click', (e) => {
              if (btn.classList.contains('dragging')) return;
              const id = Number(btn.dataset.id);
              selectUser(id);
            });
          });

          attachBubbleDragListeners();
        }

        function attachBubbleDragListeners() {
          const container = document.getElementById('user-tabs');
          if (!container) return;

          container.querySelectorAll('.user-tab').forEach(tab => {
            tab.addEventListener('dragstart', (e) => {
              draggedUserId = Number(tab.dataset.id);
              tab.classList.add('dragging');
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', String(draggedUserId));
            });

            tab.addEventListener('dragend', () => {
              tab.classList.remove('dragging');
              container.querySelectorAll('.user-tab').forEach(t => t.classList.remove('drag-over'));
              draggedUserId = null;
            });

            tab.addEventListener('dragover', (e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              const targetTab = e.target.closest('.user-tab');
              if (targetTab && targetTab !== tab) {
                targetTab.classList.add('drag-over');
              }
            });

            tab.addEventListener('dragleave', (e) => {
              const targetTab = e.target.closest('.user-tab');
              if (targetTab) {
                targetTab.classList.remove('drag-over');
              }
            });

            tab.addEventListener('drop', (e) => {
              e.preventDefault();
              const targetTab = e.target.closest('.user-tab');
              if (!targetTab) return;
              targetTab.classList.remove('drag-over');
              const targetId = Number(targetTab.dataset.id);
              if (draggedUserId && draggedUserId !== targetId) {
                const fromIdx = usersData.findIndex(u => Number(u.id) === draggedUserId);
                const toIdx = usersData.findIndex(u => Number(u.id) === targetId);
                if (fromIdx !== -1 && toIdx !== -1) {
                  const [moved] = usersData.splice(fromIdx, 1);
                  usersData.splice(toIdx, 0, moved);
                  try {
                    localStorage.setItem('plex_achievements_profile_order', JSON.stringify(usersData.map(u => u.id)));
                  } catch {}
                  renderUserTabs();
                }
              }
            });
          });
        }

        let isDrawerOpen = false;
        function toggleProfileDrawer(forceState) {
          const drawer = document.getElementById('hud-profile-drawer');
          const chevron = document.getElementById('drawer-chevron');
          if (!drawer) return;

          isDrawerOpen = typeof forceState === 'boolean' ? forceState : !isDrawerOpen;
          if (isDrawerOpen) {
            drawer.style.display = 'block';
            if (chevron) chevron.classList.add('open');
          } else {
            drawer.style.display = 'none';
            if (chevron) chevron.classList.remove('open');
          }
        }

        async function selectUser(userId, forceRefresh = false) {
          activeUserId = userId;
          renderUserTabs();
          toggleProfileDrawer(false);
          await loadAchievements(userId, forceRefresh);
          renderAll();
        }

        async function loadAchievements(userId, force = false) {
          const refreshBtn = document.getElementById('btn-refresh-achievements');
          if (refreshBtn) {
            refreshBtn.disabled = true;
            refreshBtn.textContent = '⏳ Refreshing...';
          }
          try {
            const res = await fetch('/api/achievements?user=' + userId, { cache: 'no-store' });
            if (res.ok) {
              const data = await res.json();
              if (data && data.results) {
                achievementsStore[userId] = data.results;
              }
            }
          } catch (err) {
            console.error('Failed to load achievements:', err);
          } finally {
            if (refreshBtn) {
              refreshBtn.disabled = false;
              refreshBtn.textContent = '🔄 Refresh';
            }
          }
        }

        function renderAll() {
          updateMediaCounts();
          renderUserHero();
          renderObsession();
          renderTrophyShelf();
          renderBadges();
        }

        function renderUserHero() {
          const userObj = usersData.find(u => u.id === activeUserId);
          const results = achievementsStore[activeUserId] || [];
          const name = userObj ? (userObj.alias || userObj.display_name || userObj.plex_username) : 'Viewer';

          const avatarEl = document.getElementById('user-avatar');
          if (avatarEl) avatarEl.textContent = name.slice(0, 1).toUpperCase();
          const nameEl = document.getElementById('user-name');
          if (nameEl) nameEl.textContent = name;

          const earnedList = results.filter(r => r.state === 'earned');
          const inProgList = results.filter(r => r.state === 'in_progress');
          const trophies = earnedList.filter(r => r.facet === 'trophy_shelf' && r.badge && r.badge.posterUrl);
          const badges = earnedList.filter(r => !(r.facet === 'trophy_shelf' && r.badge && r.badge.posterUrl) && r.facet !== 'obsession_spotlight');
          const cowatches = earnedList.filter(r => r.facet === 'cowatch_bond');
          const pureInProgressList = inProgList.filter(r => !r.badge?.stats?.isCaughtUpOnPlex);
          const caughtUpList = results.filter(r => r.badge && r.badge.stats && r.badge.stats.isCaughtUpOnPlex && r.state !== 'earned');

          const statEarned = document.getElementById('stat-earned');
          if (statEarned) statEarned.textContent = earnedList.length;
          const statTrophies = document.getElementById('stat-trophies');
          if (statTrophies) statTrophies.textContent = trophies.length;
          const statBadges = document.getElementById('stat-badges');
          if (statBadges) statBadges.textContent = badges.length;
          const statCowatches = document.getElementById('stat-cowatches');
          if (statCowatches) statCowatches.textContent = cowatches.length;
          const statInprog = document.getElementById('stat-inprogress');
          if (statInprog) statInprog.textContent = inProgList.length;

          // Sticky HUD Profile Pill & Quick Stats
          const hudTrophies = document.getElementById('hud-pill-trophies');
          if (hudTrophies) {
            hudTrophies.innerHTML = trophies.length + ' 🏆 <span style="opacity: 0.4; margin: 0 1px;">•</span> ' + badges.length + ' 🎖️';
            hudTrophies.title = trophies.length + ' Series Trophies, ' + badges.length + ' Milestone & Devotion Badges';
          }

          const hudEarnedPill = document.getElementById('hud-stat-earned-pill');
          if (hudEarnedPill) {
            hudEarnedPill.innerHTML = '<strong>' + earnedList.length + '</strong> Earned';
            hudEarnedPill.onclick = () => {
              document.querySelectorAll('#state-filters button').forEach(b => b.classList.remove('active'));
              const targetBtn = document.querySelector('#state-filters button[data-state="earned"]');
              if (targetBtn) targetBtn.classList.add('active');
              activeState = 'earned';
              renderAll();
            };
          }

          const hudCaughtUpPill = document.getElementById('hud-stat-caughtup-pill');
          if (hudCaughtUpPill) {
            hudCaughtUpPill.innerHTML = '<strong>' + caughtUpList.length + '</strong> Caught Up';
            hudCaughtUpPill.style.display = caughtUpList.length > 0 ? 'inline' : 'none';
            hudCaughtUpPill.onclick = () => {
              document.querySelectorAll('#state-filters button').forEach(b => b.classList.remove('active'));
              const targetBtn = document.querySelector('#state-filters button[data-state="caught_up"]');
              if (targetBtn) targetBtn.classList.add('active');
              activeState = 'caught_up';
              renderAll();
            };
          }

          const hudInProgressPill = document.getElementById('hud-stat-inprogress-pill');
          const hudSepInProgress = document.getElementById('hud-stat-sep-inprogress');
          if (hudInProgressPill) {
            hudInProgressPill.innerHTML = '<strong>' + pureInProgressList.length + '</strong> In Progress';
            hudInProgressPill.style.display = pureInProgressList.length > 0 ? 'inline' : 'none';
            if (hudSepInProgress) hudSepInProgress.style.display = pureInProgressList.length > 0 ? 'inline' : 'none';
            hudInProgressPill.onclick = () => {
              document.querySelectorAll('#state-filters button').forEach(b => b.classList.remove('active'));
              const targetBtn = document.querySelector('#state-filters button[data-state="in_progress"]');
              if (targetBtn) targetBtn.classList.add('active');
              activeState = 'in_progress';
              renderAll();
            };
          }

          let summaryText = earnedList.length + ' milestones unlocked across movie, series, anime, and household viewing.';
          if (caughtUpList.length > 0) {
            summaryText += ' • ' + caughtUpList.length + ' series caught up on server library.';
          }
          if (pureInProgressList.length > 0) {
            summaryText += ' • ' + pureInProgressList.length + ' in progress.';
          }
          const summaryEl = document.getElementById('user-summary');
          if (summaryEl) summaryEl.textContent = summaryText;
        }

        function renderObsession() {
          const container = document.getElementById('obsession-container');
          const results = achievementsStore[activeUserId] || [];
          const obsession = results.find(r => r.facet === 'obsession_spotlight' && r.state === 'earned');

          if (!obsession || (activeFacet !== 'all' && activeFacet !== 'obsession_spotlight')) {
            container.innerHTML = '';
            return;
          }

          if (activeMedia !== 'all' && getItemMediaCategory(obsession) !== activeMedia) {
            container.innerHTML = '';
            return;
          }

          const stats = obsession.badge.stats || {};
          const playsUnit = stats.mediaCategory === 'audiobook' ? 'Listens' :
                            stats.mediaCategory === 'movie_collection' ? 'Films' :
                            stats.mediaCategory === 'movie' ? 'Watches' : 'Episodes';
          const timeUnit = stats.mediaCategory === 'audiobook' ? 'Listening Time' : 'Logged Time';

          container.innerHTML = '<div class="card" style="padding: 24px; border: 1px solid rgba(245, 158, 11, 0.35); background: linear-gradient(135deg, rgba(69, 26, 3, 0.3) 0%, rgba(22, 27, 34, 0.95) 100%); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 20px;">' +
            '<div style="display: flex; align-items: center; gap: 16px;">' +
              '<span style="font-size: 2.5rem;">🔥</span>' +
              '<div>' +
                '<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">' +
                  '<span class="badge" style="background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); font-weight: 700; font-size: 0.75rem;">Obsession Spotlight</span>' +
                  '<span style="font-size: 0.8rem; color: var(--text-muted);">' + (stats.runnerUpTitle ? 'Runner-up: ' + stats.runnerUpTitle : '') + '</span>' +
                '</div>' +
                '<h3 style="margin: 0; font-size: 1.5rem; color: #fff;">' + (stats.topTitle || obsession.badge.title) + '</h3>' +
                '<p style="margin: 6px 0 0; color: #d1d5db; font-size: 0.9rem;">' + obsession.badge.description + '</p>' +
              '</div>' +
            '</div>' +
            '<div style="display: flex; gap: 16px; text-align: center;">' +
              '<div style="background: rgba(13, 17, 23, 0.8); border: 1px solid #30363d; border-radius: 12px; padding: 10px 16px;">' +
                '<div style="font-size: 1.3rem; font-weight: bold; color: #fbbf24;">' + (stats.totalHours || 0) + ' hrs</div>' +
                '<div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase;">' + timeUnit + '</div>' +
              '</div>' +
              '<div style="background: rgba(13, 17, 23, 0.8); border: 1px solid #30363d; border-radius: 12px; padding: 10px 16px;">' +
                '<div style="font-size: 1.3rem; font-weight: bold; color: #fff;">' + (stats.totalPlays || 0) + '</div>' +
                '<div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase;">' + playsUnit + '</div>' +
              '</div>' +
            '</div>' +
          '</div>';
        }

        function renderTrophyShelf() {
          const container = document.getElementById('trophy-grid');
          const badgeCount = document.getElementById('trophy-count-badge');
          const results = achievementsStore[activeUserId] || [];

          if (activeFacet !== 'all' && activeFacet !== 'trophy_shelf') {
            document.getElementById('trophy-section').style.display = 'none';
            return;
          }
          document.getElementById('trophy-section').style.display = 'flex';

          const allTrophies = results.filter(r => r.facet === 'trophy_shelf' && r.badge && r.badge.posterUrl);
          const earnedTrophies = allTrophies.filter(t => t.state === 'earned');
          const caughtUpTrophies = allTrophies.filter(t => t.state !== 'earned' && t.badge && t.badge.stats && t.badge.stats.isCaughtUpOnPlex);
          const inProgressTrophies = allTrophies.filter(t => t.state === 'in_progress' && (!t.badge.stats || !t.badge.stats.isCaughtUpOnPlex));

          if (activeState === 'earned') {
            badgeCount.textContent = earnedTrophies.length + ' Earned';
          } else if (activeState === 'caught_up') {
            badgeCount.textContent = caughtUpTrophies.length + ' Caught Up';
          } else if (activeState === 'in_progress') {
            badgeCount.textContent = inProgressTrophies.length + ' In Progress';
          } else {
            badgeCount.textContent = allTrophies.length + ' Total';
          }

          const caughtUpBadge = document.getElementById('trophy-caught-up-badge');
          if (caughtUpBadge) {
            if (caughtUpTrophies.length > 0) {
              caughtUpBadge.style.display = 'inline-flex';
              const textEl = document.getElementById('trophy-caught-up-text');
              if (textEl) textEl.textContent = caughtUpTrophies.length + ' Caught Up';
              caughtUpBadge.onclick = () => {
                document.querySelectorAll('#state-filters button').forEach(b => b.classList.remove('active'));
                const targetBtn = document.querySelector('#state-filters button[data-state="caught_up"]');
                if (targetBtn) targetBtn.classList.add('active');
                activeState = 'caught_up';
                renderAll();
              };
            } else {
              caughtUpBadge.style.display = 'none';
            }
          }

          const bannerEl = document.getElementById('trophy-caught-up-banner');
          if (bannerEl) {
            if (activeState === 'earned' && caughtUpTrophies.length > 0) {
              bannerEl.style.display = 'flex';
              bannerEl.innerHTML = '<div style="display: flex; align-items: center; justify-content: space-between; width: 100%; gap: 12px; flex-wrap: wrap;">' +
                '<span style="display: flex; align-items: center; gap: 8px; color: #34d399; font-size: 0.85rem; font-weight: 500;">' +
                  '<span>⚡</span> <span><b>' + caughtUpTrophies.length + ' series</b> caught up on Plex library with off-server episodes remaining.</span>' +
                '</span>' +
                '<button id="btn-banner-view-caught-up" style="background: rgba(16, 185, 129, 0.25); color: #6ee7b7; border: 1px solid rgba(16, 185, 129, 0.4); padding: 5px 14px; border-radius: 6px; font-size: 0.75rem; font-weight: 600; cursor: pointer;">View Caught Up &rarr;</button>' +
              '</div>';
              document.getElementById('btn-banner-view-caught-up')?.addEventListener('click', () => {
                document.querySelectorAll('#state-filters button').forEach(b => b.classList.remove('active'));
                const targetBtn = document.querySelector('#state-filters button[data-state="caught_up"]');
                if (targetBtn) targetBtn.classList.add('active');
                activeState = 'caught_up';
                renderAll();
              });
            } else {
              bannerEl.style.display = 'none';
            }
          }

          const showTrophies = allTrophies.filter(r => {
            if (activeState === 'earned' && r.state !== 'earned') return false;
            if (activeState === 'caught_up' && (r.state === 'earned' || !r.badge.stats || !r.badge.stats.isCaughtUpOnPlex)) return false;
            if (activeState === 'in_progress' && (r.state !== 'in_progress' || (r.badge.stats && r.badge.stats.isCaughtUpOnPlex))) return false;
            if (activeMedia !== 'all' && getItemMediaCategory(r) !== activeMedia) return false;
            return true;
          });

          if (showTrophies.length === 0) {
            const mediaLabel = activeMedia === 'tv' ? 'TV series' :
                               activeMedia === 'anime' ? 'anime series' :
                               activeMedia === 'movie' ? 'movies or franchises' :
                               activeMedia === 'audiobook' ? 'audiobooks' : 'media';
            const msg = activeState === 'caught_up'
              ? 'No in-progress ' + mediaLabel + ' currently caught up on server library.'
              : activeState === 'in_progress'
                ? 'No ' + mediaLabel + ' currently in progress.'
                : 'No ' + mediaLabel + ' completed matching filters.';
            container.innerHTML = '<div style="grid-column: 1 / -1; padding: 32px; text-align: center; color: var(--text-muted); background: var(--bg-card); border-radius: 12px; border: 1px solid var(--border-color);">' + msg + '</div>';
            return;
          }

          const sortedTrophies = sortAchievements(showTrophies, activeSort);
          container.innerHTML = sortedTrophies.map(t => {
            const isComplete = t.state === 'earned';
            const isCaughtUp = !isComplete && t.badge && t.badge.stats && t.badge.stats.isCaughtUpOnPlex;
            const missingCount = (t.badge && t.badge.stats && t.badge.stats.missingOffServerCount != null)
              ? t.badge.stats.missingOffServerCount
              : 0;
            const availableCount = (t.badge && t.badge.stats && t.badge.stats.availableOnPlex != null)
              ? t.badge.stats.availableOnPlex
              : (isCaughtUp ? t.progress.current : null);
            const airedCount = (t.badge && t.badge.stats && t.badge.stats.airedEpisodesCount != null)
              ? t.badge.stats.airedEpisodesCount
              : null;
            const nextAirAt = (t.badge && t.badge.stats && t.badge.stats.nextAirAt) || null;
            const shortNextAir = nextAirAt ? new Date(nextAirAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : null;
            const isAiringWithUpcoming = airedCount != null && t.progress && t.progress.target > airedCount;

            const rawTitle = t.badge.title || '';
            const title = rawTitle
              .replace(/^Show Mastery:[ \t]*/i, '')
              .replace(/^Series Progress:[ \t]*/i, '')
              .replace(/^Book Mastery:[ \t]*/i, '')
              .replace(/^Audiobook Progress:[ \t]*/i, '')
              .replace(/^Franchise Mastery:[ \t]*/i, '')
              .replace(/^Franchise Progress:[ \t]*/i, '')
              .replace(/^Movie Favorite:[ \t]*/i, '')
              .trim();

            const tierStyle = TIER_COLORS[t.badge.tier] || TIER_COLORS.bronze;
            const rewatchCount = t.badge.stats && t.badge.stats.rewatchCount ? t.badge.stats.rewatchCount : 0;
            const progressPercent = t.progress && t.progress.target ? Math.round((t.progress.current / t.progress.target) * 100) : 0;

            const isAudiobook = t.badge?.stats?.mediaCategory === 'audiobook' || t.badge?.iconHint === 'audiobook' || t.ruleId?.includes('audiobook');
            const isMovieCollection = t.badge?.stats?.mediaCategory === 'movie_collection' || t.ruleId?.startsWith('collection_mastery_');
            const isMovieFavorite = (t.badge?.stats?.mediaCategory === 'movie' && t.ruleId?.startsWith('movie_favorite_'));

            let displayTitle = title;
            if (isAudiobook) {
              displayTitle = displayTitle
                .replace(/^[0-9]{4}[ -]+/, '')
                .replace(/^-[ ]*/, '')
                .replace(/\\[.*\\]$/, '')
                .trim();
            }

            // Specialized Card Rendering
            if (isAudiobook) {
              const totalHrs = t.badge.stats?.totalHours || (t.progress?.target ? Math.round((t.progress.target / 3600) * 10) / 10 : 0);
              const listenedHrs = t.badge.stats?.viewOffsetSeconds ? Math.round((t.badge.stats.viewOffsetSeconds / 3600) * 10) / 10 : (isComplete ? totalHrs : 0);
              const bookPercent = t.badge.stats?.percentComplete || (totalHrs > 0 ? Math.round((listenedHrs / totalHrs) * 100) : 0);

              return '<div data-rule="' + t.ruleId + '" class="trophy-card">' +
                '<div class="trophy-poster-frame">' +
                  '<div class="trophy-overlay">' +
                    (isComplete
                      ? '<span style="font-size: 0.75rem; font-weight: bold; color: #38bdf8; display: flex; align-items: center; gap: 4px; margin-bottom: 4px;">● 100% Completed</span>'
                      : '<div style="margin-bottom: 6px;">' +
                          '<div style="display: flex; justify-content: space-between; font-size: 0.7rem; font-weight: bold; color: #38bdf8; margin-bottom: 2px;">' +
                            '<span>' + listenedHrs + ' / ' + totalHrs + ' hrs</span>' +
                            '<span>' + bookPercent + '%</span>' +
                          '</div>' +
                          '<div style="width: 100%; background: rgba(0,0,0,0.8); height: 5px; border-radius: 999px; overflow: hidden;">' +
                            '<div style="background: #38bdf8; width: ' + bookPercent + '%; height: 100%;"></div>' +
                          '</div>' +
                        '</div>'
                    ) +
                    '<span style="font-size: 0.85rem; font-weight: bold; color: #fff; line-height: 1.2; display: block;">' + displayTitle + '</span>' +
                  '</div>' +
                  '<img src="' + t.badge.posterUrl + '" alt="' + displayTitle + '" onerror="this.style.display=\\'none\\'" />' +
                  (isComplete && rewatchCount > 0
                    ? '<div class="tier-ribbon ' + tierStyle.ribbon + '">' + rewatchCount + 'x Re-listened</div>'
                    : (!isComplete ? '<div class="tier-ribbon" style="background: rgba(56, 189, 248, 0.3); color: #7dd3fc; border: 1px solid rgba(56, 189, 248, 0.4);">In Progress</div>' : '')
                  ) +
                  '<div class="tier-pill" style="' + (isComplete ? tierStyle.badge : 'border: 1px solid #0284c7; color: #38bdf8;') + '">' +
                    (isComplete ? t.badge.tier + '<span style="opacity: 0.5; margin: 0 4px;">•</span>Book' : '🎧 Book') +
                  '</div>' +
                '</div>' +
                '<div style="padding: 10px 12px; background: rgba(13, 17, 23, 0.85); border-top: 1px solid #30363d; display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; color: var(--text-muted);">' +
                  (isComplete
                    ? '<span>' + totalHrs + ' hrs duration</span>'
                    : '<span style="color: #38bdf8; font-weight: 600;">' + listenedHrs + 'h of ' + totalHrs + 'h (' + bookPercent + '%)</span>'
                  ) +
                  '<span style="color: #58a6ff; font-weight: 500;">Details &rarr;</span>' +
                '</div>' +
              '</div>';
            }

            if (isMovieCollection) {
              return '<div data-rule="' + t.ruleId + '" class="trophy-card">' +
                '<div class="trophy-poster-frame">' +
                  '<div class="trophy-overlay">' +
                    (isComplete
                      ? '<span style="font-size: 0.75rem; font-weight: bold; color: #3fb950; display: flex; align-items: center; gap: 4px; margin-bottom: 4px;">● 100% Completed</span>'
                      : (isCaughtUp
                          ? '<div style="margin-bottom: 6px;">' +
                              '<div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.7rem; font-weight: bold; color: #34d399; margin-bottom: 2px;">' +
                                '<span style="display: flex; align-items: center; gap: 4px;">⚡ Caught Up</span>' +
                                '<span style="background: rgba(16, 185, 129, 0.25); color: #6ee7b7; padding: 1px 5px; border-radius: 4px; font-size: 0.65rem;">+' + missingCount + ' off-server</span>' +
                              '</div>' +
                              '<div style="display: flex; justify-content: space-between; font-size: 0.65rem; color: #cbd5e1; margin-bottom: 2px;">' +
                                '<span>' + t.progress.current + ' of ' + t.progress.target + ' films</span>' +
                                '<span>' + progressPercent + '%</span>' +
                              '</div>' +
                              '<div style="width: 100%; background: rgba(0,0,0,0.8); height: 5px; border-radius: 999px; overflow: hidden;">' +
                                '<div style="background: #10b981; width: ' + progressPercent + '%; height: 100%;"></div>' +
                              '</div>' +
                            '</div>'
                          : '<div style="margin-bottom: 6px;">' +
                              '<div style="display: flex; justify-content: space-between; font-size: 0.7rem; font-weight: bold; color: #f59e0b; margin-bottom: 2px;">' +
                                '<span>' + t.progress.current + ' of ' + t.progress.target + ' films</span>' +
                                '<span>' + progressPercent + '%</span>' +
                              '</div>' +
                              '<div style="width: 100%; background: rgba(0,0,0,0.8); height: 5px; border-radius: 999px; overflow: hidden;">' +
                                '<div style="background: #e5a00d; width: ' + progressPercent + '%; height: 100%;"></div>' +
                              '</div>' +
                            '</div>'
                        )
                    ) +
                    '<span style="font-size: 0.85rem; font-weight: bold; color: #fff; line-height: 1.2; display: block;">' + title + '</span>' +
                  '</div>' +
                  '<img src="' + t.badge.posterUrl + '" alt="' + title + '" onerror="this.style.display=\\'none\\'" />' +
                  (isComplete
                    ? '<div class="tier-ribbon ' + tierStyle.ribbon + '">Franchise Complete</div>'
                    : (isCaughtUp
                        ? '<div class="tier-ribbon" style="background: rgba(16, 185, 129, 0.3); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.5); font-weight: 700;">Caught Up +' + missingCount + '</div>'
                        : '<div class="tier-ribbon" style="background: rgba(245, 158, 11, 0.3); color: #fcd34d; border: 1px solid rgba(245, 158, 11, 0.4);">In Progress</div>'
                      )
                  ) +
                  '<div class="tier-pill" style="' + (isComplete ? tierStyle.badge : (isCaughtUp ? 'border: 1px solid #059669; color: #34d399;' : 'border: 1px solid #d97706; color: #f59e0b;')) + '">' +
                    (isComplete ? t.badge.tier + '<span style="opacity: 0.5; margin: 0 4px;">•</span>Franchise' : '🎬 Franchise') +
                  '</div>' +
                '</div>' +
                '<div style="padding: 10px 12px; background: rgba(13, 17, 23, 0.85); border-top: 1px solid #30363d; display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; color: var(--text-muted);">' +
                  (isComplete
                    ? '<span>' + t.progress.target + ' films completed</span>'
                    : (isCaughtUp
                        ? '<span style="color: #34d399; font-weight: 600;">' + t.progress.current + '/' + availableCount + ' on Plex &bull; +' + missingCount + ' missing</span>'
                        : '<span style="color: #f59e0b; font-weight: 600;">' + t.progress.current + ' of ' + t.progress.target + ' films (' + progressPercent + '%)</span>'
                      )
                  ) +
                  '<span style="color: #58a6ff; font-weight: 500;">Details &rarr;</span>' +
                '</div>' +
              '</div>';
            }

            if (isMovieFavorite) {
              const totalPlays = t.badge.stats?.totalPlays || (t.badge.stats?.rewatchCount ? t.badge.stats.rewatchCount + 1 : 2);
              return '<div data-rule="' + t.ruleId + '" class="trophy-card">' +
                '<div class="trophy-poster-frame">' +
                  '<div class="trophy-overlay">' +
                    '<span style="font-size: 0.75rem; font-weight: bold; color: #cbd5e1; display: flex; align-items: center; gap: 4px; margin-bottom: 4px;">● Watched ' + totalPlays + 'x</span>' +
                    '<span style="font-size: 0.85rem; font-weight: bold; color: #fff; line-height: 1.2; display: block;">' + title + '</span>' +
                  '</div>' +
                  '<img src="' + t.badge.posterUrl + '" alt="' + title + '" onerror="this.style.display=\\'none\\'" />' +
                  '<div class="tier-ribbon ' + tierStyle.ribbon + '">Watched ' + totalPlays + 'x</div>' +
                  '<div class="tier-pill" style="' + tierStyle.badge + '">' +
                    t.badge.tier + '<span style="opacity: 0.5; margin: 0 4px;">•</span>Movie' +
                  '</div>' +
                '</div>' +
                '<div style="padding: 10px 12px; background: rgba(13, 17, 23, 0.85); border-top: 1px solid #30363d; display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; color: var(--text-muted);">' +
                  '<span>Watched ' + totalPlays + 'x' + (t.badge.stats?.latestWatchedAt ? ' &bull; ' + new Date(t.badge.stats.latestWatchedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '') + '</span>' +
                  '<span style="color: #58a6ff; font-weight: 500;">Details &rarr;</span>' +
                '</div>' +
              '</div>';
            }

            // Standard TV / Anime Series Rendering
            return '<div data-rule="' + t.ruleId + '" class="trophy-card">' +
              '<div class="trophy-poster-frame">' +
                '<div class="trophy-overlay">' +
                  (isComplete
                    ? '<span style="font-size: 0.75rem; font-weight: bold; color: #3fb950; display: flex; align-items: center; gap: 4px; margin-bottom: 4px;">● 100% Completed</span>'
                    : (isCaughtUp
                        ? '<div style="margin-bottom: 6px;">' +
                            '<div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.7rem; font-weight: bold; color: #34d399; margin-bottom: 2px;">' +
                              '<span style="display: flex; align-items: center; gap: 4px;">⚡ Caught Up</span>' +
                              '<span style="background: rgba(16, 185, 129, 0.25); color: #6ee7b7; padding: 1px 5px; border-radius: 4px; font-size: 0.65rem;">' +
                                (isAiringWithUpcoming && missingCount === 0
                                  ? (airedCount + '/' + t.progress.target + ' aired')
                                  : ('+' + missingCount + ' off-server')) +
                              '</span>' +
                            '</div>' +
                            '<div style="display: flex; justify-content: space-between; font-size: 0.65rem; color: #cbd5e1; margin-bottom: 2px;">' +
                              '<span>' + t.progress.current + ' of ' + t.progress.target + ' eps</span>' +
                              '<span>' + progressPercent + '%</span>' +
                            '</div>' +
                            '<div style="width: 100%; background: rgba(0,0,0,0.8); height: 5px; border-radius: 999px; overflow: hidden;">' +
                              '<div style="background: #10b981; width: ' + progressPercent + '%; height: 100%;"></div>' +
                            '</div>' +
                          '</div>'
                        : '<div style="margin-bottom: 6px;">' +
                            '<div style="display: flex; justify-content: space-between; font-size: 0.7rem; font-weight: bold; color: #f59e0b; margin-bottom: 2px;">' +
                              '<span>' + (isAiringWithUpcoming && availableCount != null
                                ? (t.progress.current + '/' + availableCount + ' on Plex • ' + airedCount + '/' + t.progress.target + ' aired')
                                : (t.progress.current + ' / ' + t.progress.target + ' eps')) + '</span>' +
                              '<span>' + progressPercent + '%</span>' +
                            '</div>' +
                            '<div style="width: 100%; background: rgba(0,0,0,0.8); height: 5px; border-radius: 999px; overflow: hidden;">' +
                              '<div style="background: #e5a00d; width: ' + progressPercent + '%; height: 100%;"></div>' +
                            '</div>' +
                          '</div>'
                      )
                  ) +
                  '<span style="font-size: 0.85rem; font-weight: bold; color: #fff; line-height: 1.2; display: block;">' + title + '</span>' +
                '</div> ' +
                '<img src="' + t.badge.posterUrl + '" alt="' + title + '" onerror="this.style.display=\\'none\\'" />' +
                (isComplete && rewatchCount > 0
                  ? '<div class="tier-ribbon ' + tierStyle.ribbon + '">' + rewatchCount + 'x Replay</div>'
                  : (isCaughtUp
                      ? '<div class="tier-ribbon" style="background: rgba(16, 185, 129, 0.3); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.5); font-weight: 700;">' +
                          (isAiringWithUpcoming && missingCount === 0 ? 'Caught Up • Airing' : ('Caught Up +' + missingCount)) +
                        '</div>'
                      : (!isComplete ? '<div class="tier-ribbon" style="background: rgba(245, 158, 11, 0.3); color: #fcd34d; border: 1px solid rgba(245, 158, 11, 0.4);">In Progress</div>' : '')
                    )
                ) +
                '<div class="tier-pill" style="' + (isComplete ? tierStyle.badge : (isCaughtUp ? 'border: 1px solid #059669; color: #34d399;' : 'border: 1px solid #d97706; color: #f59e0b;')) + '">' +
                  (isComplete ? t.badge.tier : ('🎯 ' + (t.badge.tier || 'bronze') + '<span style="opacity: 0.5; margin: 0 4px;">•</span>' + (t.badge.iconHint === 'anime' ? 'Anime' : 'TV'))) +
                '</div>' +
              '</div>' +
              '<div style="padding: 10px 12px; background: rgba(13, 17, 23, 0.85); border-top: 1px solid #30363d; display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; color: var(--text-muted);">' +
                (isCaughtUp
                  ? '<span style="color: #34d399; font-weight: 600;">' +
                      (isAiringWithUpcoming && missingCount === 0
                        ? (t.progress.current + '/' + airedCount + ' aired' + (shortNextAir ? ' &bull; Next: ' + shortNextAir : ' &bull; +' + (t.progress.target - airedCount) + ' upcoming'))
                        : (t.progress.current + '/' + (availableCount || t.progress.current) + ' on Plex &bull; +' + missingCount + ' missing')) +
                    '</span>'
                  : (!isComplete
                      ? '<span style="color: #f59e0b; font-weight: 600;">' +
                          (isAiringWithUpcoming && availableCount != null
                            ? (t.progress.current + '/' + availableCount + ' on Plex' + (shortNextAir ? ' &bull; Next: ' + shortNextAir : ' &bull; ' + airedCount + '/' + t.progress.target + ' aired'))
                            : (t.progress.current + ' of ' + t.progress.target + ' eps (' + progressPercent + '%)')) +
                        '</span>'
                      : '<span>' + (t.badge.stats && t.badge.stats.completedItems ? t.badge.stats.completedItems : (t.progress ? t.progress.current : 0)) + ' eps</span>'
                    )
                ) +
                '<span style="color: #58a6ff; font-weight: 500;">Details &rarr;</span>' +
              '</div>' +
            '</div>';
          }).join('');

          container.querySelectorAll('.trophy-card').forEach(card => {
            card.addEventListener('click', () => {
              const ruleId = card.dataset.rule;
              const ach = results.find(r => r.ruleId === ruleId);
              if (ach) showModal(ach);
            });
          });
        }

        function renderBadges() {
          const container = document.getElementById('badges-grid');
          const results = achievementsStore[activeUserId] || [];

          if (activeFacet === 'trophy_shelf' || activeFacet === 'obsession_spotlight') {
            document.getElementById('badges-section').style.display = 'none';
            return;
          }
          document.getElementById('badges-section').style.display = 'flex';

          let list = results.filter(r => {
            if (r.facet === 'trophy_shelf' && r.badge && r.badge.posterUrl) return false;
            if (r.facet === 'obsession_spotlight') return false;
            if (activeFacet === 'badges') {
              // Show all non-trophy badges (milestones, taste devotions, bonds)
            } else if (activeFacet !== 'all' && r.facet !== activeFacet) {
              return false;
            }
            if (activeState === 'earned' && r.state !== 'earned') return false;
            if (activeState === 'caught_up' && (r.state === 'earned' || !r.badge.stats || !r.badge.stats.isCaughtUpOnPlex)) return false;
            if (activeState === 'in_progress' && (r.state !== 'in_progress' || (r.badge.stats && r.badge.stats.isCaughtUpOnPlex))) return false;
            if (activeMedia !== 'all') {
              const cat = getItemMediaCategory(r);
              if (cat !== activeMedia && cat !== 'other') return false;
            }
            return true;
          });

          const badgesCountEl = document.getElementById('badges-count-badge');
          if (badgesCountEl) {
            badgesCountEl.textContent = list.length + (activeState === 'earned' ? ' Earned' : activeState === 'in_progress' ? ' In Progress' : ' Badges');
          }

          if (list.length === 0) {
            if (activeState === 'in_progress') {
              const allEarnedCount = results.filter(r => !(r.facet === 'trophy_shelf' && r.badge?.posterUrl) && r.facet !== 'obsession_spotlight' && r.state === 'earned').length;
              container.innerHTML = '<div style="grid-column: 1 / -1; padding: 28px; text-align: center; color: var(--text-muted); background: var(--bg-card); border-radius: 12px; border: 1px solid var(--border-color); display: flex; flex-direction: column; align-items: center; gap: 8px;">' +
                '<span style="font-size: 1.5rem;">🎉</span>' +
                '<div style="font-weight: 600; color: #e2e8f0;">No Badges Currently In Progress</div>' +
                '<div style="font-size: 0.85rem; color: #94a3b8;">All ' + allEarnedCount + ' milestone, taste devotion, and co-watch badges have already been unlocked for this profile!</div>' +
                '<button type="button" id="btn-empty-view-earned-badges" class="btn" style="margin-top: 6px; padding: 5px 14px; font-size: 0.8rem; background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 6px; cursor: pointer;">View Earned Badges (' + allEarnedCount + ') &rarr;</button>' +
              '</div>';
              document.getElementById('btn-empty-view-earned-badges')?.addEventListener('click', () => {
                document.querySelectorAll('#state-filters button').forEach(b => b.classList.remove('active'));
                const targetBtn = document.querySelector('#state-filters button[data-state="earned"]');
                if (targetBtn) targetBtn.classList.add('active');
                activeState = 'earned';
                renderAll();
              });
              return;
            }
            if (activeState === 'caught_up') {
              container.innerHTML = '<div style="grid-column: 1 / -1; padding: 24px; text-align: center; color: var(--text-muted); background: var(--bg-card); border-radius: 12px; border: 1px solid var(--border-color);">' +
                'Caught-up status applies specifically to episodic series on the Trophy Shelf.' +
              '</div>';
              return;
            }
            container.innerHTML = '<div style="grid-column: 1 / -1; padding: 32px; text-align: center; color: var(--text-muted); background: var(--bg-card); border-radius: 12px; border: 1px solid var(--border-color);">No badges matching current filter criteria.</div>';
            return;
          }

          const sortedList = sortAchievements(list, activeSort);
          container.innerHTML = sortedList.map(b => {
            const tierStyle = TIER_COLORS[b.badge.tier] || TIER_COLORS.bronze;
            const isEarned = b.state === 'earned';
            const isInProgress = b.state === 'in_progress';

            const icon = b.badge.iconHint === 'tv' ? '📺' :
                         b.badge.iconHint === 'movie' ? '🎬' :
                         b.badge.iconHint === 'audiobook' ? '🎧' :
                         b.badge.iconHint === 'cowatch' ? '🤝' :
                         b.badge.iconHint === 'anime' ? '🎌' : '🎖️';

            const facetLabel = b.facet === 'cowatch_bond' ? 'Shared Viewing Bond' :
                               b.facet === 'taste_affinity' ? 'Taste Devotion' : 'Milestone';

            return '<div data-rule="' + b.ruleId + '" class="badge-card" style="' + (!isEarned ? 'opacity: 0.7;' : '') + '">' +
              '<div style="display: flex; gap: 14px; align-items: flex-start;">' +
                '<div style="width: 48px; height: 48px; border-radius: 12px; background: ' + tierStyle.bg + '; border: 1px solid ' + tierStyle.border + '; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; flex-shrink: 0;">' +
                  icon +
                '</div>' +
                '<div style="flex: 1; min-width: 0;">' +
                  '<div style="display: flex; gap: 6px; align-items: center; margin-bottom: 4px;">' +
                    '<span class="badge" style="' + tierStyle.badge + ' font-size: 0.65rem; padding: 1px 6px; text-transform: uppercase;">' + b.badge.tier + '</span>' +
                    '<span style="font-size: 0.75rem; color: var(--text-muted);">' + facetLabel + '</span>' +
                  '</div>' +
                  '<h4 style="margin: 0; font-size: 0.95rem; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">' + b.badge.title + '</h4>' +
                  '<p style="margin: 4px 0 0; font-size: 0.8rem; color: var(--text-muted); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">' + b.badge.description + '</p>' +
                '</div>' +
              '</div>' +
              '<div style="padding-top: 8px; border-top: 1px solid #30363d; display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem;">' +
                (isEarned
                  ? '<span style="color: #3fb950; font-weight: 600;">● Earned</span><span style="color: var(--text-muted);">' + (b.earnedAt ? new Date(b.earnedAt).toLocaleDateString() : '') + '</span>'
                  : (isInProgress
                    ? '<span style="color: #58a6ff; font-weight: 500;">' + b.progress.current + ' / ' + b.progress.target + ' ' + b.progress.unit + 's</span><span style="color: var(--text-muted);">In Progress</span>'
                    : '<span style="color: var(--text-muted);">Not earned</span><span></span>')
                ) +
              '</div>' +
            '</div>';
          }).join('');

          container.querySelectorAll('.badge-card').forEach(card => {
            card.addEventListener('click', () => {
              const ruleId = card.dataset.rule;
              const ach = results.find(r => r.ruleId === ruleId);
              if (ach) showModal(ach);
            });
          });
        }

        function showModal(ach) {
          const modal = document.getElementById('detail-modal');
          const tierStyle = TIER_COLORS[ach.badge.tier] || TIER_COLORS.bronze;

          document.getElementById('modal-title').textContent = ach.badge.title;
          document.getElementById('modal-desc').textContent = ach.badge.description;

          const modalTier = document.getElementById('modal-tier');
          modalTier.textContent = ach.badge.tier;
          modalTier.style.cssText = tierStyle.badge;

          const modalState = document.getElementById('modal-state');
          const isCaughtUp = ach.badge && ach.badge.stats && ach.badge.stats.isCaughtUpOnPlex;
          if (ach.state === 'earned') {
            modalState.textContent = 'Earned';
            modalState.style.background = 'rgba(46, 160, 67, 0.2)';
            modalState.style.color = '#3fb950';
            modalState.style.border = '1px solid rgba(46, 160, 67, 0.4)';
          } else if (isCaughtUp) {
            modalState.textContent = 'Caught Up on Plex';
            modalState.style.background = 'rgba(16, 185, 129, 0.2)';
            modalState.style.color = '#34d399';
            modalState.style.border = '1px solid rgba(16, 185, 129, 0.4)';
          } else if (ach.state === 'in_progress') {
            modalState.textContent = 'In Progress';
            modalState.style.background = 'rgba(56, 189, 248, 0.2)';
            modalState.style.color = '#58a6ff';
            modalState.style.border = '1px solid rgba(56, 189, 248, 0.4)';
          } else {
            modalState.textContent = 'Not Earned';
            modalState.style.background = 'rgba(139, 148, 158, 0.2)';
            modalState.style.color = '#8b949e';
            modalState.style.border = '1px solid rgba(139, 148, 158, 0.4)';
          }

          document.getElementById('modal-facet').textContent = (ach.facet || 'Milestone').replace('_', ' ').toUpperCase();

          const iconContainer = document.getElementById('modal-icon');
          if (ach.badge.posterUrl) {
            iconContainer.innerHTML = '<img src="' + ach.badge.posterUrl + '" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display=\\'none\\'" />';
          } else {
            const icon = ach.badge.iconHint === 'tv' ? '📺' :
                         ach.badge.iconHint === 'movie' ? '🎬' :
                         ach.badge.iconHint === 'audiobook' ? '🎧' :
                         ach.badge.iconHint === 'cowatch' ? '🤝' :
                         ach.badge.iconHint === 'anime' ? '🎌' : '🎖️';
            iconContainer.innerHTML = '<span>' + icon + '</span>';
          }

          const stats = ach.badge && ach.badge.stats;
          const isEarned = ach.state === 'earned';
          const isShowMastery = ach.badge && ach.badge.badgeKey && ach.badge.badgeKey.startsWith('show_mastery');
          const isAudiobook = (stats && stats.mediaCategory === 'audiobook') || (ach.badge && ach.badge.badgeKey && ach.badge.badgeKey.startsWith('book_mastery_'));
          const isMovieCollection = (stats && stats.mediaCategory === 'movie_collection') || (ach.badge && ach.badge.badgeKey && ach.badge.badgeKey.startsWith('collection_mastery_'));
          const isMovieFavorite = (stats && stats.mediaCategory === 'movie' && ach.badge && ach.badge.badgeKey && ach.badge.badgeKey.startsWith('movie_favorite_')) || (ach.badge && ach.badge.badgeKey && ach.badge.badgeKey.startsWith('movie_favorite_'));
          const firstCompletedAt = stats && stats.firstCompletedAt ? stats.firstCompletedAt : (isEarned ? ach.earnedAt : null);

          // 1. Prominent First Completion Milestone Banner
          const firstCompletionBanner = document.getElementById('modal-first-completion');
          if (firstCompletedAt && isEarned) {
            const completedDate = new Date(firstCompletedAt);
            const formattedDate = !isNaN(completedDate.getTime()) ? (completedDate.toLocaleDateString(undefined, {
              weekday: 'short',
              year: 'numeric',
              month: 'short',
              day: 'numeric'
            }) + ' at ' + completedDate.toLocaleTimeString(undefined, {
              hour: 'numeric',
              minute: '2-digit'
            })) : 'Historical';

            let bannerHtml = '<div style="background: linear-gradient(135deg, rgba(217, 119, 6, 0.12) 0%, rgba(22, 27, 34, 0.95) 100%); border: 1px solid rgba(245, 158, 11, 0.35); border-left: 4px solid #f59e0b; border-radius: 12px; padding: 14px 16px; display: flex; flex-direction: column; gap: 8px;">';

            if (isAudiobook) {
              const totalHrs = stats && stats.totalDurationSeconds ? (stats.totalDurationSeconds / 3600).toFixed(1) : '—';
              bannerHtml +=   '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">';
              bannerHtml +=     '<div style="font-weight: 700; font-size: 0.8rem; color: #fbbf24; display: flex; align-items: center; gap: 6px; text-transform: uppercase; letter-spacing: 0.5px;">';
              bannerHtml +=       '<span>🎧</span> First 100% Book Completion';
              bannerHtml +=     '</div>';
              bannerHtml +=     '<span style="font-size: 0.7rem; font-weight: 600; background: rgba(56, 189, 248, 0.2); color: #7dd3fc; padding: 2px 8px; border-radius: 999px;">';
              bannerHtml +=       'Full Audiobook Completed (' + totalHrs + ' hrs)';
              bannerHtml +=     '</span>';
              bannerHtml +=   '</div>';
              bannerHtml +=   '<div style="font-size: 1.05rem; font-weight: 700; color: #fff;">' + formattedDate + '</div>';
              if (stats && stats.authors && stats.authors.length > 0) {
                bannerHtml += '<div style="font-size: 0.8rem; color: #cbd5e1; display: flex; align-items: center; gap: 6px;">';
                bannerHtml +=   '<span style="color: #38bdf8;">✓</span>';
                bannerHtml +=   '<span>By <strong style="color: #fff;">' + stats.authors.join(', ') + '</strong>' + (stats.seriesTitle ? ' • ' + stats.seriesTitle + (stats.seriesIndex ? ' #' + stats.seriesIndex : '') : '') + '</span>';
                bannerHtml += '</div>';
              }
              if (stats && stats.rewatchCount > 0) {
                bannerHtml += '<div style="font-size: 0.75rem; color: #94a3b8; border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 6px; margin-top: 2px;">';
                bannerHtml +=   '<span>Current Trophy Level: <strong style="color: #cbd5e1;">' + ach.badge.title + '</strong> (' + (stats.rewatchCount + 1) + 'x Total Listens)</span>';
                bannerHtml += '</div>';
              }
            } else if (isMovieCollection) {
              bannerHtml +=   '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">';
              bannerHtml +=     '<div style="font-weight: 700; font-size: 0.8rem; color: #fbbf24; display: flex; align-items: center; gap: 6px; text-transform: uppercase; letter-spacing: 0.5px;">';
              bannerHtml +=       '<span>🎬</span> First 100% Franchise Completion';
              bannerHtml +=     '</div>';
              bannerHtml +=     '<span style="font-size: 0.7rem; font-weight: 600; background: rgba(245, 158, 11, 0.2); color: #fde68a; padding: 2px 8px; border-radius: 999px;">';
              bannerHtml +=       'All ' + (ach.progress ? ach.progress.target : '') + ' Films Completed';
              bannerHtml +=     '</span>';
              bannerHtml +=   '</div>';
              bannerHtml +=   '<div style="font-size: 1.05rem; font-weight: 700; color: #fff;">' + formattedDate + '</div>';
              if (stats && stats.totalPlays) {
                bannerHtml += '<div style="font-size: 0.8rem; color: #cbd5e1; display: flex; align-items: center; gap: 6px;">';
                bannerHtml +=   '<span style="color: #34d399;">✓</span>';
                bannerHtml +=   '<span>Total Franchise Views: <strong style="color: #fff;">' + stats.totalPlays + ' film plays logged</strong></span>';
                bannerHtml += '</div>';
              }
            } else if (isMovieFavorite) {
              const playCount = (stats && stats.totalPlays) || ((stats && stats.rewatchCount || 0) + 1);
              bannerHtml +=   '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">';
              bannerHtml +=     '<div style="font-weight: 700; font-size: 0.8rem; color: #fbbf24; display: flex; align-items: center; gap: 6px; text-transform: uppercase; letter-spacing: 0.5px;">';
              bannerHtml +=       '<span>🍿</span> Cult-Classic Favorite Milestone';
              bannerHtml +=     '</div>';
              bannerHtml +=     '<span style="font-size: 0.7rem; font-weight: 600; background: rgba(56, 189, 248, 0.2); color: #7dd3fc; padding: 2px 8px; border-radius: 999px;">';
              bannerHtml +=       'Watched ' + playCount + 'x Across Distinct Sessions';
              bannerHtml +=     '</span>';
              bannerHtml +=   '</div>';
              bannerHtml +=   '<div style="font-size: 1.05rem; font-weight: 700; color: #fff;">First Watched: ' + formattedDate + '</div>';
              if (stats && stats.latestWatchedAt) {
                const latestDate = new Date(stats.latestWatchedAt);
                const latestStr = !isNaN(latestDate.getTime()) ? latestDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Recent';
                bannerHtml += '<div style="font-size: 0.8rem; color: #cbd5e1; display: flex; align-items: center; gap: 6px;">';
                bannerHtml +=   '<span style="color: #34d399;">✓</span>';
                bannerHtml +=   '<span>Latest Viewing Session: <strong style="color: #fff;">' + latestStr + '</strong></span>';
                bannerHtml += '</div>';
              }
              if (stats && stats.rewatchCount > 0) {
                bannerHtml += '<div style="font-size: 0.75rem; color: #94a3b8; border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 6px; margin-top: 2px;">';
                bannerHtml +=   '<span>Current Trophy Level: <strong style="color: #cbd5e1;">' + ach.badge.title + '</strong></span>';
                bannerHtml += '</div>';
              }
            } else {
              let epCode = '';
              if (stats && stats.firstCompletedEpisodeSeason != null && stats.firstCompletedEpisodeNumber != null) {
                epCode = 'S' + String(stats.firstCompletedEpisodeSeason).padStart(2, '0') + 'E' + String(stats.firstCompletedEpisodeNumber).padStart(2, '0') + ' • ';
              }

              bannerHtml +=   '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">';
              bannerHtml +=     '<div style="font-weight: 700; font-size: 0.8rem; color: #fbbf24; display: flex; align-items: center; gap: 6px; text-transform: uppercase; letter-spacing: 0.5px;">';
              bannerHtml +=       '<span>🏆</span> First 100% Series Completion';
              bannerHtml +=     '</div>';
              bannerHtml +=     '<span style="font-size: 0.7rem; font-weight: 600; background: rgba(245, 158, 11, 0.2); color: #fde68a; padding: 2px 8px; border-radius: 999px;">';
              bannerHtml +=       'All ' + (ach.progress ? ach.progress.target : '') + ' Episodes Completed';
              bannerHtml +=     '</span>';
              bannerHtml +=   '</div>';
              bannerHtml +=   '<div style="font-size: 1.05rem; font-weight: 700; color: #fff;">' + formattedDate + '</div>';
              if (stats && stats.firstCompletedEpisodeTitle) {
                bannerHtml += '<div style="font-size: 0.8rem; color: #cbd5e1; display: flex; align-items: center; gap: 6px;">';
                bannerHtml +=   '<span style="color: #34d399;">✓</span>';
                bannerHtml +=   '<span>Milestone Finale: <strong style="color: #fff;">' + epCode + '"' + stats.firstCompletedEpisodeTitle + '"</strong></span>';
                bannerHtml += '</div>';
              }
              if (stats && stats.rewatchCount > 0) {
                bannerHtml += '<div style="font-size: 0.75rem; color: #94a3b8; border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 6px; margin-top: 2px;">';
                bannerHtml +=   '<span>Current Trophy Level: <strong style="color: #cbd5e1;">' + ach.badge.title + '</strong> (' + (stats.rewatchCount + 1) + 'x Total Series Passes)</span>';
                bannerHtml += '</div>';
              }
            }
            bannerHtml += '</div>';
            firstCompletionBanner.innerHTML = bannerHtml;
            firstCompletionBanner.style.display = 'block';
          } else {
            firstCompletionBanner.style.display = 'none';
          }

          // 2. Next Medal Progress Card
          const nextMedalCard = document.getElementById('modal-next-medal');
          const ntp = stats && stats.nextTierProgress;
          if (ntp && ntp.nextTier) {
            const tierColor = ntp.nextTier === 'silver' ? '#cbd5e1' :
                              ntp.nextTier === 'gold' ? '#fbbf24' :
                              ntp.nextTier === 'platinum' ? '#7dd3fc' : '#f59e0b';
            const tierBorder = ntp.nextTier === 'silver' ? 'rgba(148, 163, 184, 0.35)' :
                               ntp.nextTier === 'gold' ? 'rgba(245, 158, 11, 0.35)' :
                               ntp.nextTier === 'platinum' ? 'rgba(56, 189, 248, 0.35)' : 'rgba(217, 119, 6, 0.35)';

            const unitLabel = isMovieFavorite ? 'film viewings' : (isAudiobook ? 'listens' : 'episodes');
            const unitRemaining = isMovieFavorite ? 'viewings' : (isAudiobook ? 'listens' : 'eps');

            let nmHtml = '<div style="background: rgba(13, 17, 23, 0.85); border: 1px solid ' + tierBorder + '; border-radius: 12px; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px;">';
            nmHtml +=   '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">';
            nmHtml +=     '<div style="display: flex; align-items: center; gap: 8px;">';
            nmHtml +=       '<span style="font-size: 1.1rem;">🎖️</span>';
            nmHtml +=       '<span style="font-weight: 700; font-size: 0.85rem; color: #fff;">';
            nmHtml +=         'Progress to Next Medal: <span style="color: ' + tierColor + ';">' + ntp.nextTierName + '</span>';
            nmHtml +=       '</span>';
            nmHtml +=     '</div>';
            nmHtml +=     '<span style="font-weight: 700; font-size: 0.85rem; color: ' + tierColor + ';">' + ntp.percentComplete + '%</span>';
            nmHtml +=   '</div>';
            nmHtml +=   '<div style="width: 100%; background: rgba(0,0,0,0.6); height: 7px; border-radius: 999px; overflow: hidden;">';
            nmHtml +=     '<div style="background: linear-gradient(90deg, ' + tierColor + ', #34d399); width: ' + ntp.percentComplete + '%; height: 100%; border-radius: 999px;"></div>';
            nmHtml +=   '</div>';
            nmHtml +=   '<div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.78rem; color: #94a3b8; flex-wrap: wrap; gap: 6px;">';
            nmHtml +=     '<span>' + (ntp.nextTier === 'bronze' ? 'Watched' : 'Rewatched') + ': <strong style="color: #fff;">' + ntp.rewatchedCount + '</strong> of ' + ntp.targetCount + ' ' + unitLabel + '</span>';
            nmHtml +=     '<span style="color: ' + tierColor + '; font-weight: 600;">' + (ntp.remainingCount > 0 ? ntp.remainingCount + ' ' + unitRemaining + ' remaining' : 'Ready for upgrade') + '</span>';
            nmHtml +=   '</div>';
            nmHtml +=   '<div style="font-size: 0.72rem; color: #8b949e; background: rgba(0,0,0,0.25); padding: 6px 10px; border-radius: 6px;">';
            if (isMovieFavorite) {
              nmHtml += (ntp.nextTier === 'gold' ? 'Watch this movie a 3rd time across distinct sessions to unlock the Gold medal.' :
                         ntp.nextTier === 'platinum' ? 'Watch this movie 4+ times across distinct sessions to unlock the Platinum medal.' :
                         'Watch this movie again across distinct sessions to level up your favorite medal.');
            } else {
              nmHtml += (ntp.nextTier === 'silver' ? 'Re-watch every episode at least once (2x total plays) to unlock the Silver medal.' :
                         ntp.nextTier === 'gold' ? 'Re-watch every episode at least 2 times (3x total plays) to unlock the Gold medal.' :
                         ntp.nextTier === 'platinum' ? 'Re-watch every episode at least 3 times (4x total plays) to unlock the Platinum medal.' :
                         'Complete remaining episodes to earn the series trophy.');
            }
            nmHtml +=   '</div>';
            nmHtml += '</div>';

            nextMedalCard.innerHTML = nmHtml;
            nextMedalCard.style.display = 'block';
          } else if (ntp && !ntp.nextTier && stats && stats.rewatchCount >= 3) {
            nextMedalCard.innerHTML = '<div style="background: rgba(13, 17, 23, 0.85); border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 12px; padding: 14px 16px; display: flex; align-items: center; gap: 12px;">' +
              '<span style="font-size: 1.5rem;">👑</span>' +
              '<div>' +
                '<div style="font-weight: 700; font-size: 0.9rem; color: #7dd3fc;">Pinnacle Replay Medal (Platinum) Achieved!</div>' +
                '<div style="font-size: 0.75rem; color: #94a3b8; margin-top: 2px;">' +
                  (isMovieFavorite ? 'Watched ' + (stats.rewatchCount + 1) + ' times across distinct viewing sessions.' : 'Completed ' + stats.rewatchCount + ' full series rewatches across all episodes.') +
                '</div>' +
              '</div>' +
            '</div>';
            nextMedalCard.style.display = 'block';
          } else {
            nextMedalCard.style.display = 'none';
          }

          // 3. Stats Box (Coverage Audit for Caught-Up & In-Progress Series, or standard progress for non-episode achievements)
          const statsBox = document.getElementById('modal-stats-box');
          const epDetails = stats && stats.episodeReplayDetails;
          const hasEpDetails = epDetails && epDetails.length > 0;
          const hasCoverageAudit = isCaughtUp || (!isEarned && isShowMastery && stats && stats.availableOnPlex != null);

          if (isAudiobook) {
            statsBox.style.display = 'block';
            const totalSec = stats && stats.totalDurationSeconds ? stats.totalDurationSeconds : (ach.progress ? ach.progress.target : 0);
            const offsetSec = stats && stats.viewOffsetSeconds ? stats.viewOffsetSeconds : (ach.progress ? ach.progress.current : 0);
            const listenedHrs = (offsetSec / 3600).toFixed(1);
            const totalHrs = (totalSec / 3600).toFixed(1);
            const pct = stats && stats.percentComplete != null ? stats.percentComplete : (totalSec > 0 ? Math.round((offsetSec / totalSec) * 100) : 0);

            let html = '<div style="display: flex; flex-direction: column; gap: 10px; width: 100%;">';
            html +=   '<div style="display: flex; justify-content: space-between; font-weight: 600; color: #fff;">';
            html +=     '<span>Listening Progress: ' + listenedHrs + ' / ' + totalHrs + ' hrs</span>';
            html +=     '<span style="color: #38bdf8;">' + pct + '% (' + (isEarned ? 'Completed' : 'In Progress') + ')</span>';
            html +=   '</div>';
            html +=   '<div style="width: 100%; background: rgba(0,0,0,0.6); height: 6px; border-radius: 999px; overflow: hidden;">';
            html +=     '<div style="background: #38bdf8; width: ' + pct + '%; height: 100%;"></div>';
            html +=   '</div>';
            html +=   '<div style="padding: 12px 14px; background: rgba(56, 189, 248, 0.08); border: 1px solid rgba(56, 189, 248, 0.25); border-radius: 10px; display: flex; flex-direction: column; gap: 8px;">';
            html +=     '<div style="display: flex; justify-content: space-between; align-items: center;">';
            html +=       '<span style="font-weight: 700; font-size: 0.8rem; color: #38bdf8; display: flex; align-items: center; gap: 6px;">';
            html +=         '<span>🎧</span> Listening Progress Summary';
            html +=       '</span>';
            html +=       '<span style="font-size: 0.7rem; font-weight: 600; background: rgba(56, 189, 248, 0.2); color: #7dd3fc; padding: 2px 8px; border-radius: 999px;">';
            html +=         isEarned ? '100% Finished' : (pct + '% Listened');
            html +=       '</span>';
            html +=     '</div>';
            html +=     '<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; font-size: 0.75rem; text-align: center; margin-top: 4px;">';
            html +=       '<div style="background: rgba(0,0,0,0.3); padding: 6px; border-radius: 6px;">';
            html +=         '<div style="color: #94a3b8; font-size: 0.7rem;">Time Listened</div>';
            html +=         '<div style="font-weight: 700; color: #e2e8f0;">' + listenedHrs + ' hrs</div>';
            html +=       '</div>';
            html +=       '<div style="background: rgba(0,0,0,0.3); padding: 6px; border-radius: 6px;">';
            html +=         '<div style="color: #94a3b8; font-size: 0.7rem;">Total Duration</div>';
            html +=         '<div style="font-weight: 700; color: #38bdf8;">' + totalHrs + ' hrs</div>';
            html +=       '</div>';
            html +=       '<div style="background: rgba(0,0,0,0.3); padding: 6px; border-radius: 6px;">';
            html +=         '<div style="color: #94a3b8; font-size: 0.7rem;">Chapters</div>';
            html +=         '<div style="font-weight: 700; color: #a5f3fc;">' + (stats && stats.chapterCount ? stats.chapterCount + ' chapters' : 'Standard') + '</div>';
            html +=       '</div>';
            html +=     '</div>';
            if (stats && stats.narrators && stats.narrators.length > 0) {
              html +=   '<div style="font-size: 0.75rem; color: #cbd5e1; display: flex; align-items: center; gap: 6px; margin-top: 2px;">';
              html +=     '<span>🎙️</span>';
              html +=     '<span>Narrated by: <strong style="color: #fff;">' + stats.narrators.join(', ') + '</strong></span>';
              html +=   '</div>';
            }
            html +=     '<div style="font-size: 0.75rem; color: #94a3b8; display: flex; align-items: center; gap: 6px; margin-top: 2px;">';
            html +=       '<span>📱</span>';
            html +=       '<span>Audiobook listening progress tracked automatically via Plex and Prologue playback events.</span>';
            html +=     '</div>';
            html +=   '</div>';
            html += '</div>';
            statsBox.innerHTML = html;
          } else if (isMovieCollection) {
            statsBox.style.display = 'block';
            const watched = ach.progress ? ach.progress.current : (stats && stats.completedItems != null ? stats.completedItems : 0);
            const target = ach.progress ? ach.progress.target : (stats && stats.collectionFilms ? stats.collectionFilms.length : 1);
            const available = stats && stats.availableOnPlex != null ? stats.availableOnPlex : target;
            const missing = stats && stats.missingOffServerCount != null ? stats.missingOffServerCount : Math.max(0, target - available);
            const pct = Math.round((watched / target) * 100);

            const boxAccent = isCaughtUp ? '#34d399' : (isEarned ? '#fbbf24' : '#f59e0b');
            const boxBg = isCaughtUp ? 'rgba(16, 185, 129, 0.08)' : (isEarned ? 'rgba(245, 158, 11, 0.08)' : 'rgba(245, 158, 11, 0.08)');
            const boxBorder = isCaughtUp ? 'rgba(16, 185, 129, 0.25)' : (isEarned ? 'rgba(245, 158, 11, 0.35)' : 'rgba(245, 158, 11, 0.25)');

            let html = '<div style="display: flex; flex-direction: column; gap: 10px; width: 100%;">';
            html +=   '<div style="display: flex; justify-content: space-between; font-weight: 600; color: #fff;">';
            html +=     '<span>Franchise Progress: ' + watched + ' / ' + target + ' films</span>';
            html +=     '<span style="color: ' + boxAccent + ';">' + pct + '% (' + (isEarned ? '100% Complete' : (isCaughtUp ? 'Caught Up' : 'In Progress')) + ')</span>';
            html +=   '</div>';
            html +=   '<div style="width: 100%; background: rgba(0,0,0,0.6); height: 6px; border-radius: 999px; overflow: hidden;">';
            html +=     '<div style="background: ' + boxAccent + '; width: ' + pct + '%; height: 100%;"></div>';
            html +=   '</div>';
            html +=   '<div style="padding: 12px 14px; background: ' + boxBg + '; border: 1px solid ' + boxBorder + '; border-radius: 10px; display: flex; flex-direction: column; gap: 8px;">';
            html +=     '<div style="display: flex; justify-content: space-between; align-items: center;">';
            html +=       '<span style="font-weight: 700; font-size: 0.8rem; color: ' + boxAccent + '; display: flex; align-items: center; gap: 6px;">';
            html +=         '<span>🛡️</span> Franchise Coverage Audit';
            html +=       '</span>';
            html +=       '<span style="font-size: 0.7rem; font-weight: 600; background: rgba(245, 158, 11, 0.2); color: #fde68a; padding: 2px 8px; border-radius: 999px;">';
            html +=         isEarned ? 'Full Franchise Completed' : (isCaughtUp ? 'Caught Up on Plex' : (watched + ' of ' + target + ' watched'));
            html +=       '</span>';
            html +=     '</div>';
            html +=     '<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; font-size: 0.75rem; text-align: center; margin-top: 4px;">';
            html +=       '<div style="background: rgba(0,0,0,0.3); padding: 6px; border-radius: 6px;">';
            html +=         '<div style="color: #94a3b8; font-size: 0.7rem;">Plex Library</div>';
            html +=         '<div style="font-weight: 700; color: #e2e8f0;">' + Math.min(watched, available) + '/' + available + ' films</div>';
            html +=       '</div>';
            html +=       '<div style="background: rgba(0,0,0,0.3); padding: 6px; border-radius: 6px;">';
            html +=         '<div style="color: #94a3b8; font-size: 0.7rem;">Household Watched</div>';
            html +=         '<div style="font-weight: 700; color: ' + boxAccent + ';">' + watched + ' films</div>';
            html +=       '</div>';
            html +=       '<div style="background: rgba(0,0,0,0.3); padding: 6px; border-radius: 6px;">';
            html +=         '<div style="color: #94a3b8; font-size: 0.7rem;">Missing Off-Server</div>';
            html +=         '<div style="font-weight: 700; color: ' + (missing > 0 ? '#f59e0b' : '#34d399') + ';">' + (missing > 0 ? '+' + missing + ' films' : '0 (None)') + '</div>';
            html +=       '</div>';
            html +=     '</div>';
            if (missing > 0) {
              html +=   '<div style="font-size: 0.75rem; color: #cbd5e1; display: flex; align-items: center; gap: 6px; margin-top: 2px;">';
              html +=     '<span>🔒</span>';
              html +=     '<span>Franchise Trophy locked until full canonical franchise (' + target + ' films) is acquired on server and completed.</span>';
              html +=   '</div>';
            } else {
              html +=   '<div style="font-size: 0.75rem; color: #34d399; display: flex; align-items: center; gap: 6px; margin-top: 2px;">';
              html +=     '<span>✓</span>';
              html +=     '<span>All canonical franchise films are present in your local Plex library.</span>';
              html +=   '</div>';
            }
            html +=   '</div>';
            html += '</div>';
            statsBox.innerHTML = html;
          } else if (isMovieFavorite) {
            statsBox.style.display = 'block';
            const totalPlays = stats && stats.totalPlays != null ? stats.totalPlays : ((stats && stats.rewatchCount || 0) + 1);
            const rewatchCount = stats && stats.rewatchCount != null ? stats.rewatchCount : (totalPlays - 1);
            const tierName = ach.badge.tier.toUpperCase();

            let html = '<div style="display: flex; flex-direction: column; gap: 10px; width: 100%;">';
            html +=   '<div style="display: flex; justify-content: space-between; font-weight: 600; color: #fff;">';
            html +=     '<span>Replay Loyalty: ' + totalPlays + 'x Total Watches</span>';
            html +=     '<span style="color: #fbbf24;">' + tierName + ' TIER</span>';
            html +=   '</div>';
            html +=   '<div style="padding: 12px 14px; background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.25); border-radius: 10px; display: flex; flex-direction: column; gap: 8px;">';
            html +=     '<div style="display: flex; justify-content: space-between; align-items: center;">';
            html +=       '<span style="font-weight: 700; font-size: 0.8rem; color: #fbbf24; display: flex; align-items: center; gap: 6px;">';
            html +=         '<span>🍿</span> Replay Loyalty Summary';
            html +=       '</span>';
            html +=       '<span style="font-size: 0.7rem; font-weight: 600; background: rgba(245, 158, 11, 0.2); color: #fde68a; padding: 2px 8px; border-radius: 999px;">';
            html +=         rewatchCount + ' Re-watches Logged';
            html +=       '</span>';
            html +=     '</div>';
            html +=     '<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; font-size: 0.75rem; text-align: center; margin-top: 4px;">';
            html +=       '<div style="background: rgba(0,0,0,0.3); padding: 6px; border-radius: 6px;">';
            html +=         '<div style="color: #94a3b8; font-size: 0.7rem;">Total Plays</div>';
            html +=         '<div style="font-weight: 700; color: #fbbf24;">' + totalPlays + ' views</div>';
            html +=       '</div>';
            html +=       '<div style="background: rgba(0,0,0,0.3); padding: 6px; border-radius: 6px;">';
            html +=         '<div style="color: #94a3b8; font-size: 0.7rem;">First Watched</div>';
            html +=         '<div style="font-weight: 700; color: #e2e8f0;">' + (stats && stats.firstCompletedAt ? new Date(stats.firstCompletedAt).toLocaleDateString() : 'Historical') + '</div>';
            html +=       '</div>';
            html +=       '<div style="background: rgba(0,0,0,0.3); padding: 6px; border-radius: 6px;">';
            html +=         '<div style="color: #94a3b8; font-size: 0.7rem;">Latest Viewing</div>';
            html +=         '<div style="font-weight: 700; color: #34d399;">' + (stats && stats.latestWatchedAt ? new Date(stats.latestWatchedAt).toLocaleDateString() : 'Recent') + '</div>';
            html +=       '</div>';
            html +=     '</div>';
            html +=     '<div style="font-size: 0.75rem; color: #cbd5e1; display: flex; align-items: center; gap: 6px; margin-top: 2px;">';
            html +=       '<span>✨</span>';
            html +=       '<span>Cult-Classic Favorite: Distinct viewing sessions separated by at least 12 hours count toward rewatch medal tiers.</span>';
            html +=     '</div>';
            html +=   '</div>';
            html += '</div>';
            statsBox.innerHTML = html;
          } else if (hasCoverageAudit) {
            statsBox.style.display = 'block';
            const available = ach.badge.stats.availableOnPlex != null ? ach.badge.stats.availableOnPlex : ach.progress.current;
            const missing = ach.badge.stats.missingOffServerCount != null ? ach.badge.stats.missingOffServerCount : Math.max(0, ach.progress.target - available);
            const aired = ach.badge.stats.airedEpisodesCount != null ? ach.badge.stats.airedEpisodesCount : null;
            const nextAirAt = ach.badge.stats.nextAirAt || null;
            const watched = ach.progress.current;
            const target = ach.progress.target;
            const pct = Math.round((watched / target) * 100);
            const isAiringWithUpcoming = aired != null && target > aired;
            const unairedCount = isAiringWithUpcoming ? Math.max(0, target - aired) : 0;
            const unwatchedOnPlex = Math.max(0, available - watched);
            const nextAirLabel = nextAirAt
              ? new Date(nextAirAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
              : null;

            const boxAccentColor = isCaughtUp ? '#34d399' : '#f59e0b';
            const boxBg = isCaughtUp ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)';
            const boxBorder = isCaughtUp ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245, 158, 11, 0.25)';
            const pillBg = isCaughtUp ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)';
            const pillText = isCaughtUp ? '#6ee7b7' : '#fcd34d';
            const statusText = isCaughtUp
              ? (isAiringWithUpcoming && missing === 0 ? 'Caught Up on Broadcast' : 'Caught Up on Plex')
              : (unwatchedOnPlex > 0 ? (unwatchedOnPlex + ' Unwatched on Plex') : 'In Progress');

            let html = '<div style="display: flex; flex-direction: column; gap: 10px; width: 100%;">';
            html +=   '<div style="display: flex; justify-content: space-between; font-weight: 600; color: #fff;">';
            html +=     '<span>Progress: ' + watched + ' / ' + target + ' episodes</span>';
            html +=     '<span style="color: ' + boxAccentColor + ';">' + pct + '% (' + (isCaughtUp ? 'Caught Up' : 'In Progress') + ')</span>';
            html +=   '</div>';
            html +=   '<div style="width: 100%; background: rgba(0,0,0,0.6); height: 6px; border-radius: 999px; overflow: hidden;">';
            html +=     '<div style="background: ' + (isCaughtUp ? '#10b981' : '#f59e0b') + '; width: ' + pct + '%; height: 100%;"></div>';
            html +=   '</div>';
            html +=   '<div style="padding: 12px 14px; background: ' + boxBg + '; border: 1px solid ' + boxBorder + '; border-radius: 10px; display: flex; flex-direction: column; gap: 8px;">';
            html +=     '<div style="display: flex; justify-content: space-between; align-items: center;">';
            html +=       '<span style="font-weight: 700; font-size: 0.8rem; color: ' + boxAccentColor + '; display: flex; align-items: center; gap: 6px;">';
            html +=         '<span>🛡️</span> Server Coverage Audit';
            html +=       '</span>';
            html +=       '<span style="font-size: 0.7rem; font-weight: 600; background: ' + pillBg + '; color: ' + pillText + '; padding: 2px 8px; border-radius: 999px;">';
            html +=         statusText;
            html +=       '</span>';
            html +=     '</div>';
            html +=     '<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; font-size: 0.75rem; text-align: center; margin-top: 4px;">';
            html +=       '<div style="background: rgba(0,0,0,0.3); padding: 6px; border-radius: 6px;">';
            html +=         '<div style="color: #94a3b8; font-size: 0.7rem;">Server Library</div>';
            html +=         '<div style="font-weight: 700; color: #e2e8f0;">' + Math.min(watched, available) + '/' + available + ' eps</div>';
            html +=       '</div>';
            html +=       '<div style="background: rgba(0,0,0,0.3); padding: 6px; border-radius: 6px;">';
            html +=         '<div style="color: #94a3b8; font-size: 0.7rem;">Household Watched</div>';
            html +=         '<div style="font-weight: 700; color: ' + boxAccentColor + ';">' + watched + ' eps</div>';
            html +=       '</div>';
            html +=       '<div style="background: rgba(0,0,0,0.3); padding: 6px; border-radius: 6px;">';
            if (isAiringWithUpcoming && missing === 0) {
              html +=       '<div style="color: #94a3b8; font-size: 0.7rem;">Aired to Date</div>';
              html +=       '<div style="font-weight: 700; color: #38bdf8;">' + aired + '/' + target + ' eps</div>';
            } else {
              html +=       '<div style="color: #94a3b8; font-size: 0.7rem;">Missing Off-Server</div>';
              html +=       '<div style="font-weight: 700; color: #f59e0b;">+' + missing + ' eps</div>';
            }
            html +=       '</div>';
            html +=     '</div>';
            if (isAiringWithUpcoming) {
              html +=   '<div style="font-size: 0.75rem; color: #93c5fd; display: flex; align-items: center; gap: 6px; margin-top: 2px;">';
              html +=     '<span>📡</span>';
              html +=     '<span>Broadcast Schedule: <strong>' + aired + ' of ' + target + '</strong> episodes aired (' + unairedCount + ' upcoming)' + (nextAirLabel ? ' • Next airs <strong>' + nextAirLabel + '</strong>' : '') + '.</span>';
              html +=   '</div>';
            }
            html +=     '<div style="font-size: 0.75rem; color: #cbd5e1; display: flex; align-items: center; gap: 6px; margin-top: 2px;">';
            html +=       '<span>🔒</span>';
            html +=       '<span>Series Trophy locked until full canonical series (' + target + ' eps) is acquired on server and completed.</span>';
            html +=     '</div>';
            html +=   '</div>';
            html += '</div>';
            statsBox.innerHTML = html;
          } else if (!hasEpDetails && (ach.badge.stats || ach.progress)) {
            statsBox.style.display = 'block';
            let html = '<div style="display: flex; justify-content: space-between; font-weight: 600; color: #fff;">';
            if (ach.progress) {
              const pct = Math.round((ach.progress.current / ach.progress.target) * 100);
              html += '<span>Progress: ' + ach.progress.current + ' / ' + ach.progress.target + ' ' + (ach.progress.unit || 'items') + '</span>';
              html += '<span>' + pct + '%</span>';
            } else {
              html += '<span>' + (ach.reason || 'Criteria met') + '</span>';
            }
            html += '</div>';
            statsBox.innerHTML = html;
          } else {
            statsBox.style.display = 'none';
          }

          // 4. Item Breakdown / Checklist (Franchise Films or TV/Anime Episodes)
          const epSection = document.getElementById('modal-episodes-section');
          if (isMovieCollection && stats && stats.collectionFilms && stats.collectionFilms.length > 0) {
            epSection.style.display = 'block';
            const films = stats.collectionFilms;
            const watchedCount = films.filter(f => f.completed).length;
            const totalCount = films.length;

            let epHtml = '<div style="display: flex; flex-direction: column; gap: 10px;">';
            epHtml +=   '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">';
            epHtml +=     '<div style="font-size: 0.8rem; font-weight: 700; text-transform: uppercase; color: #8b949e; letter-spacing: 0.5px;">';
            epHtml +=       'Franchise Film Checklist (' + watchedCount + ' / ' + totalCount + ' Watched)';
            epHtml +=     '</div>';
            epHtml +=   '</div>';

            // Table Header
            epHtml +=   '<div style="display: grid; grid-template-columns: minmax(0, 1fr) 55px 75px 50px 75px; gap: 8px; padding: 4px 10px; font-size: 0.7rem; font-weight: 700; color: #6e7681; text-transform: uppercase;">';
            epHtml +=     '<span>Film Title</span>';
            epHtml +=     '<span>Year</span>';
            epHtml +=     '<span>Plex</span>';
            epHtml +=     '<span style="text-align: center;">Plays</span>';
            epHtml +=     '<span style="text-align: right;">Status</span>';
            epHtml +=   '</div>';

            // Table Rows
            epHtml +=   '<div style="max-height: 240px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px;" class="thin-scroll">';
            epHtml += films.map(f => {
              const statusBadge = f.completed
                ? '<span class="badge" style="background: rgba(16, 185, 129, 0.2); color: #34d399; font-weight: 700; font-size: 0.72rem; padding: 2px 6px;">Watched</span>'
                : (f.availableOnPlex
                    ? '<span class="badge" style="background: rgba(245, 158, 11, 0.2); color: #fbbf24; font-weight: 600; font-size: 0.72rem; padding: 2px 6px;">Unwatched</span>'
                    : '<span class="badge" style="background: rgba(139, 148, 158, 0.2); color: #8b949e; font-weight: 600; font-size: 0.72rem; padding: 2px 6px;">Off-Server</span>');

              const plexLabel = f.availableOnPlex
                ? '<span style="color: #34d399; font-size: 0.75rem; font-weight: 600;">On Server</span>'
                : '<span style="color: #f59e0b; font-size: 0.75rem;">Off Server</span>';

              const playLabel = f.playCount > 0
                ? '<span style="font-weight: 700; color: #fff; font-size: 0.75rem;">' + f.playCount + 'x</span>'
                : '<span style="color: #6e7681; font-size: 0.75rem;">—</span>';

              return '<div class="modal-film-row" style="display: grid; grid-template-columns: minmax(0, 1fr) 55px 75px 50px 75px; gap: 8px; padding: 6px 10px; background: rgba(22, 27, 34, 0.6); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 6px; align-items: center;">' +
                '<span style="color: #e6edf3; font-weight: 600; font-size: 0.8rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="' + f.title + '">' + f.title + '</span>' +
                '<span style="color: #8b949e; font-size: 0.75rem;">' + (f.year || '—') + '</span>' +
                '<span>' + plexLabel + '</span>' +
                '<span style="text-align: center;">' + playLabel + '</span>' +
                '<span style="text-align: right;">' + statusBadge + '</span>' +
              '</div>';
            }).join('');
            epHtml +=   '</div>';
            epHtml += '</div>';

            epSection.innerHTML = epHtml;
          } else if (hasEpDetails) {
            epSection.style.display = 'block';
            const totalCount = epDetails.length;
            const rewatchedCount = epDetails.filter(e => e.replayCount > 0).length;
            const reqReplays = (stats.rewatchCount || 0) + 1;
            const neededCount = epDetails.filter(e => e.replayCount < reqReplays).length;

            let epFilter = rewatchedCount > 0 ? 'rewatched' : 'all';

            const renderEpisodeList = () => {
              let filtered = epDetails;
              if (epFilter === 'rewatched') {
                filtered = epDetails.filter(e => e.replayCount > 0);
              } else if (epFilter === 'needed') {
                filtered = epDetails.filter(e => e.replayCount < reqReplays);
              }

              let epHtml = '<div style="display: flex; flex-direction: column; gap: 10px;">';
              epHtml +=   '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">';
              epHtml +=     '<div style="font-size: 0.8rem; font-weight: 700; text-transform: uppercase; color: #8b949e; letter-spacing: 0.5px;">';
              epHtml +=       'Episode Repeat Watches & History';
              epHtml +=     '</div>';
              epHtml +=     '<div style="display: flex; gap: 6px;">';
              epHtml +=       '<button type="button" class="modal-ep-tab ' + (epFilter === 'rewatched' ? 'active' : '') + '" data-filter="rewatched">Rewatched (' + rewatchedCount + ')</button>';
              if (ntp && ntp.nextTier && neededCount > 0) {
                epHtml +=     '<button type="button" class="modal-ep-tab ' + (epFilter === 'needed' ? 'active' : '') + '" data-filter="needed">Needs Next (' + neededCount + ')</button>';
              }
              epHtml +=       '<button type="button" class="modal-ep-tab ' + (epFilter === 'all' ? 'active' : '') + '" data-filter="all">All (' + totalCount + ')</button>';
              epHtml +=     '</div>';
              epHtml +=   '</div>';

              // Table Header
              epHtml +=   '<div style="display: grid; grid-template-columns: 75px minmax(0, 1fr) 55px 95px 95px; gap: 8px; padding: 4px 10px; font-size: 0.7rem; font-weight: 700; color: #6e7681; text-transform: uppercase;">';
              epHtml +=     '<span>Episode</span>';
              epHtml +=     '<span>Title</span>';
              epHtml +=     '<span style="text-align: center;">Plays</span>';
              epHtml +=     '<span>First Seen</span>';
              epHtml +=     '<span class="hide-mobile">Last Repeat</span>';
              epHtml +=   '</div>';

              // Table Rows
              epHtml +=   '<div style="max-height: 240px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px;" class="thin-scroll">';
              if (filtered.length === 0) {
                epHtml +=   '<div style="padding: 16px; text-align: center; color: var(--text-muted); font-size: 0.8rem;">No episodes match this filter.</div>';
              } else {
                epHtml += filtered.map(ep => {
                  let epCode = ep.seasonNumber != null && ep.episodeNumber != null
                    ? 'S' + String(ep.seasonNumber).padStart(2, '0') + 'E' + String(ep.episodeNumber).padStart(2, '0')
                    : ep.episodeKey;

                  let playBadge = '';
                  if (ep.playCount >= 4) {
                    playBadge = '<span class="badge" style="background: rgba(56, 189, 248, 0.2); color: #7dd3fc; border: 1px solid rgba(56, 189, 248, 0.35); font-weight: 700; font-size: 0.72rem; padding: 2px 6px;">' + ep.playCount + 'x</span>';
                  } else if (ep.playCount === 3) {
                    playBadge = '<span class="badge" style="background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.35); font-weight: 700; font-size: 0.72rem; padding: 2px 6px;">3x</span>';
                  } else if (ep.playCount === 2) {
                    playBadge = '<span class="badge" style="background: rgba(148, 163, 184, 0.2); color: #cbd5e1; border: 1px solid rgba(148, 163, 184, 0.35); font-weight: 700; font-size: 0.72rem; padding: 2px 6px;">2x</span>';
                  } else {
                    playBadge = '<span class="badge" style="background: rgba(139, 148, 158, 0.12); color: #8b949e; font-weight: 600; font-size: 0.72rem; padding: 2px 6px;">1x</span>';
                  }

                  const firstDateStr = ep.firstWatchedAt
                    ? new Date(ep.firstWatchedAt).toLocaleDateString(undefined, { year: '2-digit', month: 'numeric', day: 'numeric' })
                    : '—';
                  const lastDateStr = (ep.playCount > 1 && ep.lastWatchedAt)
                    ? new Date(ep.lastWatchedAt).toLocaleDateString(undefined, { year: '2-digit', month: 'numeric', day: 'numeric' })
                    : '—';

                  return '<div class="modal-ep-row">' +
                    '<span style="font-family: monospace; font-weight: 600; color: #58a6ff; font-size: 0.75rem;">' + epCode + '</span>' +
                    '<span style="color: #e6edf3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="' + ep.title + '">' + ep.title + '</span>' +
                    '<span style="text-align: center;">' + playBadge + '</span>' +
                    '<span style="color: #8b949e; font-size: 0.72rem;">' + firstDateStr + '</span>' +
                    '<span class="hide-mobile" style="color: ' + (ep.playCount > 1 ? '#34d399' : '#6e7681') + '; font-size: 0.72rem;">' + lastDateStr + '</span>' +
                  '</div>';
                }).join('');
              }
              epHtml +=   '</div>';
              epHtml += '</div>';

              epSection.innerHTML = epHtml;

              epSection.querySelectorAll('.modal-ep-tab').forEach(tab => {
                tab.addEventListener('click', () => {
                  epFilter = tab.dataset.filter;
                  renderEpisodeList();
                });
              });
            };

            renderEpisodeList();
          } else {
            epSection.style.display = 'none';
          }

          // 5. Evidence Trail
          const evidenceList = document.getElementById('modal-evidence-list');
          const evidenceCount = document.getElementById('evidence-count');
          const evidence = ach.supportingEvidence || [];
          evidenceCount.textContent = evidence.length + ' evidence events';

          if (evidence.length === 0) {
            evidenceList.innerHTML = '<div style="color: var(--text-muted); padding: 8px;">No explicit evidence events recorded.</div>';
          } else {
            evidenceList.innerHTML = evidence.slice(0, 50).map((e, idx) => {
              return '<div style="padding: 6px 10px; background: #0d1117; border: 1px solid #21262d; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">' +
                '<div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 8px;">' +
                  '<span style="color: #58a6ff; font-family: monospace; margin-right: 6px;">#' + (idx + 1) + '</span>' +
                  '<span style="color: #c9d1d9;">' + (e.title || 'Playback event #' + e.id) + '</span>' +
                '</div>' +
                '<div style="text-align: right; flex-shrink: 0; font-size: 0.75rem; color: var(--text-muted);">' +
                  '<div>' + (e.eventTime ? new Date(e.eventTime).toLocaleDateString() : 'Historical') + '</div>' +
                '</div>' +
              '</div>';
            }).join('');
          }

          let earnedStatusText = 'Status: ' + ach.state;
          if (ach.earnedAt) {
            earnedStatusText = 'Earned on ' + new Date(ach.earnedAt).toLocaleString();
          } else if (isCaughtUp) {
            if (isMovieCollection) {
              earnedStatusText = 'Status: Caught Up on Plex (' + ach.progress.current + '/' + (stats && stats.availableOnPlex || ach.progress.current) + ' available films on server)';
            } else {
              earnedStatusText = 'Status: Caught Up on Plex (' + ach.progress.current + '/' + ((stats && stats.availableOnPlex) || ach.progress.current) + ' available on server)';
            }
          }
          document.getElementById('modal-earned-at').textContent = earnedStatusText;

          modal.style.display = 'flex';
        }

        function closeModal() {
          document.getElementById('detail-modal').style.display = 'none';
        }

        document.getElementById('btn-refresh-achievements').addEventListener('click', () => {
          if (activeUserId) selectUser(activeUserId, true);
        });

        document.querySelectorAll('#facet-filters button').forEach(btn => {
          btn.addEventListener('click', () => {
            document.querySelectorAll('#facet-filters button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeFacet = btn.dataset.facet;
            renderAll();
          });
        });

        document.querySelectorAll('#media-filters button').forEach(btn => {
          btn.addEventListener('click', () => {
            document.querySelectorAll('#media-filters button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeMedia = btn.dataset.media;
            renderAll();
          });
        });

        document.querySelectorAll('#state-filters button').forEach(btn => {
          btn.addEventListener('click', () => {
            document.querySelectorAll('#state-filters button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeState = btn.dataset.state;
            renderAll();
          });
        });

        document.getElementById('modal-close').addEventListener('click', closeModal);
        document.getElementById('modal-dismiss').addEventListener('click', closeModal);
        document.getElementById('detail-modal').addEventListener('click', (e) => {
          if (e.target.id === 'detail-modal') closeModal();
        });

        // Profile Drawer Controls
        document.getElementById('btn-toggle-profile-drawer')?.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleProfileDrawer();
        });
        document.getElementById('btn-drawer-toggle-alt')?.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleProfileDrawer();
        });
        document.getElementById('btn-close-drawer')?.addEventListener('click', () => toggleProfileDrawer(false));
        document.addEventListener('click', (e) => {
          if (!isDrawerOpen) return;
          const hud = document.getElementById('achievements-hud');
          if (hud && !hud.contains(e.target)) {
            toggleProfileDrawer(false);
          }
        });

        // Bubble Scroll Controls
        document.getElementById('btn-scroll-tabs-left')?.addEventListener('click', () => {
          document.getElementById('user-tabs')?.scrollBy({ left: -220, behavior: 'smooth' });
        });
        document.getElementById('btn-scroll-tabs-right')?.addEventListener('click', () => {
          document.getElementById('user-tabs')?.scrollBy({ left: 220, behavior: 'smooth' });
        });
        document.getElementById('btn-reset-user-order')?.addEventListener('click', () => {
          try {
            localStorage.removeItem('plex_achievements_profile_order');
          } catch {}
          initAchievements();
        });

        // Badge Sorting Dropdown
        const sortSelect = document.getElementById('sort-badges-select');
        if (sortSelect) {
          sortSelect.value = activeSort;
          sortSelect.addEventListener('change', (e) => {
            activeSort = e.target.value;
            try {
              localStorage.setItem('plex_achievements_sort', activeSort);
            } catch {}
            renderAll();
          });
        }

        initAchievements();
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
      <link rel="stylesheet" href="/static/styles.css?v=3-6-6d-caught-up">
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
          ${navItem("/prompts", "Review Prompts")}
          ${navItem("/achievements", "Achievements")}
          ${navItem("/audit", "Audit")}
          ${navItem("/settings", "Settings")}
        </nav>
      </header>
      <main class="app-page"><h1>${title}</h1>${body}</main>
    </body>
  </html>`;
}
