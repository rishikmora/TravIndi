"""Real current weather at a destination's own coordinates — Open-Meteo
(https://open-meteo.com), free and keyless, real numbers from a real
forecast model, never a fabricated "sunny and 28°" placeholder. Best-effort
like `app/domains/trust/moderation.py`'s AI calls: a timeout or upstream
error returns `None` rather than raising, since weather is flavor for the
destination "experience" view, not something that should ever block a page.
"""

from datetime import UTC, datetime

import httpx

from app.domains.tourism.schemas import WeatherOut

_OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

# The WMO weather-code table Open-Meteo documents its `weather_code` field
# against (https://open-meteo.com/en/docs) — real official codes, condensed
# to the labels this UI actually distinguishes.
_WEATHER_CODE_LABELS: dict[int, str] = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Fog",
    51: "Light drizzle",
    53: "Drizzle",
    55: "Dense drizzle",
    61: "Light rain",
    63: "Rain",
    65: "Heavy rain",
    71: "Light snow",
    73: "Snow",
    75: "Heavy snow",
    80: "Rain showers",
    81: "Rain showers",
    82: "Violent rain showers",
    95: "Thunderstorm",
    96: "Thunderstorm with hail",
    99: "Thunderstorm with hail",
}


async def get_current_weather(lon: float, lat: float) -> WeatherOut:
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            response = await client.get(
                _OPEN_METEO_URL,
                params={
                    "latitude": lat,
                    "longitude": lon,
                    "current": "temperature_2m,weather_code,is_day",
                    "timezone": "auto",
                },
            )
        response.raise_for_status()
        current = response.json()["current"]
        return WeatherOut(
            temperature_c=current["temperature_2m"],
            condition=_WEATHER_CODE_LABELS.get(current["weather_code"], "Unknown"),
            is_day=bool(current["is_day"]),
            observed_at=datetime.now(UTC),
        )
    except (httpx.HTTPError, KeyError, ValueError):
        return WeatherOut(temperature_c=None, condition=None, is_day=None, observed_at=None)
