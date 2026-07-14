---
title: "MedStock-Wise: A Multi-Tenant, Weather-Informed Framework for Zero-Shot Demand Forecasting in Healthcare Inventory"
author:
  - Suhani Chatterjee (Dept. of CSE, Manipal University Jaipur)
  - Usha Jain (Dept. of CSE, Manipal University Jaipur)
date: 2026
---

# Abstract

Hospitals depend on the timely availability of medical supplies, yet many still rely on manual or reactive, fixed-threshold inventory systems that surface a problem only once stock is already critically low. This paper presents **MedStock-Wise**, a deployed, multi-tenant framework that unifies demand forecasting, cost optimization, and continuous monitoring in a single production system. Its central contribution is a **global, weather-informed demand model that generalizes zero-shot**: it is trained once, and any newly onboarded hospital obtains useful predictions for its own items *without any per-hospital retraining*. This is achieved by describing each item through context features — a demand category, calendar signals, external weather, and the item's own recent usage — and deliberately excluding any hospital identity, so a new hospital's item is simply a new feature vector the model already knows how to score. The model is trained on a real pharmaceutical-sales time series with genuine seasonality, joined to real historical weather (Open-Meteo), and achieves a held-out coefficient of determination of R² = 0.71; in a leave-one-category-out test, every demand category held entirely out of training is still predicted better than a mean baseline, directly evidencing zero-shot generalization. To bridge the scale gap between the training data and arbitrary hospital items, the model is served as normalized **seasonal multiplier curves** that scale each item's own baseline usage, making the system scale-invariant. MedStock-Wise further provides tenant-isolated data via database row-level security, Economic Order Quantity (EOQ) optimization, expiry and demand-drift monitoring, email alerting, and a drift-triggered continual-training loop. The system is deployed and operational.

**Keywords:** healthcare inventory, demand forecasting, zero-shot generalization, weather-informed models, multi-tenancy, MLOps, EOQ, LightGBM.

# I. Introduction

Appropriate management of healthcare inventory is critical because patient outcomes depend on it. Medicines, equipment, and consumables must be available in sufficient quantity and on time. Shortages delay treatment or force emergency purchasing at premium prices, while excess stock produces expired supplies and elevated holding costs. Despite this, many hospitals still rely on manual processes or fixed low-stock thresholds that only react after a shortfall is imminent and cannot anticipate demand.

A prior version of this work (MedStock-Wise, 2025) demonstrated that a tuned gradient-boosting model with EOQ optimization could forecast demand and recommend order quantities. That system, however, had three limitations that this paper directly addresses. First, its forecasting model was trained on a single synthetic dataset and, critically, could not serve a *new* hospital without being retrained on that hospital's data. Second, it was single-tenant: all data shared one flat namespace with no organizational isolation. Third, several capabilities — seasonal disease drivers, multi-hospital support, external notifications, and continuous data-driven refinement — were named as future work but not built.

This paper turns those future directions into realized, deployed contributions. Specifically, we contribute:

1. A **global, zero-shot demand model** whose features carry no hospital identity, so onboarding a new hospital triggers no retraining (Section IV).
2. A **weather-informed seasonality mechanism** grounded in real external data rather than a hardcoded calendar rule (Sections IV–V).
3. A **scale-invariant serving design** based on seasonal multiplier curves that lets one model serve items of any magnitude (Section V).
4. A **multi-tenant architecture** with database-enforced isolation and self-service onboarding (Section III).
5. **Monitoring and a continual-training loop** — expiry, demand-drift, and prediction-error alerting, plus a drift-triggered retraining pipeline (Section VII).

We are careful throughout to distinguish what is validated on real data from what is demonstrated via transparent simulation, and we report an honest account of where the approach's accuracy is bounded by data availability.

# II. Related Work

