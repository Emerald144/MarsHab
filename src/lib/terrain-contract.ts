import { z } from "zod";

const finite = z.number().finite();
const point = z.object({ easting: finite, northing: finite });
const route = z.object({
  type: z.literal("Feature"),
  geometry: z.object({
    type: z.literal("LineString"),
    coordinates: z.array(z.tuple([finite, finite])).min(1),
  }),
  properties: z.object({
    distance_km: finite.nonnegative(),
    distance_m: finite.nonnegative(),
    estimated_one_way_hours: finite.nonnegative(),
    estimated_total_eva_hours: finite.nonnegative(),
    mean_slope_degrees: finite,
    elevation_gain_m: finite,
    elevation_loss_m: finite,
    algorithm: z.string(),
    assumptions: z.array(z.string()),
  }),
});
const outcome = z.discriminatedUnion("available", [
  z.object({ available: z.literal(true), route }),
  z.object({ available: z.literal(false), reason: z.string() }),
]);
export const validBase = (value: unknown) => point.safeParse(value).success;
export const validEmergency = (value: unknown) => outcome.safeParse(value).success;
const plan = z.object({
  base: point,
  destination_zone_id: z.string().regex(/^JZ-0[1-8]$/),
  destination_point: point,
  routes: z.object({ A: outcome, B: outcome, C: outcome }),
  feasibility: z.object({ estimated_total_hours: finite }).nullable(),
  resource_assessment: z.object({
    available: z.boolean(),
    warnings: z.array(z.string()),
    assumptions: z.array(z.string()),
  }),
});
export const validPlan = (value: unknown) => plan.safeParse(value).success;
