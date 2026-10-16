"""
Urban Water Consumption Analysis and Forecasting System
======================================================
Core Data Analysis and Forecasting Engine
Integrates linear trend analysis, monthly seasonal decomposition,
historical test set MAE evaluation, and CSV validation.
"""

import csv
import io
import re
from datetime import date, datetime
from statistics import mean
from typing import Dict, List, Tuple, Any, Optional


def create_sample_data() -> List[Tuple[date, float]]:
    """
    Create four years (48 months) of realistic municipal water consumption
    data through the current month, preserving the original baseline,
    linear growth trend, seasonal fluctuation, and minor noise.
    """
    seasonal_pattern = [-12, -10, -4, 2, 8, 14, 17, 15, 8, 2, -5, -10]
    values = []
    today = date.today()
    current_month = today.year * 12 + today.month - 1
    first_month = current_month - 47

    for month_index in range(48):
        year, month_offset = divmod(first_month + month_index, 12)
        month = month_offset + 1
        # Gradual increasing trend + repeating seasonal variation + slight random-like perturbation
        consumption = float(
            500
            + 2 * month_index
            + seasonal_pattern[month - 1]
            + (month_index % 5 - 2)
        )
        values.append((date(year, month, 1), round(consumption, 2)))

    return values


def next_month(month_date: date) -> date:
    """Return the first day of the subsequent calendar month."""
    if month_date.month == 12:
        return date(month_date.year + 1, 1, 1)
    return date(month_date.year, month_date.month + 1, 1)


def fit_model(history: List[Tuple[date, float]]) -> Tuple[float, float, Dict[int, float]]:
    """
    Fit an Ordinary Least Squares (OLS) linear trend and estimate average
    monthly seasonal effects from residual analysis.
    
    Preserves the exact statistical mathematical formulation from project.py:
    1. Trend line: Y_trend = Intercept + Slope * X
    2. Monthly residuals: Residual(t) = Actual(t) - Trend(t)
    3. Mean monthly seasonal factor: Mean(Residuals for month m)
    4. Demeaned seasonal effect: Effect(m) - Average(Effects)
    """
    if not history:
        raise ValueError("Historical data cannot be empty.")
    
    x_values = list(range(len(history)))
    y_values = [float(consumption) for _, consumption in history]
    
    n = len(x_values)
    x_mean = mean(x_values)
    y_mean = mean(y_values)
    
    denominator = sum((x - x_mean) ** 2 for x in x_values)
    if denominator == 0:
        slope = 0.0
    else:
        slope = sum((x - x_mean) * (y - y_mean) for x, y in zip(x_values, y_values)) / denominator
    
    intercept = y_mean - slope * x_mean

    # Group residuals by calendar month (1 through 12)
    monthly_residuals = {m: [] for m in range(1, 13)}
    for index, (month_date, consumption) in enumerate(history):
        trend = intercept + slope * index
        monthly_residuals[month_date.month].append(consumption - trend)

    # Average seasonal residual per month
    seasonal_effects = {
        m: mean(residuals) if residuals else 0.0
        for m, residuals in monthly_residuals.items()
    }
    
    # Demean so that seasonal effects sum to zero across all months
    seasonal_average = mean(seasonal_effects.values())
    seasonal_effects = {
        m: effect - seasonal_average
        for m, effect in seasonal_effects.items()
    }
    
    return intercept, slope, seasonal_effects


def predict(
    history: List[Tuple[date, float]],
    future_dates: List[date],
    model_params: Optional[Tuple[float, float, Dict[int, float]]] = None
) -> List[Tuple[date, float]]:
    """
    Predict water consumption for future dates using the fitted model:
    Consumption = Intercept + Slope * (len(history) + offset) + Seasonal_Effect(Month)
    """
    if model_params is None:
        intercept, slope, seasonal_effects = fit_model(history)
    else:
        intercept, slope, seasonal_effects = model_params

    results = []
    base_len = len(history)
    for offset, forecast_date in enumerate(future_dates):
        pred = (
            intercept
            + slope * (base_len + offset)
            + seasonal_effects.get(forecast_date.month, 0.0)
        )
        results.append((forecast_date, max(0.0, pred)))  # consumption cannot be negative
    return results


