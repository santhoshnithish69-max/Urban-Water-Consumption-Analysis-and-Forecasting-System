"""
Urban Water Consumption Analysis and Forecasting System
======================================================
Streamlit Web Application
A full-stack, data-driven interactive dashboard for municipal
water consumption analysis, linear trend estimation, seasonal decomposition,
and 6-month prospective demand forecasting.
"""

import io
from datetime import date
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import streamlit as st

import forecasting

# 1. Page Configuration
st.set_page_config(
    page_title="Urban Water Consumption Analysis & Forecasting",
    page_icon="💧",
    layout="wide",
    initial_sidebar_state="expanded"
)

# 2. Custom CSS for Modern Blue-and-White Water Theme
st.markdown("""
<style>
    /* Global Theme Overrides */
    .main {
        background-color: #f8fafc;
    }
    
    /* Header Container */
    .header-box {
        background: linear-gradient(135deg, #0f172a 0%, #0369a1 60%, #0284c7 100%);
        border-radius: 14px;
        padding: 2rem 2.2rem;
        color: white;
        margin-bottom: 1.8rem;
        box-shadow: 0 10px 25px -5px rgba(2, 132, 199, 0.25);
    }
    .header-title {
        font-size: 2.1rem;
        font-weight: 800;
        margin-bottom: 0.4rem;
        color: #ffffff;
    }
    .header-sub {
        font-size: 1rem;
        color: #e0f2fe;
        line-height: 1.5;
    }
    .project-badge {
        display: inline-block;
        background: rgba(255, 255, 255, 0.18);
        padding: 0.25rem 0.75rem;
        border-radius: 20px;
        font-size: 0.78rem;
        font-weight: 600;
        text-transform: uppercase;
        margin-bottom: 0.6rem;
        letter-spacing: 0.05em;
    }

    /* Metric Cards */
    div[data-testid="stMetric"] {
        background: #ffffff;
        border: 1px solid #e2e8f0;
        padding: 1.1rem 1.25rem;
        border-radius: 12px;
        box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);
        transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    div[data-testid="stMetric"]:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 14px rgba(2, 132, 199, 0.12);
        border-color: #93c5fd;
    }
    div[data-testid="stMetric"] label {
        font-weight: 700;
        font-size: 0.8rem;
        color: #64748b !important;
        text-transform: uppercase;
        letter-spacing: 0.04em;
    }
    div[data-testid="stMetric"] div[data-testid="stMetricValue"] {
        color: #0c4a6e;
        font-weight: 800;
        font-size: 1.7rem;
    }

    /* Explanation Quote Box */
    .quote-box {
        background: #eff6ff;
        border-left: 5px solid #0284c7;
        padding: 1.1rem 1.4rem;
        border-radius: 8px;
        font-size: 1.02rem;
        font-style: italic;
        color: #0369a1;
        margin: 1rem 0 1.5rem 0;
    }
</style>
""", unsafe_allow_html=True)

# 3. Session State Initialization
if "history_data" not in st.session_state:
    st.session_state.history_data = forecasting.create_sample_data()
    st.session_state.is_custom = False
    st.session_state.dataset_label = "Official 4-Year Municipal Sample (48 Months)"

# 4. Sidebar: Dataset Upload and Ingestion Controls
with st.sidebar:
    st.image("https://img.icons8.com/fluency/96/water.png", width=64)
    st.title("Dataset Controls")
    st.markdown("Upload monthly water consumption data to retrain models and regenerate predictions.")

    uploaded_file = st.file_uploader(
        "Upload Monthly CSV",
        type=["csv"],
        help="Expected columns: month,consumption_megaliters (e.g., 2022-01,486)"
    )

    if uploaded_file is not None:
        try:
            content = uploaded_file.read().decode("utf-8-sig")
            parsed_history = forecasting.parse_and_validate_csv(content)
            st.session_state.history_data = parsed_history
            st.session_state.is_custom = True
            st.session_state.dataset_label = f"Uploaded File: {uploaded_file.name} ({len(parsed_history)} Months)"
            st.success(f"Validated {len(parsed_history)} records!")
        except Exception as e:
            st.error(f"Upload error: {str(e)}")

    st.markdown("---")
    st.subheader("Sample Templates")
    
    # Download sample template
    sample_csv_text = forecasting.generate_sample_csv_text()
    st.download_button(
        label="Download Sample CSV Template",
        data=sample_csv_text,
        file_name="sample_water_consumption.csv",
        mime="text/csv",
        use_container_width=True
    )

    if st.button("Reset to Default Sample Data", use_container_width=True):
        st.session_state.history_data = forecasting.create_sample_data()
        st.session_state.is_custom = False
        st.session_state.dataset_label = "Official 4-Year Municipal Sample (48 Months)"
        st.info("Reset to default dataset.")

    st.markdown("---")
    st.caption("College Final-Year Project Demonstration")

