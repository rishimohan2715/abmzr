"""Vercel serverless entry point for the FastAPI backend.

Vercel's Python runtime (@vercel/python) detects the module-level ``app`` ASGI
application and serves it. Requests to ``/api/*`` are routed here by the
rewrite in ``vercel.json``; the FastAPI app's routes are themselves defined
under ``/api/...``, so the original path matches directly.

The backend package lives in ``/backend`` and uses flat imports
(``from elexon_service import ...``), so we add that directory to ``sys.path``
before importing the app.
"""
import os
import sys

BACKEND_DIR = os.path.join(os.path.dirname(__file__), "..", "backend")
sys.path.insert(0, BACKEND_DIR)

from main import app  # noqa: E402  (import after sys.path setup)

# Exposed for the Vercel Python ASGI runtime.
__all__ = ["app"]
