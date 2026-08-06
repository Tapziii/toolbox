document.addEventListener('DOMContentLoaded', () => {
    let myDeviceId = null;
    let targetDeviceId = null;
    let currentIncomingTransferId = null;
    let pendingOutgoingTransferId = null;

    const myDeviceNameEl = document.getElementById('my-device-name');
    const devicesListEl = document.getElementById('devices-list');
    const sendPanel = document.getElementById('send-panel');
    const targetDeviceNameEl = document.getElementById('target-device-name');
    const sendStatus = document.getElementById('send-status');
    const editNameBtn = document.getElementById('edit-name-btn');
    const editNameContainer = document.getElementById('edit-name-container');
    const nameInput = document.getElementById('name-input');
    const saveNameBtn = document.getElementById('save-name-btn');
    let pollingTimer = null;

    // Renaming logic
    editNameBtn.addEventListener('click', () => {
        nameInput.value = myDeviceNameEl.textContent;
        editNameContainer.classList.remove('hidden');
        document.querySelector('.device-identity').classList.add('hidden');
        nameInput.focus();
    });

    saveNameBtn.addEventListener('click', () => {
        const newName = nameInput.value.trim();
        if (newName && myDeviceId) {
            fetch('/api/filedrop/device/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ device_id: myDeviceId, name: newName })
            }).then(() => {
                localStorage.setItem('filedrop_name', newName);
                myDeviceNameEl.textContent = newName;
                editNameContainer.classList.add('hidden');
                document.querySelector('.device-identity').classList.remove('hidden');
            });
        }
    });

    // Register Device
    function registerDevice() {
        const storedId = localStorage.getItem('filedrop_id');
        const storedName = localStorage.getItem('filedrop_name');

        if (storedId && storedName) {
            myDeviceId = storedId;
            myDeviceNameEl.textContent = storedName;
            startPolling();
        } else {
            fetch('/api/filedrop/device/register', { method: 'POST' })
                .then(res => res.json())
                .then(data => {
                    myDeviceId = data.device_id;
                    localStorage.setItem('filedrop_id', myDeviceId);
                    localStorage.setItem('filedrop_name', data.name);
                    myDeviceNameEl.textContent = data.name;
                    startPolling();
                });
        }
    }

    registerDevice();

    function startPolling() {
        if (!pollingTimer) {
            pollStatus();
        }
    }

    // Polling Logic
    function pollStatus() {
        if (!myDeviceId) return;

        fetch(`/api/filedrop/devices/${myDeviceId}`)
            .then(res => {
                if (res.status === 401) {
                    // Server forgot us, re-register
                    localStorage.removeItem('filedrop_id');
                    localStorage.removeItem('filedrop_name');
                    clearTimeout(pollingTimer);
                    pollingTimer = null;
                    registerDevice();
                    return null;
                }
                return res.json();
            })
            .then(data => {
                if (data) {
                    updateDevicesList(data.devices);
                    checkIncomingTransfers(data.incoming);
                    checkOutgoingTransfers(data.outgoing_status);
                }
            })
            .catch(err => {
                console.error("Polling error", err);
            })
            .finally(() => {
                // Recursive timeout instead of interval to prevent stacking
                if (myDeviceId) {
                    pollingTimer = setTimeout(pollStatus, 2000);
                }
            });
    }

    let lastDevicesHash = '';
    function updateDevicesList(devices) {
        // Prevent excessive DOM repaints by checking if data changed
        const hash = JSON.stringify(devices);
        if (hash === lastDevicesHash) return;
        lastDevicesHash = hash;

        if (devices.length === 0) {
            devicesListEl.innerHTML = '<p class="scanning-text">Scanning for devices on the network...</p>';
            if (targetDeviceId) {
                targetDeviceId = null;
                sendPanel.classList.add('hidden');
            }
            return;
        }

        let html = '';
        devices.forEach(device => {
            const isSelected = targetDeviceId === device.id ? 'selected' : '';
            const icon = device.name.includes("Phone") || device.name.includes("Pad") ? '📱' : '💻';
            html += `
                <div class="device-card ${isSelected}" data-id="${device.id}" data-name="${device.name}">
                    <div class="device-icon">${icon}</div>
                    <div class="device-name">${device.name}</div>
                </div>
            `;
        });
        devicesListEl.innerHTML = html;

        // Add click events to device cards
        document.querySelectorAll('.device-card').forEach(card => {
            card.addEventListener('click', () => {
                document.querySelectorAll('.device-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                targetDeviceId = card.dataset.id;
                targetDeviceNameEl.textContent = card.dataset.name;
                sendPanel.classList.remove('hidden');
                sendStatus.classList.add('hidden');
            });
        });
    }

    // --- RECEIVING LOGIC ---
    const incomingModal = document.getElementById('incoming-modal');
    const incomingDesc = document.getElementById('incoming-desc');
    
    function checkIncomingTransfers(incoming) {
        if (incoming.length > 0 && !currentIncomingTransferId && !incomingModal.classList.contains('active')) {
            const transfer = incoming[0];
            currentIncomingTransferId = transfer.transfer_id;
            const itemType = transfer.type === 'text' ? 'some text' : 'a file';
            incomingDesc.textContent = `${transfer.sender_name} wants to send you ${itemType}.`;
            incomingModal.classList.add('active');
        }
    }

    document.getElementById('accept-btn').addEventListener('click', () => respondToTransfer(true));
    document.getElementById('reject-btn').addEventListener('click', () => respondToTransfer(false));

    function respondToTransfer(accept) {
        if (!currentIncomingTransferId) return;
        
        fetch('/api/filedrop/transfer/respond', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transfer_id: currentIncomingTransferId, accept: accept })
        }).then(() => {
            incomingModal.classList.remove('active');
            if (accept) {
                downloadTransfer(currentIncomingTransferId);
            }
            currentIncomingTransferId = null;
        });
    }

    const resultModal = document.getElementById('result-modal');
    
    function downloadTransfer(transferId) {
        // We first fetch download info. Because we use the same endpoint for both text and file download in V3.
        // Wait, our backend V3 /download/ returns text JSON, or a direct file download.
        // If it's a file, we can't fetch JSON. Let's do a fetch and check Content-Type.
        fetch(`/api/filedrop/transfer/download/${transferId}`)
            .then(res => {
                const contentType = res.headers.get("content-type");
                if (contentType && contentType.indexOf("application/json") !== -1) {
                    return res.json().then(data => {
                        showResultModal(data.text, 'text');
                    });
                } else {
                    return res.blob().then(blob => {
                        // Extract filename from Content-Disposition if possible, else generic
                        let filename = "downloaded_file";
                        const disposition = res.headers.get('content-disposition');
                        if (disposition && disposition.indexOf('attachment') !== -1) {
                            const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
                            const matches = filenameRegex.exec(disposition);
                            if (matches != null && matches[1]) { 
                                filename = matches[1].replace(/['"]/g, '');
                            }
                        }
                        const url = window.URL.createObjectURL(blob);
                        showResultModal({url, filename}, 'file');
                    });
                }
            });
    }

    function showResultModal(data, type) {
        resultModal.classList.add('active');
        document.getElementById('result-text-ui').classList.add('hidden');
        document.getElementById('result-file-ui').classList.add('hidden');

        if (type === 'text') {
            document.getElementById('result-text-ui').classList.remove('hidden');
            document.getElementById('received-text').value = data;
        } else {
            document.getElementById('result-file-ui').classList.remove('hidden');
            const a = document.getElementById('download-anchor');
            a.href = data.url;
            a.download = data.filename;
            a.click(); // Auto download
        }
    }

    document.getElementById('copy-btn').addEventListener('click', () => {
        document.getElementById('received-text').select();
        document.execCommand('copy');
        document.getElementById('copy-btn').textContent = "Copied!";
        setTimeout(() => { document.getElementById('copy-btn').textContent = "Copy to Clipboard"; }, 2000);
    });

    document.getElementById('close-result-btn').addEventListener('click', () => {
        resultModal.classList.remove('active');
    });

    // --- SENDING LOGIC ---
    function checkOutgoingTransfers(outgoing) {
        if (!pendingOutgoingTransferId) return;
        
        const transfer = outgoing.find(t => t.transfer_id === pendingOutgoingTransferId);
        if (transfer) {
            if (transfer.status === 'accepted') {
                sendStatus.textContent = "Transfer Accepted!";
                sendStatus.style.color = "#4ade80"; // green
            } else if (transfer.status === 'rejected') {
                sendStatus.textContent = "Transfer Declined.";
                sendStatus.style.color = "#f87171"; // red
            }
            pendingOutgoingTransferId = null;
            setTimeout(() => { sendStatus.classList.add('hidden'); }, 3000);
        }
    }

    // Tab Switching for Send UI
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetContainer = e.target.closest('.panel');
            targetContainer.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            targetContainer.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
            e.target.classList.add('active');
            document.getElementById(e.target.dataset.target).classList.remove('hidden');
        });
    });

    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const textInput = document.getElementById('text-input');
    const sendTextBtn = document.getElementById('send-text-btn');
    
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => { dropZone.classList.remove('dragover'); });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) uploadToSend(e.dataTransfer.files[0], 'file');
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) uploadToSend(fileInput.files[0], 'file');
    });

    sendTextBtn.addEventListener('click', () => {
        if (textInput.value.trim() !== '') uploadToSend(textInput.value.trim(), 'text');
    });

    function uploadToSend(data, type) {
        if (!targetDeviceId) return alert("Select a device first!");
        
        sendStatus.textContent = "Sending request...";
        sendStatus.style.color = "#a5b4fc";
        sendStatus.classList.remove('hidden');
        
        const formData = new FormData();
        formData.append('sender_id', myDeviceId);
        formData.append('target_id', targetDeviceId);
        formData.append('type', type);
        
        if (type === 'file') {
            formData.append('file', data);
        } else {
            formData.append('text', data);
        }

        fetch('/api/filedrop/transfer/request', { method: 'POST', body: formData })
            .then(res => res.json())
            .then(resData => {
                if (resData.success) {
                    pendingOutgoingTransferId = resData.transfer_id;
                    sendStatus.textContent = "Waiting for acceptance...";
                    textInput.value = '';
                    fileInput.value = '';
                } else {
                    sendStatus.textContent = "Error sending.";
                    sendStatus.style.color = "#f87171";
                }
            })
            .catch(err => {
                sendStatus.textContent = "Network error.";
                sendStatus.style.color = "#f87171";
            });
    }
});
