const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const exampleRoot = __dirname;
const moduleRoot = path.resolve(exampleRoot, '..');
const escapeForRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const config = getDefaultConfig(exampleRoot);

config.watchFolders = [moduleRoot];
config.resolver.nodeModulesPaths = [path.join(exampleRoot, 'node_modules')];
config.resolver.blockList = [
  ...[].concat(config.resolver.blockList ?? []),
  new RegExp(`^${escapeForRegExp(path.join(moduleRoot, 'node_modules'))}\\/.*$`),
];

module.exports = config;
