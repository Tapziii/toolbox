import os
import sys
import importlib.util

# Load the ebay app module directly to avoid circular imports
# since this file is also named app.py
ebay_path = os.path.join(os.path.dirname(__file__), 'eBay', 'ebay-searcher', 'app.py')

spec = importlib.util.spec_from_file_location("ebay_app_module", ebay_path)
ebay_module = importlib.util.module_from_spec(spec)
sys.modules["ebay_app_module"] = ebay_module

# We also need to add ebay-searcher to sys.path so its internal imports (like ebay_client) work
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'eBay', 'ebay-searcher'))

spec.loader.exec_module(ebay_module)
app = ebay_module.app

from flask import send_from_directory, redirect, request, jsonify, send_file
import uuid
import werkzeug.utils
import threading
try:
    import yt_dlp
except ImportError:
    yt_dlp = None

BASE_DIR = os.path.dirname(__file__)
STATIC_DIRS = ['10mb', 'Altimeter', 'CAPS', 'ColorPicker', 'Toolbox', 'FileDrop', 'QuickConvert', 'YTDownloader', 'LinkShortener']

@app.route('/')
def serve_root():
    return send_from_directory(os.path.join(BASE_DIR, 'Toolbox'), 'index.html')

@app.route('/<project>/')
def serve_static_index(project):
    if project in STATIC_DIRS:
        return send_from_directory(os.path.join(BASE_DIR, project), 'index.html')
    elif project.lower() == 'ebay':
        return redirect('/ebay/')
    return "Not found", 404

@app.route('/<project>/<path:filename>')
def serve_static_file(project, filename):
    if project in STATIC_DIRS:
        return send_from_directory(os.path.join(BASE_DIR, project), filename)
    elif project.lower() == 'ebay':
        return redirect('/ebay/')
    return "Not found", 404

# --- FileDrop V3 API (AirDrop Clone) ---
import time
import random
import werkzeug.utils

FILEDROP_UPLOAD_DIR = os.path.join(BASE_DIR, 'uploads')
os.makedirs(FILEDROP_UPLOAD_DIR, exist_ok=True)

DEVICES = {}
TRANSFERS = {}

ADJECTIVES = ["Neon", "Cyber", "Silver", "Quantum", "Plasma", "Cosmic", "Solar", "Lunar", "Turbo", "Aero"]
NOUNS = ["Phone", "Desktop", "Tablet", "Laptop", "Watch", "Device", "Pad", "Mac", "PC", "Nexus"]

@app.route('/api/filedrop/device/register', methods=['POST'])
def filedrop_register():
    device_id = str(uuid.uuid4())
    name = f"{random.choice(ADJECTIVES)} {random.choice(NOUNS)}"
    DEVICES[device_id] = {'name': name, 'last_seen': time.time()}
    return jsonify({'success': True, 'device_id': device_id, 'name': name})

@app.route('/api/filedrop/device/update', methods=['POST'])
def filedrop_update_name():
    device_id = request.form.get('device_id')
    new_name = request.form.get('name')
    if device_id in DEVICES and new_name:
        DEVICES[device_id]['name'] = new_name[:20] # Limit length
        return jsonify({'success': True})
    return jsonify({'error': 'Device not found'}), 404