# 5. Header Banner
st.markdown(f"""
<div class="header-box">
    <div class="project-badge">Final-Year Engineering Project</div>
    <div class="header-title">Urban Water Consumption Analysis &amp; Forecasting System</div>
    <div class="header-sub">
        Time-series predictive analytics utilizing Ordinary Least Squares (OLS) linear trend decomposition
        and monthly seasonal adjustment for municipal reservoir and demand planning.
    </div>
</div>
""", unsafe_allow_html=True)

# 6. Execute Analysis Pipeline
history = st.session_state.history_data
try:
    analysis = forecasting.perform_full_analysis(history)
except Exception as e:
    st.error(f"Error computing forecast: {str(e)}")
    st.stop()

# 7. Five Dynamic KPI Statistic Cards
col1, col2, col3, col4, col5 = st.columns(5)

with col1:
    st.metric(
        label="Total Historical",
        value=f"{int(analysis['total_historical_consumption']):,} ML",
        help=f"Sum over {analysis['historical_count']} recorded months ({analysis['start_month']} to {analysis['end_month']})"
    )

with col2:
    st.metric(
        label="Monthly Average",
        value=f"{analysis['average_monthly_consumption']:.1f} ML",
        help=f"Historical baseline demand across {analysis['historical_count']} months"
    )

with col3:
    diff = analysis['next_month_diff']
    pct = analysis['next_month_pct']
    st.metric(
        label=f"Next Month ({analysis['next_month']})",
        value=f"{analysis['next_month_consumption']:.1f} ML",
        delta=f"{diff:+.1f} ML ({pct:+.1f}%)"
    )

with col4:
    st.metric(
        label="Model Error (MAE)",
        value=f"{analysis['mae']:.2f} ML",
        help=f"Mean Absolute Error back-tested on held-out test data (MAPE: {analysis['mape']}%)"
    )

with col5:
    trend_symbol = "+" if analysis['slope_monthly'] >= 0 else ""
    st.metric(
        label="Trend Vector",
        value=analysis['trend_direction'],
        delta=f"{trend_symbol}{analysis['slope_monthly']:.2f} ML/mo"
    )

st.markdown("<br>", unsafe_allow_html=True)

# 8. Interactive Time-Series Graph
st.subheader("Monthly Water Consumption: Historical Actuals vs. 6-Month Forecast")
st.caption(
    "Blue solid curve represents actual historical municipal consumption. "
    "Orange dashed line shows model predictions for the upcoming 6 months. "
    "The vertical gray dotted boundary marks the forecast starting point."
)

fig, ax = plt.subplots(figsize=(11, 4.6), dpi=120)

# Extract plotting dates
hist_dates = [d for d, _ in history]
hist_vals = [v for _, v in history]

# Extract forecast dates
forecast_rows = analysis['forecast']
fore_dates = [date.fromisoformat(f"{row['month']}-01") for row in forecast_rows]
fore_vals = [row['consumption'] for row in forecast_rows]

# Plot lines
ax.plot(hist_dates, hist_vals, label="Actual Consumption", color="#0284c7", linewidth=2.5, marker="o", markersize=3)
ax.plot(
    [hist_dates[-1], *fore_dates],
    [hist_vals[-1], *fore_vals],
    label="Forecast Outlook (Next 6 Mo)",
    color="#f59e0b",
    linestyle="--",
    linewidth=2.5,
    marker="s",
    markersize=4.5
)

# Vertical boundary line
ax.axvline(hist_dates[-1], color="#64748b", linestyle=":", linewidth=2, label="Forecast Starts")

# Styling
ax.set_ylabel("Consumption (Megaliters)", fontsize=10, fontweight="bold", color="#1e293b")
ax.set_xlabel("Year & Month", fontsize=10, fontweight="bold", color="#1e293b")
ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y-%m"))
fig.autofmt_xdate()
ax.grid(True, linestyle="--", alpha=0.35, color="#cbd5e1")
ax.legend(frameon=True, facecolor="#ffffff", edgecolor="#e2e8f0", fontsize=9, loc="upper left")
ax.set_facecolor("#f8fafc")
fig.patch.set_facecolor("#ffffff")
plt.tight_layout()

st.pyplot(fig)

# 9. Two-Column Layout: Forecast Table & Seasonality
col_left, col_right = st.columns([1.1, 0.9])

with col_left:
    st.subheader("6-Month Prospective Forecast Table")
    forecast_df = pd.DataFrame([
        {
            "Forecast Month": row["display_month"],
            "Predicted Demand (ML)": f"{row['consumption']:.2f}",
            "Seasonal Effect (ML)": f"{row['seasonal_effect']:+.2f}",
            "MoM Trend Change": f"{row['mom_change']:+.2f} ML ({row['mom_percent']:+.1f}%)",
            "Direction": "Increasing" if row["is_increasing"] else "Decreasing"
        }
        for row in forecast_rows
    ])
    st.dataframe(forecast_df, use_container_width=True, hide_index=True)

    # Download predictions CSV
    csv_forecast_data = forecasting.generate_forecast_csv_text(analysis['forecast'])
    st.download_button(
        label="Download Forecast Results (CSV)",
        data=csv_forecast_data,
        file_name="urban_water_forecast.csv",
        mime="text/csv",
        use_container_width=True
    )