def evaluate_model_mae(
    history: List[Tuple[date, float]],
    test_months: int = 6
) -> Dict[str, Any]:
    """
    Evaluate forecasting model accuracy using Mean Absolute Error (MAE)
    on real historical held-out test data.
    
    Splits history into training set (earlier portion) and test set (final N months).
    Predicts values for test set months using only training set data, then compares
    predictions against actual known test observations.
    
    Returns:
        dict containing mae, test_months_count, test_details (actual, predicted, error).
    """
    total_months = len(history)
    if total_months < 12:
        raise ValueError("Need at least 12 months of historical data to evaluate model.")
    
    # Adapt test window if dataset is smaller than 18 months
    effective_test_months = min(test_months, max(2, total_months // 4))
    
    training_data = history[:-effective_test_months]
    test_data = history[-effective_test_months:]
    
    test_dates = [month_date for month_date, _ in test_data]
    test_predictions = predict(training_data, test_dates)
    
    errors = []
    comparison = []
    for (actual_date, actual_val), (pred_date, pred_val) in zip(test_data, test_predictions):
        abs_err = abs(actual_val - pred_val)
        errors.append(abs_err)
        comparison.append({
            "month": actual_date.strftime("%Y-%m"),
            "actual": round(actual_val, 2),
            "predicted": round(pred_val, 2),
            "absolute_error": round(abs_err, 2),
            "percentage_error": round((abs_err / actual_val * 100), 2) if actual_val > 0 else 0.0
        })
        
    mae = mean(errors) if errors else 0.0
    mape = mean(c["percentage_error"] for c in comparison) if comparison else 0.0
    
    return {
        "mae": round(mae, 2),
        "mape": round(mape, 2),
        "test_months_count": effective_test_months,
        "training_months_count": len(training_data),
        "test_comparisons": comparison
    }


def parse_and_validate_csv(csv_content: str) -> List[Tuple[date, float]]:
    """
    Parse and thoroughly validate uploaded CSV data for water consumption.
    
    Expected format:
    month,consumption_megaliters
    2022-01,486
    2022-02,491
    
    Validations performed:
    1. Check for non-empty content
    2. Check for valid CSV header (month/date and consumption/consumption_megaliters)
    3. Check date format (YYYY-MM or YYYY-MM-DD)
    4. Check numerical values (must be valid positive float/int, not NaN/empty)
    5. Check for duplicate months
    6. Minimum record count (at least 12 months)
    7. Chronological ordering
    """
    if not csv_content or not csv_content.strip():
        raise ValueError("Uploaded file is empty. Please upload a valid CSV file.")

    # Read lines and strip BOM if present
    content = csv_content.lstrip("\ufeff")
    lines = [line.strip() for line in content.splitlines() if line.strip()]
    if len(lines) < 2:
        raise ValueError("CSV file must contain a header row and at least 12 rows of data.")

    # Parse CSV with dialect sniffing or standard delimiter
    try:
        delimiter = ","
        if ";" in lines[0] and lines[0].count(";") > lines[0].count(","):
            delimiter = ";"
        elif "\t" in lines[0]:
            delimiter = "\t"
        reader = csv.reader(io.StringIO(content), delimiter=delimiter)
    except Exception as e:
        raise ValueError(f"Unable to parse CSV structure: {str(e)}")

    rows = list(reader)
    if not rows:
        raise ValueError("No data found in the CSV file.")

    header = [col.strip().lower() for col in rows[0]]
    
    # Identify month column
    month_col_idx = -1
    for idx, col in enumerate(header):
        if col in ("month", "date", "period", "timestamp", "year_month", "year-month"):
            month_col_idx = idx
            break
            
    # Identify consumption column
    consumption_col_idx = -1
    for idx, col in enumerate(header):
        if any(term in col for term in ("consumption", "megaliters", "usage", "volume", "value", "megalitres")):
            consumption_col_idx = idx
            break

    # If headers not matching keywords, default to col 0 and 1 if there are 2 columns
    if month_col_idx == -1 and len(header) >= 2:
        month_col_idx = 0
    if consumption_col_idx == -1 and len(header) >= 2:
        consumption_col_idx = 1

    if month_col_idx == -1 or consumption_col_idx == -1:
        raise ValueError(
            "CSV header must contain 'month' and 'consumption_megaliters' columns (e.g., month,consumption_megaliters)."
        )

    parsed_records: Dict[date, float] = {}
    month_regex = re.compile(r"^(\d{4})[-/](0[1-9]|1[0-2])(?:[-/](0[1-9]|[12]\d|3[01]))?$")

    for line_num, row in enumerate(rows[1:], start=2):
        if not row or all(not cell.strip() for cell in row):
            continue  # ignore empty line

        if len(row) <= max(month_col_idx, consumption_col_idx):
            raise ValueError(f"Line {line_num}: Incomplete row with fewer columns than expected.")

        raw_month = row[month_col_idx].strip()
        raw_consumption = row[consumption_col_idx].strip()

        if not raw_month:
            raise ValueError(f"Line {line_num}: Month value is missing.")
        if not raw_consumption:
            raise ValueError(f"Line {line_num}: Consumption value is missing.")

        # Validate Date format
        match = month_regex.match(raw_month)
        if not match:
            # Try parsing with datetime
            try:
                dt = datetime.strptime(raw_month, "%Y-%m-%d").date()
                month_date = date(dt.year, dt.month, 1)
            except ValueError:
                try:
                    dt = datetime.strptime(raw_month, "%Y-%m").date()
                    month_date = date(dt.year, dt.month, 1)
                except ValueError:
                    raise ValueError(
                        f"Line {line_num}: Invalid date format '{raw_month}'. Expected 'YYYY-MM' (e.g., 2022-01)."
                    )
        else:
            year = int(match.group(1))
            month = int(match.group(2))
            month_date = date(year, month, 1)

        # Validate Consumption numeric value
        try:
            # remove thousands separators or quotes if present
            clean_consumption_str = raw_consumption.replace(",", "").replace("$", "").strip()
            consumption_val = float(clean_consumption_str)
        except ValueError:
            raise ValueError(
                f"Line {line_num}: Invalid numeric consumption value '{raw_consumption}'. Must be a valid positive number."
            )

        if consumption_val <= 0:
            raise ValueError(
                f"Line {line_num}: Consumption value ({consumption_val}) must be greater than zero."
            )

        # Check duplicate months
        if month_date in parsed_records:
            raise ValueError(
                f"Line {line_num}: Duplicate month '{month_date.strftime('%Y-%m')}' detected. Each month must be unique."
            )

        parsed_records[month_date] = round(consumption_val, 2)

    # Sort records chronologically
    sorted_history = sorted(parsed_records.items(), key=lambda item: item[0])

    if len(sorted_history) < 12:
        raise ValueError(
            f"Dataset contains only {len(sorted_history)} months. At least 12 months of consecutive data are required to capture annual seasonality."
        )

    return sorted_history


def perform_full_analysis(history: List[Tuple[date, float]]) -> Dict[str, Any]:
    """
    Perform complete analytical pipeline on historical data:
    1. Computes descriptive statistics (total, average, min, max)
    2. Fits OLS linear trend and monthly seasonal effects
    3. Evaluates model performance via MAE and MAPE on historical test split
    4. Predicts consumption for the next 6 months
    5. Calculates month-over-month trend directions and percentages
    """
    history_dates = [d for d, _ in history]
    history_values = [v for _, v in history]

    total_consumption = sum(history_values)
    avg_consumption = mean(history_values)
    min_consumption = min(history_values)
    max_consumption = max(history_values)

    min_item = next((d.strftime("%b %Y"), v) for d, v in history if v == min_consumption)
    max_item = next((d.strftime("%b %Y"), v) for d, v in history if v == max_consumption)

    # Fit linear trend and seasonal effects
    intercept, slope, seasonal_effects = fit_model(history)

    # Trend determination
    if slope > 0.05:
        trend_direction = "Increasing"
        trend_badge = "trend-up"
    elif slope < -0.05:
        trend_direction = "Decreasing"
        trend_badge = "trend-down"
    else:
        trend_direction = "Stable"
        trend_badge = "trend-stable"

    annual_trend_change = slope * 12.0

    # Model Evaluation (real historical test MAE)
    evaluation = evaluate_model_mae(history, test_months=6)

    # Generate 6 future months
    future_dates = []
    curr = next_month(history[-1][0])
    for _ in range(6):
        future_dates.append(curr)
        curr = next_month(curr)

    # Predict future 6 months using full model
    future_predictions = predict(history, future_dates, (intercept, slope, seasonal_effects))

    latest_actual = history[-1][1]
    latest_month_str = history[-1][0].strftime("%Y-%m")

    # Format forecast rows with month-over-month change
    forecast_list = []
    prev_val = latest_actual
    for f_date, f_val in future_predictions:
        mom_change = f_val - prev_val
        mom_percent = (mom_change / prev_val * 100) if prev_val > 0 else 0.0
        forecast_list.append({
            "month": f_date.strftime("%Y-%m"),
            "display_month": f_date.strftime("%b %Y"),
            "consumption": round(f_val, 2),
            "seasonal_effect": round(seasonal_effects[f_date.month], 2),
            "mom_change": round(mom_change, 2),
            "mom_percent": round(mom_percent, 1),
            "is_increasing": f_val >= prev_val
        })
        prev_val = f_val

    next_month_pred = forecast_list[0]["consumption"]
    next_month_str = forecast_list[0]["month"]
    next_month_diff = next_month_pred - latest_actual
    next_month_pct = (next_month_diff / latest_actual * 100) if latest_actual > 0 else 0.0

    # Month names mapping for seasonal effects display
    month_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    seasonal_breakdown = [
        {
            "month_num": m,
            "month_name": month_names[m - 1],
            "effect": round(seasonal_effects[m], 2)
        }
        for m in range(1, 13)
    ]

    return {
        "unit": "megaliters",
        "total_historical_consumption": round(total_consumption, 2),
        "average_monthly_consumption": round(avg_consumption, 2),
        "historical_count": len(history),
        "start_month": history[0][0].strftime("%b %Y"),
        "end_month": history[-1][0].strftime("%b %Y"),
        "latest_month": latest_month_str,
        "latest_consumption": round(latest_actual, 2),
        "min_record": {"month": min_item[0], "value": min_item[1]},
        "max_record": {"month": max_item[0], "value": max_item[1]},
        
        # Trend indicators
        "trend_direction": trend_direction,
        "trend_badge": trend_badge,
        "slope_monthly": round(slope, 3),
        "annual_trend_change": round(annual_trend_change, 2),
        "intercept": round(intercept, 2),
        
        # Next month prediction
        "next_month": next_month_str,
        "next_month_consumption": round(next_month_pred, 2),
        "next_month_diff": round(next_month_diff, 2),
        "next_month_pct": round(next_month_pct, 1),
        
        # Evaluation
        "mae": evaluation["mae"],
        "mape": evaluation["mape"],
        "test_months_count": evaluation["test_months_count"],
        "test_comparisons": evaluation["test_comparisons"],
        
        # Forecasts
        "forecast": forecast_list,
        
        # Chart Data
        "history": [
            {"month": d.strftime("%Y-%m"), "display_month": d.strftime("%b %Y"), "consumption": v}
            for d, v in history
        ],
        "seasonal_effects": seasonal_breakdown
    }


def generate_forecast_csv_text(forecasts: List[Dict[str, Any]]) -> str:
    """Generate downloadable CSV content from forecasts."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["month", "predicted_consumption_megaliters", "seasonal_effect_megaliters", "trend_status"])
    for item in forecasts:
        trend = "Increasing" if item.get("is_increasing") else "Decreasing"
        writer.writerow([
            item["month"],
            item["consumption"],
            item.get("seasonal_effect", 0.0),
            trend
        ])
    return output.getvalue()


def generate_sample_csv_text(history: Optional[List[Tuple[date, float]]] = None) -> str:
    """Generate sample dataset CSV content matching the expected upload format."""
    if history is None:
        history = create_sample_data()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["month", "consumption_megaliters"])
    for d, v in history:
        writer.writerow([d.strftime("%Y-%m"), round(v, 2)])
    return output.getvalue()