@app.route('/api/filedrop/devices/<device_id>', methods=['GET'])
def filedrop_poll(device_id):
    current_time = time.time()
    
    if device_id not in DEVICES:
        return jsonify({'error': 'Not registered'}), 401
        
    DEVICES[device_id]['last_seen'] = current_time
    
    # Find active devices (seen in last 15 seconds to prevent flickering)
    # Keep devices in memory for 5 minutes before deleting them so they don't lose their identity if they sleep
    active_devices = []
    for d_id, d_info in list(DEVICES.items()):
        time_since_seen = current_time - d_info['last_seen']
        if time_since_seen > 300: 
            del DEVICES[d_id]
        elif time_since_seen <= 15: 
            if d_id != device_id:
                active_devices.append({'id': d_id, 'name': d_info['name']})
            
    # Check for incoming transfers
    incoming = []
    for t_id, t_info in TRANSFERS.items():
        if t_info['target_id'] == device_id and t_info['status'] == 'pending':
            sender_name = DEVICES.get(t_info['sender_id'], {}).get('name', 'Unknown Device')
            incoming.append({
                'transfer_id': t_id,
                'sender_name': sender_name,
                'type': t_info['type'],
                'filename': t_info.get('filename', '')
            })
            
    # Check for my outgoing transfers that were accepted/rejected
    outgoing_status = []
    for t_id, t_info in TRANSFERS.items():
        if t_info['sender_id'] == device_id and t_info['status'] in ['accepted', 'rejected']:
            outgoing_status.append({'transfer_id': t_id, 'status': t_info['status']})
            if t_info['status'] == 'rejected':
                # Clean up memory
                TRANSFERS.pop(t_id, None)

    return jsonify({
        'devices': active_devices,
        'incoming': incoming,
        'outgoing_status': outgoing_status
    })

@app.route('/api/filedrop/transfer/request', methods=['POST'])
def filedrop_transfer_request():
    sender_id = request.form.get('sender_id')
    target_id = request.form.get('target_id')
    data_type = request.form.get('type', 'file')
    
    if not sender_id or not target_id:
        return jsonify({'error': 'Missing ids'}), 400
        
    transfer_id = str(uuid.uuid4())
    save_dir = os.path.join(FILEDROP_UPLOAD_DIR, transfer_id)
    os.makedirs(save_dir, exist_ok=True)
    
    transfer_data = {
        'sender_id': sender_id,
        'target_id': target_id,
        'status': 'pending',
        'type': data_type
    }
    
    if data_type == 'text':
        text_content = request.form.get('text', '')
        with open(os.path.join(save_dir, 'content.txt'), 'w', encoding='utf-8') as f:
            f.write(text_content)
        transfer_data['text'] = text_content
    else:
        file = request.files.get('file')
        if not file or file.filename == '':
            return jsonify({'error': 'No file'}), 400
        filename = werkzeug.utils.secure_filename(file.filename)
        file.save(os.path.join(save_dir, filename))
        transfer_data['filename'] = filename
        
    TRANSFERS[transfer_id] = transfer_data
    return jsonify({'success': True, 'transfer_id': transfer_id})

@app.route('/api/filedrop/transfer/respond', methods=['POST'])
def filedrop_transfer_respond():
    transfer_id = request.json.get('transfer_id')
    accept = request.json.get('accept')
    
    if transfer_id in TRANSFERS:
        TRANSFERS[transfer_id]['status'] = 'accepted' if accept else 'rejected'
        return jsonify({'success': True})
    return jsonify({'error': 'Transfer not found'}), 404

@app.route('/api/filedrop/transfer/download/<transfer_id>')
def filedrop_transfer_download(transfer_id):
    if transfer_id not in TRANSFERS:
        return "Not found", 404
        
    t_info = TRANSFERS[transfer_id]
    
    if t_info['type'] == 'text':
        # Remove from memory once downloaded
        TRANSFERS.pop(transfer_id, None)
        return jsonify({'type': 'text', 'text': t_info['text']})
    else:
        filename = t_info['filename']
        file_path = os.path.join(FILEDROP_UPLOAD_DIR, transfer_id, filename)
        # We leave it on disk for now, could be cleaned up by a cron task later
        TRANSFERS.pop(transfer_id, None)
        return send_file(file_path, as_attachment=True)

# --- YT Downloader API ---
import re

YT_DOWNLOADS = {}
YT_DOWNLOAD_DIR = os.path.join(BASE_DIR, 'uploads', 'ytdl')
os.makedirs(YT_DOWNLOAD_DIR, exist_ok=True)

