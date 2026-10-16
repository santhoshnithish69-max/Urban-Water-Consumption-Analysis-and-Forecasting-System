""" Urban Water Consumption Prediction-->Time-series analysis"""

import csv
from datetime import date
from statistics import mean


def create_sample_data():
    """Create four years of example consumption data through the current month."""
    seasonal_pattern = [-12, -10, -4, 2, 8, 14, 17, 15, 8, 2, -5, -10]
    values = []
    current_month = date.today().year * 12 + date.today().month - 1
    first_month = current_month - 47

    for month_index in range(48):
        year, month_offset = divmod(first_month + month_index, 12)
        month = month_offset + 1
        # A gradual increase plus a repeating seasonal pattern.
        consumption = (
            500
            + 2 * month_index
            + seasonal_pattern[month - 1]
            + (month_index % 5 - 2)
        )
        values.append((date(year, month, 1), consumption))

    return values


def fit_model(history):
    """Fit a linear trend and estimate average seasonal effects by month."""
    x_values = list(range(len(history)))
    y_values = [consumption for _, consumption in history]
    x_mean = mean(x_values)
    y_mean = mean(y_values)
    denominator = sum((x - x_mean) ** 2 for x in x_values)
    slope = sum(
        (x - x_mean) * (y - y_mean)
        for x, y in zip(x_values, y_values)
    ) / denominator
    intercept = y_mean - slope * x_mean

    monthly_residuals = {month: [] for month in range(1, 13)}
    for index, (month_date, consumption) in enumerate(history):
        trend = intercept + slope * index
        monthly_residuals[month_date.month].append(consumption - trend)

    seasonal_effects = {
        month: mean(residuals) if residuals else 0
        for month, residuals in monthly_residuals.items()
    }
    seasonal_average = mean(seasonal_effects.values())
    seasonal_effects = {
        month: effect - seasonal_average
        for month, effect in seasonal_effects.items()
    }
    return intercept, slope, seasonal_effects


def predict(history, future_dates):
    intercept, slope, seasonal_effects = fit_model(history)
    return [
        (
            forecast_date,
            intercept
            + slope * (len(history) + offset)
            + seasonal_effects[forecast_date.month],
        )
        for offset, forecast_date in enumerate(future_dates)
    ]


def next_month(month_date):
    if month_date.month == 12:
        return date(month_date.year + 1, 1, 1)
    return date(month_date.year, month_date.month + 1, 1)


def plot_forecast(history, forecasts):
    """Plot historical consumption and the forecast, and save the graph."""
    import matplotlib.dates as mdates
    import matplotlib.pyplot as plt

    history_dates = [month_date for month_date, _ in history]
    history_values = [consumption for _, consumption in history]
    forecast_dates = [month_date for month_date, _ in forecasts]
    forecast_values = [consumption for _, consumption in forecasts]

    plt.figure(figsize=(11, 6))
    plt.plot(history_dates, history_values, label="Actual consumption", color="blue")
    plt.plot(
        [history_dates[-1], *forecast_dates],
        [history_values[-1], *forecast_values],
        label="Forecast",
        color="orange",
        linestyle="--",
        marker="o",
    )
    plt.axvline(
        history_dates[-1],
        color="gray",
        linestyle=":",
        label="Forecast starts",
    )
    plt.title("Urban Water Consumption: Actual and Forecast")
    plt.xlabel("Month")
    plt.ylabel("Consumption (megaliters)")
    plt.gca().xaxis.set_major_formatter(mdates.DateFormatter("%Y-%m"))
    plt.gcf().autofmt_xdate()
    plt.grid(True, alpha=0.3)
    plt.legend()
    plt.tight_layout()
    plt.savefig("urban_water_forecast.png")
    plt.show()


def main():
    data = create_sample_data()
    training_data = data[:-6]
    test_data = data[-6:]

    test_predictions = predict(
        training_data,
        [month_date for month_date, _ in test_data],
    )
    mae = mean(
        abs(actual - predicted)
        for (_, actual), (_, predicted) in zip(test_data, test_predictions)
    )
    print(f"Test mean absolute error: {mae:.2f} megaliters")

    future_dates = []
    month_date = next_month(data[-1][0])
    for _ in range(6):
        future_dates.append(month_date)
        month_date = next_month(month_date)

    forecasts = predict(data, future_dates)
    with open("urban_water_forecast.csv", "w", newline="", encoding="utf-8") as file:
        writer = csv.writer(file)
        writer.writerow(["month", "predicted_consumption_megaliters"])
        writer.writerows(
            (month_date.isoformat(), round(consumption, 2))
            for month_date, consumption in forecasts
        )

    print("\nNext 6 months' predicted consumption:")
    for month_date, consumption in forecasts:
        print(f"{month_date:%Y-%m}: {consumption:.2f} megaliters")
    print("\nForecast saved to urban_water_forecast.csv")
    plot_forecast(data, forecasts)
    print("Graph saved to urban_water_forecast.png")
    print("Replace create_sample_data() with your actual monthly readings.")


if __name__ == "__main__":
    main()