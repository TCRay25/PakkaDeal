/**
 * Base Courier Provider Interface
 */
export class BaseCourier {
  constructor(name, code, options = {}) {
    this.name = name;
    this.code = code;
    this.hasApi = options.hasApi ?? true;
    this.manualTrackingUrl = options.manualTrackingUrl || "";
    this.statusUrlTemplate = options.statusUrlTemplate || "";
  }

  /**
   * Returns detection match and confidence (0-100)
   * @param {string} trackingId
   * @returns {{ matches: boolean, confidence: number, patternName: string }}
   */
  detect(trackingId) {
    return { matches: false, confidence: 0, patternName: "default" };
  }

  /**
   * Queries tracking details
   * @param {string} trackingId
   * @returns {Promise<any>}
   */
  async track(trackingId) {
    throw new Error("track() must be implemented by courier provider");
  }

  /**
   * Normalizes response to standard PakkaDeal tracking envelope
   * @param {any} raw
   * @param {string} trackingId
   */
  normalize(raw, trackingId) {
    throw new Error("normalize() must be implemented by courier provider");
  }

  /**
   * Maps courier status to standardized tracking status:
   * 'order_created' | 'picked_up' | 'in_transit' | 'destination_hub' | 'out_for_delivery' | 'delivered' | 'delivery_failed' | 'returned' | 'unknown'
   * @param {string} originalStatus
   * @returns {string}
   */
  mapStatus(originalStatus) {
    return "unknown";
  }
}