@app.route('/api/ytdl/start', methods=['POST'])
def ytdl_start():
    if not yt_dlp:
        return jsonify({'error': 'yt-dlp is not installed on the server.'}), 500
        
    url = request.json.get('url')
    quality = request.json.get('quality', 'best')
    download_id = str(uuid.uuid4())
    
    YT_DOWNLOADS[download_id] = {
        'status': 'loading',
        'progress': 0,
        'message': 'Initializing...',
        'filename': None
    }
    
    def progress_hook(d):
        if d['status'] == 'downloading':
            percent_str = d.get('_percent_str', '0%').replace('%', '').strip()
            percent_str = re.sub(r'\x1b\[[0-9;]*m', '', percent_str)
            try:
                percent = float(percent_str)
            except:
                percent = 0
                
            eta = d.get('_eta_str', 'Unknown')
            eta = re.sub(r'\x1b\[[0-9;]*m', '', eta)
            
            YT_DOWNLOADS[download_id]['progress'] = percent
            YT_DOWNLOADS[download_id]['message'] = f'Downloading... {percent:.1f}% (ETA: {eta})'
            
        elif d['status'] == 'finished':
            YT_DOWNLOADS[download_id]['message'] = 'Processing and finalizing video (this may take a moment)...'

    def download_thread():
        try:
            ydl_opts = {
                'outtmpl': os.path.join(YT_DOWNLOAD_DIR, download_id + '_%(title)s.%(ext)s'),
                'progress_hooks': [progress_hook],
                'quiet': True,
                'no_warnings': True,
            }
            if quality == 'audio':
                ydl_opts['format'] = 'bestaudio/best'
                ydl_opts['postprocessors'] = [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': '192',
                }]
            else:
                ydl_opts['format'] = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best'
                
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
                filename = ydl.prepare_filename(info)
                if quality == 'audio':
                    filename = os.path.splitext(filename)[0] + '.mp3'
                
                YT_DOWNLOADS[download_id]['status'] = 'success'
                YT_DOWNLOADS[download_id]['message'] = 'Video processed successfully! Download starting...'
                YT_DOWNLOADS[download_id]['progress'] = 100
                YT_DOWNLOADS[download_id]['filename'] = os.path.basename(filename)
                
        except Exception as e:
            YT_DOWNLOADS[download_id]['status'] = 'error'
            YT_DOWNLOADS[download_id]['message'] = str(e)
            
    threading.Thread(target=download_thread).start()
    return jsonify({'download_id': download_id})

@app.route('/api/ytdl/progress/<download_id>')
def ytdl_progress(download_id):
    return jsonify(YT_DOWNLOADS.get(download_id, {'status': 'error', 'message': 'Not found'}))

@app.route('/api/ytdl/file/<download_id>')
def ytdl_file(download_id):
    if download_id not in YT_DOWNLOADS or not YT_DOWNLOADS[download_id].get('filename'):
        return "Not found", 404
    filename = YT_DOWNLOADS[download_id]['filename']
    return send_file(os.path.join(YT_DOWNLOAD_DIR, filename), as_attachment=True)

# --- Tap.zi Link Shortener API ---
import json
import string

LINKS_FILE = os.path.join(BASE_DIR, 'uploads', 'links.json')

def load_links():
    if os.path.exists(LINKS_FILE):
        try:
            with open(LINKS_FILE, 'r') as f:
                return json.load(f)
        except:
            return {}
    return {}

def save_links(links):
    with open(LINKS_FILE, 'w') as f:
        json.dump(links, f)

@app.route('/api/shorten', methods=['POST'])
def shorten_link():
    long_url = request.json.get('url')
    if not long_url:
        return jsonify({'error': 'No URL provided'}), 400
        
    if not long_url.startswith(('http://', 'https://')):
        long_url = 'https://' + long_url
        
    links = load_links()
    
    characters = string.ascii_letters + string.digits
    for _ in range(10):
        short_id = ''.join(random.choice(characters) for _ in range(5))
        if short_id not in links:
            break
            
    links[short_id] = {
        'url': long_url,
        'clicks': 0,
        'created_at': time.time()
    }
    
    save_links(links)
    return jsonify({'success': True, 'short_id': short_id, 'url': long_url})

@app.route('/s/<short_id>')
def redirect_short_link(short_id):
    links = load_links()
    if short_id in links:
        links[short_id]['clicks'] = links[short_id].get('clicks', 0) + 1
        save_links(links)
        return redirect(links[short_id]['url'])
    return "Link not found", 404

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
