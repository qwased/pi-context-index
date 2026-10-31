import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * P0 wires the two registrations here: the always-on `context_index` reader
 * and the single `session_before_compact` path. This scaffold deliberately
 * registers nothing, so the package stays inert until that pipeline lands.
 */
export default (_pi: ExtensionAPI): void => {};
