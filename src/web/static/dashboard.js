const layouts = new Set(["overview","timeline","explorer","people","progress"]);
const state = { layout: "overview", filters: {}, offset: 0, totals: null, users: null, libraries: null };
const content = document.querySelector("#dashboard-content");
const form = document.querySelector("#dashboard-filters");
const dialog = document.querySelector("#detail-dialog");
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmtDate = value => value ? new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(new Date(value)) : "Unknown time";
const fmtDuration = ms => ms ? Math.round(ms/60000)+" min" : "Duration unknown";
const safePrefs = () => { try { const v=JSON.parse(localStorage.getItem("cowatch.dashboard")||"{}"); return v&&typeof v==="object"?v:{}; } catch { return {}; } };
const prefs=safePrefs(); state.layout=layouts.has(prefs.layout)?prefs.layout:"overview"; state.filters=prefs.filters&&typeof prefs.filters==="object"?prefs.filters:{};
const save=()=>{try{localStorage.setItem("cowatch.dashboard",JSON.stringify({layout:state.layout,filters:state.filters}));}catch{}};
const query=(extra={})=>{const p=new URLSearchParams();Object.entries({...state.filters,...extra}).forEach(([k,v])=>{if(v!==""&&v!=null)p.set(k,String(v));});return p;};
const fetchJson=async url=>{const r=await fetch(url);const j=await r.json();if(!r.ok||!j.ok)throw new Error(j.message||"Panel could not load.");return j.data;};
const evidence=x=>{const e=x.evidence||{};return '<div class="evidence"><span class="proof observed">Observed</span>'+(e.confirmed?'<span class="proof confirmed">Confirmed</span>':'')+(e.promptStatus?'<span class="proof">Prompt '+esc(e.promptStatus)+'</span>':'')+(e.plexSyncStatus?'<span class="proof synced">Plex '+esc(e.plexSyncStatus)+'</span>':'')+'</div>';};
const art=x=>'<img class="poster" src="'+esc(x.artworkUrl)+'" alt="" loading="lazy" onerror="this.src=\'/static/icon.svg\'">';
const mediaTitle=x=>esc(x.displayTitle||x.title||x.showTitle||"");
const activityRow=x=>'<article class="activity-row" tabindex="0" data-item="'+encodeURIComponent(JSON.stringify(x))+'">'+art(x)+'<div class="activity-copy"><div class="activity-heading"><strong>'+mediaTitle(x)+'</strong><span>'+esc(x.categoryLabel)+'</span></div>'+(x.category==="audiobook"&&x.showTitle?'<p>By '+esc(x.showTitle)+'</p>':x.showTitle&&x.showTitle!==x.displayTitle?'<p>'+esc(x.title)+'</p>':'')+'<p>'+esc(x.displayName)+' &middot; '+fmtDate(x.watchedAt)+' &middot; '+fmtDuration(x.duration)+'</p>'+evidence(x)+'</div><div class="progress-ring">'+esc(x.percentComplete??"--")+'%</div></article>';
const empty=label=>'<div class="panel-state"><h3>No '+esc(label)+' here yet</h3><p>Try broadening the filters. Missing evidence stays unknown.</p></div>';
function setButtons(){document.querySelectorAll("[data-layout]").forEach(b=>{b.classList.toggle("active",b.dataset.layout===state.layout);b.setAttribute("aria-pressed",String(b.dataset.layout===state.layout));});}

