/* ════════════════════════════════════════════════════════════
   eBay Deal Finder — Frontend Application Logic
   ════════════════════════════════════════════════════════════ */

(function () {
    "use strict";

    // ── DOM refs ──────────────────────────────────────────────
    const searchForm      = document.getElementById("searchForm");
    // Global pagination state
    let currentPage = 1;
    let hasMorePages = false;

    // Elements
    const searchInput     = document.getElementById("searchInput");
    const searchBtn       = document.getElementById("searchBtn");
    const heroSection     = document.getElementById("heroSection");
    const minPriceInput   = document.getElementById("minPrice");
    const maxPriceInput   = document.getElementById("maxPrice");
    const includeShipping = document.getElementById("includeShipping");
    const categorySel     = document.getElementById("categoryFilter");
    const conditionSel    = document.getElementById("conditionFilter");
    const formatSel       = document.getElementById("formatFilter");
    const sortSel         = document.getElementById("sortFilter");
    const marketplaceSel  = document.getElementById("marketplaceFilter");
    const displayCurrSel  = document.getElementById("displayCurrency");
    const excludeKwInput  = document.getElementById("excludeKwInput");
    const excludeKwList   = document.getElementById("excludeKwList");
    const excludeCtryInput= document.getElementById("excludeCtryInput");
    const excludeCtryList = document.getElementById("excludeCtryList");
    const currSymbol1     = document.getElementById("currencySymbol");
    const currSymbol2     = document.getElementById("currencySymbol2");
    const resultsCount    = document.getElementById("resultsCount");
    const resultStats     = document.getElementById("resultStats");
    const loader          = document.getElementById("loader");
    const errorMsg        = document.getElementById("errorMsg");
    const emptyState      = document.getElementById("emptyState");
    const noResults       = document.getElementById("noResults");
    const productGrid     = document.getElementById("productGrid");
    const paginationControls = document.getElementById("paginationControls");
    const prevPageBtn     = document.getElementById("prevPageBtn");
    const nextPageBtn     = document.getElementById("nextPageBtn");
    const pageIndicator   = document.getElementById("pageIndicator");
    
    // Preset elements
    const presetDropdown  = document.getElementById("presetDropdown");
    const savePresetBtn   = document.getElementById("savePresetBtn");
    const deletePresetBtn = document.getElementById("deletePresetBtn");

    let abortController   = null;
    let lastItems         = [];   // cache for client-side re-render on currency change

    const excludeKwTags = new Set();
    const excludeCtryTags = new Set();

    function setupTagInput(inputEl, listEl, tagsSet) {
        inputEl.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault(); // prevent form submit
                const val = inputEl.value.trim();
                if (val && !tagsSet.has(val)) {
                    tagsSet.add(val);
                    renderTags(listEl, tagsSet);
                }
                inputEl.value = "";
            }
        });
        
        listEl.addEventListener("click", (e) => {
            if (e.target.closest(".tag__close")) {
                const tag = e.target.closest(".tag").dataset.val;
                tagsSet.delete(tag);
                renderTags(listEl, tagsSet);
            }
        });
    }

    function renderTags(listEl, tagsSet) {
        listEl.innerHTML = Array.from(tagsSet).map(tag => `
            <span class="tag" data-val="${escapeAttr(tag)}">
                ${escapeHTML(tag)}
                <button type="button" class="tag__close">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                </button>
            </span>
        `).join("");
    }

    setupTagInput(excludeKwInput, excludeKwList, excludeKwTags);
    setupTagInput(excludeCtryInput, excludeCtryList, excludeCtryTags);

    // ── Approximate exchange rates (updated periodically) ─────
    // Rates relative to USD
    const RATES = {
        USD: 1,
        EUR: 0.92,
        GBP: 0.79,
        ILS: 3.65,
        AUD: 1.55,
        CAD: 1.37,
    };

    const CURRENCY_SYMBOLS = {
        USD: "$", EUR: "€", GBP: "£", ILS: "₪", AUD: "A$", CAD: "C$",
    };

    function convertPrice(amount, fromCurrency, toCurrency) {
        if (fromCurrency === toCurrency || !RATES[fromCurrency] || !RATES[toCurrency]) {
            return amount;
        }
        const usd = amount / RATES[fromCurrency];
        return usd * RATES[toCurrency];
    }

    function getDisplaySymbol(currency) {
        return CURRENCY_SYMBOLS[currency] || currency + " ";
    }

    // ── Event listeners ───────────────────────────────────────
    searchForm.addEventListener("submit", (e) => {
        e.preventDefault();
        runSearch();
    });

    // Filters no longer auto-search
    [categorySel, conditionSel, formatSel, sortSel, marketplaceSel, includeShipping].forEach((el) => {
        el.addEventListener("change", () => {
            currentPage = 1;
        });
    });

    searchBtn.addEventListener("click", () => {
        currentPage = 1;
        runSearch();
    });
    searchInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            currentPage = 1;
            runSearch();
        }
    });

    // Pagination buttons
    prevPageBtn.addEventListener("click", () => {
        if (currentPage > 1) {
            currentPage--;
            runSearch();
            window.scrollTo({ top: 0, behavior: "smooth" });
        }
    });

    nextPageBtn.addEventListener("click", () => {
        if (hasMorePages) {
            currentPage++;
            runSearch();
            window.scrollTo({ top: 0, behavior: "smooth" });
        }
    });

    marketplaceSel.addEventListener("change", () => {
        const val = marketplaceSel.value;
        let sym = "$";
        if (val === "EBAY_GB") sym = "£";
        else if (val === "EBAY_AU") sym = "A$";
        else if (val === "EBAY_CA") sym = "C$";
        else if (["EBAY_DE", "EBAY_FR", "EBAY_IT", "EBAY_ES"].includes(val)) sym = "€";
        currSymbol1.textContent = sym;
        currSymbol2.textContent = sym;
    });

    // Display currency change — just re-render, no new fetch
    displayCurrSel.addEventListener("change", () => {
        if (lastItems.length) renderItems(lastItems);
    });

    // ── Search ────────────────────────────────────────────────
    async function runSearch() {
        const query = searchInput.value.trim();
        if (!query) return;

        if (abortController) abortController.abort();
        abortController = new AbortController();

        heroSection.classList.add("compact");
        showLoader(true);
        showError(false);
        showEmpty(false);
        showNoResults(false);
        productGrid.innerHTML = "";
        resultStats.textContent = "";
        searchBtn.disabled = true;

        const params = new URLSearchParams({ q: query });
        const minP = minPriceInput.value;
        const maxP = maxPriceInput.value;
        if (minP) params.set("min_price", minP);
        if (maxP) params.set("max_price", maxP);
        if (includeShipping.checked) params.set("include_shipping", "true");
        params.set("category", categorySel.value);
        params.set("condition", conditionSel.value);
        params.set("sort", sortSel.value);
        params.set("marketplace", marketplaceSel.value);
        params.set("format", formatSel.value);
        params.set("page", currentPage);

        if (excludeKwTags.size > 0) {
            params.set("exclude_keywords", Array.from(excludeKwTags).join(","));
        }

        if (excludeCtryTags.size > 0) {
            params.set("exclude_countries", Array.from(excludeCtryTags).join(","));
        }

        try {
            const resp = await fetch(`/api/search?${params}`, {
                signal: abortController.signal,
            });
            const data = await resp.json();

            showLoader(false);
            searchBtn.disabled = false;

            if (data.error) {
                showError(true, data.error);
                return;
            }

            if (!data.items || data.items.length === 0) {
                showNoResults(true);
                resultStats.textContent = "0 results";
                lastItems = [];
                paginationControls.style.display = "none";
                return;
            }

            lastItems = data.items;
            hasMorePages = data.has_more;
            pageIndicator.textContent = `Page ${currentPage}`;
            prevPageBtn.disabled = currentPage === 1;
            nextPageBtn.disabled = !hasMorePages;
            paginationControls.style.display = "flex";

            const totalStr = data.total_ebay_results && data.total_ebay_results !== "Unknown" ? data.total_ebay_results : "Many";
            if (!hasMorePages && currentPage === 1) {
                // If there is only one page and no more pages, we know the exact total of filtered items!
                resultStats.innerHTML = `Found <strong>${data.items.length}</strong> relevant listings`;
            } else {
                resultStats.innerHTML = `Found <strong>${data.items.length}</strong> relevant listings on this page (out of ${totalStr} total)`;
            }
            renderItems(data.items);
        } catch (err) {
            if (err.name === "AbortError") return;
            showLoader(false);
            searchBtn.disabled = false;
            showError(true, "Network error — please try again.");
        }
    }

    // ── Render product cards ──────────────────────────────────
    function renderItems(items) {
        productGrid.innerHTML = "";
        const displayCurr = displayCurrSel.value;

        items.forEach((item, i) => {
            const card = document.createElement("a");
            card.className = "product-card";
            card.href = item.item_url;
            card.target = "_blank";
            card.rel = "noopener noreferrer";
            card.style.animationDelay = `${Math.min(i * 25, 500)}ms`;

            const badgeClass = getBadgeClass(item.condition);
            const condText = item.condition || "N/A";

            // Price conversion
            let priceVal = item.price;
            let priceCurr = item.currency || "USD";
            if (displayCurr !== "original" && displayCurr !== priceCurr) {
                priceVal = convertPrice(priceVal, priceCurr, displayCurr);
                priceCurr = displayCurr;
            }
            const priceSymbol = getDisplaySymbol(priceCurr);

            // Image
            const imgHTML = item.image_url
                ? `<img class="product-card__img" src="${escapeAttr(item.image_url)}" alt="${escapeAttr(item.title)}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'product-card__img-placeholder\\'>No image</div>'">`
                : `<div class="product-card__img-placeholder">No image</div>`;

            // Shipping badge
            let shippingHTML = "";
            if (item.shipping) {
                const isFree = item.shipping.toLowerCase() === "free";
                const cls = isFree ? "product-card__shipping product-card__shipping--free" : "product-card__shipping";
                shippingHTML = `<span class="${cls}">${isFree ? "Free shipping" : "+" + escapeHTML(item.shipping)}</span>`;
            }

            // Location
            let locationHTML = "";
            if (item.location) {
                locationHTML = `
                    <div class="product-card__meta-row">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
                            <circle cx="12" cy="10" r="3"/>
                        </svg>
                        ${escapeHTML(item.location)}
                    </div>`;
            }

            // Seller
            let sellerHTML = "";
            if (item.seller_name) {
                const fb = item.seller_feedback ? ` · ${escapeHTML(item.seller_feedback)}` : "";
                sellerHTML = `
                    <div class="product-card__meta-row">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                            <circle cx="12" cy="7" r="4"/>
                        </svg>
                        ${escapeHTML(item.seller_name)}${fb}
                    </div>`;
            }

            card.innerHTML = `
                <div class="product-card__img-wrap">
                    ${imgHTML}
                    <span class="product-card__badge ${badgeClass}">${escapeHTML(condText)}</span>
                </div>
                <div class="product-card__body">
                    <div class="product-card__title">${escapeHTML(item.title)}</div>
                    <div class="product-card__price-row">
                        <div class="product-card__price">${priceSymbol}${formatPrice(priceVal)}</div>
                        ${shippingHTML}
                    </div>
                    <div class="product-card__meta">
                        ${locationHTML}
                        ${sellerHTML}
                    </div>
                    <span class="product-card__link">
                        View on eBay
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M7 17L17 7M17 7H7M17 7v10"/>
                        </svg>
                    </span>
                </div>
            `;

            productGrid.appendChild(card);
        });
    }

    // ── Helpers ────────────────────────────────────────────────
    function getBadgeClass(cond) {
        if (!cond) return "badge--other";
        const c = cond.toLowerCase();
        if (c.includes("new"))    return "badge--new";
        if (c.includes("refurb")) return "badge--refurbished";
        if (c.includes("used") || c.includes("pre-owned") || c.includes("pre‑owned"))
            return "badge--used";
        if (c.includes("parts"))  return "badge--parts";
        return "badge--other";
    }

    function formatPrice(p) {
        const num = parseFloat(p);
        if (isNaN(num)) return "—";
        return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function escapeHTML(str) {
        const d = document.createElement("div");
        d.textContent = str || "";
        return d.innerHTML;
    }

    function escapeAttr(str) {
        return (str || "").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    function showLoader(on)          { loader.classList.toggle("active", on); }
    function showEmpty(on)           { emptyState.style.display = on ? "flex" : "none"; }
    function showNoResults(on)       { noResults.style.display  = on ? "flex" : "none"; }
    function showError(on, msg = "") {
        errorMsg.classList.toggle("active", on);
        errorMsg.textContent = msg;
    }

    // ── Presets Logic ─────────────────────────────────────────
    let currentPresets = {};

    async function fetchPresets() {
        try {
            const resp = await fetch("/api/presets");
            if (resp.ok) {
                currentPresets = await resp.json();
                renderPresetsDropdown();
            }
        } catch (e) {
            console.error("Failed to fetch presets", e);
        }
    }

    function renderPresetsDropdown() {
        const val = presetDropdown.value;
        presetDropdown.innerHTML = '<option value="">-- Load a Saved Preset --</option>';
        for (const name of Object.keys(currentPresets)) {
            const opt = document.createElement("option");
            opt.value = name;
            opt.textContent = name;
            presetDropdown.appendChild(opt);
        }
        if (currentPresets[val]) {
            presetDropdown.value = val;
            deletePresetBtn.style.display = "block";
        } else {
            presetDropdown.value = "";
            deletePresetBtn.style.display = "none";
        }
    }

    savePresetBtn.addEventListener("click", async () => {
        const name = prompt("Enter a name for this preset:");
        if (!name) return;

        const state = {
            query: searchInput.value.trim(),
            minPrice: minPriceInput.value,
            maxPrice: maxPriceInput.value,
            includeShipping: includeShipping.checked,
            category: categorySel.value,
            condition: conditionSel.value,
            sort: sortSel.value,
            marketplace: marketplaceSel.value,
            format: formatSel.value,
            excludeKeywords: Array.from(excludeKwTags),
            excludeCountries: Array.from(excludeCtryTags)
        };

        try {
            const resp = await fetch("/api/presets", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, state })
            });
            if (resp.ok) {
                const data = await resp.json();
                currentPresets = data.presets;
                renderPresetsDropdown();
                presetDropdown.value = name;
                deletePresetBtn.style.display = "block";
            }
        } catch (e) {
            alert("Failed to save preset");
        }
    });

    deletePresetBtn.addEventListener("click", async () => {
        const name = presetDropdown.value;
        if (!name || !confirm(`Delete preset "${name}"?`)) return;

        try {
            const resp = await fetch(`/api/presets/${encodeURIComponent(name)}`, { method: "DELETE" });
            if (resp.ok) {
                const data = await resp.json();
                currentPresets = data.presets;
                renderPresetsDropdown();
            }
        } catch (e) {
            alert("Failed to delete preset");
        }
    });

    presetDropdown.addEventListener("change", () => {
        const name = presetDropdown.value;
        if (!name || !currentPresets[name]) {
            deletePresetBtn.style.display = "none";
            return;
        }

        deletePresetBtn.style.display = "block";
        const state = currentPresets[name];

        searchInput.value = state.query || "";
        minPriceInput.value = state.minPrice || "";
        maxPriceInput.value = state.maxPrice || "";
        includeShipping.checked = state.includeShipping || false;
        categorySel.value = state.category || "all";
        conditionSel.value = state.condition || "all";
        sortSel.value = state.sort || "bestMatch";
        marketplaceSel.value = state.marketplace || "EBAY_US";
        formatSel.value = state.format || "all";

        excludeKwTags.clear();
        excludeCtryTags.clear();

        if (state.excludeKeywords) {
            state.excludeKeywords.forEach(kw => excludeKwTags.add(kw));
        }
        if (state.excludeCountries) {
            state.excludeCountries.forEach(ctry => excludeCtryTags.add(ctry));
        }

        // We can't reuse the raw renderTags wrapper because it's tightly scoped above.
        // I will just trigger the UI render directly:
        const kwList = document.getElementById("excludeKwList");
        const ctryList = document.getElementById("excludeCtryList");
        
        function renderTagsList(listEl, tagsSet) {
            listEl.innerHTML = "";
            tagsSet.forEach((val) => {
                const tagEl = document.createElement("span");
                tagEl.className = "tag";
                tagEl.innerHTML = `${val} <span class="tag-close" data-val="${val}">&times;</span>`;
                tagEl.querySelector(".tag-close").addEventListener("click", function() {
                    tagsSet.delete(this.dataset.val);
                    renderTagsList(listEl, tagsSet);
                });
                listEl.appendChild(tagEl);
            });
        }
        
        renderTagsList(kwList, excludeKwTags);
        renderTagsList(ctryList, excludeCtryTags);

        currentPage = 1;
        runSearch();
    });

    // Initialize
    fetchPresets();
})();
