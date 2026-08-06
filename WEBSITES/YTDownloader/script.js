document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('download-form');
    const urlInput = document.getElementById('url');
    const qualitySelect = document.getElementById('quality');
    const submitBtn = document.getElementById('submit-btn');
    const btnText = document.getElementById('btn-text');
    const btnSpinner = document.getElementById('btn-spinner');
    
    const statusContainer = document.getElementById('status-container');
    const statusBadge = document.getElementById('status-badge');
    const statusText = document.getElementById('status-text');
    const progressContainer = document.getElementById('progress-container');
    const progressBar = document.getElementById('progress-bar');
    const downloadLink = document.getElementById('download-link');
    
    let pollInterval = null;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const url = urlInput.value.trim();
        if (!url) {
            showError("Please enter a valid YouTube URL");
            return;
        }

        // Set Loading State
        urlInput.disabled = true;
        qualitySelect.disabled = true;
        submitBtn.disabled = true;
        btnText.classList.add('hidden');
        btnSpinner.classList.remove('hidden');
        
        statusContainer.classList.remove('hidden');
        progressContainer.classList.remove('hidden');
        downloadLink.classList.add('hidden');
        
        statusBadge.className = 'status-badge loading';
        statusBadge.textContent = 'Please wait...';
        statusText.textContent = 'Initializing connection to server...';
        progressBar.style.width = '0%';
        
        if (pollInterval) clearInterval(pollInterval);

        try {
            const response = await fetch('/api/ytdl/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: url,
                    quality: qualitySelect.value
                })
            });

            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Failed to start download');
            }

            const downloadId = data.download_id;
            
            // Poll for progress every second
            pollInterval = setInterval(async () => {
                try {
                    const progRes = await fetch(`/api/ytdl/progress/${downloadId}`);
                    const progData = await progRes.json();
                    
                    if (progData.status === 'loading') {
                        progressBar.style.width = `${progData.progress}%`;
                        statusText.textContent = progData.message;
                    } else if (progData.status === 'success') {
                        clearInterval(pollInterval);
                        showSuccess(downloadId, progData.message);
                    } else if (progData.status === 'error') {
                        clearInterval(pollInterval);
                        showError(progData.message);
                    }
                } catch (err) {
                    // Ignore transient network errors during polling
                    console.error("Polling error:", err);
                }
            }, 1000);

        } catch (err) {
            showError(err.message);
        }
    });

    function showSuccess(downloadId, message) {
        urlInput.disabled = false;
        qualitySelect.disabled = false;
        submitBtn.disabled = false;
        btnText.classList.remove('hidden');
        btnSpinner.classList.add('hidden');
        
        statusBadge.className = 'status-badge success';
        statusBadge.textContent = 'Success!';
        statusText.textContent = message;
        progressBar.style.width = '100%';
        
        const fileUrl = `/api/ytdl/file/${downloadId}`;
        downloadLink.href = fileUrl;
        downloadLink.classList.remove('hidden');
        
        // Auto-trigger download
        const a = document.createElement('a');
        a.href = fileUrl;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    function showError(message) {
        urlInput.disabled = false;
        qualitySelect.disabled = false;
        submitBtn.disabled = false;
        btnText.classList.remove('hidden');
        btnSpinner.classList.add('hidden');
        
        statusBadge.className = 'status-badge error';
        statusBadge.textContent = 'Error';
        statusText.textContent = message;
        progressContainer.classList.add('hidden');
        downloadLink.classList.add('hidden');
        
        if (pollInterval) clearInterval(pollInterval);
    }
});
