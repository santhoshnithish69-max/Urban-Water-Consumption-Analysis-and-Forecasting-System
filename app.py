"""
Urban Water Consumption Analysis and Forecasting System
======================================================
Flask Web Application Backend
Handles dashboard rendering, dynamic statistics calculation,
time-series forecasting, CSV uploads and validations, and downloads.
"""

import io
import os
import uuid
from pathlib import Path
from flask import (
    Flask,
    render_template,
    jsonify,
    request,
    send_file,
    session,
    Response
)

import forecasting

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
SAMPLE_CSV_PATH = DATA_DIR / "sample_water_consumption.csv"
OUTPUT_FORECAST_CSV_PATH = BASE_DIR / "urban_water_forecast.csv"

# Initialize Flask application with explicit absolute paths for templates and static assets
app = Flask(
    __name__,
    template_folder=str(BASE_DIR / "templates"),
    static_folder=str(BASE_DIR / "static"),
    static_url_path="/static"
)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "urban-water-forecasting-secret-key-2026")

# In-memory storage for uploaded datasets keyed by session ID
SESSION_DATA_STORE = {}


def get_current_history():
    """
    Retrieve active historical dataset:
    Returns user uploaded data if available for current session,
    otherwise loads the verified sample dataset.
    """
    user_id = session.get("user_id")
    if user_id and user_id in SESSION_DATA_STORE:
        return SESSION_DATA_STORE[user_id]["history"], True

    # Fallback to sample data file or generator
    if SAMPLE_CSV_PATH.exists():
        try:
            content = SAMPLE_CSV_PATH.read_text(encoding="utf-8")
            history = forecasting.parse_and_validate_csv(content)
            return history, False
        except Exception:
            pass

    history = forecasting.create_sample_data()
    return history, False


@app.before_request
def ensure_session():
    """Ensure every visitor has a unique session identifier."""
    if "user_id" not in session:
        session["user_id"] = str(uuid.uuid4())


@app.route("/")
def index():
    """Render the main dashboard interface."""
    return render_template("index.html")


@app.route("/api/forecast", methods=["GET"])
def api_forecast():
    """
    Return dynamic statistics, linear trend parameters,
    monthly seasonal effects, test MAE, and next 6-month forecast.
    """
    try:
        history, is_custom = get_current_history()
        analysis = forecasting.perform_full_analysis(history)
        analysis["is_custom_dataset"] = is_custom

        # Keep urban_water_forecast.csv updated on disk
        csv_text = forecasting.generate_forecast_csv_text(analysis["forecast"])
        try:
            OUTPUT_FORECAST_CSV_PATH.write_text(csv_text, encoding="utf-8")
        except Exception:
            pass

        return jsonify({
            "success": True,
            "data": analysis
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "error": f"Failed to compute forecast: {str(e)}"
        }), 500


@app.route("/api/upload", methods=["POST"])
def api_upload():
    """
    Handle CSV dataset upload.
    Validates file format, columns, dates, missing/duplicate data,
    and updates the active session predictions.
    """
    if "file" not in request.files:
        # Check if raw CSV text was sent in JSON payload
        json_data = request.get_json(silent=True)
        if json_data and "csv_content" in json_data:
            csv_content = json_data["csv_content"]
            filename = "pasted_data.csv"
        else:
            return jsonify({
                "success": False,
                "error": "No file uploaded. Please select a CSV file to upload."
            }), 400
    else:
        file = request.files["file"]
        if file.filename == "":
            return jsonify({
                "success": False,
                "error": "No file selected. Please choose a CSV file."
            }), 400

        filename = file.filename
        if not filename.lower().endswith(".csv"):
            return jsonify({
                "success": False,
                "error": "Invalid file format. Please upload a .csv file."
            }), 400

        try:
            csv_content = file.read().decode("utf-8-sig")
        except UnicodeDecodeError:
            try:
                file.seek(0)
                csv_content = file.read().decode("latin-1")
            except Exception:
                return jsonify({
                    "success": False,
                    "error": "Unable to read file encoding. Please ensure the file is saved as UTF-8 CSV."
                }), 400

    # Validate and parse CSV content
    try:
        parsed_history = forecasting.parse_and_validate_csv(csv_content)
    except ValueError as ve:
        return jsonify({
            "success": False,
            "error": str(ve)
        }), 400
    except Exception as e:
        return jsonify({
            "success": False,
            "error": f"Error parsing CSV: {str(e)}"
        }), 400

    # Store for current session
    user_id = session["user_id"]
    SESSION_DATA_STORE[user_id] = {
        "filename": filename,
        "history": parsed_history
    }

    # Run analysis
    analysis = forecasting.perform_full_analysis(parsed_history)
    analysis["is_custom_dataset"] = True
    analysis["uploaded_filename"] = filename

    # Update forecast file on disk
    try:
        csv_forecast = forecasting.generate_forecast_csv_text(analysis["forecast"])
        OUTPUT_FORECAST_CSV_PATH.write_text(csv_forecast, encoding="utf-8")
    except Exception:
        pass

    return jsonify({
        "success": True,
        "message": f"Successfully loaded and validated '{filename}' with {len(parsed_history)} monthly records.",
        "data": analysis
    })


@app.route("/api/reset", methods=["POST"])
def api_reset():
    """Reset session dataset back to default municipal sample data."""
    user_id = session.get("user_id")
    if user_id and user_id in SESSION_DATA_STORE:
        del SESSION_DATA_STORE[user_id]

    history, _ = get_current_history()
    analysis = forecasting.perform_full_analysis(history)
    analysis["is_custom_dataset"] = False

    try:
        csv_forecast = forecasting.generate_forecast_csv_text(analysis["forecast"])
        OUTPUT_FORECAST_CSV_PATH.write_text(csv_forecast, encoding="utf-8")
    except Exception:
        pass

    return jsonify({
        "success": True,
        "message": "Reset to default urban sample dataset successfully.",
        "data": analysis
    })


@app.route("/api/download/forecast", methods=["GET"])
@app.route("/forecast.csv", methods=["GET"])
def download_forecast():
    """Download generated 6-month predictions as CSV file."""
    history, _ = get_current_history()
    analysis = forecasting.perform_full_analysis(history)
    csv_text = forecasting.generate_forecast_csv_text(analysis["forecast"])

    return Response(
        csv_text,
        mimetype="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=urban_water_forecast.csv",
            "Content-Type": "text/csv; charset=utf-8"
        }
    )


@app.route("/api/download/sample", methods=["GET"])
def download_sample():
    """Download the official template sample CSV for user testing."""
    if SAMPLE_CSV_PATH.exists():
        try:
            content = SAMPLE_CSV_PATH.read_text(encoding="utf-8")
            return Response(
                content,
                mimetype="text/csv",
                headers={
                    "Content-Disposition": "attachment; filename=sample_water_consumption.csv",
                    "Content-Type": "text/csv; charset=utf-8"
                }
            )
        except Exception:
            pass

    # Generate on the fly if not on disk
    sample_text = forecasting.generate_sample_csv_text()
    return Response(
        sample_text,
        mimetype="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=sample_water_consumption.csv",
            "Content-Type": "text/csv; charset=utf-8"
        }
    )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print("=" * 65)
    print(" Urban Water Consumption Analysis & Forecasting System")
    print(f" Web Server starting at: http://127.0.0.1:{port}")
    print(" Open the above URL in your browser to view the dashboard.")
    print("=" * 65)
    app.run(host="127.0.0.1", port=port, debug=True)
