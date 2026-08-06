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

BASE_DIR = os.path.dirname(__file__)
STATIC_DIRS = ['10mb', 'Altimeter', 'CAPS', 'ColorPicker', 'Toolbox', 'FileDrop', 'QuickConvert']

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

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