Prior studies on machine learning for healthcare supply chains largely treat forecasting and optimization as separate, offline exercises, validating a model on a single institution's historical data. Comparatively few describe end-to-end systems that operationalize predictions with live monitoring, and fewer still address the practical requirement that a forecasting system serve *multiple, heterogeneous* institutions without bespoke per-institution model training. The gap between theoretical validation and deployable, multi-tenant intelligence is what MedStock-Wise targets. Our design draws on two well-established ideas: (i) *global (pooled) forecasting models*, which learn shared structure across many series and generalize to unseen series through context features rather than per-series parameters; and (ii) *seasonal decomposition*, where a forecast is factored into a level term and a seasonal factor — here, the item's own baseline supplies the level and the model supplies the seasonal factor.

# III. System Architecture

MedStock-Wise is a web application (React/TypeScript front end) backed by a managed PostgreSQL database with authentication, storage, and serverless "edge" functions, plus a separate model-serving microservice. The system is **multi-tenant**: every operational table (inventory, predictions, alerts, cost optimizations, usage history, audit logs, alert configuration) carries a `hospital_id`, and **row-level security (RLS)** policies enforce that a user can only read or write rows belonging to their own hospital. Role-based access (admin, inventory manager, nurse) is layered on top of tenant isolation, so authorization requires both the correct role *and* a matching hospital.

Onboarding is self-service. At sign-up a user either **creates a new hospital** — becoming its administrator, with the hospital assigned a climate region — or **joins an existing hospital** using an invite code, in which case they are added as a nurse. This branching is resolved atomically inside a database trigger, so an invalid invite code or a failed hospital creation rolls back the entire sign-up with no orphaned records. A user's hospital assignment is immutable after sign-up, preventing a compromised account from grafting itself onto another tenant.

Server-side actions that must bypass RLS (running predictions, seeding, cost optimization) execute with a service role and therefore re-derive the caller's hospital from the verified session token and explicitly scope every query and insert, so the tenant boundary is preserved even where RLS is not the enforcing layer.

# IV. Demand Forecasting Methodology

## A. Data foundation

A forecasting model can only generalize if its training target has real, learnable structure. We found that a naïve inventory-usage field, when constructed as a per-day snapshot, exhibited near-zero autocorrelation (~0.01) and no meaningful correlation with any covariate — effectively noise — which fundamentally bounds any model trained on it. We therefore ground the model in a **real pharmaceutical-sales time series** (daily sales across eight Anatomical Therapeutic Chemical (ATC) drug categories over roughly six years) that exhibits genuine, epidemiologically coherent seasonality: antihistamines peak in spring (allergy season), airway/respiratory medications peak in cold months, and antipyretic analgesics peak in fever season, with lag-1 autocorrelations of 0.15–0.47. The eight ATC codes are consolidated into five **demand categories** — *allergy*, *respiratory_airway*, *analgesic*, *anti_inflammatory*, *sedative* — keeping opposite-seasonality drugs (spring-peaking allergy vs. winter-peaking airway) in separate categories so their signals do not cancel.

External weather is obtained from the **Open-Meteo** historical archive (free, key-less) for a representative city per climate region, aligned to the sales dates. Training joins the temperate region — the climate consistent with the sales data's observed seasonality.

## B. Features and zero-shot design

The data is reshaped to one row per (demand category, date). Features are: a one-hot demand category; calendar signals (month, day of week, week of year, weekend indicator); weather (mean and minimum temperature, precipitation, and a 7-day rolling mean temperature); and demand lags (1, 7, 14 days) with a 7-day rolling mean. Crucially, **no location or hospital identity is included**. Because the model never learns "this specific hospital," a new hospital's item is representable purely through these shared context features — the mechanism that enables zero-shot generalization and eliminates per-hospital retraining.

The model is a gradient-boosted tree ensemble (LightGBM), tuned by randomized search with a time-series cross-validation split. The train/test split is a single 80/20 temporal cut; lags are computed within each category prior to the global date sort, so no future information leaks into training. Reproducibility is fixed by a global random seed.

# V. Scale-Invariant Serving via Seasonal Multiplier Curves

