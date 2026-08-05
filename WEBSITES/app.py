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

from flask import send_from_directory, redirect

BASE_DIR = os.path.dirname(__file__)
STATIC_DIRS = ['10mb', 'Altimeter', 'CAPS', 'ColorPicker', 'Toolbox']

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

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
