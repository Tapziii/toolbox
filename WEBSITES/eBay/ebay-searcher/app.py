"""Flask web application — eBay product search with filters and image results."""

import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from flask import Flask, jsonify, render_template, request
from ebay_client import EBayClient
import hashlib
import json

import os

app = Flask(__name__)
ebay = EBayClient()

PRESETS_FILE = os.path.join(os.path.dirname(__file__), "presets.json")

def load_presets():
    if os.path.exists(PRESETS_FILE):
        with open(PRESETS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

def save_presets(presets_data):
    with open(PRESETS_FILE, "w", encoding="utf-8") as f:
        json.dump(presets_data, f, indent=4)

# Smart Session Cache mapping signature -> session data
SEARCH_CACHE = {}

def get_signature(params: dict) -> str:
    """Return a unique MD5 hash for a given search parameter dictionary."""
    return hashlib.md5(json.dumps(params, sort_keys=True).encode()).hexdigest()

@app.route("/ebay/")
def index():
    """Serve the main search page."""
    return render_template("index.html")


@app.route("/api/search")
def api_search():
    """Search eBay and return JSON results.

    Query params:
        q                – search keywords (required)
        min_price        – minimum price filter
        max_price        – maximum price filter
        marketplace      – marketplace ID (default EBAY_US)
        sort             – sort order (default bestMatch)
        condition        – condition filter (default all)
        exclude_keywords – comma-separated words to exclude
        exclude_countries– comma-separated countries to filter out
        limit            – max results (default 60)
    """
    query = request.args.get("q", "").strip()
    if not query:
        return jsonify({"error": "Missing search query", "items": []}), 400

    min_price = request.args.get("min_price", type=float)
    max_price = request.args.get("max_price", type=float)
    marketplace = request.args.get("marketplace", "EBAY_US")
    sort = request.args.get("sort", "bestMatch")
    condition = request.args.get("condition", "all")
    exclude_keywords = request.args.get("exclude_keywords", "").strip()
    exclude_countries = request.args.get("exclude_countries", "").strip()
    category = request.args.get("category", "all")
    format_filter = request.args.get("format", "all")
    include_shipping = request.args.get("include_shipping", "false").lower() == "true"
    page = request.args.get("page", 1, type=int)

    try:
        # Build dictionary of all search parameters to uniquely identify this search
        search_params = {
            "query": query,
            "marketplace_id": marketplace,
            "min_price": min_price,
            "max_price": max_price,
            "sort": sort,
            "condition": condition,
            "category": category,
            "exclude_keywords": exclude_keywords or None,
            "exclude_countries": exclude_countries or None,
            "format_filter": format_filter,
            "include_shipping": include_shipping,
        }
        
        sig = get_signature(search_params)

        if sig not in SEARCH_CACHE:
            SEARCH_CACHE[sig] = {
                "items": [],
                "seen_ids": set(),
                "next_ebay_page": 1,
                "done": False,
                "total_ebay_results": "Unknown"
            }

        session = SEARCH_CACHE[sig]
        target_item_count = page * 50

        # Scrape eBay pages until we have enough items or hit the end of eBay's results
        while len(session["items"]) < target_item_count and not session["done"]:
            ebay_data = ebay.search(
                **search_params,
                page=session["next_ebay_page"]
            )
            
            # Deduplicate items by ID
            new_items_count = 0
            for item in ebay_data["items"]:
                if item["item_id"] not in session["seen_ids"]:
                    session["seen_ids"].add(item["item_id"])
                    session["items"].append(item)
                    new_items_count += 1
                    
            session["total_ebay_results"] = ebay_data.get("total_ebay_results", "Unknown")
            session["next_ebay_page"] += 1
            
            if not ebay_data["has_more"]:
                session["done"] = True
                
            # Safety checks for infinite loops:
            # 1. If eBay returns multiple valid items but ALL are duplicates, it's looping the same page.
            if len(ebay_data["items"]) >= 5 and new_items_count == 0:
                session["done"] = True
                
            # 2. Hard limit of 20 eBay pages per session to prevent infinite scraping if filters are too strict.
            if session["next_ebay_page"] > 20:
                session["done"] = True

        # Extract exactly 50 items for the requested page
        start_idx = (page - 1) * 50
        end_idx = page * 50
        page_items = session["items"][start_idx:end_idx]

        # Determine if there are more pages available
        has_more = not session["done"] or len(session["items"]) > end_idx

        return jsonify({
            "items": page_items,
            "current_page": page,
            "has_more": has_more,
            "total_ebay_results": session["total_ebay_results"],
            "query": query,
            "count": len(page_items)
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e), "items": []}), 500

@app.route("/api/presets", methods=["GET"])
def get_presets():
    return jsonify(load_presets())

@app.route("/api/presets", methods=["POST"])
def create_preset():
    data = request.json
    name = data.get("name")
    if not name:
        return jsonify({"error": "Preset name is required"}), 400
    
    presets = load_presets()
    presets[name] = data.get("state", {})
    save_presets(presets)
    return jsonify({"success": True, "presets": presets})

@app.route("/api/presets/<name>", methods=["DELETE"])
def delete_preset(name):
    presets = load_presets()
    if name in presets:
        del presets[name]
        save_presets(presets)
    return jsonify({"success": True, "presets": presets})

if __name__ == "__main__":
    app.run(debug=True, host="127.0.0.1", port=5000)
