const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const config = getDefaultConfig(__dirname);

// @supabase/supabase-js has an optional dependency on @opentelemetry/api that
// it never needs at runtime, but Metro still tries to resolve it. Alias it to
// an empty shim so bundling succeeds without pulling in that (ESM-broken) pkg.
const shim = path.resolve(__dirname, "lib/empty-shim.js");
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName === "@opentelemetry/api" ||
    moduleName.startsWith("@opentelemetry/api/")
  ) {
    return { type: "sourceFile", filePath: shim };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: "./global.css" });
