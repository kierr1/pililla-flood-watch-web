# Flood risk model integration

The existing `/ml` page uses a local heuristic (`src/lib/floodModel.ts`) and not a trained model. The dashboard also shows heuristic confidence. Do not relabel these as validated AI forecasts.

The historical Pililla DRRM PDF contains static susceptibility and exposure, not time-series flood outcomes. Import its 27 susceptibility rows into a separate reference table, then collect verified flood and non-flood labels before training.

Use the Python FastAPI service from the Pililla Flood Classification Starter package. Deploy it as a separate Render service with backend-only Supabase secret credentials. Configure a server-side proxy for `/predict`, keep the service key out of the Vite bundle, and expose `model_loaded` and training status on `/ml`.

The site's live readings use `water_level_m`, `wind_speed` in m/s, and `rainfall_mm`. Convert wind to km/h with `*3.6` for the Python API, and ensure `rainfall_mm` is measured over the last hour before mapping it to `rainfall_1h_mm`. Do not use next-hour rainfall forecast as historical observed rainfall. Do not substitute zero for missing measurements.

Current `/ml` UI has ten manually tuned features and defaults. Treat these as a simulation until a verified classifier is available. Do not generate automatic evacuation orders from experimental model output.
