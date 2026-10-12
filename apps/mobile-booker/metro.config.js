// Expo's monorepo-aware Metro config, plus .wasm assets for expo-sqlite's web build (used only
// for the browser preview / screenshots — the product is the Android app).
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('wasm');
module.exports = config;
