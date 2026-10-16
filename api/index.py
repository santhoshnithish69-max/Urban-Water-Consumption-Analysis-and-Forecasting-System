"""
Vercel Serverless Function Entrypoint
====================================
Exposes the WSGI Flask application object for Vercel's Python runtime.
"""

import sys
from pathlib import Path

# Add project root directory to Python module search path
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

# Import the initialized Flask application instance
from app import app

# Vercel looks for the `app` WSGI variable
if __name__ == "__main__":
    app.run(debug=True)