async function openDetail(x){
  document.querySelector("#detail-content").innerHTML='<div class="panel-state">Loading rich detail.</div>';dialog.showModal();
  let d;try{d=await fetchJson("/api/dashboard/detail/"+encodeURIComponent(x.ratingKey));}catch{d={item:x,plays:[x],people:[{displayName:x.displayName}],repeatCount:0,catalog:null,audiobook:null};}
  
  const a=d.audiobook;
  const isEpisode = x.category==="tv"||x.category==="anime"||x.category==="classic_tv";
  const seasonEp = isEpisode && (x.seasonNumber != null || x.episodeNumber != null)
    ? `Season ${x.seasonNumber ?? '?'}, Episode ${x.episodeNumber ?? '?'}`
    : '';

  let headerHtml = '';
  if (x.category === "audiobook") {
    const title = x.displayTitle || x.title;
    const authorLine = x.showTitle ? '<p class="detail-episode-meta" style="margin-top: 8px; margin-bottom: 12px;"><span class="detail-episode-title">By '+esc(x.showTitle)+'</span></p>' : '';
    headerHtml = '<p class="eyebrow">'+esc(x.categoryLabel)+'</p><h2 style="margin-bottom: 0;">'+esc(title)+'</h2>'+authorLine;
  } else if (x.showTitle) {
    let epTitle = x.title;
    if (epTitle.toLowerCase().includes("episode") || x.showTitle === epTitle || epTitle.match(/^Season \d+/i)) {
      headerHtml = '<p class="eyebrow">'+esc(x.categoryLabel)+'</p><h2 style="margin-bottom: 0;">'+esc(x.showTitle)+'</h2><p class="detail-episode-meta" style="margin-top: 8px; margin-bottom: 12px;"><span class="detail-season-badge">'+esc(seasonEp || 'Episode')+'</span></p>';
    } else {
      headerHtml = '<p class="eyebrow">'+esc(x.categoryLabel)+'</p><h2 style="margin-bottom: 0;">'+esc(x.showTitle)+'</h2><p class="detail-episode-meta" style="margin-top: 8px; margin-bottom: 12px;"><span class="detail-season-badge">'+esc(seasonEp || 'Episode')+'</span> &middot; <span class="detail-episode-title">"'+esc(epTitle)+'"</span></p>';
    }
  } else {
    headerHtml = '<p class="eyebrow">'+esc(x.categoryLabel)+'</p><h2 style="margin-bottom: 12px;">'+esc(x.title)+'</h2>';
  }

  const hierarchy = a 
    ? '<h3>Audiobook hierarchy</h3><p>'+[a.parent_series_title,a.subseries_title,a.series_title,a.title].filter(Boolean).map(esc).join(" > ")+'</p><p>'+esc(a.chapter_count??"Unknown")+' chapters &middot; '+esc(a.enrichment_status)+'</p>'
    : '';

  const durationText = fmtDuration(d.catalog?.duration || x.duration);

  const detailHtml = `
    <div class="detail-layout">
      <div class="detail-poster-wrapper">
        ${art(x)}
      </div>
      <div class="detail-info-wrapper">
        <div>${headerHtml}</div>
        ${hierarchy ? `<div>${hierarchy}</div>` : ''}
        <dl class="detail-metadata">
          <dt>People</dt>
          <dd>${d.people.map(p=>esc(p.displayName)).join(", ")}</dd>
          <dt>Plays</dt>
          <dd>${d.plays.length} (${d.repeatCount} repeats)</dd>
          <dt>Library</dt>
          <dd>${esc(x.libraryName||"Unknown")}</dd>
          <dt>Consumed</dt>
          <dd>${fmtDate(x.watchedAt)}</dd>
          <dt>Duration</dt>
          <dd>${esc(durationText)}</dd>
          <dt>Progress</dt>
          <dd>${esc(x.percentComplete??"Unknown")}%</dd>
          <dt>Raw type</dt>
          <dd>${esc(x.mediaType)}${x.categoryDerived ? " (category derived)" : ""}</dd>
        </dl>
        ${evidence(x)}
      </div>
    </div>
  `;
  
  document.querySelector("#detail-content").innerHTML = detailHtml;
}

