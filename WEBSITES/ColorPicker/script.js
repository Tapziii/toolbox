document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const dropZone = document.getElementById('drop-zone');
    const imageInput = document.getElementById('image-upload');
    const workspace = document.querySelector('.image-workspace');
    const canvas = document.getElementById('image-canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const magnifier = document.getElementById('magnifier');
    const magCanvas = document.getElementById('magnifier-canvas');
    const magCtx = magCanvas.getContext('2d', { willReadFrequently: true });

    const primarySwatch = document.getElementById('primary-swatch');
    const secondarySwatch = document.getElementById('secondary-swatch');
    const hexInput = document.getElementById('hex-input');
    const rgbInput = document.getElementById('rgb-input');
    const hslInput = document.getElementById('hsl-input');
    
    const paletteContainer = document.getElementById('color-palette');
    const btnAddColor = document.getElementById('btn-add-color');
    const btnRemoveColor = document.getElementById('btn-remove-color');
    const btnDownload = document.getElementById('btn-download');
    const btnSave = document.getElementById('btn-save');
    const btnScreenPick = document.getElementById('btn-screen-pick');
    const themeToggle = document.getElementById('theme-toggle');
    const copyBtns = document.querySelectorAll('.copy-btn');

    // State
    let currentImage = null;
    let currentColor = { r: 37, g: 150, b: 190 }; // Initial color
    let previousColor = { r: 238, g: 191, b: 136 };
    let colorPalette = [
        '#2596be', '#eebf88', '#e97c41', '#e4a559', '#76b9ce', '#271711', '#853e28', '#99dbe5', '#0f3869', '#155d91'
    ]; // Initial palette matching mockup
    let zoomLevel = 10;
    
    // Position Tracking
    let imageX = 0;
    let imageY = 0;
    
    // Initialize
    magCtx.imageSmoothingEnabled = false;
    renderPalette();

    // Event Listeners for Upload
    imageInput.addEventListener('change', handleFileSelect);
    
    // Make drop zone clickable
    dropZone.addEventListener('click', () => {
        imageInput.click();
    });

    // Dark Mode Toggle
    themeToggle.addEventListener('click', () => {
        document.documentElement.classList.toggle('dark');
        document.body.classList.toggle('dark');
    });
    
    workspace.addEventListener('dragover', (e) => {
        e.preventDefault();
        workspace.classList.add('drag-over');
    });

    workspace.addEventListener('dragleave', (e) => {
        e.preventDefault();
        workspace.classList.remove('drag-over');
    });

    workspace.addEventListener('drop', (e) => {
        e.preventDefault();
        workspace.classList.remove('drag-over');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            loadImage(e.dataTransfer.files[0]);
        }
    });

    function handleFileSelect(e) {
        if (e.target.files && e.target.files[0]) {
            loadImage(e.target.files[0]);
        }
    }

    function loadImage(file) {
        if (!file.type.match('image.*')) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                currentImage = img;
                workspace.classList.add('has-image');
                resizeCanvasAndDraw();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    function resizeCanvasAndDraw() {
        if (!currentImage) return;
        
        // Match canvas logical size to image actual size for 1:1 pixel mapping
        canvas.width = currentImage.width;
        canvas.height = currentImage.height;
        ctx.drawImage(currentImage, 0, 0);
    }

    function updateMagnifier(rect, scaleX, scaleY) {
        magnifier.style.display = 'block';
        
        // Calculate visual position of the crosshair on screen
        let visualX = (imageX / scaleX) + rect.left - workspace.getBoundingClientRect().left;
        let visualY = (imageY / scaleY) + rect.top - workspace.getBoundingClientRect().top;
        
        magnifier.style.left = `${visualX - 60}px`;
        magnifier.style.top = `${visualY - 60}px`;

        // Draw zoomed area on magnifier canvas
        magCtx.clearRect(0, 0, magCanvas.width, magCanvas.height);
        
        const srcWidth = magCanvas.width / zoomLevel;
        const srcHeight = magCanvas.height / zoomLevel;
        const srcX = imageX - (srcWidth / 2);
        const srcY = imageY - (srcHeight / 2);

        magCtx.drawImage(
            canvas,
            srcX, srcY, srcWidth, srcHeight,
            0, 0, magCanvas.width, magCanvas.height
        );
    }

    // Magnifier and Color Picking Logic
    canvas.addEventListener('mousemove', (e) => {
        if (!currentImage) return;

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        if (e.shiftKey) {
            // Precision mode: movement scales perfectly with zoom level!
            // This makes moving the mouse 1 pixel on screen move exactly 0.5 pixels visually in the magnifier.
            const sensitivityX = 0.5 / (zoomLevel * scaleX);
            const sensitivityY = 0.5 / (zoomLevel * scaleY);
            
            imageX += (e.movementX * scaleX) * sensitivityX;
            imageY += (e.movementY * scaleY) * sensitivityY;
            
            // Clamp to image bounds
            imageX = Math.max(0, Math.min(imageX, canvas.width - 1));
            imageY = Math.max(0, Math.min(imageY, canvas.height - 1));
        } else {
            // Normal mode: track cursor exactly
            const cssX = e.clientX - rect.left;
            const cssY = e.clientY - rect.top;
            imageX = cssX * scaleX;
            imageY = cssY * scaleY;
        }

        updateMagnifier(rect, scaleX, scaleY);
    });

    canvas.addEventListener('wheel', (e) => {
        if (!currentImage) return;
        e.preventDefault(); // Prevent page scrolling
        
        // Adjust zoom level
        if (e.deltaY < 0) {
            zoomLevel = Math.min(zoomLevel + 2, 40); // Zoom in, max 40x
        } else {
            zoomLevel = Math.max(zoomLevel - 2, 2);  // Zoom out, min 2x
        }
        
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        updateMagnifier(rect, scaleX, scaleY);
    });

    canvas.addEventListener('mouseleave', () => {
        magnifier.style.display = 'none';
    });

    canvas.addEventListener('click', (e) => {
        if (!currentImage) return;

        const x = Math.floor(imageX);
        const y = Math.floor(imageY);

        const pixelData = ctx.getImageData(x, y, 1, 1).data;
        
        // Update previous color
        previousColor = { ...currentColor };
        
        // Set new current color
        currentColor = {
            r: pixelData[0],
            g: pixelData[1],
            b: pixelData[2]
        };

        updateColorDisplays();
    });

    // Native EyeDropper API (Chrome/Edge/Chromium 95+)
    btnScreenPick.addEventListener('click', async () => {
        if (!window.EyeDropper) {
            alert('Your browser does not support the EyeDropper API.');
            return;
        }

        const eyeDropper = new EyeDropper();
        try {
            const result = await eyeDropper.open();
            // result.sRGBHex
            const hex = result.sRGBHex;
            
            // Parse HEX to RGB
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            
            previousColor = { ...currentColor };
            currentColor = { r, g, b };
            updateColorDisplays();
            
        } catch (e) {
            console.log('User canceled eye dropper.');
        }
    });

    // Color conversions
    function rgbToHex(r, g, b) {
        return "#" + (1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1).toUpperCase();
    }

    function rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;

        if (max === min) {
            h = s = 0; // achromatic
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }

        return {
            h: Math.round(h * 360),
            s: Math.round(s * 100),
            l: Math.round(l * 100)
        };
    }

    function updateColorDisplays() {
        const hex = rgbToHex(currentColor.r, currentColor.g, currentColor.b);
        const hsl = rgbToHsl(currentColor.r, currentColor.g, currentColor.b);
        const rgbStr = `rgb(${currentColor.r}, ${currentColor.g}, ${currentColor.b})`;
        const prevHex = rgbToHex(previousColor.r, previousColor.g, previousColor.b);

        primarySwatch.style.backgroundColor = hex;
        secondarySwatch.style.backgroundColor = prevHex;

        hexInput.value = hex;
        rgbInput.value = rgbStr;
        hslInput.value = `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
    }

    // Palette Management
    function renderPalette() {
        paletteContainer.innerHTML = '';
        colorPalette.forEach(hexColor => {
            const div = document.createElement('div');
            div.className = 'palette-color';
            div.style.backgroundColor = hexColor;
            div.title = hexColor;
            div.addEventListener('click', () => {
                // Parse HEX to RGB and set as current
                const r = parseInt(hexColor.slice(1, 3), 16);
                const g = parseInt(hexColor.slice(3, 5), 16);
                const b = parseInt(hexColor.slice(5, 7), 16);
                
                previousColor = { ...currentColor };
                currentColor = { r, g, b };
                updateColorDisplays();
            });
            paletteContainer.appendChild(div);
        });
    }

    btnAddColor.addEventListener('click', () => {
        const hex = rgbToHex(currentColor.r, currentColor.g, currentColor.b);
        if (!colorPalette.includes(hex)) {
            colorPalette.push(hex);
            renderPalette();
            // Scroll to end
            paletteContainer.scrollLeft = paletteContainer.scrollWidth;
        }
    });

    btnRemoveColor.addEventListener('click', () => {
        if (colorPalette.length > 0) {
            colorPalette.pop();
            renderPalette();
        }
    });

    btnDownload.addEventListener('click', () => {
        // Download palette as a text file
        let cssVars = ':root {\n';
        colorPalette.forEach((color, idx) => {
            cssVars += `  --color-${idx + 1}: ${color};\n`;
        });
        cssVars += '}\n';

        const blob = new Blob([cssVars], { type: 'text/css' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'palette.css';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    btnSave.addEventListener('click', () => {
        // Mock save logic, could save to localStorage
        localStorage.setItem('chroma_palette', JSON.stringify(colorPalette));
        alert('Palette saved to browser local storage!');
    });

    // Copy Buttons
    copyBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            const input = document.getElementById(targetId);
            
            navigator.clipboard.writeText(input.value).then(() => {
                // Feedback animation
                const originalSvg = btn.innerHTML;
                btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
                setTimeout(() => {
                    btn.innerHTML = originalSvg;
                }, 1500);
            });
        });
    });

    // Initialize displays
    updateColorDisplays();
});
