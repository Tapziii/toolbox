document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const sizePreset = document.getElementById('size-preset');
    const customSizeWrapper = document.getElementById('custom-size-wrapper');
    const sizeValueInput = document.getElementById('size-value-input');
    const formatSelect = document.getElementById('format-select');
    
    const processingZone = document.getElementById('processing-zone');
    const progressBar = document.getElementById('progress-bar');
    const processingStatus = document.getElementById('processing-status');
    
    const resultZone = document.getElementById('result-zone');
    const originalSizeEl = document.getElementById('original-size');
    const compressedSizeEl = document.getElementById('compressed-size');
    const previewImage = document.getElementById('preview-image');
    const downloadBtn = document.getElementById('download-btn');
    const resetBtn = document.getElementById('reset-btn');

    let currentFile = null;
    let resultBlobUrl = null;

    // Size Preset Selection
    sizePreset.addEventListener('change', (e) => {
        if (e.target.value === 'custom') {
            customSizeWrapper.classList.remove('hidden');
            sizeValueInput.focus();
        } else {
            customSizeWrapper.classList.add('hidden');
            sizeValueInput.value = e.target.value;
        }
    });

    // File Selection
    dropZone.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    });

    // Drag and Drop
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
    });

    dropZone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            if (file.type.startsWith('image/')) {
                handleFile(file);
            } else {
                alert('Please drop an image file.');
            }
        }
    });

    // Navigation and Reset
    resetBtn.addEventListener('click', () => {
        if (resultBlobUrl) {
            URL.revokeObjectURL(resultBlobUrl);
            resultBlobUrl = null;
        }
        fileInput.value = '';
        currentFile = null;
        
        resultZone.classList.add('hidden');
        dropZone.classList.remove('hidden');
    });

    // Core Processing
    async function handleFile(file) {
        currentFile = file;
        
        // UI Transition
        dropZone.classList.add('hidden');
        processingZone.classList.remove('hidden');
        progressBar.style.width = '10%';
        processingStatus.textContent = 'Reading image...';

        try {
            let targetMB;
            if (sizePreset.value === 'custom') {
                targetMB = parseFloat(sizeValueInput.value) || 10;
            } else {
                targetMB = parseFloat(sizePreset.value) || 10;
            }
            const targetBytes = targetMB * 1024 * 1024;
            
            let outputFormat = formatSelect.value;
            if (outputFormat === 'auto') {
                outputFormat = file.type;
                // Fallback for unsupported image types
                if (outputFormat !== 'image/jpeg' && outputFormat !== 'image/png' && outputFormat !== 'image/webp') {
                    outputFormat = 'image/jpeg';
                }
            }

            // If file is already smaller than target AND format is same, skip compression
            if (file.size <= targetBytes && file.type === outputFormat) {
                progressBar.style.width = '100%';
                showResult(file, file);
                return;
            }

            const img = await loadImage(file);
            progressBar.style.width = '30%';
            processingStatus.textContent = 'Compressing...';

            const compressedBlob = await compressImage(img, outputFormat, targetBytes);
            
            progressBar.style.width = '100%';
            processingStatus.textContent = 'Done!';
            
            setTimeout(() => {
                showResult(file, compressedBlob);
            }, 300);

        } catch (error) {
            console.error(error);
            alert('An error occurred during compression.');
            resetBtn.click();
        }
    }

    function loadImage(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                URL.revokeObjectURL(url);
                resolve(img);
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Failed to load image'));
            };
            img.src = url;
        });
    }

    async function compressImage(img, targetFormat, targetBytes) {
        const isPNG = targetFormat === 'image/png';
        const maxIterations = 8;
        
        // 1. Try quality reduction first (if not PNG)
        if (!isPNG) {
            let lowQuality = 0.05;
            let highQuality = 1.0;
            let bestBlob = null;
            
            // Quick check with high quality
            let blob = await getCanvasBlob(img, 1.0, 0.9, targetFormat);
            if (blob.size <= targetBytes) return blob;
            
            // Quick check with low quality
            blob = await getCanvasBlob(img, 1.0, 0.1, targetFormat);
            if (blob.size <= targetBytes) {
                // Binary search for optimal quality between 0.1 and 0.9
                for (let i = 0; i < maxIterations; i++) {
                    const midQuality = (lowQuality + highQuality) / 2;
                    const testBlob = await getCanvasBlob(img, 1.0, midQuality, targetFormat);
                    
                    if (testBlob.size <= targetBytes) {
                        bestBlob = testBlob;
                        lowQuality = midQuality; // Can try higher quality
                        // Update progress loosely
                        progressBar.style.width = `${30 + (i / maxIterations) * 30}%`;
                    } else {
                        highQuality = midQuality; // Must lower quality
                    }
                }
                return bestBlob || blob;
            }
        }
        
        // 2. If PNG or if quality 0.1 JPEG is STILL too big, scale dimensions
        let lowScale = 0.01;
        let highScale = 1.0;
        let bestBlob = null;
        let fallbackQuality = isPNG ? 1.0 : 0.6; 
        
        for (let i = 0; i < maxIterations; i++) {
            const midScale = (lowScale + highScale) / 2;
            const testBlob = await getCanvasBlob(img, midScale, fallbackQuality, targetFormat);
            
            if (testBlob.size <= targetBytes) {
                bestBlob = testBlob;
                lowScale = midScale; // Can try larger scale
            } else {
                highScale = midScale; // Must scale smaller
            }
            progressBar.style.width = `${60 + (i / maxIterations) * 30}%`;
        }
        
        if (!bestBlob) {
            bestBlob = await getCanvasBlob(img, 0.05, fallbackQuality, targetFormat);
        }
        
        return bestBlob;
    }

    function getCanvasBlob(img, scale, quality, format) {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.floor(img.width * scale));
            canvas.height = Math.max(1, Math.floor(img.height * scale));
            const ctx = canvas.getContext('2d');
            
            // For PNGs with transparency, prevent black backgrounds if converting to JPEG
            if (format === 'image/jpeg') {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
            
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => resolve(blob), format, quality);
        });
    }

    function formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function showResult(originalFile, compressedBlob) {
        processingZone.classList.add('hidden');
        resultZone.classList.remove('hidden');
        
        originalSizeEl.textContent = formatBytes(originalFile.size);
        compressedSizeEl.textContent = formatBytes(compressedBlob.size);
        
        if (compressedBlob.size > originalFile.size) {
            compressedSizeEl.classList.remove('highlight');
            compressedSizeEl.style.color = 'var(--danger)';
        } else {
            compressedSizeEl.classList.add('highlight');
            compressedSizeEl.style.color = 'var(--success)';
        }

        resultBlobUrl = URL.createObjectURL(compressedBlob);
        previewImage.src = resultBlobUrl;

        // Setup download button
        downloadBtn.onclick = () => {
            const a = document.createElement('a');
            a.href = resultBlobUrl;
            
            // Determine extension
            let ext = 'jpg';
            if (compressedBlob.type === 'image/png') ext = 'png';
            else if (compressedBlob.type === 'image/webp') ext = 'webp';
            
            const originalName = originalFile.name.split('.')[0];
            a.download = `${originalName}_compressed.${ext}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        };
    }
});
