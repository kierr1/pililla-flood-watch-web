// Experimental thesis Flood Risk Index (FRI): unitless 0–100.
// The 21.5-ft creek-bed-to-device height is a PROVISIONAL reference,
// not a surveyed flood-warning or evacuation threshold.
// Input water_level_m must be height above the creek-bed datum, NOT ultrasonic air gap.
// Input windSpeedMs is meters/second, converted to km/h for the 118 km/h reference.
export const DEVICE_HEIGHT_FT = 21.5;
export const WATER_REFERENCE_M = DEVICE_HEIGHT_FT * 0.3048; // 6.5532 m
export const WIND_REFERENCE_KMH = 118;
export type FloodRiskCategory = "low" | "moderate" | "high" | "critical";

export interface FloodRiskIndex {
  score: number;
  waterScore: number;
  windScore: number;
  category: FloodRiskCategory;
}

function normalizedScore(measurement: number, reference: number): number {
  return Math.min(100, Math.max(0, measurement / reference * 100));
}

export function calculateFloodRiskIndex(
  waterLevelM: number | null | undefined,
  windSpeedMs: number | null | undefined,
): FloodRiskIndex | null {
  // Both signals are required for the specified 80/20 formula.
  if (
    waterLevelM == null || windSpeedMs == null ||
    !Number.isFinite(waterLevelM) || !Number.isFinite(windSpeedMs) ||
    waterLevelM < 0 || windSpeedMs < 0 || waterLevelM > WATER_REFERENCE_M
  ) return null;

  const waterScore = normalizedScore(waterLevelM, WATER_REFERENCE_M);
  const windScore = normalizedScore(windSpeedMs * 3.6, WIND_REFERENCE_KMH);
  const score = 0.8 * waterScore + 0.2 * windScore;
  const category: FloodRiskCategory = score >= 75 ? "critical"
    : score >= 50 ? "high" : score >= 25 ? "moderate" : "low";
  return { score, waterScore, windScore, category };
}
