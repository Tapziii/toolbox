import os
import sys

# Insert the ebay-searcher path so we can import its app
ebay_path = os.path.join(os.path.dirname(__file__), 'eBay', 'ebay-searcher')
sys.path.insert(0, ebay_path)

from app import app
from flask import send_from_directory, redirect

BASE_DIR = os.path.dirname(__file__)
STATIC_DIRS = ['10mb', 'Altimeter', 'CAPS', 'ColorPicker', 'Toolbox']

@app.route('/<project>/')
def serve_static_index(project):
    if project in STATIC_DIRS:
        return send_from_directory(os.path.join(BASE_DIR, project), 'index.html')
    elif project.lower() == 'ebay':
        return redirect('/')
    return "Not found", 404

@app.route('/<project>/<path:filename>')
def serve_static_file(project, filename):
    if project in STATIC_DIRS:
        return send_from_directory(os.path.join(BASE_DIR, project), filename)
    elif project.lower() == 'ebay':
        return redirect('/')
    return "Not found", 404

if __name__ == '__main__':
    # When running locally, it defaults to port 5000
    app.run(debug=True, host='0.0.0.0', port=5000)