// ----------------------------------------------------
// Global summary stats and sidebars
// ----------------------------------------------------
async function loadGlobals() {
  try {
    const d = await fetchJson("/api/dashboard/overview?" + query({ limit: 1 }));
    state.totals = d.totals;
    state.users = d.users;
    state.libraries = d.libraries;
    
    // Update options if empty
    const user=form.elements.user,lib=form.elements.library;
    if(user && user.options.length===1)d.users.forEach(u=>user.add(new Option(u.display_name||u.plex_username,u.plex_username)));
    if(lib && lib.options.length===1)d.libraries.forEach(x=>lib.add(new Option(x,x)));

    // Update sidebar presence status list
    const presence = document.querySelector("#sidebar-presence");
    if(presence && d.users) {
      presence.innerHTML = d.users.map(u => {
        const active = d.heatmaps && d.heatmaps[u.id] && d.heatmaps[u.id].some(h => h > 0);
        const initial = (u.display_name || u.plex_username).slice(0,1).toUpperCase();
        return `<div class="presence-user">
          <div class="avatar-sm">${esc(initial)}</div>
          <span class="presence-name">${esc(u.display_name||u.plex_username)}</span>
          <span class="presence-dot ${active ? 'online' : 'offline'}"></span>
        </div>`;
      }).join("");
    }

    // Update Stat Ribbon
    const ribbon = document.querySelector("#stat-ribbon");
    if(ribbon && d.totals) {
      const hours = Math.round(d.totals.minutes / 60);
      ribbon.innerHTML = `
        <div class="ribbon-card">
          <span class="ribbon-val">${hours.toLocaleString()}h</span>
          <span class="ribbon-lbl">Total Watched</span>
        </div>
        <div class="ribbon-card">
          <span class="ribbon-val">${d.totals.plays.toLocaleString()}</span>
          <span class="ribbon-lbl">Total Plays</span>
        </div>
        <div class="ribbon-card">
          <span class="ribbon-val">${d.totals.people}</span>
          <span class="ribbon-lbl">Active Users</span>
        </div>
        <div class="ribbon-card alert-state ${d.totals.pendingPrompts > 0 ? 'active' : ''}">
          <span class="ribbon-val">${d.totals.pendingPrompts}</span>
          <span class="ribbon-lbl">Pending Prompts</span>
        </div>
      `;
    }
  } catch(e) {
    console.error("Failed to load globals:", e);
  }
}

// ----------------------------------------------------
// Dashboard Panels
// ----------------------------------------------------