The model predicts demand in the *training data's* units, which do not match the scale of an arbitrary hospital item (a hospital's glove consumption is unrelated in magnitude to a pharmacy's drug sales). Serving raw predictions would therefore be meaningless. We resolve this with **seasonal decomposition**: the model supplies the seasonal *shape*, and each item's own baseline usage supplies the *level*.

Concretely, the trained model is distilled offline into normalized **seasonal multiplier curves** — for each demand category and climate region, the model is evaluated across a representative year using that region's weather *climatology*, and the resulting demand profile is normalized to a mean of 1.0. Serving is then a lookup plus arithmetic:

> forecast_daily = item_baseline_usage × multiplier[category][region][day-of-year]
> estimated_demand = forecast_daily × restock_lead_time

This is fully **scale-invariant** (a 10-unit/day item and a 1000-unit/day item receive the same multiplier and scale linearly), requires no model inference at request time, and degrades gracefully: items with no seasonal analogue (equipment, most PPE) are tagged *general* and receive a flat 1.0 multiplier — i.e., no seasonal adjustment, which is the correct behaviour for a ventilator. Because serving is a pure lookup, the model-serving microservice carries no heavy ML dependencies.

# VI. Inventory Cost Optimization

For each item the system computes the Economic Order Quantity (EOQ), reorder point, and safety stock from the item's cost parameters and its (now seasonally-adjusted) demand. Reorder timing uses predicted daily demand multiplied by restock lead time. High-consumption consumables receive larger, less frequent orders; low-turnover, high-unit-cost equipment receives more conservative quantities. Relative to fixed-quantity or manual ordering, EOQ-based recommendations yield steadier procurement cycles and reduce unnecessary accumulation.

# VII. Monitoring and Continual Learning

MedStock-Wise implements three monitoring signals whose alert types were previously specified but never computed:

- **Expiry warning:** items within a configurable window of their expiry date raise an alert (critical within seven days).
- **Demand drift:** each item's baseline usage is captured on first observation; when subsequent usage diverges beyond a configurable threshold, a drift alert flags that the item's demand has moved away from its baseline.
- **Prediction error:** a prior forecast is compared against realized demand; large divergence is flagged.

These signals feed a **drift-triggered continual-training loop**. Drift alerts indicate the shared model may be stale; a continuous-integration workflow (manually dispatchable or scheduled) then regenerates the model and seasonal curves, runs the test suite, commits the refreshed artifacts, and redeploys the serving microservice. This is standard "continual training" via CI rather than per-example online learning, which is more robust for noisy tabular demand. Two forms of adaptation therefore coexist: **zero-shot serving** (no retraining when a hospital onboards) and **closed-loop refresh** (retraining the *shared* model as the underlying data evolves).

# VIII. Results and Evaluation

All results below are on real data unless explicitly noted as simulation.

**Held-out accuracy.** On the temporal hold-out, the global model attains **R² = 0.71** (MAE = 4.67 units/day; WAPE = 37%). We report WAPE rather than MAPE because the demand series is intermittent with many zero-sale days, on which MAPE is undefined/unstable. The R² is the decisive evidence that the real data foundation supports a learnable, generalizing model — a model trained on the earlier noise-like inventory field achieved R² ≈ 0.

**Zero-shot generalization.** In a leave-one-demand-category-out protocol, the model is trained on four categories and evaluated on the fifth, which it never saw in training. **All five held-out categories beat a mean-usage baseline** — for example, allergy MAE 3.54 vs. baseline 11.11, and respiratory MAE 6.20 vs. 9.11. This directly supports the claim that a newly onboarded hospital's unseen item type still receives useful predictions with no retraining.

**Weather contribution.** A with-versus-without-weather ablation shows weather reduces single-location MAE by only ~1%. We report this honestly: at a single training location, calendar features are strongly collinear with weather, so weather is largely redundant *for accuracy there*. Its role is **cross-region differentiation at serving time** — feeding a tropical hospital's actual weather to the same model yields a region-appropriate forecast that calendar signals alone cannot produce, which we demonstrate directly (e.g., a respiratory item's estimated demand is ~1.85× higher in January than July in a temperate region, and the January multiplier differs between temperate and tropical regions).

