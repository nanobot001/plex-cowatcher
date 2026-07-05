const layouts = new Set(["overview","timeline","explorer","people","progress"]);
const state = { layout: "overview", filters: {}, offset: 0, totals: null, users: null, libraries: null, explorer: { section: "", sort: "recent", offset: 0, selected: "" } };
const content = document.querySelector("#dashboard-content");
const form = document.querySelector("#dashboard-filters");
const dialog = document.querySelector("#detail-dialog");
let explorerRenderVersion=0;
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmtDate = value => value ? new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(new Date(value)) : "Unknown time";
const normalizeDurationSeconds = value => {
  const raw = Number(value ?? 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return raw > 100000 ? raw / 1000 : raw;
};
const fmtDuration = value => {
  if (value == null) return "Duration unknown";
  const minutes = Math.round(normalizeDurationSeconds(value) / 60);
  return minutes > 0 ? fmtHourValue(minutes) : "0m";
};
const safePrefs = () => { try { const v=JSON.parse(localStorage.getItem("cowatch.dashboard")||"{}"); return v&&typeof v==="object"?v:{}; } catch { return {}; } };
const prefs=safePrefs(); state.layout=layouts.has(prefs.layout)?prefs.layout:"overview"; state.filters=prefs.filters&&typeof prefs.filters==="object"?prefs.filters:{};
const save=()=>{try{localStorage.setItem("cowatch.dashboard",JSON.stringify({layout:state.layout,filters:state.filters}));}catch{}};
const query=(extra={})=>{const p=new URLSearchParams();Object.entries({...state.filters,...extra}).forEach(([k,v])=>{if(v!==""&&v!=null)p.set(k,String(v));});return p;};
const fetchJson=async url=>{const r=await fetch(url);const j=await r.json();if(!r.ok||!j.ok)throw new Error(j.message||"Panel could not load.");return j.data;};
const evidence=x=>{const e=x.evidence||{};return '<div class="evidence"><span class="proof observed">Observed</span>'+(e.confirmed?'<span class="proof confirmed">Confirmed</span>':'')+(e.promptStatus?'<span class="proof">Prompt '+esc(e.promptStatus)+'</span>':'')+(e.plexSyncStatus?'<span class="proof synced">Plex '+esc(e.plexSyncStatus)+'</span>':'')+'</div>';};
const art=x=>'<img class="poster" src="'+esc(x.artworkUrl)+'" alt="'+esc((x.displayTitle||x.title||x.showTitle||"Title")+" "+categoryLabel(x.category)+" artwork")+'" loading="lazy" onerror="this.src=\'/static/icon.svg\';this.classList.add(\'artwork-fallback\')">';
const mediaTitle=x=>esc(x.displayTitle||x.title||x.showTitle||"");
const mediaBadge=x=>x.displayName?'<span class="media-badge">'+esc(x.displayName)+'</span>':'';
const cardArt=x=>'<div class="poster-frame">'+art(x)+mediaBadge(x)+'</div>';
const libraryArt=x=>'<div class="poster-frame">'+art(x)+viewerBadge(x)+'</div>';
const watchedBy=x=>{
  const names=[...new Set(Array.isArray(x.displayNames)?x.displayNames.filter(Boolean):[])].sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:"base"}));
  if(!names.length)return "";
  const visible=names.slice(0,2);
  const remaining=names.length-visible.length;
  
  let labelPrefix = "Watched by";
  if (x.evidence && x.evidence.relationship === "together") {
    labelPrefix = "Together";
  } else if (x.evidence && x.evidence.relationship === "likely_together") {
    labelPrefix = "Likely together";
  }

  const full=`${labelPrefix} ${names.join(", ")}`;
  return `<span class="library-watched-by" data-testid="watched-by" aria-label="${esc(full)}" title="${esc(full)}"><span class="library-watched-label">${esc(labelPrefix)}</span> ${visible.map(esc).join(", ")}${remaining?` <span class="library-watched-more">+${remaining} more</span>`:""}</span>`;
};
const viewerBadge=x=>{
  const rawNames = Array.isArray(x.displayNames) && x.displayNames.length
    ? x.displayNames.filter(Boolean)
    : x.displayName
      ? String(x.displayName).split(" + ").map(name => name.trim()).filter(Boolean)
      : [];
  const names = [...new Set(rawNames)].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  if (!names.length) return "";
  
  let labelPrefix = "Watched by";
  if (x.evidence && x.evidence.relationship === "together") {
    labelPrefix = "Together";
  } else if (x.evidence && x.evidence.relationship === "likely_together") {
    labelPrefix = "Likely together";
  }

  const badgeAttrs = labelPrefix === "Watched by"
    ? `aria-hidden="true" title="${esc(`Watched by ${names.join(", ")}`)}"`
    : `aria-hidden="true" title="${esc(`${labelPrefix} ${names.join(", ")}`)}"`;
  if (names.length === 1) return `<span class="media-badge" data-testid="viewer-badge" ${badgeAttrs}>${esc(names[0])}</span>`;
  const visibleNames = names.slice(0, 2);
  const remaining = names.length - visibleNames.length;
  const badgeLabel = visibleNames.map((name, index) => {
    const spanClass = index === 0 ? "media-badge-name" : "media-badge-name media-badge-name-secondary";
    return `<span class="${spanClass}">${index > 0 ? '<span class="media-badge-sep">+</span> ' : ""}${esc(name)}</span>`;
  }).join("");
  const more = remaining > 0 ? `<span class="media-badge-more">+${remaining} more</span>` : "";
  
  const multiClass = x.evidence && (x.evidence.relationship === "together" || x.evidence.relationship === "likely_together")
    ? `media-badge--multi media-badge--${x.evidence.relationship.replace("_", "-")}`
    : "media-badge--multi";

  return `<span class="media-badge ${multiClass}" data-testid="viewer-badge" ${badgeAttrs}>${badgeLabel}${more}</span>`;
};
const groupRecentCards = items => {
  const groups = new Map();
  const result = [];
  for (const item of Array.isArray(items) ? items : []) {
    if (!item) continue;
    const eventId = item.evidence && item.evidence.cowatchEventId;
    if (eventId) {
      if (!groups.has(eventId)) {
        groups.set(eventId, []);
      }
      groups.get(eventId).push(item);
    } else {
      result.push({
        ...item,
        displayNames: Array.isArray(item.displayNames) && item.displayNames.length
          ? [...item.displayNames]
          : item.displayName
            ? [item.displayName]
            : []
      });
    }
  }
  for (const [eventId, groupItems] of groups.entries()) {
    groupItems.sort((a, b) => new Date(b.watchedAt) - new Date(a.watchedAt));
    const primary = groupItems[0];
    const displayNames = [...new Set(groupItems.flatMap(it => 
      Array.isArray(it.displayNames) && it.displayNames.length
        ? it.displayNames
        : it.displayName
          ? [it.displayName]
          : []
    ))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    
    const relationship = groupItems.some(it => it.evidence && it.evidence.relationship === "together") ? "together" : "likely_together";
    
    result.push({
      ...primary,
      displayNames,
      displayName: displayNames.join(" + "),
      evidence: {
        ...primary.evidence,
        relationship
      }
    });
  }
  return result.sort((a, b) => new Date(b.watchedAt) - new Date(a.watchedAt));
};
const activityRow=x=>'<article class="activity-row" tabindex="0" data-select-key="'+esc(x.groupKey || x.ratingKey)+'" data-item="'+encodeURIComponent(JSON.stringify(x))+'">'+art(x)+'<div class="activity-copy"><div class="activity-heading"><strong>'+mediaTitle(x)+'</strong><span>'+esc(x.categoryLabel)+'</span></div>'+(x.category==="audiobook"&&x.showTitle?'<p>By '+esc(x.showTitle)+'</p>':x.showTitle&&x.showTitle!==x.displayTitle?'<p>'+esc(x.title)+'</p>':'')+'<p>'+esc(x.displayName)+' &middot; '+fmtDate(x.watchedAt)+' &middot; '+fmtDuration(x.duration)+'</p>'+evidence(x)+'</div><div class="progress-ring">'+esc(x.percentComplete??"--")+'%</div></article>';
const empty=label=>'<div class="panel-state"><h3>No '+esc(label)+' here yet</h3><p>Try broadening the filters. Missing evidence stays unknown.</p></div>';
const encodeRoute=route=>encodeURIComponent(JSON.stringify(route));
const fmtHourValue=minutes=>{
  const totalMinutes = Math.max(0, Number(minutes || 0));
  if (totalMinutes === 0) return "0m";
  const hours = totalMinutes / 60;
  if (hours >= 10) return `${Math.round(hours).toLocaleString()}h`;
  if (hours >= 1) return `${hours.toFixed(1).replace(/\.0$/, "")}h`;
  return `${Math.round(totalMinutes)}m`;
};
const categoryLabel=category=>({movie:"Movies",tv:"TV",classic_tv:"Classic TV",anime:"Anime",audiobook:"Audiobooks"})[category]||String(category||"");
const explorerSections=[
  {id:"continue",label:"Continue Consuming"},
  {id:"tv",label:"TV"},
  {id:"classic_tv",label:"Classic TV"},
  {id:"movie",label:"Movies"},
  {id:"anime",label:"Anime"},
  {id:"audiobook",label:"Audiobooks"}
];
const explorerFilterKeys=["dateFrom","dateTo","user","category","library","completed","search"];
const routeQuery=()=>{
  const p=query();
  if(state.layout==="explorer"){
    if(state.explorer.section)p.set("section",state.explorer.section);
    if(state.explorer.sort!=="recent")p.set("sort",state.explorer.sort);
    if(state.explorer.offset)p.set("offset",String(state.explorer.offset));
  }
  if(state.explorer.selected)p.set("selected",state.explorer.selected);
  return p;
};
function restoreLocationState(){
  const raw=location.hash.slice(1);
  const [layoutName,rawQuery=""]=raw.split("?");
  if(layouts.has(layoutName))state.layout=layoutName;
  if(!raw.includes("?"))return;
  const params=new URLSearchParams(rawQuery);
  state.filters=Object.fromEntries(explorerFilterKeys.filter(key=>params.has(key)).map(key=>[key,params.get(key)]));
  const section=params.get("section")||state.filters.category||"";
  state.explorer.section=explorerSections.some(item=>item.id===section)?section:"";
  state.explorer.sort=["recent","title","progress","plays"].includes(params.get("sort"))?params.get("sort"):"recent";
  state.explorer.offset=Math.max(0,Number(params.get("offset"))||0);
  state.explorer.selected=params.get("selected")||"";
}
const toneClass=status=>({failed:"is-danger",error:"is-danger",missing:"is-warning",review:"is-neutral",pending:"is-info",prompted:"is-info"})[status]||"is-neutral";
const deltaText=value=>value==null?"":`${value>0?"+":value<0?"-":""}${fmtHourValue(Math.abs(value))}`;
const progressText=value=>value==null?"Progress unknown":`${value}% finished`;
const attentionHeading=item=>({
  unresolved_prompt:"Waiting on a co-watch answer",
  discord_delivery_failed:"Prompt delivery failed",
  plex_sync_failed:"Watch state sync failed",
  missing_metadata:"Title needs matching metadata",
  uncertain_classification:"Category needs review"
})[item?.kind]||"Needs review";
const attentionDetail=item=>{
  const who = item?.user ? String(item.user) : "Someone";
  const title = item?.title ? String(item.title) : "This title";
  switch (item?.kind) {
    case "unresolved_prompt":
      return `${who} still needs to answer whether ${title} was co-watched.`;
    case "discord_delivery_failed":
      return `The co-watch prompt for ${title} did not reach ${who}.`;
    case "plex_sync_failed":
      return `We could not sync watched state for ${title} to ${who}.`;
    case "missing_metadata":
      return `${title} is visible in playback history, but it is not matched in the catalog yet.`;
    case "uncertain_classification":
      return `${title} is showing up under a guessed category and should be checked.`;
    default:
      return item?.detail || "Needs review.";
  }
};
const attentionStatusLabel=item=>{
  if (item?.kind === "unresolved_prompt") return "Waiting";
  if (item?.kind === "discord_delivery_failed") return "Resend";
  if (item?.kind === "plex_sync_failed") return "Sync failed";
  if (item?.kind === "missing_metadata") return "Match title";
  if (item?.kind === "uncertain_classification") return "Review";
  return String(item?.status || "Open").replace(/_/g, " ");
};
const sidebarOverview = ()=>document.querySelector("#sidebar-overview-sections");
function setSidebarOverview(html=""){
  const node = sidebarOverview();
  if(!node)return;
  node.innerHTML = html;
  node.style.display = html ? "block" : "none";
}
function setButtons(){document.querySelectorAll("[data-layout]").forEach(b=>{b.classList.toggle("active",b.dataset.layout===state.layout);b.setAttribute("aria-pressed",String(b.dataset.layout===state.layout));});}

function syncFormToState(){
  for(const element of form.elements){
    if(element.name)element.value=state.filters[element.name]||"";
  }
}

function applyRoute(route){
  if(!route)return;
  state.filters=route.filters&&typeof route.filters==="object"?{...route.filters}:{};
  if(route.layout)state.layout=route.layout;
  state.offset=0;
  state.explorer.section=state.layout==="explorer"?(state.filters.category||""):"";
  state.explorer.offset=0;
  state.explorer.selected="";
  syncFormToState();
  save();
  loadGlobals();
  render();
}

function getRatingKeyFromSelected(selected) {
  if (!selected) return "";
  const parts = selected.split(":");
  return parts[parts.length - 1];
}

function selectCardInDOM(selectedKey) {
  document.querySelectorAll(".poster-card.selected, .cw-card.selected, .activity-row.selected").forEach(el => {
    el.classList.remove("selected");
    el.setAttribute("aria-pressed", "false");
  });
  if (selectedKey) {
    const card = document.querySelector(`[data-select-key="${selectedKey}"]`);
    if (card) {
      card.classList.add("selected");
      card.setAttribute("aria-pressed", "true");
    }
  }
}

async function openDetail(x) {
  state.explorer.selected = x.groupKey || x.ratingKey;
  save();
  selectCardInDOM(state.explorer.selected);
  const targetHash = "#" + state.layout + "?" + routeQuery();
  if (location.hash !== targetHash) {
    history.replaceState({}, "", targetHash);
  }
  await syncDetailFromURL();
}

let activeDetailFetchAbortController = null;

async function syncDetailFromURL() {
  if (activeDetailFetchAbortController) {
    activeDetailFetchAbortController.abort();
    activeDetailFetchAbortController = null;
  }

  if (!state.explorer.selected) {
    if (dialog.hasAttribute("open")) {
      dialog.close();
    }
    return;
  }

  const ratingKey = getRatingKeyFromSelected(state.explorer.selected);
  if (!ratingKey) {
    if (dialog.hasAttribute("open")) {
      dialog.close();
    }
    return;
  }

  // Open dialog as modal universally (handles overlay, dim backdrop, and focus trap natively)
  if (!dialog.hasAttribute("open")) {
    dialog.showModal();
  }

  // Optimistic rendering from active DOM card to eliminate loading lag
  const cardElement = document.querySelector(`[data-select-key="${state.explorer.selected}"]`);
  let optimisticItem = null;
  if (cardElement) {
    const rawData = cardElement.dataset.libraryItem || cardElement.dataset.item;
    if (rawData) {
      try {
        optimisticItem = JSON.parse(decodeURIComponent(rawData));
      } catch (e) {}
    }
  }

  if (optimisticItem) {
    renderDetailContent({
      item: optimisticItem,
      plays: [],
      people: [],
      repeatCount: 0,
      catalog: null,
      audiobook: null,
      hierarchy: null,
      isOptimistic: true
    });
  } else {
    document.querySelector("#detail-content").innerHTML = '<div class="panel-state">Loading rich detail.</div>';
  }

  activeDetailFetchAbortController = new AbortController();
  const signal = activeDetailFetchAbortController.signal;

  try {
    const d = await fetchJson("/api/dashboard/detail/" + encodeURIComponent(ratingKey), { signal });
    if (signal.aborted) return;
    if (d) {
      renderDetailContent(d);
    } else {
      document.querySelector("#detail-content").innerHTML = '<div class="panel-state error">Detail unavailable.</div>';
    }
  } catch (err) {
    if (signal.aborted) return;
    document.querySelector("#detail-content").innerHTML = '<div class="panel-state error">Could not load details.</div>';
  }
}

async function toggleEpisodeLazyPlays(event, episodeRatingKey) {
  event.stopPropagation();
  const container = document.getElementById("lazy-ep-" + episodeRatingKey);
  if (!container) return;

  if (container.style.display === "block") {
    container.style.display = "none";
    return;
  }

  container.style.display = "block";
  container.innerHTML = "Loading plays...";

  try {
    const d = await fetchJson("/api/dashboard/detail/" + encodeURIComponent(episodeRatingKey));
    if (!d || !d.plays || d.plays.length === 0) {
      container.innerHTML = "No session history recorded.";
      return;
    }
    
    const playsHtml = d.plays.map(p => {
      const label = p.evidence?.confirmed ? "Together" : p.evidence?.timingRelationship === "overlap" ? "Likely together" : "Watched by";
      const badgeClass = p.evidence?.confirmed ? "confirmed" : p.evidence?.timingRelationship === "overlap" ? "observed" : "synced";
      const dateStr = fmtDate(p.watchedAt);
      const userText = p.displayNames?.length ? p.displayNames.join(", ") : p.displayName;
      return `
        <div class="detail-lazy-play-item">
          <span class="proof ${badgeClass}">${esc(label)}</span>
          <strong class="play-user">${esc(userText)}</strong>
          <span class="play-date text-muted">${esc(dateStr)}</span>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="detail-lazy-plays">
        ${playsHtml}
      </div>
    `;
  } catch (err) {
    container.innerHTML = "Error loading play history.";
  }
}

window.toggleEpisodeLazyPlays = toggleEpisodeLazyPlays;

function renderDetailContent(d) {
  const x = d.item;
  const a = d.audiobook;
  const isEpisode = x.category === "tv" || x.category === "anime" || x.category === "classic_tv";
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

  let artHtml = '';
  if (x.category === "audiobook" && a) {
    artHtml = `<img class="poster" src="/api/artwork/${encodeURIComponent(x.ratingKey)}" alt="${esc(a.title)}" onerror="this.src='/api/artwork/${encodeURIComponent(x.parentRatingKey || x.ratingKey)}'">`;
  } else {
    artHtml = art(x);
  }

  let hierarchyHtml = '';
  let evidenceHtml = '';

  if (d.isOptimistic) {
    hierarchyHtml = `
      <div class="detail-hierarchy-section">
        <h3>Hierarchy</h3>
        <div class="panel-state compact">Loading hierarchy...</div>
      </div>
    `;
    evidenceHtml = `
      <div class="detail-evidence-section">
        <h3>Playback Sessions</h3>
        <div class="panel-state compact">Loading playback details...</div>
      </div>
    `;
  } else {
    if (d.hierarchy && d.hierarchy.type === "tv") {
      hierarchyHtml = `
        <div class="detail-hierarchy-section">
          <h3>Show Hierarchy</h3>
          <div class="detail-hierarchy-tree">
            ${d.hierarchy.seasons.map(s => `
              <div class="detail-tree-season" data-season-num="${s.seasonNumber}">
                <div class="detail-tree-season-header" onclick="this.parentElement.classList.toggle('expanded')">
                  <span>${esc(s.seasonName)}</span>
                  <span class="chevron">▼</span>
                </div>
                <div class="detail-tree-season-episodes">
                  ${s.episodes.map(ep => {
                    const stateBadges = Object.entries(ep.watchedStates).map(([person, state]) => `
                      <span class="state-badge ${esc(state)}" title="${esc(person)}: ${esc(state)}">${esc(person)}</span>
                    `).join('');
                    return `
                      <div class="detail-tree-episode-row" data-episode-key="${esc(ep.ratingKey)}" onclick="toggleEpisodeLazyPlays(event, '${esc(ep.ratingKey)}')">
                        <div class="detail-tree-episode-meta">
                          <strong>Ep ${ep.episodeNumber != null ? ep.episodeNumber : '?'}: ${esc(ep.title)}</strong>
                          <div class="state-badge-group">${stateBadges}</div>
                        </div>
                        <div class="detail-tree-episode-lazy" id="lazy-ep-${esc(ep.ratingKey)}" style="display:none;"></div>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else if (d.hierarchy && d.hierarchy.type === "audiobook") {
      const parentInfo = [d.hierarchy.parentSeries, d.hierarchy.subseries, d.hierarchy.series].filter(Boolean).map(esc).join(" &middot; ");
      hierarchyHtml = `
        <div class="detail-hierarchy-section">
          <h3>Book Hierarchy</h3>
          ${parentInfo ? `<p class="detail-episode-meta">${parentInfo}</p>` : ''}
          <div class="detail-hierarchy-tree">
            ${d.hierarchy.chapters.map(ch => {
              const stateBadges = Object.entries(ch.watchedStates).map(([person, state]) => `
                <span class="state-badge ${esc(state)}" title="${esc(person)}: ${esc(state)}">${esc(person)}</span>
              `).join('');
              return `
                <div class="detail-tree-episode-row" data-episode-key="${esc(ch.ratingKey)}" onclick="toggleEpisodeLazyPlays(event, '${esc(ch.ratingKey)}')">
                  <div class="detail-tree-episode-meta">
                    <strong>${esc(ch.title)}</strong>
                    <div class="state-badge-group">${stateBadges}</div>
                  </div>
                  <div class="detail-tree-episode-lazy" id="lazy-ep-${esc(ch.ratingKey)}" style="display:none;"></div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    if (d.plays && d.plays.length > 0) {
      evidenceHtml = `
        <div class="detail-evidence-section">
          <h3>Playback Sessions</h3>
          <div class="detail-lazy-plays">
            ${d.plays.map(p => {
              const label = p.evidence?.confirmed ? "Together" : p.evidence?.timingRelationship === "overlap" ? "Likely together" : "Watched by";
              const badgeClass = p.evidence?.confirmed ? "confirmed" : p.evidence?.timingRelationship === "overlap" ? "observed" : "synced";
              const dateStr = fmtDate(p.watchedAt);
              const userText = p.displayNames?.length ? p.displayNames.join(", ") : p.displayName;
              return `
                <div class="detail-lazy-play-item">
                  <span class="proof ${badgeClass}">${esc(label)}</span>
                  <strong class="play-user">${esc(userText)}</strong>
                  <span class="play-date text-muted">${esc(dateStr)}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }
  }

  const durationText = fmtDuration(d.catalog?.duration || x.duration);
  const peopleList = d.isOptimistic
    ? (x.displayNames?.length ? x.displayNames : [x.displayName]).filter(Boolean).map(n => ({ displayName: n }))
    : d.people || [];
  const playsCount = d.isOptimistic ? "..." : d.plays.length;
  const repeatCount = d.isOptimistic ? "..." : d.repeatCount;

  const detailHtml = `
    <div class="detail-layout">
      <div class="detail-poster-column">
        <div class="detail-poster-wrapper">
          ${artHtml}
        </div>
        ${hierarchyHtml}
      </div>
      <div class="detail-scroll-container">
        <div class="detail-info-wrapper">
          <div>${headerHtml}</div>
          <dl class="detail-metadata">
            <dt>People</dt>
            <dd data-testid="detail-people">${peopleList.map(p=>esc(p.displayName)).join(", ")}</dd>
            <dt>Plays</dt>
            <dd>${playsCount} (${repeatCount} repeats)</dd>
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
        </div>
        ${evidenceHtml}
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
  const [overview, health, audit] = await Promise.allSettled([
    fetchJson("/api/dashboard/overview?" + query()),
    fetch("/api/health").then(r => r.json()),
    fetchJson("/api/audit?days=7")
  ]);

  if (overview.status === "rejected") throw overview.reason;
  const d = overview.value;
  const auditList = audit.status === "fulfilled" ? (Array.isArray(audit.value) ? audit.value : audit.value?.audit || audit.value?.data || []) : [];

  const healthData = health.status === "fulfilled" ? health.value : null;
  const readiness = healthData?.readiness || {};
  const readinessEntries = Object.entries(readiness);
  const healthSummary = healthData
    ? `${readinessEntries.filter(([, v]) => v.status === "healthy").length}/${readinessEntries.length || 0} healthy`
    : "Health unavailable";
  const currentWindow = d.windows?.overview || "Visible activity window";

  const summaryHtml = (d.summaryStrip || []).map(item => `
    <button class="overview-summary-card" data-route="${encodeRoute({layout:"explorer",filters:{...state.filters,category:item.category}})}">
      <span class="overview-summary-label">${esc(item.label)}</span>
      <strong>${esc(fmtHourValue(item.minutes))}</strong>
      <span class="overview-summary-meta">${esc(item.plays)} plays</span>
      ${item.deltaMinutes == null ? `<span class="overview-summary-delta muted">No prior comparable window</span>` : `<span class="overview-summary-delta ${item.deltaMinutes === 0 ? "muted" : item.deltaMinutes > 0 ? "up" : "down"}">${esc(deltaText(item.deltaMinutes))} vs prior window</span>`}
    </button>
  `).join("");

  const recentSyncHtml = auditList.length > 0
    ? `<div class="feed-list">${auditList.slice(0, 5).map(entry => {
        const action = String(entry.action || "event").replace(/_/g, " ");
        const status = String(entry.status || "ok");
        const actor = String(entry.actor || "system");
        const payload = entry.error ? ` · ${esc(entry.error)}` : "";
        return `<article class="feed-row"><div><strong>${esc(action)}</strong><p>${esc(actor)} · ${fmtDate(entry.created_at)}${payload}</p></div><span class="audit-pill status-${esc(status)}">${esc(status)}</span></article>`;
      }).join("")}</div>`
    : '<div class="panel-state"><p>No recent sync activity yet.</p></div>';

  const watchHealthHtml = healthData
    ? `<div class="health-mini-grid">${readinessEntries.map(([k, v]) => `<article class="health-mini-card status-${esc(v.status)}"><strong>${esc(k)}</strong><p>${esc(v.message)}</p></article>`).join("")}</div>`
    : '<div class="panel-state"><p>Watch health is unavailable.</p></div>';

  const recentPlaybackItems = groupRecentCards(Array.isArray(d.recentPlayback) ? d.recentPlayback : Array.isArray(d.activity?.items) ? d.activity.items.slice(0, 24) : []);
  const cwHtml = recentPlaybackItems.length
    ? `<div class="cw-carousel cw-carousel-overview">${recentPlaybackItems.map(cw => `
        <article class="cw-card" data-testid="recent-playback-card" tabindex="0" data-select-key="${esc(cw.groupKey || cw.ratingKey)}" data-item="${encodeURIComponent(JSON.stringify(cw))}">
          ${libraryArt(cw)}
          <div class="cw-bar"><i style="width:${esc(cw.percentComplete ?? 0)}%"></i></div>
          <p>${esc(cw.displayTitle || cw.title || '')}</p>
          ${watchedBy(cw)}
          <span class="cw-meta">${fmtDate(cw.watchedAt)}</span>
        </article>
      `).join("")}</div>`
    : '<div class="panel-state compact"><p>No recent playback to show right now.</p></div>';
  const completedItems = groupRecentCards(d.recentlyCompleted || []);
  const completedHtml = completedItems.length
    ? `<div class="overview-completed-list">${completedItems.map(item => `
        <button class="overview-completed-row" data-item="${encodeURIComponent(JSON.stringify(item))}">
          ${art(item)}
          <div>
            <strong>${esc(item.displayTitle || item.title)}</strong>
            ${watchedBy(item)}
            <p>${fmtDate(item.watchedAt)}</p>
          </div>
        </button>
      `).join("")}</div>`
    : '<div class="panel-state compact"><p>No completed titles landed in this visible window.</p></div>';
  const mixHtml = (d.categoryMix || []).length
    ? `<div class="overview-mix-grid">${d.categoryMix.map(item => `
        <button class="overview-mix-card" data-route="${encodeRoute({layout:"explorer",filters:{...state.filters,category:item.category}})}" data-cat="${esc(item.category)}">
          <span>${esc(categoryLabel(item.category))}</span>
          <strong>${esc(fmtHourValue(item.durationMinutes))}</strong>
          <small>${esc(item.plays)} plays · ${esc(item.completionRate)}% complete</small>
        </button>
      `).join("")}</div>`
    : '<div class="panel-state compact"><p>Category mix will appear once visible household activity exists.</p></div>';
  const activityHtml = (d.householdActivity || []).length
    ? `<div class="overview-people-list">${d.householdActivity.map(person => `
        <button class="overview-person-row" data-route="${encodeRoute({layout:"timeline",filters:{...state.filters,user:person.plexUsername}})}">
          <div class="overview-person-avatar">${esc((person.displayName || '?').slice(0,1).toUpperCase())}</div>
          <div class="overview-person-copy">
            <strong>${esc(person.displayName)}</strong>
            <p>${esc(fmtHourValue(person.minutes))} · ${esc(person.completed)} completed · ${esc(person.inProgress)} in progress</p>
            <p class="muted">Latest: ${esc(person.latestItemTitle)} · ${fmtDate(person.latestWatchedAt)}</p>
          </div>
          <span class="overview-person-tag">${esc(categoryLabel(person.topCategory || 'movie'))}</span>
        </button>
      `).join("")}</div>`
    : '<div class="panel-state compact"><p>No visible household activity in this window.</p></div>';
  const attentionHtml = (d.needsAttention || []).length
    ? `<div class="overview-attention-list">${d.needsAttention.map(item => `
        <button class="overview-attention-row ${toneClass(item.status)}" data-route="${encodeRoute(item.route)}">
          <div class="overview-attention-copy">
            <strong>${esc(attentionHeading(item))}</strong>
            <p>${esc(attentionDetail(item))}</p>
          </div>
          <span class="overview-attention-status">${esc(attentionStatusLabel(item))}</span>
        </button>
      `).join("")}</div>`
    : '<div class="panel-state compact"><p>Nothing needs fixing right now.</p></div>';

  setSidebarOverview(`
    <div class="sidebar-section sidebar-overview-stack">
      <div class="dashboard-panel overview-ops-panel">
        <div class="panel-title"><h3>Operations</h3><span>${esc(healthSummary)}</span></div>
        <div class="overview-ops-grid">
          <article class="glance-card"><strong>${esc(fmtHourValue(d.totals.minutes || 0))}</strong><span>Visible time</span></article>
          <article class="glance-card"><strong>${esc(d.totals.people)}</strong><span>Active people</span></article>
          <article class="glance-card"><strong>${esc(d.needsAttention?.length || 0)}</strong><span>Open issues</span></article>
          <article class="glance-card"><strong>${esc(d.totals.pendingPrompts)}</strong><span>Pending prompts</span></article>
        </div>
      </div>
      <details class="dashboard-collapsible" open>
        <summary>
          <div class="collapsible-copy">
            <h3>Readiness Details</h3>
            <span>${esc(healthSummary)}</span>
          </div>
          <span class="collapsible-meta">${esc(Object.values(readiness).filter(v => v.status === 'healthy').length)} healthy</span>
        </summary>
        <div class="dashboard-collapsible-body">
          ${watchHealthHtml}
        </div>
      </details>
      <details class="dashboard-collapsible">
        <summary>
          <div class="collapsible-copy">
            <h3>Recent Sync Activity</h3>
            <span>Latest audit trail entries</span>
          </div>
          <span class="collapsible-meta">${esc(auditList.length)} events</span>
        </summary>
        <div class="dashboard-collapsible-body">
          ${recentSyncHtml}
        </div>
      </details>
    </div>
  `);

  content.innerHTML = `
    <section class="overview-main-stack">
      <section class="dashboard-panel">
        <div class="panel-title"><h3>Recent Playback</h3><span>${esc(d.windows?.overview || 'Latest household watch history')}</span></div>
        ${cwHtml}
      </section>

      <section class="dashboard-panel overview-summary-panel">
        <div class="panel-title"><h3>Household Overview</h3><span>${esc(currentWindow)}</span></div>
        <div class="overview-summary-grid">
          <article class="overview-lead-card">
            <span class="overview-lead-label">Consumed time</span>
            <strong>${esc(fmtHourValue(d.totals.minutes || 0))}</strong>
            <p>${esc(d.totals.plays)} plays across ${esc(d.totals.people)} visible people</p>
          </article>
          ${summaryHtml}
        </div>
      </section>

      <section class="overview-grid-two">
        <div class="dashboard-panel">
          <div class="panel-title"><h3>Recently Completed</h3><span>${esc(d.windows?.recentlyCompleted || currentWindow)}</span></div>
          ${completedHtml}
        </div>
        <div class="dashboard-panel">
          <div class="panel-title"><h3>Needs Fixing</h3><span>${esc(d.windows?.needsAttention || 'Things blocking clean watch history')}</span></div>
          ${attentionHtml}
        </div>
      </section>

      <section class="overview-grid-two">
        <div class="dashboard-panel">
          <div class="panel-title"><h3>Category Mix</h3><span>${esc(d.windows?.categoryMix || currentWindow)}</span></div>
          ${mixHtml}
        </div>
        <div class="dashboard-panel">
          <div class="panel-title"><h3>Household Activity</h3><span>${esc(d.windows?.householdActivity || currentWindow)}</span></div>
          ${activityHtml}
        </div>
      </section>
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
        
        return `<div class="gantt-block" style="left: ${left}%; width: max(6px, ${width}%); background: ${catColor};" title="${esc(item.displayName)} Â· ${esc(item.itemCount)} items" tabindex="0"></div>`;
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
  const renderVersion=++explorerRenderVersion;
  const section=state.explorer.section||state.filters.category||"";
  const sectionLimit=6;
  const pageLimit=24;
  const endpoint=(id,options={})=>id==="continue"
    ? "/api/dashboard/continue-consuming?"+query(options)
    : "/api/dashboard/media?"+query({...options,category:id});
  const secondary=x=>{
    const count=Number(x.distinctItems||0);
    if(x.category==="movie")return `${x.plays} play${x.plays===1?"":"s"}`;
    if(x.category==="audiobook")return `${count} chapter${count===1?"":"s"} · ${x.plays} play${x.plays===1?"":"s"}`;
    return `${count} episode${count===1?"":"s"} · ${x.plays} play${x.plays===1?"":"s"}`;
  };
  const card=x=>`<article class="poster-card library-card ${state.explorer.selected===x.groupKey?"selected":""}" data-testid="library-card" tabindex="0" role="button" aria-pressed="${state.explorer.selected===x.groupKey}" data-library-item="${encodeURIComponent(JSON.stringify(x))}" data-select-key="${esc(x.groupKey)}">${libraryArt(x)}${x.percentComplete!=null&&!x.completed?`<div class="cw-bar"><i style="width:${esc(x.percentComplete)}%"></i></div>`:""}<strong>${mediaTitle(x)}</strong><span>${esc(secondary(x))}</span>${watchedBy(x)}</article>`;
  if(section){
    const d=await fetchJson(endpoint(section,{limit:pageLimit,offset:state.explorer.offset,sort:state.explorer.sort}));
    if(renderVersion!==explorerRenderVersion)return;
    const label=explorerSections.find(item=>item.id===section)?.label||categoryLabel(section);
    content.innerHTML=`<div class="library-workspace"><main>
      <section class="dashboard-panel library-all-panel">
        <div class="library-toolbar"><div><button class="text-button" data-library-home>All sections</button><h3>${esc(label)}</h3><p>${d.total} consumed title${d.total===1?"":"s"}</p></div>
          <label>Sort<select data-library-sort><option value="recent">Recently consumed</option><option value="title">Title</option><option value="progress">Progress</option><option value="plays">Play count</option></select></label>
        </div>
        <div class="poster-grid">${d.items.length?d.items.map(card).join(""):empty("consumed titles")}</div>
        ${libraryPager(d)}
      </section>
    </main></div>`;
    const sortSelect=content.querySelector("[data-library-sort]");
    if(sortSelect)sortSelect.value=state.explorer.sort;
    return;
  }

  const results=await Promise.all(explorerSections.map(item=>fetchJson(endpoint(item.id,{limit:sectionLimit,offset:0,sort:"recent"}))));
  if(renderVersion!==explorerRenderVersion)return;
  const sectionsHtml=explorerSections.map((item,index)=>{
    const d=results[index];
    return `<section class="dashboard-panel library-section" data-section="${item.id}">
      <div class="panel-title"><div><h3>${esc(item.label)}</h3><span>${d.total} title${d.total===1?"":"s"}</span></div><button class="text-button" data-view-section="${item.id}">View all</button></div>
      <div class="poster-grid library-preview-grid">${d.items.length?d.items.map(card).join(""):empty(item.label.toLowerCase())}</div>
    </section>`;
  }).join("");
  content.innerHTML=`<div class="library-workspace"><main class="library-sections">${sectionsHtml}</main></div>`;
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
function libraryPager(d){if(d.total<=d.limit)return "";return '<nav class="pager" aria-label="Library pagination"><button data-library-page="prev" '+(d.offset===0?"disabled":"")+'>Previous</button><span>'+(d.offset+1)+'-'+Math.min(d.total,d.offset+d.limit)+' of '+d.total+'</span><button data-library-page="next" '+(d.offset+d.limit>=d.total?"disabled":"")+'>Next</button></nav>';}
function populateOptions(d){const user=form.elements.user,lib=form.elements.library;if(user && user.options.length===1)d.users.forEach(u=>user.add(new Option(u.display_name||u.plex_username,u.plex_username)));if(lib && lib.options.length===1)d.libraries.forEach(x=>lib.add(new Option(x,x)));}

async function render(){
  setButtons();
  setSidebarOverview("");
  content.innerHTML='<div class="panel-state">Loading '+esc(state.layout)+'...</div>';
  const targetHash="#"+state.layout+"?"+routeQuery();
  if(location.hash!==targetHash)history.pushState({},"",targetHash);
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
    await syncDetailFromURL();
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
  const previousCategory=state.filters.category||"";
  state.filters=Object.fromEntries(new FormData(form));
  state.offset=0;
  if((state.filters.category||"")!==previousCategory)state.explorer.section=state.filters.category||"";
  state.explorer.offset=0;
  state.explorer.selected="";
  save();
  render();
  loadGlobals();
});

form.addEventListener("reset",()=>setTimeout(()=>{
  state.filters={};
  state.offset=0;
  state.explorer={section:"",sort:"recent",offset:0,selected:""};
  save();
  render();
  loadGlobals();
},0));

content.addEventListener("click",async e=>{
  const libraryItem=e.target.closest("[data-library-item]");
  if(libraryItem){
    const item=JSON.parse(decodeURIComponent(libraryItem.dataset.libraryItem));
    state.explorer.selected=item.groupKey;
    return render();
  }
  const item=e.target.closest("[data-item]");
  if(item)return openDetail(JSON.parse(decodeURIComponent(item.dataset.item)));
  const routeButton=e.target.closest("[data-route]");
  if(routeButton){
    applyRoute(JSON.parse(decodeURIComponent(routeButton.dataset.route)));
    return;
  }
  const page=e.target.closest("[data-page]");
  if(page){
    state.offset=Math.max(0,state.offset+(page.dataset.page==="next"?50:-50));
    return render();
  }
  const libraryPage=e.target.closest("[data-library-page]");
  if(libraryPage){
    state.explorer.offset=Math.max(0,state.explorer.offset+(libraryPage.dataset.libraryPage==="next"?24:-24));
    state.explorer.selected="";
    return render();
  }
  const viewSection=e.target.closest("[data-view-section]");
  if(viewSection){
    state.explorer.section=viewSection.dataset.viewSection;
    state.explorer.offset=0;
    state.explorer.sort="recent";
    state.explorer.selected="";
    return render();
  }
  if(e.target.closest("[data-library-home]")){
    state.explorer.section="";
    state.explorer.offset=0;
    state.explorer.selected="";
    if(state.filters.category){
      delete state.filters.category;
      if(form.elements.category)form.elements.category.value="";
      save();
    }
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
  if((e.key==="Enter"||e.key===" ")&&e.target.matches("[data-library-item]")){
    e.preventDefault();
    const item=JSON.parse(decodeURIComponent(e.target.dataset.libraryItem));
    state.explorer.selected=item.groupKey;
    render();
    return;
  }
  if((e.key==="Enter"||e.key===" ")&&e.target.matches("[data-item]")){
    e.preventDefault();
    openDetail(JSON.parse(decodeURIComponent(e.target.dataset.item)));
  }
});

content.addEventListener("change",e=>{
  if(e.target.matches("[data-library-sort]")){
    state.explorer.sort=e.target.value;
    state.explorer.offset=0;
    state.explorer.selected="";
    render();
  }
});

dialog.querySelector(".dialog-close").addEventListener("click",()=>dialog.close());
dialog.addEventListener("click",e=>{if(e.target===dialog)dialog.close();});
dialog.addEventListener("close",()=>{
  if(state.explorer.selected){
    const closedKey = state.explorer.selected;
    state.explorer.selected="";
    save();
    selectCardInDOM("");
    const targetHash = "#" + state.layout + "?" + routeQuery();
    if (location.hash !== targetHash) {
      history.replaceState({}, "", targetHash);
    }
    if (closedKey) {
      const card = document.querySelector(`[data-select-key="${closedKey}"]`);
      if (card) {
        card.focus();
      }
    }
  }
});

window.addEventListener("popstate",()=>{
  restoreLocationState();
  syncFormToState();
  render();
});

restoreLocationState();
syncFormToState();

loadGlobals();
render();

