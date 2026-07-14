"""
Fetches daily historical weather from Open-Meteo's archive API (free, no key)
for one representative city per climate region, over the pharma dataset's
date range, and caches it to ml/data/raw/weather_<region>.csv so training is
fully reproducible without re-hitting the API.

Why these cities:
  - temperate:   Belgrade (44.79, 20.45) -- the Pharma Sales dataset is from a
                 Balkan/Central-European pharmacy, so this is the real weather
                 that actually co-occurred with the real demand we train on.
  - tropical:    Mumbai (19.07, 72.87) -- monsoon-driven, for the simulated
                 tropical-region hospitals.
  - subtropical: Delhi (28.61, 77.21) -- hot summers, cool winters, monsoon.

Run: python3 ml/fetch_weather.py   (no-op for regions already cached)
"""
import json
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT_DIR = ROOT / "data" / "raw"

# Match the pharma dataset's date span (salesdaily.csv: 2014-01-02 .. 2019-10-08).
START_DATE = "2014-01-01"
END_DATE = "2019-10-31"

REGIONS = {
    "temperate": (44.79, 20.45),
    "tropical": (19.07, 72.87),
    "subtropical": (28.61, 77.21),
}

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"


def fetch_region(region: str, lat: float, lon: float) -> None:
    out_path = OUT_DIR / f"weather_{region}.csv"
    if out_path.exists():
        print(f"[skip] {out_path.name} already present")
        return

    query = (
        f"{ARCHIVE_URL}?latitude={lat}&longitude={lon}"
        f"&start_date={START_DATE}&end_date={END_DATE}"
        "&daily=temperature_2m_mean,temperature_2m_max,temperature_2m_min,precipitation_sum"
        "&timezone=UTC"
    )
    print(f"[fetch] {region} ({lat},{lon})...")
    with urllib.request.urlopen(query, timeout=60) as resp:
        payload = json.load(resp)

    daily = payload["daily"]
    rows = zip(
        daily["time"],
        daily["temperature_2m_mean"],
        daily["temperature_2m_max"],
        daily["temperature_2m_min"],
        daily["precipitation_sum"],
    )

    with open(out_path, "w") as f:
        f.write("date,temp_mean,temp_max,temp_min,precip\n")
        for date, tmean, tmax, tmin, precip in rows:
            f.write(f"{date},{tmean},{tmax},{tmin},{precip}\n")

    print(f"[done] wrote {out_path.name}")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for region, (lat, lon) in REGIONS.items():
        fetch_region(region, lat, lon)
        time.sleep(1)  # be polite to the free API


if __name__ == "__main__":
    main()