**Shortage and expiry decision support.** Alerts are generated when predicted demand over the lead time exceeds available buffer, and when items approach expiry, providing anticipatory rather than purely reactive signals.

# IX. Deployment and Engineering

The system is deployed end-to-end: an independently owned managed database with all schema migrations and serverless functions applied; a static-hosted front end; and the model-serving microservice on a container host, verified to return the correct seasonal behaviour. Engineering practices include: enforced row-level security as the primary authorization boundary; server-verified rate limiting and password-reuse prevention; runtime input validation on all serverless endpoints; audit logging of sensitive actions via database triggers; typed data access; a unit and integration test suite (front end, ML pipeline, and serving logic); and continuous integration that type-checks, lints, tests, and builds on every change. A graceful fallback ensures that if the model service is unreachable, predictions degrade to a clearly-labelled formula rather than failing.

# X. Limitations

We state limitations plainly. (1) The multi-region demand layer is a **transparent simulation**: the real weather-to-demand relationship is learned from real data and then applied to other regions' real weather; it is not a validated multi-hospital accuracy claim. (2) The pharmacy data's exact location is unpublished; a temperate climate is a documented assumption consistent with the observed seasonality. (3) Day-to-day intermittent count demand is intrinsically hard to predict exactly (WAPE ≈ 37%), though the model captures the structure (R² = 0.71). (4) Serving currently uses climatological seasonality rather than the live short-term weather forecast; incorporating the forward forecast is a direct extension. (5) Drift and prediction-error monitoring become meaningful only as a hospital accumulates real usage over time; in a static deployment they correctly remain quiet.

# XI. Future Work

Natural next steps include: incorporating live short-range weather forecasts (rather than climatology) so the system anticipates specific incoming weather events; integrating regional epidemiological surveillance signals (e.g., influenza or vector-borne disease incidence) as additional demand drivers; deriving true consumption from stock-delta history to sharpen drift and error monitoring; a stochastic EOQ formulation to relax the constant-demand, fixed-lead-time assumption; multi-channel notifications (SMS in addition to email); and validation on real, larger, multi-institution datasets as they become available.

# XII. Conclusion

MedStock-Wise shows that a single, weather-informed global model can serve heterogeneous hospitals with **zero per-hospital retraining**, by combining context-only features, real seasonal data, and a scale-invariant seasonal-multiplier serving design, all within a deployed multi-tenant system that also delivers cost optimization, monitoring, and a continual-training loop. The model generalizes zero-shot to unseen demand categories on real data (R² = 0.71; every held-out category beats baseline), and the accompanying engineering makes it a practical, honest, and extensible platform for modern healthcare inventory management.

# References

[1] V. N. Kolluri, "Machine Learning in Managing Healthcare Supply Chains," *J. Emerg. Technol. Innov. Res.*, vol. 3, no. 6, 2016.

[2] F. S. Khan et al., "AI in healthcare supply chain management: enhancing efficiency and reducing costs with predictive analytics," *J. Comput. Sci. Technol. Studies*, vol. 6, no. 5, pp. 85–93, 2024.

[3] G. Ke et al., "LightGBM: A Highly Efficient Gradient Boosting Decision Tree," *Advances in Neural Information Processing Systems*, 2017.

[4] Open-Meteo, "Free Open-Source Weather API," historical archive service. [Online]. Available: https://open-meteo.com

[5] M. Zdravković, "Pharma Sales Data" (daily pharmaceutical sales across ATC categories, 2014–2019). Public dataset.

[6] R. J. Hyndman and G. Athanasopoulos, *Forecasting: Principles and Practice*, 3rd ed., OTexts, 2021 (global/pooled models; seasonal decomposition).

[7] F. R. Harris, "How Many Parts to Make at Once," *Factory, The Magazine of Management*, 1913 (Economic Order Quantity).
