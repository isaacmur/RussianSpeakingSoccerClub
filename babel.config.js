module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    // Note: the reanimated plugin is added by nativewind/babel (css-interop)
    // and babel-preset-expo — it must not be listed again here or Babel errors
    // on a duplicate. It also has to be last, which those presets ensure.
  };
};
