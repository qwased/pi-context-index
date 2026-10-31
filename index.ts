import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerContextIndex } from "./src/host";

/**
 * The extension registers one direct reader tool and takes over compaction.
 * Both paths are local and deterministic; no model is called to build context.
 */
export default (pi: ExtensionAPI): void => {
  registerContextIndex(pi);
};
