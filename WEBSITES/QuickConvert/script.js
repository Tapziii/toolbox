document.addEventListener('DOMContentLoaded', () => {
    const inputTop = document.getElementById('input-top');
    const inputBottom = document.getElementById('input-bottom');
    const selectTop = document.getElementById('select-top');
    const selectBottom = document.getElementById('select-bottom');
    const swapBtn = document.getElementById('swap-btn');
    const statusText = document.getElementById('status-text');
    const tabBtns = document.querySelectorAll('.tab-btn');

    let currentCategory = 'currency';
    let lastActiveInput = 'top'; 

    const categories = {
        currency: {
            units: { "USD": "USD", "EUR": "EUR", "ILS": "ILS", "GBP": "GBP", "JPY": "JPY", "CAD": "CAD", "AUD": "AUD" },
            rates: {},
            convert: (val, from, to) => val * (categories.currency.rates[to] / categories.currency.rates[from])
        },
        weight: {
            metric: ["kg", "g"],
            imperial: ["lbs", "oz"],
            units: { "kg": "KG", "g": "G", "lbs": "LBS", "oz": "OZ" },
            rates: { "kg": 1, "g": 1000, "lbs": 2.20462, "oz": 35.274 },
            convert: (val, from, to) => val * (categories.weight.rates[to] / categories.weight.rates[from])
        },
        length: {
            metric: ["km", "m", "cm"],
            imperial: ["mi", "yd", "ft", "in"],
            units: { "km": "KM", "m": "M", "cm": "CM", "mi": "MI", "yd": "YD", "ft": "FT", "in": "IN" },
            rates: { "m": 1, "cm": 100, "km": 0.001, "in": 39.3701, "ft": 3.28084, "yd": 1.09361, "mi": 0.000621371 },
            convert: (val, from, to) => val * (categories.length.rates[to] / categories.length.rates[from])
        },
        temp: {
            metric: ["c"],
            imperial: ["f"],
            units: { "c": "°C", "f": "°F" }, // Removed Kelvin as it's rarely used day-to-day
            convert: (val, from, to) => {
                let celsius = val;
                if (from === "f") celsius = (val - 32) * 5/9;
                
                if (to === "c") return celsius;
                if (to === "f") return (celsius * 9/5) + 32;
            }
        },
        speed: {
            metric: ["kmh"],
            imperial: ["mph", "kn"],
            units: { "kmh": "KM/H", "mph": "MPH", "kn": "KNOTS" },
            rates: { "kmh": 1, "mph": 0.621371, "kn": 0.539957 },
            convert: (val, from, to) => val * (categories.speed.rates[to] / categories.speed.rates[from])
        },
        time: {
            metric: ["ms", "s", "min", "h", "d", "wk", "mo", "yr"],
            imperial: ["ms", "s", "min", "h", "d", "wk", "mo", "yr"],
            units: { "ms": "Milliseconds", "s": "Seconds", "min": "Minutes", "h": "Hours", "d": "Days", "wk": "Weeks", "mo": "Months", "yr": "Years" },
            rates: { "ms": 1, "s": 1000, "min": 60000, "h": 3600000, "d": 86400000, "wk": 604800000, "mo": 2629800000, "yr": 31557600000 },
            convert: (val, from, to) => val * (categories.time.rates[from] / categories.time.rates[to])
        },
        timezone: {
            metric: ["utc", "pst", "cst", "est", "cet", "israel"],
            imperial: ["utc", "pst", "cst", "est", "cet", "israel"],
            units: { 
                "utc": "GMT/UTC", "pst": "Pacific (PST)", "cst": "Central (CST)", "est": "Eastern (EST)", "cet": "Central Europe", "israel": "Israel" 
            },
            rates: { 
                "utc": 0, "pst": -8, "cst": -6, "est": -5, "cet": 1, "israel": 2
            },
            convert: (val, from, to) => {
                if (!val) return "";
                // val is "HH:MM"
                let [h, m] = val.split(':').map(Number);
                
                let dstOffset = document.getElementById('dst-toggle').checked ? 1 : 0;
                
                let fromRate = categories.timezone.rates[from];
                if (from !== 'utc') fromRate += dstOffset;
                
                let toRate = categories.timezone.rates[to];
                if (to !== 'utc') toRate += dstOffset;
                
                // Convert to UTC first
                let utcHours = h - fromRate;
                
                // Convert to Target
                let targetHours = utcHours + toRate;
                
                // Handle India's 0.5 hour offset
                let extraMinutes = (targetHours % 1) * 60;
                targetHours = Math.floor(targetHours);
                m += extraMinutes;
                
                if (m >= 60) {
                    m -= 60;
                    targetHours += 1;
                } else if (m < 0) {
                    m += 60;
                    targetHours -= 1;
                }
                
                // Wrap around 24 hours
                targetHours = ((targetHours % 24) + 24) % 24;
                
                return `${String(targetHours).padStart(2, '0')}:${String(Math.round(m)).padStart(2, '0')}`;
            }
        }
    };

    // Load Currency Data via ultra-reliable CDN
    async function loadCurrencyRates() {
        try {
            const cached = localStorage.getItem('quickconvert_rates');
            const cachedDate = localStorage.getItem('quickconvert_date');
            const today = new Date().toISOString().split('T')[0];

            if (cached && cachedDate === today) {
                setupCurrency(JSON.parse(cached));
                statusText.textContent = `Rates updated today.`;
            } else {
                const res = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json');
                if (!res.ok) throw new Error('API Error');
                const data = await res.json();
                
                // Convert all keys to uppercase
                const rates = {};
                for (const [key, value] of Object.entries(data.usd)) {
                    rates[key.toUpperCase()] = value;
                }
                
                localStorage.setItem('quickconvert_rates', JSON.stringify(rates));
                localStorage.setItem('quickconvert_date', today);
                
                setupCurrency(rates);
                statusText.textContent = `Live rates fetched today.`;
            }
        } catch (e) {
            console.error(e);
            const cached = localStorage.getItem('quickconvert_rates');
            if (cached) {
                setupCurrency(JSON.parse(cached));
                statusText.textContent = `Using offline cached rates.`;
            } else {
                statusText.textContent = `Failed to load currency rates.`;
            }
        }
    }

    function setupCurrency(rates) {
        categories.currency.rates = rates;
        if (currentCategory === 'currency') {
            doConversion(); // Trigger conversion if they already typed something
        }
    }

    function updateBottomSelectOptions() {
        if (currentCategory === 'currency') return; // Currency allows any-to-any
        
        const cat = categories[currentCategory];
        const topVal = selectTop.value;
        const isTopMetric = cat.metric.includes(topVal);
        
        // If Top is Metric, Bottom MUST be Imperial. And vice versa.
        const allowedBottomKeys = isTopMetric ? cat.imperial : cat.metric;
        
        const currentBottomVal = selectBottom.value;
        selectBottom.innerHTML = '';
        
        allowedBottomKeys.forEach(k => {
            const opt = document.createElement('option');
            opt.value = k;
            opt.textContent = getLabel(currentCategory, k);
            selectBottom.appendChild(opt);
        });
        
        // Preserve selection if possible, otherwise pick first
        if (allowedBottomKeys.includes(currentBottomVal)) {
            selectBottom.value = currentBottomVal;
        } else {
            selectBottom.value = allowedBottomKeys[0];
        }
        
        syncCustomSelect(selectBottom);
    }

    function populateSelects(category) {
        const cat = categories[category];
        const keys = Object.keys(cat.units);
        
        selectTop.innerHTML = '';
        selectBottom.innerHTML = '';
        
        keys.forEach(k => {
            const opt1 = document.createElement('option');
            opt1.value = k;
            opt1.textContent = getLabel(category, k);
            selectTop.appendChild(opt1);

            if (category === 'currency') {
                const opt2 = document.createElement('option');
                opt2.value = k;
                opt2.textContent = getLabel(category, k);
                selectBottom.appendChild(opt2);
            }
        });

        if (category === 'currency') {
            selectTop.value = "USD";
            selectBottom.value = "EUR";
        } else {
            // Set logical defaults
            selectTop.value = cat.metric[0];
            updateBottomSelectOptions();
        }

        syncCustomSelect(selectTop);
        syncCustomSelect(selectBottom);

        doConversion();
    }

    function doConversion() {
        if (!inputTop.value && !inputBottom.value) return;

        const cat = categories[currentCategory];
        const from = selectTop.value;
        const to = selectBottom.value;

        // If currency rates aren't loaded yet, abort to prevent NaN
        if (currentCategory === 'currency' && !cat.rates[to]) return;

        if (lastActiveInput === 'top') {
            if (currentCategory === 'timezone') {
                inputBottom.value = cat.convert(inputTop.value, from, to);
                return;
            }
            const val = parseFloat(inputTop.value);
            if (isNaN(val)) {
                inputBottom.value = '';
                return;
            }
            let res = cat.convert(val, from, to);
            inputBottom.value = formatResult(res);
        } else {
            if (currentCategory === 'timezone') {
                inputTop.value = cat.convert(inputBottom.value, to, from);
                return;
            }
            const val = parseFloat(inputBottom.value);
            if (isNaN(val)) {
                inputTop.value = '';
                return;
            }
            let res = cat.convert(val, to, from);
            inputTop.value = formatResult(res);
        }
    }

    function formatResult(num) {
        if (currentCategory === 'currency') return num.toFixed(2);
        return Math.round(num * 10000) / 10000;
    }

    // Event Listeners
    inputTop.addEventListener('input', () => { lastActiveInput = 'top'; doConversion(); });
    inputBottom.addEventListener('input', () => { lastActiveInput = 'bottom'; doConversion(); });

    selectTop.addEventListener('change', () => { 
        if (currentCategory !== 'currency') updateBottomSelectOptions();
        lastActiveInput = 'top'; 
        doConversion(); 
    });
    
    selectBottom.addEventListener('change', () => { 
        lastActiveInput = 'top'; 
        doConversion(); 
    });

    let currentRotation = 0;
    swapBtn.addEventListener('click', () => {
        // Continuous rotation
        currentRotation += 180;
        swapBtn.style.setProperty('--rotation', `${currentRotation}deg`);
        
        const tempTopVal = inputTop.value;
        inputTop.value = inputBottom.value;
        inputBottom.value = tempTopVal;

        if (currentCategory === 'currency') {
            const tempSel = selectTop.value;
            selectTop.value = selectBottom.value;
            selectBottom.value = tempSel;
        } else {
            // For scales, swapping means changing top to whatever bottom was, 
            // which flips the Metric/Imperial state, then bottom automatically adopts the other scale.
            const previousBottomUnit = selectBottom.value;
            const previousTopUnit = selectTop.value;
            
            selectTop.value = previousBottomUnit;
            updateBottomSelectOptions();
            selectBottom.value = previousTopUnit;
        }

        lastActiveInput = 'top';
        syncCustomSelect(selectTop);
        syncCustomSelect(selectBottom);
        doConversion();
    });

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentCategory = btn.dataset.category;
            populateSelects(currentCategory);
            
            if (currentCategory === 'timezone') {
                inputTop.type = 'time';
                inputBottom.type = 'time';
                document.getElementById('dst-container').style.display = 'flex';
            } else {
                inputTop.type = 'number';
                inputBottom.type = 'number';
                document.getElementById('dst-container').style.display = 'none';
            }
            
            if (currentCategory !== 'currency') {
                statusText.textContent = `${currentCategory.charAt(0).toUpperCase() + currentCategory.slice(1)} Conversion`;
            } else {
                statusText.textContent = `Using live exchange rates.`;
            }
        });
    });

    // Auto-detect DST based on user's system time (standard approach)
    function isDST() {
        const date = new Date();
        const jan = new Date(date.getFullYear(), 0, 1).getTimezoneOffset();
        const jul = new Date(date.getFullYear(), 6, 1).getTimezoneOffset();
        return date.getTimezoneOffset() < Math.max(jan, jul);
    }
    const dstToggle = document.getElementById('dst-toggle');
    dstToggle.checked = isDST();
    
    function getLabel(category, key) {
        let text = categories[category].units[key];
        if (category === 'timezone') {
            let offset = categories.timezone.rates[key];
            let dstOffset = dstToggle.checked && key !== 'utc' ? 1 : 0;
            offset += dstOffset;
            let sign = offset >= 0 ? '+' : '';
            text = `${text} (${sign}${offset})`;
        }
        return text;
    }

    dstToggle.addEventListener('change', () => {
        if (currentCategory === 'timezone') {
            [selectTop, selectBottom].forEach(sel => {
                Array.from(sel.options).forEach(opt => {
                    opt.textContent = getLabel('timezone', opt.value);
                });
                syncCustomSelect(sel);
            });
        }
        doConversion();
    });

    // Initialize
    populateSelects('currency');
    loadCurrencyRates();

    function syncCustomSelect(selectEl) {
        let container = selectEl.nextElementSibling;
        
        // Create the custom UI if it doesn't exist
        if (!container || !container.classList.contains('custom-select-container')) {
            container = document.createElement('div');
            container.className = 'custom-select-container';
            
            const display = document.createElement('div');
            display.className = 'custom-select-display';
            
            const options = document.createElement('div');
            options.className = 'custom-select-options';
            
            container.appendChild(display);
            container.appendChild(options);
            selectEl.parentNode.insertBefore(container, selectEl.nextSibling);
            
            // Toggle options
            display.addEventListener('click', (e) => {
                e.stopPropagation();
                // Close others
                document.querySelectorAll('.custom-select-options').forEach(o => {
                    if (o !== options) o.classList.remove('show');
                });
                options.classList.toggle('show');
            });
            
            // Close on click outside
            document.addEventListener('click', () => {
                options.classList.remove('show');
            });
        }
        
        const display = container.querySelector('.custom-select-display');
        const optionsPanel = container.querySelector('.custom-select-options');
        
        // Build options
        optionsPanel.innerHTML = '';
        Array.from(selectEl.options).forEach(opt => {
            const optionEl = document.createElement('div');
            optionEl.className = 'custom-select-option';
            optionEl.textContent = opt.textContent;
            if (opt.value === selectEl.value) {
                optionEl.classList.add('selected');
                display.textContent = opt.textContent;
            }
            
            optionEl.addEventListener('click', (e) => {
                e.stopPropagation();
                selectEl.value = opt.value;
                selectEl.dispatchEvent(new Event('change'));
                optionsPanel.classList.remove('show');
                syncCustomSelect(selectEl);
            });
            
            optionsPanel.appendChild(optionEl);
        });
    }

});


