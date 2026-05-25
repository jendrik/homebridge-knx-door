import { createRequire } from 'node:module';

type PackageMetadata = {
  displayName: string;
  name: string;
  version: string;
};

const require = createRequire(import.meta.url);
const { displayName, name, version } = require('../package.json') as PackageMetadata;

/**
 * This is the name of the platform that users will use to register the plugin in the Homebridge config.json.
 */
export const PLATFORM_NAME = 'knx-door';

/**
 * This must match the package name in package.json when Homebridge APIs require the plugin identifier.
 */
export const PLUGIN_NAME = name;
export const PLUGIN_DISPLAY_NAME = displayName;
export const PLUGIN_VERSION = version;
