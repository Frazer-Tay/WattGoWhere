document.addEventListener('DOMContentLoaded', () => {
    // --- Configuration ---
    const RETAILERS_JSON_PATH = 'data/retailers.json';
    const MAP_CENTER = [1.3521, 103.8198]; // Singapore
    const INITIAL_ZOOM = 11;
    const MARKER_FLY_TO_ZOOM = 16;
    const USER_LOCATION_ZOOM = 14;
    const APP_NAME = "WattUseWhere";

    // --- DOM Elements ---
    const searchInput = document.getElementById('search-input');
    const categoryCheckboxes = document.querySelectorAll('.category-filters input[type="checkbox"]');
    const retailerListDiv = document.getElementById('retailer-list');
    const resultsCountSpan = document.getElementById('results-count');
    const mapElement = document.getElementById('map');
    const findMeButton = document.getElementById('find-me-btn');
    const locationStatusSpan = document.getElementById('location-status');
    const mapLoader = document.getElementById('map-loader');

    // --- State ---
    let allRetailers = [];
    let map = null;
    let markersLayer = null;
    let retailerMarkers = {}; // { 'markerId': marker }
    let userLocationMarker = null;
    let isMapReady = false;
    let isDataLoading = false;

    // --- Initialization ---
    function initApp() {
        console.log(`[${APP_NAME}] Initializing...`);
        updatePlaceholder(); // Set initial placeholder based on state
        if (!navigator.geolocation) {
            findMeButton.disabled = true; findMeButton.title = "Geolocation not supported"; console.warn(`[${APP_NAME}] Geolocation not supported.`);
        }
        initMap(); fetchRetailers();
    }

    // --- Map Initialization ---
    async function initMap() {
        if (!mapElement) { console.error(`[${APP_NAME}] #map missing!`); showError("Cannot load map display."); return; }
        if (typeof L !== 'object' || !L.map) { console.error(`[${APP_NAME}] Leaflet lib missing!`); showError("Map library error. Refresh required."); return; }
        if (mapLoader) mapLoader.classList.add('is-loading');

        try {
            map = L.map(mapElement, { zoomControl: true, preferCanvas: true }).setView(MAP_CENTER, INITIAL_ZOOM);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© <a href="https://osm.org/copyright" target="_blank" rel="noopener">OSM</a>' }).addTo(map);
            markersLayer = L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 45, disableClusteringAtZoom: 17, spiderfyOnMaxZoom: true });
            map.addLayer(markersLayer);
            L.control.scale({ imperial: false }).addTo(map);
            isMapReady = true; console.log(`[${APP_NAME}] Map ready.`);
            if (mapLoader) mapLoader.classList.remove('is-loading');
            if (allRetailers.length > 0 && !isDataLoading) filterAndRenderRetailers(); else updatePlaceholder();
        } catch (error) {
            console.error(`[${APP_NAME}] Map init error:`, error); if (mapLoader) mapLoader.classList.remove('is-loading');
            showError("Failed to initialize the map."); if (mapElement) mapElement.innerHTML = '<p class="list-placeholder error-placeholder">⚠️ Map Load Error</p>'; isMapReady = false;
        }
    }

    // --- Data Fetching ---
    async function fetchRetailers() {
        if (isDataLoading) return; isDataLoading = true; setLoadingState(true); updateLocationStatus('', 'info');
        try {
            const response = await fetch(RETAILERS_JSON_PATH);
            if (!response.ok) throw new Error(`HTTP ${response.status}`); const data = await response.json(); if (!Array.isArray(data)) throw new Error("Invalid data format");
            const rawCount = data.length;
            allRetailers = data.filter(r => r?.latitude && r?.longitude && r?.retailOutlet).map(r => ({ sN: r.sN, retailOutlet: String(r.retailOutlet || '').trim(), outletAddress: String(r.outletAddress || 'Address unavailable').trim(), latitude: r.latitude, longitude: r.longitude, website: (r.website && String(r.website).trim().match(/^https?:\/\/.+/i)) ? String(r.website).trim() : null, remarks: r.remarks ? String(r.remarks).trim() : null, sellsMajorAppliances: r.sellsMajorAppliances === 'Y', sellsFansLighting: r.sellsFansLighting === 'Y', sellsWaterFittingsSanitary: r.sellsWaterFittingsSanitary === 'Y', sellsHpWaterHeater: r.sellsHpWaterHeater === 'Y' }));
            const validCount = allRetailers.length; console.log(`[${APP_NAME}] Processed ${validCount} retailers.` + (rawCount - validCount > 0 ? ` Skipped ${rawCount - validCount}.` : ''));
        } catch (error) { console.error(`[${APP_NAME}] Data error:`, error); showError(`Load Error: ${error.message}`); allRetailers = []; resultsCountSpan.textContent = '0'; }
        finally { isDataLoading = false; setLoadingState(false); if (isMapReady) filterAndRenderRetailers(); updatePlaceholder(); }
    }

    // --- UI State & Feedback ---
    function setLoadingState(isLoading) { const shouldDisable = isLoading || !isMapReady; searchInput.disabled = shouldDisable; findMeButton.disabled = shouldDisable || !navigator.geolocation; categoryCheckboxes.forEach(cb => cb.disabled = shouldDisable); updatePlaceholder(); }
    function updatePlaceholder() { const hasItems = retailerListDiv.querySelector('.retailer-item'); const hasError = retailerListDiv.querySelector('.error-placeholder'); if (hasError) return; if (isDataLoading) setPlaceholderMessage("Loading retailer data...", false); else if (!isMapReady) setPlaceholderMessage("Loading map...", false); else if (!hasItems && allRetailers.length === 0) setPlaceholderMessage("No retailer data found. Check source or filters.", false); else if (!hasItems && allRetailers.length > 0) setPlaceholderMessage("No retailers match current filters.", false); else if (!hasItems) setPlaceholderMessage("Search or filter to find retailers.", false); }
    function setPlaceholderMessage(message, isError = false) { const listHasItems = retailerListDiv.querySelector('.retailer-item'); if (isError || !listHasItems) { const cls = isError ? "list-placeholder error-placeholder" : "list-placeholder"; retailerListDiv.innerHTML = `<p class="${cls}">${isError ? '⚠️ ' : ''}${message}</p>`; } }
    function showError(message) { setPlaceholderMessage(message, true); }
    function updateLocationStatus(message = '', type = 'info') { locationStatusSpan.textContent = message; locationStatusSpan.className = `location-status status-${type}`; }

    // --- Filtering Logic ---
    function getFilteredRetailers() { const searchTerm = searchInput.value.toLowerCase().trim(); const flags = {'filter-major':'sellsMajorAppliances','filter-fans-lights':'sellsFansLighting','filter-water':'sellsWaterFittingsSanitary','filter-hp-water-heater':'sellsHpWaterHeater'}; const activeKeys = Array.from(categoryCheckboxes).filter(cb=>cb.checked).map(cb=>flags[cb.id]); return allRetailers.filter(r => { if (searchTerm && !(r.retailOutlet.toLowerCase().includes(searchTerm) || r.outletAddress.toLowerCase().includes(searchTerm))) return false; if (activeKeys.length > 0 && !activeKeys.every(k => r[k])) return false; return true; }); }

    // --- Rendering Logic ---
    function renderRetailers(retailersToDisplay) {
        if (!isMapReady || !markersLayer) { console.warn(`[${APP_NAME}] Render skipped: Map not ready.`); updatePlaceholder(); return; }
        retailerListDiv.innerHTML = ''; markersLayer.clearLayers(); retailerMarkers = {}; const count = retailersToDisplay.length; resultsCountSpan.textContent = count;
        if (count === 0) { updatePlaceholder(); return; }
        const frag = document.createDocumentFragment(); const markers = [];
        retailersToDisplay.forEach((r, idx) => { if (!r?.latitude || !r?.longitude) return; const id = r.sN ? `r-${r.sN}` : `r-idx-${idx}`; try { const item = createRetailerListItem(r); item.setAttribute('data-marker-id', id); item.setAttribute('tabindex', '0'); item.addEventListener('click', handleListItemClick); item.addEventListener('keydown', (e)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();handleListItemClick(e);}}); frag.appendChild(item); } catch (e) { console.error(`Err list item ${id}:`, e); } try { const pop = createPopupContent(r); const m = L.marker([r.latitude, r.longitude], { title: r.retailOutlet, alt: `Location of ${r.retailOutlet}` }).bindPopup(pop, { maxWidth: 280 }); retailerMarkers[id] = m; markers.push(m); } catch (e) { console.warn(`Err marker ${id}:`, e); } });
        retailerListDiv.appendChild(frag); if (markers.length > 0) { try { markersLayer.addLayers(markers); } catch (e) { console.error(`Err bulk add markers:`, e);} }
    }

    // --- Helper: Create List Item ---
    function createRetailerListItem(r) { const item = document.createElement('div'); item.className = 'retailer-item'; const addTxt=(p,t,c,x)=>{if(x){const e=document.createElement(t);if(c)e.className=c;e.textContent=x;p.appendChild(e);}}; addTxt(item,'h3','',r.retailOutlet); addTxt(item,'p','address',r.outletAddress); if (r.website) {const p=document.createElement('p');p.className='website';const a=document.createElement('a');a.href=r.website;a.target='_blank';a.rel='noopener noreferrer'; a.appendChild(document.createTextNode('Visit Website '));const i=document.createElement('i');i.className='bi bi-box-arrow-up-right';a.appendChild(i);p.appendChild(a);item.appendChild(p);} addTxt(item,'p','remarks',r.remarks); const cats=document.createElement('div');cats.className='categories'; const map={sellsMajorAppliances:"Appliances", sellsFansLighting:"Fans/Lights", sellsWaterFittingsSanitary:"Water/Sanitary", sellsHpWaterHeater:"HP Heater"}; let hasCats=false; Object.entries(map).forEach(([k,l])=>{if(r[k]){addTxt(cats,'span','',l);hasCats=true;}}); if(hasCats)item.appendChild(cats); return item; }

    // --- Helper: Create Popup Content ---
    function createPopupContent(r) { const esc=(s)=>s?String(s).replace(/&/g,"&").replace(/</g,"<").replace(/>/g,">"):""; let c=`<b>${esc(r.retailOutlet)}</b><br>${esc(r.outletAddress)}`; const map={sellsMajorAppliances:"Appliances", sellsFansLighting:"Fans/Lights", sellsWaterFittingsSanitary:"Water/Sanitary", sellsHpWaterHeater:"HP Heater"}; const sold=Object.entries(map).filter(([k,_])=>r[k]).map(([_,l])=>l); if(sold.length>0) c+=`<br><small>Sells: ${sold.join(', ')}</small>`; if(r.website) c+=`<br><a href="${esc(r.website)}" target="_blank" rel="noopener">Website <i class="bi bi-box-arrow-up-right"></i></a>`; c+=`<br><a href="https://www.google.com/maps/dir/?api=1&destination=${r.latitude},${r.longitude}" target="_blank" rel="noopener">Directions <i class="bi bi-pin-map-fill"></i></a>`; if(r.remarks) c+=`<br><i>Note: ${esc(r.remarks)}</i>`; return c; }

    // --- Event Handlers ---
    function handleFilterChange() { if (!isMapReady) return; filterAndRenderRetailers(); }
    function filterAndRenderRetailers() { const f = getFilteredRetailers(); renderRetailers(f); updateLocationStatus('', 'info'); }
    function handleListItemClick(event) { if(event.type==='keydown'&&!['Enter',' '].includes(event.key)) return; event.preventDefault(); const li=event.currentTarget; const id=li.getAttribute('data-marker-id'); const marker=retailerMarkers[id]; if(!marker||!map||!markersLayer) return; const prev=retailerListDiv.querySelector('.selected'); if(prev) prev.classList.remove('selected'); li.classList.add('selected'); li.scrollIntoView({behavior:'smooth',block:'nearest'}); console.log(`[${APP_NAME}] Focus map: ${id}`); markersLayer.zoomToShowLayer(marker, ()=>{ const ll=marker.getLatLng();const z=Math.max(map.getZoom(),MARKER_FLY_TO_ZOOM); map.flyTo(ll,z,{duration:0.4}); setTimeout(()=>{if(marker?.openPopup) marker.openPopup();},100); }); }

    // --- Geolocation ---
    function handleFindMeClick() { if (!isMapReady || !map) { updateLocationStatus('Map loading...', 'loading'); return; } if (!navigator.geolocation) { updateLocationStatus('Location N/A', 'error'); return; } updateLocationStatus('Requesting loc...', 'loading'); findMeButton.disabled = true; navigator.geolocation.getCurrentPosition( (pos)=>{ const{latitude:lat,longitude:lng,accuracy:acc}=pos.coords; console.log(`[${APP_NAME}] Geo OK: ${lat.toFixed(5)},${lng.toFixed(5)}±${acc.toFixed(0)}m`); updateLocationStatus('Plotting...', 'loading'); if(userLocationMarker)map.removeLayer(userLocationMarker);userLocationMarker=null; try {userLocationMarker=L.marker([lat,lng],{title:`Your Loc(Acc:~${acc.toFixed(0)}m)`,alt:"Your location",zIndexOffset:1000}).addTo(map).bindPopup(`<b>You are here</b><br>Acc:~${acc.toFixed(0)}m`).openPopup();}catch(e){console.error("Err user marker",e);updateLocationStatus('Map plot error.','error');findMeButton.disabled=false;return;} map.flyTo([lat,lng],USER_LOCATION_ZOOM,{duration:1.0}).once('moveend',()=>{updateLocationStatus('Map centered.','success');findMeButton.disabled=false;console.log(`[${APP_NAME}] Geo done.`);}); }, (err)=>{let m='Loc Error: ';switch(err.code){case 1:m+='Denied.';break;case 2:m+='Unavailable.';break;case 3:m+='Timeout.';break;default:m+=`Code ${err.code}`;}; console.error(`[${APP_NAME}] Geo Err: ${m}`,err);updateLocationStatus(m,'error');findMeButton.disabled=false;}, {enableHighAccuracy:false,timeout:8000,maximumAge:60000}); }

    // --- Start App ---
    initApp();

    // --- Attach Listeners ---
    searchInput.addEventListener('input', handleFilterChange); categoryCheckboxes.forEach(cb=>cb.addEventListener('change',handleFilterChange)); findMeButton.addEventListener('click', handleFindMeClick);
    console.log(`[${APP_NAME}] Setup complete.`);
}); // End DOMContentLoaded