async function renderOverview() {
  const [overview, health, prompts] = await Promise.allSettled([
    fetchJson("/api/dashboard/overview?" + query()),
    fetch("/api/health").then(r => r.json()),
    fetchJson("/api/dashboard/prompts")
  ]);
  
  if (overview.status === "rejected") throw overview.reason;
  const d = overview.value;
  const pList = prompts.status === "fulfilled" ? prompts.value : [];
  
  const healthHtml = health.status === "fulfilled" 
    ? Object.entries(health.value.readiness || {}).map(([k, v]) => '<span class="health-pill status-' + esc(v.status) + '">' + esc(k) + ' ' + esc(v.status) + '</span>').join("") 
    : '<span class="proof error">Health unavailable</span>';
    
  // Recently Active Media Carousel
  const cwHtml = d.continueWatching && d.continueWatching.length > 0 
    ? '<div class="cw-carousel">' + d.continueWatching.map(cw => '<article class="cw-card" tabindex="0" data-item="' + encodeURIComponent(JSON.stringify(cw)) + '">' + art(cw) + '<div class="cw-bar"><i style="width:'+esc(cw.percentComplete||0)+'%"></i></div><p>' + esc(cw.displayTitle) + '</p></article>').join("") + '</div>'
    : '<p class="text-muted">No active media in progress.</p>';

  content.innerHTML = `
    <section class="dashboard-grid">
      <div class="dashboard-panel panel-wide">
        <div class="panel-title"><h3>Recently Enjoyed (In Progress)</h3></div>
        ${cwHtml}
        
        <div class="panel-title" style="margin-top: 2rem;"><h3>Category Breakdown</h3></div>
        <div class="category-stats-grid">
          ${d.categoryStats.map(s => `
            <div class="stat-card" data-cat="${s.category}">
              <h4>${esc(s.category.replace('_',' ').toUpperCase())}</h4>
              <div class="stat-main">
                <div class="ring" style="--val: ${s.completionRate}%;"><span class="ring-val">${s.completionRate}%</span><br><small>Fin.</small></div>
                <div class="stat-val"><strong>${s.durationHours}</strong><br>Hours</div>
                <div class="stat-val"><strong>${s.plays}</strong><br>Plays</div>
              </div>
              <div class="top-titles-list">
                ${(d.topTitles[s.category]||[]).map(t => `<div class="top-title-row"><span>${esc(t.title)}</span><small>${Math.round(t.duration/3600000)}h</small></div>`).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      
      <aside>
        <div class="dashboard-panel">
          <h3>Service Readiness</h3>
          <div class="health-list">${healthHtml}</div>
        </div>
      </aside>
    </section>
  `;
}

async function renderTimeline() {
  const d = await fetchJson("/api/dashboard/timeline?" + query({limit: 50, offset: state.offset}));
  const sessions = Array.isArray(d.sessions) ? d.sessions : [];
  
  if ((d.items || []).length === 0 && sessions.length === 0) {
    content.innerHTML = empty("timeline activity");
    return;
  }
  
  // Group bounded chart sessions by day.
  const daysMap = new Map();
  if (sessions.length > 0) {
    sessions.forEach(session => {
      if (!daysMap.has(session.date)) daysMap.set(session.date, []);
      daysMap.get(session.date).push(session);
    });
  } else {
      (d.items || []).forEach(item => {
        if (!item.watchedAt) return;
        const dateStr = item.watchedAt.slice(0, 10);
        if (!daysMap.has(dateStr)) daysMap.set(dateStr, []);
        daysMap.get(dateStr).push({
          id: `${item.userId}-${dateStr}`,
          userId: item.userId,
          displayName: item.displayName,
          date: dateStr,
          startTime: item.watchedAt,
          endTime: item.watchedAt,
          itemCount: 1,
          category: item.category
        });
      });
  }
  
  const sortedDays = [...daysMap.keys()].sort().reverse();
  
  const dayGanttsHtml = sortedDays.map(dateStr => {
    const dayItems = daysMap.get(dateStr);
    dayItems.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    
    const dayStart = new Date(dateStr + "T00:00:00").getTime();
    const dayRange = 24 * 60 * 60 * 1000;
    
    // Group day items by user
    const userMap = new Map();
    dayItems.forEach(item => {
      if (!userMap.has(item.displayName)) userMap.set(item.displayName, []);
      userMap.get(item.displayName).push(item);
    });
    
    const lanes = Array.from(userMap.entries()).map(([user, items]) => {
      const blocks = items.map(item => {
        const start = new Date(item.startTime).getTime();
        const end = new Date(item.endTime || item.startTime).getTime();
        const duration = Math.max(15 * 60 * 1000, end - start || 1800000);
        
        let left = ((start - dayStart) / dayRange) * 100;
        let width = (duration / dayRange) * 100;
        
        if (left < 0) { width += left; left = 0; }
        if (left + width > 100) width = 100 - left;
        
        const catColor = {"movie":"var(--accent-movie)","tv":"var(--accent-tv)","classic_tv":"var(--accent-classic)","anime":"var(--accent-anime)","audiobook":"var(--accent-audiobook)"}[item.category] || "#95a5a6";
        
        return `<div class="gantt-block" style="left: ${left}%; width: max(6px, ${width}%); background: ${catColor};" title="${esc(item.displayName)} · ${esc(item.itemCount)} items" tabindex="0"></div>`;
      }).join("");
      return `<div class="gantt-lane"><div class="gantt-user">${esc(user)}</div><div class="gantt-track">${blocks}</div></div>`;
    }).join("");
    
    const formattedDay = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(dateStr + "T12:00:00"));
    
    return `
      <div class="day-gantt-card">
        <div class="day-gantt-header">${esc(formattedDay)}</div>
        <div class="gantt-grid-header">
          <span>12 AM</span><span>4 AM</span><span>8 AM</span><span>12 PM</span><span>4 PM</span><span>8 PM</span>
        </div>
        <div class="gantt-container">
          <div class="gantt-grid-lines">
            <div></div><div></div><div></div><div></div><div></div><div></div>
          </div>
          ${lanes}
        </div>
      </div>
    `;
  }).join("");
  
  content.innerHTML = `
    <section class="day-gantts-section">
      ${dayGanttsHtml}
      <div class="recent-list-fallback" style="margin-top: 2rem;">
        <div class="panel-title mb-2"><h3>Activity Feed</h3></div>
        ${(d.items || []).slice(0, 15).map(activityRow).join("")}
      </div>
      ${pager(d)}
    </section>
  `;
}

async function renderExplorer() {
  const cw = await fetchJson("/api/dashboard/continue-watching?" + query({limit: 20}));
  const d = await fetchJson("/api/dashboard/media?" + query({limit: 48, offset: state.offset, sort: "title"}));
  
  const cwHtml = cw.length > 0 
    ? '<section class="dashboard-panel mb-4"><div class="panel-title"><h3>Recently Enjoyed (In Progress)</h3></div><div class="poster-carousel">' + cw.map(x => '<article class="poster-card cw-poster" tabindex="0" data-item="'+encodeURIComponent(JSON.stringify(x))+'">'+art(x)+'<div class="cw-bar"><i style="width:'+esc(x.percentComplete||0)+'%"></i></div><strong>'+esc(x.displayTitle||x.title)+'</strong></article>').join("") + '</div></section>'
    : '';

  const cats = [
    { id: "", label: "All Media" },
    { id: "movie", label: "Movies" },
    { id: "tv", label: "TV Shows" },
    { id: "classic_tv", label: "Classic TV" },
    { id: "anime", label: "Anime" },
    { id: "audiobook", label: "Audiobooks" }
  ];
  const activeCat = state.filters.category || "";
  const catTabsHtml = `<div class="explorer-tabs">
    ${cats.map(c => `<button class="explorer-tab ${activeCat === c.id ? 'active' : ''}" data-category="${c.id}">${esc(c.label)}</button>`).join("")}
  </div>`;

  content.innerHTML = cwHtml + `
    <section class="dashboard-panel">
      <div class="panel-title"><h3>Household Library</h3><span>Categorized media explorer</span></div>
      ${catTabsHtml}
      <div class="poster-grid">
                ${(d.items.length ? d.items.map(x=>'<article class="poster-card" tabindex="0" data-item="'+encodeURIComponent(JSON.stringify(x))+'">'+art(x)+'<strong>'+mediaTitle(x)+'</strong><span>'+esc(x.categoryLabel)+' &middot; '+x.distinctItems+' '+(x.category==="movie"?"title":x.category==="audiobook"?"chapter":"episode")+(x.distinctItems===1?"":"s")+' &middot; '+x.plays+' play'+(x.plays===1?"":"s")+'</span></article>').join("") : empty("consumed titles"))}
      </div>
      ${pager(d)}
    </section>
  `;
}

async function renderPeople() {
  const [people, cowatch] = await Promise.all([
    fetchJson("/api/dashboard/people?" + query()),
    fetchJson("/api/dashboard/cowatch-patterns")
  ]);
  const rows = Array.isArray(people) ? people : people.people || [];

  const patternsHtml = cowatch.length > 0 
    ? cowatch.map(p => `
      <div class="pattern-card">
        <div class="pattern-header">
          <strong>${p.cats.join(' + ').toUpperCase()}</strong>
          <span class="badge badge-success">${p.percent}%</span>
        </div>
        <p>${p.durationHours} hours co-watched</p>
      </div>
    `).join('')
    : '<p class="text-muted">No co-watching patterns detected.</p>';

  content.innerHTML = `
    <section class="dashboard-grid">
      <div class="dashboard-panel panel-wide">
        <div class="panel-title"><h3>Household Members</h3></div>
        <div class="people-grid">
          ${rows.map(p=>'<article class="person-card"><div class="avatar">'+esc((p.display_name||p.plex_username).slice(0,1))+'</div><h4>'+esc(p.display_name||p.plex_username)+'</h4><p>'+p.plays+' plays &middot; '+p.minutes+' min</p><div>'+p.mix.map(m=>'<span class="proof">'+esc(m.category)+' '+m.count+'</span>').join("")+'</div>'+(p.recent.length?'<button class="text-button" data-person="'+esc(p.plex_username)+'">View activity</button>':'<p class="text-muted">No activity in this window.</p>')+'</article>').join("")}
        </div>
      </div>
      <aside>
        <div class="dashboard-panel">
          <h3>Co-Watch Patterns</h3>
          <p class="text-muted mb-2">Most frequent categories watched together</p>
          ${patternsHtml}
        </div>
      </aside>
    </section>
  `;
}

async function renderProgress() {
  const d = await fetchJson("/api/dashboard/progress?" + query());
  
  const recHtml = (d.recentlyCompleted || []).length > 0
    ? '<div class="recent-completed-list">' + d.recentlyCompleted.map(x => `
        <div class="rec-comp-row" tabindex="0" data-item="${encodeURIComponent(JSON.stringify(x))}">
          ${art(x)}
          <div><strong>${esc(x.displayTitle)}</strong><br><span>Completed by ${esc(x.displayName)}</span></div>
        </div>
      `).join('') + '</div>'
    : '<p class="text-muted">Nothing completed recently.</p>';

  content.innerHTML = `
    <section class="dashboard-grid">
      <div class="dashboard-panel panel-wide">
        <div class="panel-title"><h3>Progress</h3><span>Episode dot grids & hierarchy</span></div>
        <div class="collection-grid">
          ${(d.progress.length ? d.progress.map(x => {
            let dots = '';
            if (x.seasons) {
              let maxEp = 12;
              for (const s of Object.values(x.seasons)) {
                if (s.length > 0) maxEp = Math.max(maxEp, Math.max(...s));
              }
              dots = '<div class="ep-dots-container">';
              for (const [season, eps] of Object.entries(x.seasons)) {
                dots += `<div class="ep-dot-row"><span class="season-label">S${season}</span><div class="dots-wrapper">`;
                for (let i = 1; i <= maxEp; i++) {
                  dots += `<span class="ep-dot ${eps.includes(i) ? 'active' : ''}"></span>`;
                }
                dots += `</div></div>`;
              }
              dots += '</div>';
            }
            return `<article class="collection-card" data-cat="${esc(x.category)}"><span>${esc(x.displayName)} &middot; ${esc(x.category)}</span><h4>${esc(x.title)}</h4><div class="bar"><i style="width:${Math.min(100,x.averagePercent??0)}%"></i></div><p>${x.distinctItems} distinct &middot; ${x.plays} plays</p><small>Total available: ${x.totalKnown ? x.totalItems : 'unknown'}</small>${dots}</article>`;
          }).join("") : empty("progress"))}
        </div>
      </div>
      <aside>
        <div class="dashboard-panel">
          <h3>Recently Completed</h3>
          ${recHtml}
        </div>
      </aside>
    </section>
  `;
}

// ----------------------------------------------------
// Core Initialization
// ----------------------------------------------------
function pager(d){if(d.total<=d.limit)return "";return '<nav class="pager" aria-label="Pagination"><button data-page="prev" '+(d.offset===0?"disabled":"")+'>Previous</button><span>'+(d.offset+1)+'-'+Math.min(d.total,d.offset+d.limit)+' of '+d.total+'</span><button data-page="next" '+(d.offset+d.limit>=d.total?"disabled":"")+'>Next</button></nav>';}
function populateOptions(d){const user=form.elements.user,lib=form.elements.library;if(user && user.options.length===1)d.users.forEach(u=>user.add(new Option(u.display_name||u.plex_username,u.plex_username)));if(lib && lib.options.length===1)d.libraries.forEach(x=>lib.add(new Option(x,x)));}

async function render(){
  setButtons();
  content.innerHTML='<div class="panel-state">Loading '+esc(state.layout)+'...</div>';
  const targetHash="#"+state.layout+"?"+query();
  if(location.hash!==targetHash)history.pushState({layout:state.layout,filters:state.filters},"",targetHash);
  document.querySelector("#csv-export").href="/api/dashboard/export.csv?"+query();
  
  // Update page title/subtitle
  const titles = {
    overview: ["Overview", "Everything everyone is enjoying."],
    timeline: ["Timeline", "Gantt chart of household watch sessions."],
    explorer: ["Library", "Categorized media catalog and watch history."],
    people: ["People & Co-Watching", "Household members and co-watching patterns."],
    progress: ["Progress", "Series completion rates and playback evidence."]
  };
  const info = titles[state.layout] || ["Dashboard", ""];
  document.querySelector("#view-title").textContent = info[0];
  document.querySelector("#view-subtitle").textContent = info[1];

  try{
    await ({overview:renderOverview,timeline:renderTimeline,explorer:renderExplorer,people:renderPeople,progress:renderProgress}[state.layout])();
  }catch(e){
    content.innerHTML='<div class="panel-state error"><h3>This panel could not load</h3><p>'+esc(e.message)+'</p><button class="btn" data-retry>Try again</button></div>';
  }
  document.querySelector("#active-filters").textContent=Object.entries(state.filters).filter(([,v])=>v).map(([k,v])=>k+": "+v).join(" &middot; ")||"Showing all household activity";
}

document.querySelector("#layout-switcher").addEventListener("click",e=>{
  const b=e.target.closest("[data-layout]");
  if(!b)return;
  if(location.pathname !== "/") return;
  e.preventDefault();
  state.layout=b.dataset.layout;
  state.offset=0;
  save();
  render();
});

form.addEventListener("change",()=>{
  state.filters=Object.fromEntries(new FormData(form));
  state.offset=0;
  save();
  render();
  loadGlobals();
});

form.addEventListener("reset",()=>setTimeout(()=>{
  state.filters={};
  state.offset=0;
  save();
  render();
  loadGlobals();
},0));

content.addEventListener("click",async e=>{
  const item=e.target.closest("[data-item]");
  if(item)return openDetail(JSON.parse(decodeURIComponent(item.dataset.item)));
  const page=e.target.closest("[data-page]");
  if(page){
    state.offset=Math.max(0,state.offset+(page.dataset.page==="next"?50:-50));
    return render();
  }
  const person=e.target.closest("[data-person]");
  if(person){
    form.elements.user.value=person.dataset.person;
    state.filters.user=person.dataset.person;
    state.layout="timeline";
    save();
    return render();
  }
  const tab = e.target.closest(".explorer-tab");
  if(tab) {
    const category = tab.dataset.category;
    form.elements.category.value = category;
    state.filters.category = category;
    state.offset = 0;
    save();
    render();
    loadGlobals();
    return;
  }
  const action=e.target.closest("[data-action]");
  if(action&&confirm("Confirm this prompt action?")){
    const r=await fetch("/api/dashboard/prompts/"+action.dataset.id+"/"+action.dataset.action,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({confirm:true})});
    if(!r.ok)alert((await r.json()).message||"Action failed");
    render();
  }
  if(e.target.closest("[data-retry]"))render();
});

content.addEventListener("keydown",e=>{
  if((e.key==="Enter"||e.key===" ")&&e.target.matches("[data-item]")){
    e.preventDefault();
    openDetail(JSON.parse(decodeURIComponent(e.target.dataset.item)));
  }
});

dialog.querySelector(".dialog-close").addEventListener("click",()=>dialog.close());
dialog.addEventListener("click",e=>{if(e.target===dialog)dialog.close();});

window.addEventListener("popstate",e=>{
  const h=location.hash.slice(1).split("?")[0];
  if(layouts.has(h)){
    state.layout=h;
    state.filters=e.state?.filters||state.filters;
    for(const element of form.elements){
      if(element.name)element.value=state.filters[element.name]||"";
    }
    render();
  }
});

Object.entries(state.filters).forEach(([k,v])=>{if(form.elements[k])form.elements[k].value=v;});
const hash=location.hash.slice(1).split("?")[0];
if(layouts.has(hash))state.layout=hash;

loadGlobals();
render();
