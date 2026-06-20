import { logger } from "./logger";

const PENDO_TRACK_URL = "https://data.pendo.io/data/track";
const PENDO_INTEGRATION_KEY = "b5f41d66-897f-4169-add0-ef04650b15f2";

export function pendoTrack(
  event: string,
  properties: Record<string, unknown> = {},
  visitorId = "system",
  accountId = "system",
): void {
  const body = JSON.stringify({
    type: "track",
    event,
    visitorId,
    accountId,
    timestamp: Date.now(),
    properties,
  });

  fetch(PENDO_TRACK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-pendo-integration-key": PENDO_INTEGRATION_KEY,
    },
    body,
  }).catch((err) => {
    logger.warn({ err, event }, "Failed to send Pendo track event");
  });
}
