const form = document.getElementById('shortener-form');
const longUrlInput = document.getElementById('long-url');
const shortenBtn = document.getElementById('shorten-btn');
const resultContainer = document.getElementById('result-container');
const shortUrlInput = document.getElementById('short-url');
const copyBtn = document.getElementById('copy-btn');
const historyList = document.getElementById('history-list');

// Load history from localStorage
let linkHistory = JSON.parse(localStorage.getItem('tapzi_history')) || [];

function renderHistory() {
    historyList.innerHTML = '';
    
    if (linkHistory.length === 0) {
        historyList.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.9rem;">No links created yet.</p>';
        return;
    }
    
    linkHistory.forEach(item => {
        const div = document.createElement('div');
        div.className = 'history-item';
        
        // The display URL is tap.zi/xyz, but the real URL to copy is window.location.origin + /s/xyz
        const displayUrl = `tap.zi/${item.shortId}`;
        const realUrl = `${window.location.origin}/s/${item.shortId}`;
        
        div.innerHTML = `
            <div class="history-details">
                <a href="${realUrl}" target="_blank" class="history-short">${displayUrl}</a>
                <div class="history-long" title="${item.longUrl}">${item.longUrl}</div>
            </div>
            <button class="history-copy" onclick="copyToClipboard('${realUrl}', this)" title="Copy Link">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="20" height="20">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                </svg>
            </button>
        `;
        historyList.appendChild(div);
    });
}

// Initial render
renderHistory();

// Handle form submission
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const url = longUrlInput.value.trim();
    if (!url) return;
    
    shortenBtn.disabled = true;
    shortenBtn.textContent = '...';
    
    try {
        const response = await fetch('/api/shorten', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Display tap.zi branding
            const displayUrl = `tap.zi/${data.short_id}`;
            const realUrl = `${window.location.origin}/s/${data.short_id}`;
            
            shortUrlInput.value = displayUrl;
            // Store the real URL in a data attribute for the copy button
            shortUrlInput.dataset.realUrl = realUrl;
            
            resultContainer.classList.remove('hidden');
            
            // Add to history (top of list)
            linkHistory.unshift({
                shortId: data.short_id,
                longUrl: data.url,
                date: new Date().toISOString()
            });
            
            // Keep only last 10
            if (linkHistory.length > 10) linkHistory.pop();
            
            localStorage.setItem('tapzi_history', JSON.stringify(linkHistory));
            renderHistory();
            
            longUrlInput.value = '';
        } else {
            alert(data.error || 'Failed to shorten URL');
        }
    } catch (err) {
        alert('An error occurred. Make sure the server is running.');
    } finally {
        shortenBtn.disabled = false;
        shortenBtn.textContent = 'Shorten';
    }
});

// Copy button for the main result
copyBtn.addEventListener('click', () => {
    const realUrl = shortUrlInput.dataset.realUrl;
    if (realUrl) {
        copyToClipboard(realUrl, copyBtn);
    }
});

// Helper for copying
window.copyToClipboard = function(text, btnElement) {
    navigator.clipboard.writeText(text).then(() => {
        const originalContent = btnElement.innerHTML;
        btnElement.innerHTML = '<span style="color: #4ade80; font-weight: bold; font-size: 0.9rem;">Copied!</span>';
        setTimeout(() => {
            btnElement.innerHTML = originalContent;
        }, 2000);
    });
};
