const layouts = new Set(["overview","timeline","explorer","people","progress"]);
const state = { layout: "overview", filters: {}, offset: 0, totals: null, users: null, libraries: null, explorer: { section: "", sort: "recent", offset: 0, selected: "" }, timeline: { date: "", offset: 0 }, people: { period: "30d", dateFrom: "", dateTo: "", orderMode: "default", activeOrder: [], secondaryOrder: [] }, progress: { recentlyActiveOffset: 0, continueOffset: 0, recentlyCompletedOffset: 0, expandedProgress: "" } };
const content = document.querySelector("#dashboard-content");
const form = document.querySelector("#dashboard-filters");
const dialog = document.querySelector("#detail-dialog");
let explorerRenderVersion=0;
let peopleRenderVersion=0;
const progressExpansionCache = new Map();
const peopleDragState = { pointerId: null, personId: "", group: "", sourceCard: null, dragGhost: null, placeholder: null, targetCard: null, placeBefore: true, startX: 0, startY: 0, lastX: 0, lastY: 0, offsetX: 0, offsetY: 0, dragging: false, ignoreClickUntil: 0 };
const peopleHeatmapState = { activeByPerson: new Map(), activeDefault: [], secondaryDefault: [], activeVisible: [], secondaryVisible: [], hoveredCell: null, popover: null, announcer: null, pendingAnnouncement: "" };
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
const prefs=safePrefs(); state.layout=layouts.has(prefs.layout)?prefs.layout:"overview"; state.filters=prefs.filters&&typeof prefs.filters==="object"?prefs.filters:{}; state.people=prefs.people&&typeof prefs.people==="object"?{...state.people,...prefs.people}:state.people;
const save=()=>{try{localStorage.setItem("cowatch.dashboard",JSON.stringify({layout:state.layout,filters:state.filters,people:state.people}));}catch{}};
const query=(extra={})=>{const p=new URLSearchParams();Object.entries({...state.filters,...extra}).forEach(([k,v])=>{if(v!==""&&v!=null)p.set(k,String(v));});return p;};
const peopleQuery=(extra={})=>{const p=query(extra);p.delete("dateFrom");p.delete("dateTo");p.set("period",state.people.period||"30d");if(state.people.period==="custom"){if(state.people.dateFrom)p.set("dateFrom",state.people.dateFrom);if(state.people.dateTo)p.set("dateTo",state.people.dateTo);}return p;};
const fetchJson=async url=>{const r=await fetch(url,{cache:"no-store"});const j=await r.json();if(!r.ok||!j.ok)throw new Error(j.message||"Panel could not load.");return j.data;};
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
  if(state.layout==="people"){
    p.delete("dateFrom");
    p.delete("dateTo");
    if(state.people.period&&state.people.period!=="30d")p.set("period",state.people.period);
    if(state.people.period==="custom"){
      if(state.people.dateFrom)p.set("dateFrom",state.people.dateFrom);
      if(state.people.dateTo)p.set("dateTo",state.people.dateTo);
    }
  }
  if(state.layout==="explorer"){
    if(state.explorer.section)p.set("section",state.explorer.section);
    if(state.explorer.sort!=="recent")p.set("sort",state.explorer.sort);
    if(state.explorer.offset)p.set("offset",String(state.explorer.offset));
  }
  if(state.layout==="timeline"){
    if(state.timeline.date)p.set("timelineDate",state.timeline.date);
    if(state.timeline.offset)p.set("timelineOffset",String(state.timeline.offset));
  }
  if(state.layout==="progress"){
    if(state.progress.recentlyActiveOffset)p.set("recentlyActiveOffset",String(state.progress.recentlyActiveOffset));
    if(state.progress.continueOffset)p.set("continueOffset",String(state.progress.continueOffset));
    if(state.progress.recentlyCompletedOffset)p.set("recentlyCompletedOffset",String(state.progress.recentlyCompletedOffset));
    if(state.progress.expandedProgress)p.set("expandedProgress",state.progress.expandedProgress);
  }
  if(state.explorer.selected)p.set("selected",state.explorer.selected);
  return p;
};
const personOrderKey = group => group === "secondary" ? "secondaryOrder" : "activeOrder";
const personOrderLabel = group => group === "secondary" ? "Other" : "Active";
const personId = person => String(person?.id ?? "");
function reconcilePeopleOrder(savedOrder, people) {
  const visible = Array.isArray(people) ? people : [];
  const ids = new Set(visible.map(personId));
  const orderedIds = [];
  for (const rawId of Array.isArray(savedOrder) ? savedOrder : []) {
    const id = String(rawId);
    if (ids.has(id) && !orderedIds.includes(id)) orderedIds.push(id);
  }
  for (const person of visible) {
    const id = personId(person);
    if (id && !orderedIds.includes(id)) orderedIds.push(id);
  }
  return orderedIds;
}
function sortPeopleGroup(people, group) {
  const key = personOrderKey(group);
  const byId = new Map((Array.isArray(people) ? people : []).map(person => [personId(person), person]));
  return reconcilePeopleOrder(state.people[key], people).map(id => byId.get(id)).filter(Boolean);
}
function peopleGroupDefaults(group) {
  return group === "secondary" ? peopleHeatmapState.secondaryDefault : peopleHeatmapState.activeDefault;
}
function setPeopleVisibleGroup(group, people) {
  if (group === "secondary") peopleHeatmapState.secondaryVisible = people;
  else peopleHeatmapState.activeVisible = people;
}
function clearPeopleDragGhost() {
  if (peopleDragState.dragGhost?.parentNode) {
    peopleDragState.dragGhost.parentNode.removeChild(peopleDragState.dragGhost);
  }
  peopleDragState.dragGhost = null;
}
function restorePeopleDragSource() {
  if (peopleDragState.sourceCard) {
    peopleDragState.sourceCard.style.removeProperty("display");
  }
}
function reorderPeopleGrid(group, people) {
  const grid = content.querySelector(`[data-people-group="${group}"]`);
  if (!grid) return;
  const cards = new Map([...grid.querySelectorAll(":scope > [data-person-card]")].map(card => [card.dataset.personId, card]));
  for (const person of people) {
    const card = cards.get(personId(person));
    if (card) grid.appendChild(card);
  }
  setPeopleVisibleGroup(group, people);
}
function applyPeopleOrderPresentation() {
  const custom = state.people.orderMode === "custom";
  const activePeople = custom ? sortPeopleGroup(peopleHeatmapState.activeDefault, "active") : [...peopleHeatmapState.activeDefault];
  const secondaryPeople = custom ? sortPeopleGroup(peopleHeatmapState.secondaryDefault, "secondary") : [...peopleHeatmapState.secondaryDefault];
  reorderPeopleGrid("active", activePeople);
  reorderPeopleGrid("secondary", secondaryPeople);
  content.querySelectorAll("[data-person-order-controls]").forEach(controls => { controls.hidden = !custom; });
  content.querySelectorAll("[data-people-order-mode]").forEach(button => {
    button.setAttribute("aria-pressed", String(button.dataset.peopleOrderMode === state.people.orderMode));
  });
  const ordering = content.querySelector("[data-testid='people-order-controls']");
  if (ordering) ordering.classList.toggle("is-custom", custom);
  const copy = content.querySelector("[data-people-order-copy]");
  if (copy) copy.textContent = custom ? "Drag cards into place. Arrow controls are available for keyboard ordering." : "Using the default household order.";
}
function resetPeopleOrder() {
  state.people = {
    ...state.people,
    orderMode: "default",
    activeOrder: [],
    secondaryOrder: []
  };
  save();
  applyPeopleOrderPresentation();
  announcePeopleOrder("People card positions reset to the server order.");
}
function announcePeopleOrder(message) {
  const announcer = peopleHeatmapState.announcer || document.querySelector("[data-testid='people-order-live']");
  if (!announcer) return;
  peopleHeatmapState.pendingAnnouncement = message;
  announcer.textContent = "";
  requestAnimationFrame(() => {
    if (peopleHeatmapState.pendingAnnouncement) {
      announcer.textContent = peopleHeatmapState.pendingAnnouncement;
    }
  });
}
function getPeopleHeatmapPopover() {
  if (peopleHeatmapState.popover && document.contains(peopleHeatmapState.popover)) return peopleHeatmapState.popover;
  peopleHeatmapState.popover = document.querySelector("[data-testid='people-heatmap-popover']");
  return peopleHeatmapState.popover;
}
function clampPopoverPosition(rect, popover) {
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = document.documentElement.clientHeight;
  const margin = 12;
  const width = popover.offsetWidth || 280;
  const height = popover.offsetHeight || 180;
  const preferredLeft = rect.right + 12;
  const fallbackLeft = rect.left - width - 12;
  const left = Math.max(margin, Math.min(viewportWidth - width - margin, preferredLeft + width <= viewportWidth - margin ? preferredLeft : fallbackLeft));
  const belowTop = rect.bottom + 12;
  const aboveTop = rect.top - height - 12;
  const top = Math.max(margin, Math.min(viewportHeight - height - margin, belowTop + height <= viewportHeight - margin ? belowTop : aboveTop));
  return { left: Math.max(margin, left), top: Math.max(margin, top) };
}
function getHeatmapCellData(cell) {
  if (!cell) return null;
  return {
    personId: cell.dataset.personId || "",
    personName: cell.dataset.personName || "",
    date: cell.dataset.heatmapDate || "",
    minutes: Number(cell.dataset.minutes || 0),
    observedMinutes: Number(cell.dataset.observedMinutes || 0),
    attributedMinutes: Number(cell.dataset.attributedMinutes || 0),
    plays: Number(cell.dataset.plays || 0),
    confirmedTogetherSessions: Number(cell.dataset.confirmedTogetherSessions || 0),
    route: cell.dataset.route ? JSON.parse(decodeURIComponent(cell.dataset.route)) : null
  };
}
function formatHeatmapPopover(data) {
  const together = data.confirmedTogetherSessions || 0;
  return `<div class="people-heatmap-popover-header"><strong>${esc(data.personName)}</strong><span>${esc(data.date)}</span></div>
    <dl>
      <div><dt>Total</dt><dd>${esc(fmtHourValue(data.minutes))}</dd></div>
      <div><dt>Observed</dt><dd>${esc(fmtHourValue(data.observedMinutes))}</dd></div>
      <div><dt>Together</dt><dd>${esc(fmtHourValue(data.attributedMinutes))}</dd></div>
      <div><dt>Plays</dt><dd>${esc(data.plays)}</dd></div>
      <div><dt>Confirmed sessions</dt><dd>${esc(together)}</dd></div>
    </dl>
    ${data.route ? `<button type="button" class="text-button" data-route="${esc(encodeRoute(data.route))}">Open day in Timeline</button>` : ""}`;
}
function showHeatmapPopover(cell) {
  const popover = getPeopleHeatmapPopover();
  if (!popover) return;
  const data = getHeatmapCellData(cell);
  if (!data) return;
  popover.hidden = false;
  popover.style.visibility = "hidden";
  popover.innerHTML = formatHeatmapPopover(data);
  const rect = cell.getBoundingClientRect();
  const position = clampPopoverPosition(rect, popover);
  popover.style.left = `${position.left}px`;
  popover.style.top = `${position.top}px`;
  popover.style.visibility = "visible";
  popover.dataset.visible = "true";
  peopleHeatmapState.hoveredCell = cell;
  const container = cell.closest("[data-person-heatmap]");
  if (container) {
    const cells = [...container.querySelectorAll("[data-heatmap-cell]")];
    const index = cells.indexOf(cell);
    if (index >= 0) syncHeatmapActiveIndex(container, index);
  }
  const announcer = peopleHeatmapState.announcer || document.querySelector("[data-testid='people-order-live']");
  if (announcer) {
    announcer.textContent = `${data.personName}, ${data.date}: ${fmtHourValue(data.minutes)} total, ${fmtHourValue(data.observedMinutes)} observed, ${fmtHourValue(data.attributedMinutes)} Together, ${data.plays} plays, ${data.confirmedTogetherSessions} confirmed Together session${data.confirmedTogetherSessions === 1 ? "" : "s"}.`;
  }
}
function hideHeatmapPopover() {
  const popover = getPeopleHeatmapPopover();
  if (!popover) return;
  popover.hidden = true;
  popover.dataset.visible = "false";
  popover.style.visibility = "";
  popover.innerHTML = "";
  peopleHeatmapState.hoveredCell = null;
}
function restoreLocationState(){
  const raw=location.hash.slice(1);
  const [layoutName,rawQuery=""]=raw.split("?");
  if(layouts.has(layoutName))state.layout=layoutName;
  if(!raw.includes("?"))return;
  const params=new URLSearchParams(rawQuery);
  const restoredFilterKeys=state.layout==="people"?explorerFilterKeys.filter(key=>!['dateFrom','dateTo'].includes(key)):explorerFilterKeys;
  state.filters=Object.fromEntries(restoredFilterKeys.filter(key=>params.has(key)).map(key=>[key,params.get(key)]));
  if(state.layout==="people"){
    const period=params.get("period")||"30d";
    state.people.period=["7d","30d","90d","all","custom"].includes(period)?period:"30d";
    state.people.dateFrom=params.get("dateFrom")||"";
    state.people.dateTo=params.get("dateTo")||"";
  }
  const section=params.get("section")||state.filters.category||"";
  state.explorer.section=explorerSections.some(item=>item.id===section)?section:"";
  state.explorer.sort=["recent","title","progress","plays"].includes(params.get("sort"))?params.get("sort"):"recent";
  state.explorer.offset=Math.max(0,Number(params.get("offset"))||0);
  state.explorer.selected=params.get("selected")||"";
  state.timeline.date=params.get("timelineDate")||"";
  state.timeline.offset=Math.max(0,Number(params.get("timelineOffset"))||0);
  if(state.layout==="progress"){
    state.progress.recentlyActiveOffset=Math.max(0,Number(params.get("recentlyActiveOffset"))||0);
    state.progress.continueOffset=Math.max(0,Number(params.get("continueOffset"))||0);
    state.progress.recentlyCompletedOffset=Math.max(0,Number(params.get("recentlyCompletedOffset"))||0);
    state.progress.expandedProgress=params.get("expandedProgress")||"";
  }
}
const toneClass=status=>({failed:"is-danger",error:"is-danger",missing:"is-warning",review:"is-neutral",pending:"is-info",prompted:"is-info"})[status]||"is-neutral";
const deltaText=value=>value==null?"":`${value>0?"+":value<0?"-":""}${fmtHourValue(Math.abs(value))}`;
const progressText=value=>value==null?"Progress unknown":`${value}% finished`;
const progressExpandable=category=>category==="tv"||category==="classic_tv"||category==="anime"||category==="audiobook";
const attentionHeading=item=>({
  unresolved_prompt:"Waiting on a co-watch answer",
  discord_delivery_failed:"Prompt delivery failed",
  plex_sync_failed:"Watch state sync failed",
  missing_metadata:"Title needs matching metadata",
  uncertain_classification:"Category needs review",
  cowatch_review_prompt:"Discord co-watch review"
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
  if(Object.prototype.hasOwnProperty.call(route, "timelineDate")) {
    state.timeline.date = route.timelineDate || "";
  }
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
    if (d.adjudications && d.adjudications.length > 0) {
      evidenceHtml += `<div class="detail-evidence-section"><h3>Co-watch review history</h3><div class="detail-lazy-plays">${d.adjudications.map(row=>`<div class="detail-lazy-play-item"><span class="proof">${esc(row.decision.replace("_"," "))}</span><strong class="play-user">${esc(row.sourceName)} &amp; ${esc(row.targetName)}</strong><span class="play-date text-muted">${esc(row.method)} &middot; ${fmtDate(row.createdAt)}</span></div>`).join("")}</div></div>`;
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
  const params = {};
  if (state.timeline.date) params.date = state.timeline.date;
  params.offset = state.timeline.offset;
  params.limit = 50;

  const d = await fetchJson("/api/dashboard/timeline?" + query(params));
  
  if (d.selectedDate && state.timeline.date !== d.selectedDate) {
    state.timeline.date = d.selectedDate;
    save();
    const targetHash = "#" + state.layout + "?" + routeQuery();
    history.replaceState({}, "", targetHash);
  }

  const formattedDay = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(d.selectedDate + "T12:00:00"));

  const navHtml = `
    <div class="timeline-nav-header">
      <div class="timeline-nav-controls">
        <button class="timeline-nav-btn" id="timeline-prev-day" ${d.prevActiveDate ? "" : "disabled"} data-date="${d.prevActiveDate || ""}">← Previous Day</button>
        <button class="timeline-nav-btn" id="timeline-today-btn">Today</button>
      </div>
      <div>
        <input type="date" class="timeline-date-picker" id="timeline-picker" value="${d.selectedDate}">
      </div>
      <div class="timeline-nav-controls">
        <button class="timeline-nav-btn" id="timeline-next-day" ${d.nextActiveDate ? "" : "disabled"} data-date="${d.nextActiveDate || ""}">Next Day →</button>
      </div>
    </div>
  `;

  let chartHtml = "";
  if (!d.sessions || d.sessions.length === 0) {
    chartHtml = `
      <div class="day-gantt-card">
        <div class="day-gantt-header">${esc(formattedDay)}</div>
        <div class="panel-state empty" style="padding: 40px 0;">No household activity recorded on this day.</div>
      </div>
    `;
  } else {
    const userMap = new Map();
    d.sessions.forEach(session => {
      if (!userMap.has(session.displayName)) userMap.set(session.displayName, []);
      userMap.get(session.displayName).push(session);
    });

    const dayStart = new Date(d.selectedDate + "T00:00:00").getTime();
    const dayRange = 24 * 60 * 60 * 1000;

    const lanes = Array.from(userMap.entries()).map(([user, sessions]) => {
      const blocks = sessions.map(session => {
        const start = new Date(session.startTime).getTime();
        const end = new Date(session.endTime || session.startTime).getTime();
        const duration = Math.max(15 * 60 * 1000, end - start);
        
        let left = ((start - dayStart) / dayRange) * 100;
        let width = (duration / dayRange) * 100;
        
        if (left < 0) { width += left; left = 0; }
        if (left + width > 100) width = 100 - left;
        
        const catColor = {"movie":"var(--accent-movie)","tv":"var(--accent-tv)","classic_tv":"var(--accent-classic)","anime":"var(--accent-anime)","audiobook":"var(--accent-audiobook)"}[session.category] || "#95a5a6";
        
        const classes = ["gantt-block"];
        if (session.isCompleted) classes.push("completed");
        if (session.isPaused) classes.push("paused-fragmented");
        if (session.relationship === "together") classes.push("together");
        if (session.relationship === "likely_together") classes.push("likely-together");
        
        const timeFmt = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });
        const timeRange = `${timeFmt.format(new Date(session.startTime))} - ${timeFmt.format(new Date(session.endTime))}`;
        const statusText = session.isCompleted ? "Completed" : "Incomplete";
        const relationText = session.relationship === "together" ? "Together" : session.relationship === "likely_together" ? "Likely Together" : "Individual";
        const tooltip = `${esc(user)} watched ${esc(session.item.displayTitle)} (${esc(session.itemCount)} items)\nTime: ${timeRange} (${statusText}, ${relationText})`;
        
        const serializedItem = encodeURIComponent(JSON.stringify(session.item));
        
        return `<div class="${classes.join(" ")}" style="left: ${left}%; width: max(6px, ${width}%); background: ${catColor};" title="${tooltip}" tabindex="0" data-item="${serializedItem}"></div>`;
      }).join("");
      return `<div class="gantt-lane"><div class="gantt-user">${esc(user)}</div><div class="gantt-track">${blocks}</div></div>`;
    }).join("");

    chartHtml = `
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
  }

  let cowatchHtml = "";
  if (d.coWatchMoments && d.coWatchMoments.length > 0) {
    const momentsList = d.coWatchMoments.map(moment => {
      const isConfirmed = moment.participants.some(p => p.evidenceState === "confirmed");
      const isSource = moment.participants.find(p => p.role === "source");
      const watchers = moment.participants
        .filter(p => p.evidenceState === "confirmed" || p.evidenceState === "inferred" || p.role === "source")
        .map(p => esc(p.displayName))
        .join(" & ");
        
      const badgeClass = isConfirmed ? "together" : "likely-together";
      const badgeText = isConfirmed ? "Together" : "Likely Together";
      
      const provenance = moment.participants
        .filter(p => p.userId !== isSource?.userId && (p.evidenceState === "confirmed" || p.evidenceState === "inferred"))
        .map(p => p.reason)
        .join("; ");
        
      const timeFmt = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });
      const timeStr = timeFmt.format(new Date(moment.watchedAt));
      
      const representativeItem = {
        ratingKey: moment.ratingKey,
        category: moment.mediaType,
        title: moment.title,
        showTitle: moment.showTitle,
        seasonNumber: moment.seasonNumber,
        episodeNumber: moment.episodeNumber
      };
      
      return `
        <div class="cowatch-moment-row" data-item="${encodeURIComponent(JSON.stringify(representativeItem))}">
          <div class="cowatch-moment-info">
            <div class="cowatch-moment-title">${esc(moment.showTitle || moment.title)}</div>
            <div class="cowatch-moment-meta">${esc(watchers)} &middot; ${esc(timeStr)}</div>
            <div class="cowatch-moment-meta" style="font-size: 0.75rem; font-style: italic;">${esc(provenance)}</div>
          </div>
          <div>
            <span class="cowatch-moment-badge ${badgeClass}">${badgeText}</span>
          </div>
        </div>
      `;
    }).join("");
    
    cowatchHtml = `
      <section class="cowatch-moments-panel">
        <div class="panel-title"><h3>Co-Watching Moments</h3></div>
        <div class="cowatch-moments-list">${momentsList}</div>
      </section>
    `;
  }

  const feedItems = Array.isArray(d.items) ? d.items : [];
  const feedHtml = `
    <div class="recent-list-fallback" style="margin-top: 2rem;">
      <div class="panel-title mb-2"><h3>Activity Feed</h3></div>
      ${feedItems.length > 0 ? feedItems.map(activityRow).join("") : empty("activity")}
    </div>
    ${pager(d)}
  `;

  content.innerHTML = `
    <section class="day-gantts-section">
      ${navHtml}
      ${chartHtml}
      ${cowatchHtml}
      ${feedHtml}
    </section>
  `;

  const prevBtn = content.querySelector("#timeline-prev-day");
  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      const date = prevBtn.dataset.date;
      if (date) {
        state.timeline.date = date;
        state.timeline.offset = 0;
        save();
        render();
      }
    });
  }

  const nextBtn = content.querySelector("#timeline-next-day");
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      const date = nextBtn.dataset.date;
      if (date) {
        state.timeline.date = date;
        state.timeline.offset = 0;
        save();
        render();
      }
    });
  }

  const todayBtn = content.querySelector("#timeline-today-btn");
  if (todayBtn) {
    todayBtn.addEventListener("click", () => {
      state.timeline.date = "";
      state.timeline.offset = 0;
      save();
      render();
    });
  }

  const picker = content.querySelector("#timeline-picker");
  if (picker) {
    picker.addEventListener("change", (e) => {
      state.timeline.date = e.target.value;
      state.timeline.offset = 0;
      save();
      render();
    });
  }
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
  const renderVersion=++peopleRenderVersion;
  const periodParams=peopleQuery();
  const [peopleResult,pairingsResult,reviewsResult,operationsResult]=await Promise.allSettled([
    fetchJson("/api/dashboard/people?" + periodParams),
    fetchJson("/api/dashboard/cowatch-pairings?" + periodParams),
    fetchJson("/api/dashboard/cowatch-reviews?" + peopleQuery({limit:20,offset:0})),
    fetchJson("/api/dashboard/operations")
  ]);
  if(peopleResult.status==="rejected")throw peopleResult.reason;
  const data = peopleResult.value;
  const active = data.active || [];
  const secondary = data.secondary || [];
  peopleHeatmapState.activeDefault = active;
  peopleHeatmapState.secondaryDefault = secondary;
  const activePeople = state.people.orderMode === "custom" ? sortPeopleGroup(active, "active") : active;
  const secondaryPeople = state.people.orderMode === "custom" ? sortPeopleGroup(secondary, "secondary") : secondary;
  peopleHeatmapState.activeVisible = activePeople;
  peopleHeatmapState.secondaryVisible = secondaryPeople;
  const orderModeLabel = state.people.orderMode === "custom" ? "Drag cards into place. Arrow controls are available for keyboard ordering." : "Using the default household order.";
  const orderControls = `<div class="people-ordering${state.people.orderMode === "custom" ? " is-custom" : ""}" data-testid="people-order-controls">
    <div class="people-order-actions">
      <div class="people-order-mode" role="group" aria-label="People card ordering">
        <button type="button" data-people-order-mode="default" aria-pressed="${state.people.orderMode !== "custom"}">Default</button>
        <button type="button" data-people-order-mode="custom" aria-pressed="${state.people.orderMode === "custom"}">Custom</button>
      </div>
      <button type="button" class="people-order-reset" data-people-order-reset aria-label="Reset positions" title="Clear saved card positions">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4v6h6M5.5 15a7 7 0 1 0 1.7-7.2L4 10"/></svg><span>Reset</span>
      </button>
    </div>
    <p class="people-order-copy" data-people-order-copy>${esc(orderModeLabel)}</p>
    <span class="sr-only" data-testid="people-order-live" aria-live="polite"></span>
  </div>`;
  const personCard = (person, group) => {
    const name=person.display_name||person.plex_username;
    const statusLabel=person.status==="active"?"Active":person.status==="disabled"?"Disabled":"No activity";
    const heatmapDays = person.heatmap||[];
    const activeIndex = Math.min(Number(peopleHeatmapState.activeByPerson.get(person.id) ?? 0), Math.max(0, heatmapDays.length - 1));
    peopleHeatmapState.activeByPerson.set(person.id, activeIndex);
    const heatmap=(heatmapDays).map((day,index)=>{
      const level=day.minutes<=0?0:day.minutes<30?1:day.minutes<120?2:3;
      const together=Number(day.confirmedTogetherSessions||0);
      const label=`${day.date}: ${fmtHourValue(day.minutes)} total (${fmtHourValue(day.observedMinutes)} observed, ${fmtHourValue(day.attributedMinutes)} attributed) across ${day.plays} play${day.plays===1?"":"s"}; ${together} confirmed Together session${together===1?"":"s"}`;
      const route=encodeRoute({layout:"timeline",filters:{...state.filters,user:person.plex_username},timelineDate:day.date});
      return `<span id="heatmap-${esc(person.id)}-${index}" class="person-heat-cell level-${level}${together?" has-together":""}${index===activeIndex?" is-active":""}" role="gridcell" aria-label="${esc(label)}" data-heatmap-cell data-person-id="${esc(person.id)}" data-person-name="${esc(name)}" data-heatmap-date="${esc(day.date)}" data-minutes="${esc(day.minutes)}" data-observed-minutes="${esc(day.observedMinutes)}" data-attributed-minutes="${esc(day.attributedMinutes)}" data-plays="${esc(day.plays)}" data-confirmed-together-sessions="${esc(together)}" data-route="${esc(route)}"></span>`;
    }).join("");
    const recent=(person.recent||[]).map(item=>`<button class="person-recent-title" data-item="${encodeURIComponent(JSON.stringify(item))}"><span>${mediaTitle(item)}</span><small>${item.contribution==="attributed_confirmed_together"?'<span class="together-label">Together</span> &middot; ':""}${esc(categoryLabel(item.category))} &middot; ${fmtDate(item.watchedAt)}</small></button>`).join("");
    const warnings=(person.possibleDuplicates||[]).length?`<p class="person-warning"><strong>Possible duplicate</strong><span>Similar to ${esc(person.possibleDuplicates.join(", "))}. Kept separate.</span></p>`:"";
    const breakdown=person.activityBreakdown||{observed:{plays:person.plays||0,minutes:person.minutes||0,completed:person.completed||0},attributedTogether:{plays:0,minutes:0,completed:0,unknownDuration:0},confirmedTogetherSessions:0};
    const unknown=breakdown.attributedTogether.unknownDuration?` &middot; ${breakdown.attributedTogether.unknownDuration} unknown duration`:"";
    const libraryRoute={layout:"explorer",filters:{...state.filters,user:person.plex_username}};
    const timelineRoute={layout:"timeline",filters:{...state.filters,user:person.plex_username}};
    const orderControlsHtml = `<div class="person-order-controls" data-person-order-controls aria-label="Order ${esc(name)}"${state.people.orderMode === "custom" ? "" : " hidden"}>
        <button type="button" class="person-order-handle" data-person-drag-handle data-person-id="${esc(person.id)}" data-person-group="${esc(group)}" aria-label="Drag to reorder ${esc(name)}" title="Drag ${esc(name)}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="7" r="1.5"/><circle cx="16" cy="7" r="1.5"/><circle cx="8" cy="12" r="1.5"/><circle cx="16" cy="12" r="1.5"/><circle cx="8" cy="17" r="1.5"/><circle cx="16" cy="17" r="1.5"/></svg>
        </button>
        <div class="person-order-stepper">
          <button type="button" data-person-move="earlier" data-person-id="${esc(person.id)}" data-person-group="${esc(group)}" aria-label="Move earlier" title="Move ${esc(name)} earlier">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 14 5-5 5 5"/></svg>
          </button>
          <button type="button" data-person-move="later" data-person-id="${esc(person.id)}" data-person-group="${esc(group)}" aria-label="Move later" title="Move ${esc(name)} later">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>
          </button>
        </div>
      </div>`;
    return `<article class="person-card" data-testid="person-card" data-person-card data-person-id="${esc(person.id)}" data-person-group="${esc(group)}" data-person-status="${esc(person.status)}">
      <header class="person-card-header"><div class="avatar" aria-hidden="true">${esc(name.slice(0,1))}</div><div><h4>${esc(name)}</h4><span class="person-status status-${esc(person.status)}">${esc(statusLabel)}</span></div>${orderControlsHtml}</header>
      ${warnings}
      <div class="person-stats"><span><strong>${esc(fmtHourValue(person.minutes))}</strong> total watched</span><span><strong>${esc(person.completed)}</strong> completed</span><span><strong>${esc(person.activeDays)}</strong> active days</span></div>
      <div class="person-breakdown" data-testid="person-breakdown"><span><strong>${esc(fmtHourValue(breakdown.observed.minutes))}</strong> directly observed</span><span><strong>${esc(fmtHourValue(breakdown.attributedTogether.minutes))}</strong> added from Together${unknown}</span><span><strong>${esc(breakdown.confirmedTogetherSessions)}</strong> confirmed shared session${breakdown.confirmedTogetherSessions===1?"":"s"}</span></div>
      <div class="person-mix" aria-label="Category mix">${(person.mix||[]).length?person.mix.map(m=>`<span class="proof">${esc(m.label)} ${esc(m.count)}</span>`).join(""):'<span class="text-muted">No category activity</span>'}</div>
      <div class="person-heatmap" role="grid" tabindex="0" aria-label="Activity by day for ${esc(name)}" aria-activedescendant="heatmap-${esc(person.id)}-${activeIndex}" data-person-heatmap data-person-id="${esc(person.id)}" data-active-index="${activeIndex}">${heatmap}</div>
      <div class="person-recent"><h5>Recent titles</h5>${recent||'<p class="text-muted">No activity in this window.</p>'}</div>
      <div class="person-actions"><button class="text-button" data-route="${encodeRoute(libraryRoute)}">Open Library</button><button class="text-button" data-route="${encodeRoute(timelineRoute)}">Open Timeline</button></div>
      <details class="person-account"><summary>Technical account</summary><dl><dt>Plex account</dt><dd>${esc(person.technicalAccount?.plexUsername||person.plex_username)}</dd></dl></details>
    </article>`;
  };

  const pairingHtml=pairingsResult.status==="rejected"
    ? `<div class="panel-state error"><h3>Pairings could not load</h3><p>${esc(pairingsResult.reason.message)}</p><button class="btn" data-retry>Try again</button></div>`
    : pairingsResult.value.items.length
      ? pairingsResult.value.items.map(pair=>{
          const names=pair.people.map(person=>person.displayName).join(" & ");
          const time=pair.knownSharedMinutes>0?fmtHourValue(pair.knownSharedMinutes):"Time unknown";
          const unknown=pair.unknownDurationSessions?`<span>${pair.unknownDurationSessions} session${pair.unknownDurationSessions===1?"":"s"} without measurable overlap</span>`:"";
          const titles=pair.titles.map(title=>`<button class="pair-title" data-route="${encodeRoute({layout:"timeline",filters:{...state.filters,ratingKey:title.ratingKey}})}">${esc(title.title)}</button>`).join("");
          return `<article class="pairing-card" data-testid="pairing-card"><header><div><h4>${esc(names)}</h4><span>${pair.sessionCount} shared session${pair.sessionCount===1?"":"s"}</span></div><strong>${esc(time)}</strong></header><div class="pairing-provenance"><span class="proof confirmed">Together ${pair.provenance.confirmed}</span>${pair.provenance.adjudicated?`<span class="proof confirmed">Reviewed together ${pair.provenance.adjudicated}</span>`:""}<span class="proof">Likely together ${pair.provenance.inferred}</span>${unknown}</div><div class="pairing-titles">${titles}</div></article>`;
        }).join("")
      : empty("person pairings");
  const reviewsHtml=reviewsResult.status==="rejected"
    ? `<div class="panel-state error"><h3>Review queue could not load</h3><p>${esc(reviewsResult.reason.message)}</p><button class="btn" data-retry>Try again</button></div>`
    : reviewsResult.value.items.length
      ? reviewsResult.value.items.map(candidate=>{
          const names=`${candidate.source.displayName} & ${candidate.target.displayName}`;
          const stateLabel=candidate.effectiveRelationship==="together"?"Together":candidate.effectiveRelationship==="suppressed"?"Not together":"Likely together";
          const promptOpen=["pending","sent"].includes(candidate.discordPromptStatus);
          const discordControl=reviewsResult.value.discordAvailable
            ? promptOpen?`<span class="review-prompt-state">Discord: ${esc(candidate.discordPromptStatus)}</span>`:`<button class="text-button" data-review-discord>Ask in Discord</button>`
            : '<span class="review-prompt-state">Discord review unavailable</span>';
          return `<article class="review-card" data-testid="review-card" data-candidate-id="${esc(candidate.candidateId)}"><div><span class="proof">${esc(stateLabel)}</span><h4>${esc(candidate.showTitle||candidate.title)}</h4><p>${esc(names)} &middot; ${fmtDate(candidate.watchedAt)}</p></div><div class="review-actions" aria-label="Review ${esc(candidate.showTitle||candidate.title)}"><button data-review-decision="yes">Yes</button><button data-review-decision="no">No</button><button data-review-decision="not_sure">Not sure</button>${candidate.decision?'<button class="text-button" data-review-decision="clear">Clear decision</button>':""}${discordControl}</div></article>`;
        }).join("")
      : empty("likely-together reviews");
  const operationsHtml=operationsResult.status==="rejected"
    ? `<div class="panel-state error"><h3>Operations could not load</h3><p>${esc(operationsResult.reason.message)}</p><button class="btn" data-retry>Try again</button></div>`
    : operationsResult.value.items.length
      ? operationsResult.value.items.map(item=>`<article class="operation-row" data-testid="operation-row"><div><strong>${esc(attentionHeading(item))}</strong><p>${esc(item.detail)}</p><small>${esc(attentionStatusLabel(item))}${item.watchedAt?` &middot; ${fmtDate(item.watchedAt)}`:""}</small></div><div class="operation-actions">${item.route?`<button class="text-button" data-route="${encodeRoute(item.route)}">Open context</button>`:""}${item.watchEventId&&item.kind==="unresolved_prompt"?`<button class="text-button" data-action="dismiss" data-id="${esc(item.watchEventId)}">Dismiss</button>`:""}${item.watchEventId&&["unresolved_prompt","discord_delivery_failed"].includes(item.kind)?`<button class="text-button" data-action="reprompt" data-id="${esc(item.watchEventId)}">Send again</button>`:""}</div></article>`).join("")
      : empty("open operations");

  const periodOptions=[['7d','7 days'],['30d','30 days'],['90d','90 days'],['all','All time'],['custom','Custom']];
  const periodControls=`<div class="people-period" data-testid="people-period-controls" aria-label="People reporting period"><div class="people-period-presets">${periodOptions.map(([value,label])=>`<button type="button" data-people-period="${value}" aria-pressed="${state.people.period===value}">${label}</button>`).join("")}</div>${state.people.period==="custom"?`<div class="people-custom-dates"><label>From<input type="date" data-people-date-from value="${esc(state.people.dateFrom)}"></label><label>To<input type="date" data-people-date-to value="${esc(state.people.dateTo)}"></label><button type="button" class="btn" data-people-custom-apply>Apply dates</button><span class="people-date-error" role="alert"></span></div>`:""}</div>`;
  const orderControlsHtml = `${orderControls}`;
  const heatmapRange=data.window?.heatmapTruncated?`Daily heatmap shows ${esc(data.window.heatmapStart)} to ${esc(data.window.heatmapEnd)}; totals cover the full period.`:`Daily heatmap covers ${esc(data.window?.heatmapStart||"")} to ${esc(data.window?.heatmapEnd||"")}.`;

  if(renderVersion!==peopleRenderVersion)return;
  content.innerHTML = `<div class="people-workspace">
    <section class="dashboard-panel">
      <div class="panel-title"><div><h3>Household Members</h3><span>${esc(data.window?.label||"")} &middot; ${active.length} active</span></div></div>
      ${periodControls}
      ${orderControlsHtml}
      <div class="person-heat-legend" data-testid="people-heatmap-legend"><span><i class="level-0"></i>No activity</span><span><i class="level-1"></i>Under 30m</span><span><i class="level-2"></i>30m-2h</span><span><i class="level-3"></i>2h+</span><span><i class="together-marker"></i>Together</span><small>${heatmapRange}</small></div>
      <div class="people-grid" data-testid="active-people" data-people-group="active">${activePeople.length?activePeople.map(person=>personCard(person,"active")).join(""):empty("active household members")}</div>
    </section>
    <details class="dashboard-panel people-secondary" data-testid="secondary-people">
      <summary><span>Other included identities</span><small>${secondary.length} disabled or without activity</small></summary>
      <div class="people-grid" data-people-group="secondary">${secondaryPeople.length?secondaryPeople.map(person=>personCard(person,"secondary")).join(""):empty("other included identities")}</div>
    </details>
    <section class="dashboard-panel" data-testid="pairings-panel"><div class="panel-title"><div><h3>Who watches together</h3><span>Exact-item evidence only</span></div></div><div class="pairings-list">${pairingHtml}</div></section>
    <section class="dashboard-panel" data-testid="reviews-panel"><div class="panel-title"><div><h3>Review likely co-watches</h3><span>${reviewsResult.status==="fulfilled"?`${reviewsResult.value.total} exact-item candidate${reviewsResult.value.total===1?"":"s"}`:"Needs retry"}</span></div></div><div class="reviews-list">${reviewsHtml}</div></section>
    <section class="dashboard-panel" data-testid="operations-panel"><div class="panel-title"><div><h3>Operations</h3><span>Current unresolved prompts and sync issues</span></div></div><div class="operations-list">${operationsHtml}</div></section>
    <div class="people-heatmap-popover" data-testid="people-heatmap-popover" hidden></div>
  </div>`;
  peopleHeatmapState.popover = content.querySelector("[data-testid='people-heatmap-popover']");
  peopleHeatmapState.announcer = content.querySelector("[data-testid='people-order-live']");
  if (peopleHeatmapState.pendingAnnouncement && peopleHeatmapState.announcer) {
    peopleHeatmapState.announcer.textContent = peopleHeatmapState.pendingAnnouncement;
    peopleHeatmapState.pendingAnnouncement = "";
  }
}

async function renderProgress() {
  const d = await fetchJson("/api/dashboard/progress?" + query({
    recentlyActiveLimit: 6,
    recentlyActiveOffset: state.progress.recentlyActiveOffset,
    continueLimit: 6,
    continueOffset: state.progress.continueOffset,
    recentlyCompletedLimit: 6,
    recentlyCompletedOffset: state.progress.recentlyCompletedOffset
  }));

  const renderCard = (x) => {
    const isTv = x.category === "tv" || x.category === "classic_tv" || x.category === "anime";
    const isAudiobook = x.category === "audiobook";
    const canExpand = progressExpandable(x.category);
    const isExpanded = state.progress.expandedProgress === x.groupKey;
    const expansionButton = canExpand
      ? `<button type="button" class="text-button progress-expand-toggle" data-testid="progress-expand-toggle" data-progress-expand="${esc(x.groupKey)}" aria-expanded="${isExpanded}" aria-label="${isExpanded ? "Hide" : "Show"} hierarchy for ${esc(x.title)}">${isExpanded ? "Hide hierarchy" : "Show hierarchy"}</button>`
      : "";

    // Progress Bar or Unknown Total
    let barHtml = "";
    if (x.totalKnown && x.totalItems) {
      const pct = Math.min(100, Math.round((x.distinctCompleted / x.totalItems) * 100));
      const label = x.category === "movie" ? "Completed" : `${x.distinctCompleted} of ${x.totalItems} completed (${pct}%)`;
      barHtml = `
        <div class="progress-card-bar-wrapper">
          <div class="progress-card-bar" data-testid="progress-bar" title="${esc(label)}">
            <i style="width: ${pct}%"></i>
          </div>
          <span class="progress-card-bar-label">${esc(label)}</span>
        </div>
      `;
    } else {
      const label = `Total unknown · ${x.distinctCompleted} completed`;
      barHtml = `
        <div class="progress-card-bar-wrapper">
          <div class="progress-card-bar bar-unknown" data-testid="progress-bar" title="${esc(label)}">
            <i style="width: 100%"></i>
          </div>
          <span class="progress-card-bar-label">${esc(label)}</span>
        </div>
      `;
    }

    // Stats
    const totalLabel = x.totalKnown ? x.totalItems : "unknown";
    const observedStr = x.observedMinutes > 0 ? fmtHourValue(x.observedMinutes) : "0m";

    // People Badges
    const peopleBadges = (x.people || []).map(p => `
      <span class="media-badge" style="position: static; display: inline-block; margin-right: 4px; font-size: 0.65rem;">
        ${esc(p.displayName)}
      </span>
    `).join("");

    // TV summary or Audiobook series
    let summaryLine = "";
    if (isTv && x.seasons) {
      const parts = [];
      for (const [sNum, eps] of Object.entries(x.seasons)) {
        parts.push(`S${sNum} (${eps.length} ep${eps.length > 1 ? "s" : ""})`);
      }
      summaryLine = parts.join(" &middot; ");
    } else if (isAudiobook && x.hierarchy) {
      const h = x.hierarchy;
      const parts = [h.parentSeries, h.series, h.subseries].filter(Boolean);
      if (parts.length > 0) {
        summaryLine = parts.join(" &middot; ");
      }
    }

    const cardInteractionAttrs = canExpand
      ? `data-progress-card="${esc(x.groupKey)}" tabindex="0" aria-expanded="${isExpanded}" aria-label="${esc(x.title)} progress hierarchy"`
      : `data-item="${encodeURIComponent(JSON.stringify(x))}"`;

    return `
      <article class="collection-card progress-card" data-testid="progress-card" data-cat="${esc(x.category)}" data-group-key="${esc(x.groupKey)}" ${cardInteractionAttrs}>
        <div class="progress-card-header">
          ${art(x)}
          <div class="progress-card-info">
            <div class="progress-card-title-row">
              <h4>${esc(x.title)}</h4>
              <span class="progress-card-category-badge" data-cat="${esc(x.category)}">${esc(categoryLabel(x.category))}</span>
            </div>
            ${summaryLine ? `<p class="progress-card-summary">${summaryLine}</p>` : ""}
            <p class="progress-card-details">
              ${x.distinctItems} distinct &middot; ${x.plays} play${x.plays > 1 ? "s" : ""} ${x.plays - x.distinctItems > 0 ? `(${x.plays - x.distinctItems} repeat${x.plays - x.distinctItems > 1 ? "s" : ""})` : ""}
            </p>
            <p class="progress-card-observed">Observed: ${observedStr}</p>
            <div class="progress-card-people-row">${peopleBadges}</div>
            ${expansionButton ? `<div class="progress-card-actions">${expansionButton}</div>` : ""}
          </div>
        </div>
        ${barHtml}
        <div class="progress-hierarchy-slot" data-progress-expansion-slot hidden></div>
      </article>
    `;
  };

  const continueHtml = (d.continue.items || []).length > 0
    ? d.continue.items.map(renderCard).join("")
    : `<p class="text-muted" data-testid="progress-empty-continue">No items currently in progress.</p>`;

  const activeHtml = (d.recentlyActive.items || []).length > 0
    ? d.recentlyActive.items.map(renderCard).join("")
    : `<p class="text-muted" data-testid="progress-empty-recentlyActive">No active items.</p>`;

  const completedHtml = (d.recentlyCompleted.items || []).length > 0
    ? d.recentlyCompleted.items.map(x => `
        <div class="rec-comp-row" tabindex="0" data-item="${encodeURIComponent(JSON.stringify(x))}" data-testid="progress-completed-row">
          ${art(x)}
          <div>
            <strong>${esc(x.title)}</strong>
            <br>
            <span class="text-muted" style="font-size:0.8rem;">
              Completed by ${x.people.map(p => esc(p.displayName)).join(", ")}
            </span>
          </div>
        </div>
      `).join("")
    : `<p class="text-muted" data-testid="progress-empty-recentlyCompleted">Nothing completed recently.</p>`;

  content.innerHTML = `
    <section class="dashboard-grid">
      <div class="dashboard-panel panel-wide">
        <div class="progress-section">
          <div class="panel-title">
            <h3>Continue Watching & Listening</h3>
            <span>Pick up where you left off</span>
          </div>
          <div class="collection-grid" data-testid="progress-continue-list">
            ${continueHtml}
          </div>
          ${progressPager(d.continue, "continue")}
        </div>

        <div class="progress-section" style="margin-top: 40px;">
          <div class="panel-title">
            <h3>Recently Active</h3>
            <span>Latest activity across all series</span>
          </div>
          <div class="collection-grid" data-testid="progress-active-list">
            ${activeHtml}
          </div>
          ${progressPager(d.recentlyActive, "recentlyActive")}
        </div>
      </div>
      <aside>
        <div class="dashboard-panel">
          <h3>Recently Completed</h3>
          <div class="recent-completed-list" data-testid="progress-completed-list">
            ${completedHtml}
          </div>
          ${progressPager(d.recentlyCompleted, "recentlyCompleted")}
        </div>
      </aside>
    </section>
  `;

  await syncProgressExpansionFromState();
}

function getProgressCardByKey(groupKey) {
  return [...content.querySelectorAll("[data-testid='progress-card']")].find(card => card.dataset.groupKey === groupKey) || null;
}

function updateProgressRoute(push) {
  const targetHash = "#" + state.layout + "?" + routeQuery();
  if (location.hash === targetHash) return;
  if (push) history.pushState({}, "", targetHash);
  else history.replaceState({}, "", targetHash);
}

function resetProgressExpansionSlots(preferredCard = null) {
  let expandedCardSeen = false;
  content.querySelectorAll("[data-testid='progress-card']").forEach(card => {
    const matchesExpanded = card.dataset.groupKey === state.progress.expandedProgress;
    const expanded = matchesExpanded && !expandedCardSeen && (!preferredCard || card === preferredCard);
    if (expanded) expandedCardSeen = true;
    card.classList.toggle("is-expanded", expanded);
    if (card.hasAttribute("data-progress-card")) {
      card.setAttribute("aria-expanded", String(expanded));
    }
    const slot = card.querySelector("[data-progress-expansion-slot]");
    if (slot && !expanded) {
      slot.hidden = true;
      slot.innerHTML = "";
    }
    const toggle = card.querySelector("[data-progress-expand]");
    if (toggle) {
      toggle.setAttribute("aria-expanded", String(expanded));
      const title = card.querySelector(".progress-card-title-row h4")?.textContent || "this title";
      toggle.textContent = expanded ? "Hide hierarchy" : "Show hierarchy";
      toggle.setAttribute("aria-label", `${expanded ? "Hide" : "Show"} hierarchy for ${title}`);
    }
  });
}

function progressStateText(stateValue) {
  return ({ watched: "watched", partial: "partial", repeated: "repeated", unknown: "unknown" })[stateValue] || "unknown";
}

function progressStateBadges(watchedStates, itemTitle) {
  const entries = Object.entries(watchedStates || {}).sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length) return '<span class="text-muted">No visible person state</span>';
  return entries.map(([person, stateValue]) => {
    const label = `${itemTitle}: ${person} ${progressStateText(stateValue)}`;
    return `<span class="state-badge ${esc(stateValue)}" data-testid="progress-state" aria-label="${esc(label)}" title="${esc(label)}">${esc(person)} <span>${esc(progressStateText(stateValue))}</span></span>`;
  }).join("");
}

function progressDetailItem(expansion, node, kind) {
  return {
    ratingKey: node.ratingKey,
    title: node.title,
    displayTitle: node.title,
    showTitle: expansion.title,
    category: expansion.category,
    categoryLabel: categoryLabel(expansion.category),
    artworkUrl: expansion.artworkUrl,
    duration: node.duration,
    mediaType: kind === "chapter" ? "track" : "episode",
    watchedAt: "",
    percentComplete: null
  };
}

function renderProgressHierarchy(expansion) {
  if (!expansion || !expansion.hierarchy) {
    return '<div class="panel-state compact error">Hierarchy unavailable.</div>';
  }
  if (expansion.hierarchy.type === "movie") {
    return '<div class="panel-state compact">Movies do not have a Progress hierarchy.</div>';
  }
  if (expansion.hierarchy.type === "audiobook") {
    const parentInfo = [expansion.hierarchy.parentSeries, expansion.hierarchy.subseries, expansion.hierarchy.series].filter(Boolean).join(" / ");
    const chapters = expansion.hierarchy.chapters || [];
    return `
      <section class="progress-hierarchy" data-testid="progress-hierarchy" aria-label="${esc(expansion.title)} audiobook hierarchy">
        <div class="progress-hierarchy-heading">
          <div>
            <strong>${esc(expansion.hierarchy.bookTitle || expansion.title)}</strong>
            ${parentInfo ? `<span>${esc(parentInfo)}</span>` : ""}
          </div>
          <small>${esc(chapters.length)} chapter${chapters.length === 1 ? "" : "s"} loaded &middot; ${esc(expansion.timingMs)} ms</small>
        </div>
        <div class="progress-chapter-list">
          ${chapters.map(ch => {
            const item = progressDetailItem(expansion, ch, "chapter");
            return `
              <button type="button" class="progress-node progress-chapter" data-testid="progress-chapter" data-item="${encodeURIComponent(JSON.stringify(item))}" aria-label="${esc(ch.title)} chapter detail">
                <span class="progress-node-title">${esc(ch.title)}</span>
                <span class="progress-node-states">${progressStateBadges(ch.watchedStates, ch.title)}</span>
              </button>
            `;
          }).join("")}
        </div>
      </section>
    `;
  }
  if (expansion.hierarchy.type === "tv") {
    const seasons = expansion.hierarchy.seasons || [];
    return `
      <section class="progress-hierarchy" data-testid="progress-hierarchy" aria-label="${esc(expansion.title)} show hierarchy">
        <div class="progress-hierarchy-heading">
          <div>
            <strong>${esc(expansion.hierarchy.showTitle || expansion.title)}</strong>
            <span>${esc(seasons.length)} season${seasons.length === 1 ? "" : "s"} loaded</span>
          </div>
          <small>${esc(expansion.timingMs)} ms</small>
        </div>
        <div class="progress-season-list">
          ${seasons.map(season => `
            <section class="progress-season" data-testid="progress-season" aria-label="${esc(season.seasonName)}">
              <header>
                <strong>${esc(season.seasonName)}</strong>
                <span>${esc((season.episodes || []).length)} episode${(season.episodes || []).length === 1 ? "" : "s"}</span>
              </header>
              <div class="progress-episode-list">
                ${(season.episodes || []).map(ep => {
                  const item = progressDetailItem(expansion, ep, "episode");
                  const episodeLabel = `Episode ${ep.episodeNumber ?? "?"}: ${ep.title}`;
                  return `
                    <button type="button" class="progress-node progress-episode" data-testid="progress-episode" data-item="${encodeURIComponent(JSON.stringify(item))}" aria-label="${esc(episodeLabel)} detail">
                      <span class="progress-node-title">${esc(episodeLabel)}</span>
                      <span class="progress-node-states">${progressStateBadges(ep.watchedStates, ep.title)}</span>
                    </button>
                  `;
                }).join("")}
              </div>
            </section>
          `).join("")}
        </div>
      </section>
    `;
  }
  return '<div class="panel-state compact error">Unsupported hierarchy response.</div>';
}

async function syncProgressExpansionFromState(preferredCard = null) {
  resetProgressExpansionSlots(preferredCard);
  const groupKey = state.progress.expandedProgress;
  if (!groupKey) return;
  const card = preferredCard?.dataset?.groupKey === groupKey ? preferredCard : getProgressCardByKey(groupKey);
  if (!card) return;
  const slot = card.querySelector("[data-progress-expansion-slot]");
  if (!slot) return;
  slot.hidden = false;
  if (progressExpansionCache.has(groupKey)) {
    slot.innerHTML = renderProgressHierarchy(progressExpansionCache.get(groupKey));
    return;
  }
  slot.innerHTML = '<div class="panel-state compact" data-testid="progress-hierarchy-loading">Loading hierarchy...</div>';
  try {
    const expansion = await fetchJson("/api/dashboard/progress/expand/" + encodeURIComponent(groupKey));
    progressExpansionCache.set(groupKey, expansion);
    if (state.progress.expandedProgress === groupKey && document.contains(slot)) {
      slot.innerHTML = renderProgressHierarchy(expansion);
    }
  } catch (error) {
    if (state.progress.expandedProgress === groupKey && document.contains(slot)) {
      slot.innerHTML = '<div class="panel-state compact error" data-testid="progress-hierarchy-error">Hierarchy could not load.</div>';
    }
  }
}

function progressPager(bucket, stateKey) {
  if (bucket.total <= bucket.limit) return "";
  return `
    <nav class="pager" aria-label="${stateKey} pagination" style="margin-top: 16px;">
      <button data-progress-page="${stateKey}:prev" ${bucket.offset === 0 ? "disabled" : ""}>Previous</button>
      <span>${bucket.offset + 1}-${Math.min(bucket.total, bucket.offset + bucket.limit)} of ${bucket.total}</span>
      <button data-progress-page="${stateKey}:next" ${bucket.offset + bucket.limit >= bucket.total ? "disabled" : ""}>Next</button>
    </nav>
  `;
}

function movePeopleCard(group, visiblePeople, draggedIdValue, delta) {
  const draggedId = String(draggedIdValue);
  const ids = visiblePeople.map(personId);
  const fromIndex = ids.indexOf(draggedId);
  if (fromIndex < 0) return ids;
  const toIndex = Math.max(0, Math.min(ids.length - 1, fromIndex + delta));
  if (fromIndex === toIndex) return ids;
  const [entry] = ids.splice(fromIndex, 1);
  ids.splice(toIndex, 0, entry);
  state.people = {
    ...state.people,
    orderMode: "custom",
    [personOrderKey(group)]: ids
  };
  save();
  const byId = new Map(visiblePeople.map(person => [personId(person), person]));
  const orderedPeople = ids.map(id => byId.get(id)).filter(Boolean);
  reorderPeopleGrid(group, orderedPeople);
  const person = visiblePeople[fromIndex];
  if (person) announcePeopleOrder(`${person.display_name || person.plex_username} moved to position ${toIndex + 1} of ${ids.length} in ${personOrderLabel(group)}.`);
  return ids;
}

function finishPeopleDrag() {
  if (peopleDragState.placeholder && peopleDragState.placeholder.parentNode) peopleDragState.placeholder.parentNode.removeChild(peopleDragState.placeholder);
  clearPeopleDragGhost();
  restorePeopleDragSource();
  if (peopleDragState.sourceCard) {
    peopleDragState.sourceCard.classList.remove("is-dragging");
    for (const property of ["position", "left", "top", "width", "height", "z-index", "pointer-events", "margin"]) {
      peopleDragState.sourceCard.style.removeProperty(property);
    }
  }
  peopleDragState.pointerId = null;
  peopleDragState.personId = "";
  peopleDragState.group = "";
  peopleDragState.sourceCard = null;
  peopleDragState.placeholder = null;
  peopleDragState.targetCard = null;
  peopleDragState.placeBefore = true;
  peopleDragState.startX = 0;
  peopleDragState.startY = 0;
  peopleDragState.lastX = 0;
  peopleDragState.lastY = 0;
  peopleDragState.offsetX = 0;
  peopleDragState.offsetY = 0;
  peopleDragState.dragging = false;
  peopleDragState.ignoreClickUntil = Date.now() + 120;
}

function beginPeopleDrag(handle, event) {
  if (state.people.orderMode !== "custom") return;
  const card = handle.closest("[data-person-card]");
  const group = card?.dataset.personGroup;
  const personIdValue = card?.dataset.personId;
  if (!card || !group || !personIdValue) return;
  peopleDragState.pointerId = event.pointerId ?? "mouse";
  peopleDragState.personId = String(personIdValue);
  peopleDragState.group = group;
  peopleDragState.sourceCard = card;
  peopleDragState.startX = event.clientX;
  peopleDragState.startY = event.clientY;
  peopleDragState.lastX = event.clientX;
  peopleDragState.lastY = event.clientY;
  const rect = card.getBoundingClientRect();
  peopleDragState.offsetX = event.clientX - rect.left;
  peopleDragState.offsetY = event.clientY - rect.top;
  peopleDragState.dragging = false;
  peopleDragState.placeBefore = true;
}

function updatePeopleDrag(event) {
  if (peopleDragState.pointerId == null) return;
  const eventPointerId = event.pointerId ?? peopleDragState.pointerId;
  if (eventPointerId !== peopleDragState.pointerId) return;
  const sourceCard = peopleDragState.sourceCard;
  if (!sourceCard) return;
  const moved = Math.abs(event.clientX - peopleDragState.startX) + Math.abs(event.clientY - peopleDragState.startY);
  if (!peopleDragState.dragging && moved > 10) {
    peopleDragState.dragging = true;
    const rect = sourceCard.getBoundingClientRect();
    peopleDragState.placeholder = document.createElement("div");
    peopleDragState.placeholder.className = "person-card person-card-placeholder";
    peopleDragState.placeholder.setAttribute("aria-hidden", "true");
    peopleDragState.placeholder.style.height = `${rect.height}px`;
    sourceCard.parentElement?.insertBefore(peopleDragState.placeholder, sourceCard);
    const ghost = sourceCard.cloneNode(true);
    ghost.classList.add("is-dragging", "person-card-drag-ghost");
    ghost.removeAttribute("data-testid");
    ghost.removeAttribute("data-person-card");
    ghost.removeAttribute("data-person-id");
    ghost.removeAttribute("data-person-group");
    ghost.removeAttribute("data-person-status");
    ghost.setAttribute("aria-hidden", "true");
    ghost.setAttribute("data-testid", "people-drag-ghost");
    ghost.querySelectorAll("[id]").forEach(node => node.removeAttribute("id"));
    ghost.querySelectorAll("[tabindex]").forEach(node => node.removeAttribute("tabindex"));
    Object.assign(ghost.style, {
      position: "fixed",
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      zIndex: "90",
      pointerEvents: "none",
      margin: "0"
    });
    document.body.appendChild(ghost);
    peopleDragState.dragGhost = ghost;
    sourceCard.style.display = "none";
  }
  if (!peopleDragState.dragging) return;
  const dragCard = peopleDragState.dragGhost || sourceCard;
  peopleDragState.lastX = event.clientX;
  peopleDragState.lastY = event.clientY;
  dragCard.style.left = `${event.clientX - peopleDragState.offsetX}px`;
  dragCard.style.top = `${event.clientY - peopleDragState.offsetY}px`;
  const targetCard = findPersonCardAtPoint(peopleDragState.group, event.clientX, event.clientY, peopleDragState.personId);
  if (!targetCard || targetCard === sourceCard || targetCard.dataset.personGroup !== peopleDragState.group) return;
  const rect = targetCard.getBoundingClientRect();
  const sourceRect = dragCard.getBoundingClientRect();
  const cardsShareRow = Math.abs((sourceRect.top + sourceRect.height / 2) - (rect.top + rect.height / 2)) < Math.min(sourceRect.height, rect.height) / 2;
  const placeBefore = cardsShareRow
    ? event.clientX <= rect.left + rect.width / 2
    : event.clientY <= rect.top + rect.height / 2;
  const parent = targetCard.parentElement;
  if (!parent || !peopleDragState.placeholder) return;
  if (peopleDragState.placeholder.parentElement === parent) {
    parent.removeChild(peopleDragState.placeholder);
  }
  parent.insertBefore(peopleDragState.placeholder, placeBefore ? targetCard : targetCard.nextSibling);
  peopleDragState.targetCard = targetCard;
  peopleDragState.placeBefore = placeBefore;
}

function commitPeopleDrag() {
  if (!peopleDragState.dragging || !peopleDragState.sourceCard || !peopleDragState.group) {
    finishPeopleDrag();
    return false;
  }
  const sourceCard = peopleDragState.sourceCard;
  const placeholder = peopleDragState.placeholder;
  const group = peopleDragState.group;
  const sourceId = peopleDragState.personId;
  if (!placeholder?.parentElement) {
    finishPeopleDrag();
    return false;
  }
  placeholder.replaceWith(sourceCard);
  peopleDragState.placeholder = null;
  const grid = sourceCard.closest(`[data-people-group="${group}"]`);
  const ids = grid ? [...grid.querySelectorAll(":scope > [data-person-card]")].map(card => card.dataset.personId).filter(Boolean) : [];
  const defaults = peopleGroupDefaults(group);
  const byId = new Map(defaults.map(person => [personId(person), person]));
  const orderedPeople = ids.map(id => byId.get(id)).filter(Boolean);
  state.people = { ...state.people, orderMode: "custom", [personOrderKey(group)]: ids };
  save();
  setPeopleVisibleGroup(group, orderedPeople);
  const person = byId.get(sourceId);
  if (person) announcePeopleOrder(`${person.display_name || person.plex_username} moved to position ${ids.indexOf(sourceId) + 1} of ${ids.length} in ${personOrderLabel(group)}.`);
  finishPeopleDrag();
  return true;
}

function syncHeatmapActiveIndex(container, index) {
  const cells = [...container.querySelectorAll("[data-heatmap-cell]")];
  if (!cells.length) return null;
  const bounded = Math.max(0, Math.min(cells.length - 1, index));
  container.dataset.activeIndex = String(bounded);
  cells.forEach((cell, cellIndex) => cell.classList.toggle("is-active", cellIndex === bounded));
  const activeCell = cells[bounded];
  if (activeCell) {
    container.setAttribute("aria-activedescendant", activeCell.id);
    peopleHeatmapState.activeByPerson.set(container.dataset.personId || "", bounded);
  }
  return activeCell || null;
}

function resolveHeatmapCellFromTarget(target) {
  return target?.closest("[data-heatmap-cell]") || null;
}

function findPersonCardAtPoint(group, x, y, excludeId = "") {
  const cards = [...content.querySelectorAll(`[data-person-card][data-person-group="${group}"]`)].filter(card => card.dataset.personId !== excludeId);
  let bestCard = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const card of cards) {
    const rect = card.getBoundingClientRect();
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      return card;
    }
    const dx = rect.left + rect.width / 2 - x;
    const dy = rect.top + rect.height / 2 - y;
    const distance = Math.hypot(dx, dy);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestCard = card;
    }
  }
  return bestCard;
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
    people: ["People", "Included household members and their recent activity."],
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
  state.progress={recentlyActiveOffset:0,continueOffset:0,recentlyCompletedOffset:0,expandedProgress:""};
  save();
  render();
  loadGlobals();
});

form.addEventListener("reset",()=>setTimeout(()=>{
  state.filters={};
  state.offset=0;
  state.explorer={section:"",sort:"recent",offset:0,selected:""};
  state.progress={recentlyActiveOffset:0,continueOffset:0,recentlyCompletedOffset:0,expandedProgress:""};
  save();
  render();
  loadGlobals();
},0));

content.addEventListener("click",async e=>{
  if (Date.now() < peopleDragState.ignoreClickUntil) {
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  const periodButton=e.target.closest("[data-people-period]");
  if(periodButton){
    const period=periodButton.dataset.peoplePeriod;
    state.people.period=period;
    if(period==="custom"&&(!state.people.dateFrom||!state.people.dateTo)){
      const end=new Date();
      const start=new Date(end.getTime()-29*24*60*60*1000);
      state.people.dateFrom=start.toISOString().slice(0,10);
      state.people.dateTo=end.toISOString().slice(0,10);
    }
    save();
    return render();
  }
  const peopleOrderMode = e.target.closest("[data-people-order-mode]");
  if (peopleOrderMode) {
    const mode = peopleOrderMode.dataset.peopleOrderMode;
    if (mode === "custom" || mode === "default") {
      state.people = {
        ...state.people,
        orderMode: mode,
        activeOrder: mode === "custom" ? (state.people.activeOrder || []) : state.people.activeOrder,
        secondaryOrder: mode === "custom" ? (state.people.secondaryOrder || []) : state.people.secondaryOrder
      };
      save();
      applyPeopleOrderPresentation();
      return;
    }
  }
  if (e.target.closest("[data-people-order-reset]")) {
    resetPeopleOrder();
    return;
  }
  const moveButton = e.target.closest("[data-person-move]");
  if (moveButton) {
    const card = moveButton.closest("[data-person-card]");
    if (!card) return;
    const group = card.dataset.personGroup || "active";
    const groupPeople = (group === "secondary" ? (peopleHeatmapState.secondaryVisible || []) : (peopleHeatmapState.activeVisible || [])).slice();
    if (!groupPeople.find(person => personId(person) === String(moveButton.dataset.personId || ""))) return;
    movePeopleCard(group, groupPeople, moveButton.dataset.personId || "", moveButton.dataset.personMove === "earlier" ? -1 : 1);
    return;
  }
  const customApply=e.target.closest("[data-people-custom-apply]");
  if(customApply){
    const from=content.querySelector("[data-people-date-from]")?.value||"";
    const to=content.querySelector("[data-people-date-to]")?.value||"";
    const error=content.querySelector(".people-date-error");
    if(!from||!to||from>to){if(error)error.textContent="Choose a From date on or before the To date.";return;}
    state.people={...state.people,period:"custom",dateFrom:from,dateTo:to};
    save();
    return render();
  }
  const libraryItem=e.target.closest("[data-library-item]");
  if(libraryItem){
    const item=JSON.parse(decodeURIComponent(libraryItem.dataset.libraryItem));
    state.explorer.selected=item.groupKey;
    return render();
  }
  const progressExpand=e.target.closest("[data-progress-expand]");
  if(progressExpand){
    e.preventDefault();
    e.stopPropagation();
    const groupKey=progressExpand.dataset.progressExpand;
    state.progress.expandedProgress=state.progress.expandedProgress===groupKey?"":groupKey;
    updateProgressRoute(true);
    await syncProgressExpansionFromState();
    return;
  }
  const progressCard=e.target.closest("[data-progress-card]");
  const progressDetailItem=e.target.closest(".progress-node[data-item]");
  if(progressCard && !progressDetailItem){
    e.preventDefault();
    const groupKey=progressCard.dataset.progressCard;
    const collapseCurrent=state.progress.expandedProgress===groupKey&&progressCard.classList.contains("is-expanded");
    state.progress.expandedProgress=collapseCurrent?"":groupKey;
    updateProgressRoute(true);
    await syncProgressExpansionFromState(state.progress.expandedProgress ? progressCard : null);
    return;
  }
  const item=e.target.closest("[data-item]");
  if(item)return openDetail(JSON.parse(decodeURIComponent(item.dataset.item)));
  const routeButton=e.target.closest("[data-route]");
  if(routeButton){
    applyRoute(JSON.parse(decodeURIComponent(routeButton.dataset.route)));
    return;
  }
  const heatmapCell = e.target.closest("[data-heatmap-cell]");
  if (heatmapCell) {
    showHeatmapPopover(heatmapCell, e);
    return;
  }
  const page=e.target.closest("[data-page]");
  if(page){
    if(state.layout==="timeline"){
      state.timeline.offset=Math.max(0,state.timeline.offset+(page.dataset.page==="next"?50:-50));
    } else {
      state.offset=Math.max(0,state.offset+(page.dataset.page==="next"?50:-50));
    }
    return render();
  }
  const progressPage = e.target.closest("[data-progress-page]");
  if (progressPage) {
    const [key, dir] = progressPage.dataset.progressPage.split(":");
    const offsetKey = key + "Offset";
    const step = 6;
    if (dir === "next") {
      state.progress[offsetKey] += step;
    } else {
      state.progress[offsetKey] = Math.max(0, state.progress[offsetKey] - step);
    }
    save();
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
  const reviewDecision=e.target.closest("[data-review-decision]");
  if(reviewDecision){
    const card=reviewDecision.closest("[data-candidate-id]");
    const decision=reviewDecision.dataset.reviewDecision;
    if(!card||!confirm(`Apply ${decision.replace("_"," ")} to this co-watch review?`))return;
    const requestId=globalThis.crypto?.randomUUID?.()||`web-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const response=await fetch(`/api/dashboard/cowatch-reviews/${card.dataset.candidateId}/decision`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({decision,apply:true,confirm:true,requestId})});
    const result=await response.json();
    if(!response.ok||!result.ok)alert(result.message||"Review action failed");
    return render();
  }
  const reviewDiscord=e.target.closest("[data-review-discord]");
  if(reviewDiscord){
    const card=reviewDiscord.closest("[data-candidate-id]");
    if(!card||!confirm("Send this co-watch review to Discord?"))return;
    const pendingState=Object.assign(document.createElement("span"),{className:"review-prompt-state",textContent:"Discord: queuing"});
    reviewDiscord.replaceWith(pendingState);
    const requestId=globalThis.crypto?.randomUUID?.()||`web-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const response=await fetch(`/api/dashboard/cowatch-reviews/${card.dataset.candidateId}/ask-discord`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({apply:true,confirm:true,requestId})});
    const result=await response.json();
    if(!response.ok||!result.ok){alert(result.message||"Discord review could not be queued");await render();return;}
    pendingState.textContent=`Discord: ${result.data?.status||"pending"}`;
    const operationsList=content.querySelector(".operations-list");
    if(operationsList){
      const row=document.createElement("article");
      row.className="operation-row";
      row.dataset.testid="operation-row";
      row.innerHTML=`<div><strong>Discord co-watch review</strong><p>Review queued for Discord delivery.</p><small>${esc(result.data?.status||"pending")}</small></div>`;
      operationsList.prepend(row);
    }
    return;
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

content.addEventListener("pointerdown", e => {
  const handle = e.target.closest("[data-person-drag-handle]");
  if (handle) {
    if (state.people.orderMode !== "custom") return;
    beginPeopleDrag(handle, e);
    e.preventDefault();
    try { handle.setPointerCapture(e.pointerId); } catch {}
    return;
  }
  const heatmapCell = resolveHeatmapCellFromTarget(e.target);
  if (heatmapCell) {
    showHeatmapPopover(heatmapCell, e);
  }
});

content.addEventListener("pointermove", e => {
  const heatmapCell = resolveHeatmapCellFromTarget(e.target);
  if (heatmapCell) {
    showHeatmapPopover(heatmapCell, e);
  }
});

document.addEventListener("pointermove", e => {
  updatePeopleDrag(e);
});

document.addEventListener("pointerup", e => {
  if (peopleDragState.pointerId !== null && (e.pointerId == null || e.pointerId === peopleDragState.pointerId)) {
    commitPeopleDrag();
  }
});

document.addEventListener("pointercancel", e => {
  if (peopleDragState.pointerId !== null && (e.pointerId == null || e.pointerId === peopleDragState.pointerId)) {
    finishPeopleDrag();
  }
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
    return;
  }
  if((e.key==="Enter"||e.key===" ")&&e.target.matches("[data-progress-card]")){
    e.preventDefault();
    const groupKey=e.target.dataset.progressCard;
    const collapseCurrent=state.progress.expandedProgress===groupKey&&e.target.classList.contains("is-expanded");
    state.progress.expandedProgress=collapseCurrent?"":groupKey;
    updateProgressRoute(true);
    syncProgressExpansionFromState(state.progress.expandedProgress ? e.target : null);
    return;
  }
  const heatmapContainer = e.target.closest("[data-person-heatmap]");
  if (heatmapContainer) {
    const cells = [...heatmapContainer.querySelectorAll("[data-heatmap-cell]")];
    if (!cells.length) return;
    const activeIndex = Number(heatmapContainer.dataset.activeIndex || 0);
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.min(cells.length - 1, activeIndex + 1);
      syncHeatmapActiveIndex(heatmapContainer, next);
      showHeatmapPopover(cells[next], e);
      return;
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.max(0, activeIndex - 1);
      syncHeatmapActiveIndex(heatmapContainer, next);
      showHeatmapPopover(cells[next], e);
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      syncHeatmapActiveIndex(heatmapContainer, 0);
      showHeatmapPopover(cells[0], e);
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      const last = cells.length - 1;
      syncHeatmapActiveIndex(heatmapContainer, last);
      showHeatmapPopover(cells[last], e);
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      showHeatmapPopover(cells[activeIndex], e);
    }
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

content.addEventListener("focusin", e => {
  const heatmapContainer = e.target.closest("[data-person-heatmap]");
  if (!heatmapContainer) return;
  const cells = [...heatmapContainer.querySelectorAll("[data-heatmap-cell]")];
  if (!cells.length) return;
  const activeIndex = Number(heatmapContainer.dataset.activeIndex || 0);
  syncHeatmapActiveIndex(heatmapContainer, activeIndex);
  showHeatmapPopover(cells[activeIndex], e);
});

content.addEventListener("focusout", e => {
  if (e.target.closest("[data-person-heatmap]")) {
    if (e.relatedTarget?.closest?.("[data-testid='people-heatmap-popover']")) return;
    setTimeout(() => {
      const activeElement = document.activeElement;
      const focusRemainsInHeatmapUi = activeElement?.closest?.("[data-person-heatmap], [data-testid='people-heatmap-popover']");
      if (!content.contains(activeElement) || !focusRemainsInHeatmapUi) {
        hideHeatmapPopover();
      }
    }, 0);
  }
});

content.addEventListener("mouseleave", e => {
  if (e.target === content || e.target.closest(".person-heatmap")) {
    hideHeatmapPopover();
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