with col_right:
    st.subheader("Monthly Seasonal Effects Decomposition")
    st.caption("Calculated deviation from linear trend baseline across calendar months:")
    
    seasonal_data = analysis["seasonal_effects"]
    season_df = pd.DataFrame(seasonal_data)
    
    fig_bar, ax_bar = plt.subplots(figsize=(7, 4.3), dpi=100)
    colors = ["#f59e0b" if val >= 0 else "#0284c7" for val in season_df["effect"]]
    ax_bar.bar(season_df["month_name"], season_df["effect"], color=colors, edgecolor="#0f172a", linewidth=0.5)
    ax_bar.axhline(0, color="#64748b", linestyle="-", linewidth=1)
    ax_bar.set_ylabel("Seasonal Impact (ML)", fontsize=9, fontweight="bold")
    ax_bar.grid(axis="y", linestyle="--", alpha=0.3)
    ax_bar.set_facecolor("#f8fafc")
    fig_bar.patch.set_facecolor("#ffffff")
    plt.tight_layout()
    st.pyplot(fig_bar)

# 10. Mandatory MAE Explanation & Test Split Back-Testing
st.markdown("---")
st.subheader("Model Evaluation: Mean Absolute Error (MAE)")

st.markdown("""
<div class="quote-box">
    "Mean Absolute Error measures the average absolute difference between actual and predicted water consumption. Lower MAE generally indicates better predictions."
</div>
""", unsafe_allow_html=True)

st.markdown(f"""
- **Test Methodology**: The dataset was partitioned into an earlier training period and a held-out test set consisting of the final **{analysis['test_months_count']} months**.
- **Model Equation**: $\\text{{Consumption}}(t) = {analysis['intercept']:.2f} + ({analysis['slope_monthly']:.3f} \\times t) + S(\\text{{month}})$
- **Calculated Evaluation**: **MAE = {analysis['mae']:.2f} Megaliters** (MAPE = {analysis['mape']:.2f}%).
""")

with st.expander("View Historical 6-Month Test Set Evaluation Breakdown"):
    test_comp_df = pd.DataFrame(analysis["test_comparisons"])
    test_comp_df.columns = ["Month", "Known Actual (ML)", "Back-Test Predicted (ML)", "Absolute Error (ML)", "Percentage Error (%)"]
    st.dataframe(test_comp_df, use_container_width=True, hide_index=True)

# 11. Project Documentation Tabs (For College Viva)
st.markdown("---")
st.subheader("Project Information & Documentation")

tab_obj, tab_meth, tab_tech, tab_app = st.tabs(["Objective", "Methodology", "Technologies", "Applications"])

with tab_obj:
    st.markdown("""
    ### System Objective
    Rapid urbanization and fluctuating climate patterns create volatile municipal water demand.
    This project provides municipal water utility engineers and urban planners with an interpretable,
    mathematically rigorous forecasting system to:
    - Track long-term consumption growth trajectories.
    - Separate seasonal cyclical fluctuations (summer peaks vs. winter drops).
    - Produce actionable 6-month demand outlooks to optimize storage reserves and avoid water shortages.
    """)

with tab_meth:
    st.markdown("""
    ### Mathematical Methodology
    The forecasting engine applies classical additive time-series decomposition:
    1. **Ordinary Least Squares (OLS) Linear Trend**: Computes trend baseline $\\beta_0$ and slope $\\beta_1$.
    2. **Monthly Residual Seasonality**: Subtracts trend from raw readings to compute residuals per calendar month, normalized to mean zero.
    3. **Prospective Synthesis**: Future consumption = $\\text{Trend}(t) + \\text{Seasonal\\_Effect}(\\text{Month})$.
    4. **Back-Testing**: Validated using held-out historical observations to calculate real MAE.
    """)

with tab_tech:
    st.markdown("""
    ### Technology Stack
    - **Frontend & Cloud**: Streamlit Community Cloud, Altair, HTML5/CSS3.
    - **Backend & Model**: Python 3, Pandas, Matplotlib, Pure Statistics (OLS & Additive Seasonality).
    - **Data Formats**: CSV (`month,consumption_megaliters`).
    """)

with tab_app:
    st.markdown("""
    ### Real-World Applications
    - **Reservoir Capacity Planning**: Regulate inter-basin reservoir releases before dry spells.
    - **Pumping Optimization**: Schedule energy-heavy distribution during off-peak electricity hours.
    - **Drought Preparedness**: Early warnings when consumption exceeds projected thresholds.
    """)

st.caption("Urban Water Consumption Analysis & Forecasting System • Final-Year Engineering Project Demonstration")
