# Homebridge 2 Static Platform Modernization Design

## Goal

Update `@jendrik/homebridge-knx-door` so it is ready for Homebridge 2.0 and current supported Node.js versions, while keeping the existing `StaticPlatformPlugin` architecture and retaining `fakegato-history` support.

Backward compatibility with Homebridge 1.x and Node 20 is intentionally out of scope.

## Current State

The plugin is a small TypeScript ESM Homebridge platform plugin:

- `src/index.ts` registers the platform alias `knx-door`.
- `src/platform.ts` implements `StaticPlatformPlugin`, creates the KNX connection, creates the fakegato history factory, and returns static accessories.
- `src/accessory.ts` creates one HomeKit contact sensor per KNX group address and records fakegato history entries.
- `config.schema.json` defines the Homebridge UI configuration schema.

The package already builds and lints, but its Homebridge dev dependency is still a 2.0 beta, its engine metadata still permits Homebridge 1 and Node 20, and config/state handling is mostly untyped.

## Chosen Approach

Use a focused Homebridge 2 static-platform modernization.

This approach keeps the existing plugin shape and config surface, updates package/runtime compatibility, tightens typing and validation, and avoids a dynamic-platform rewrite. It is the lowest-risk path because this plugin has a fixed configured device list and does not need cached accessory lifecycle behavior yet.

## Compatibility And Package Surface

The package will declare Homebridge 2-only support:

- `engines.homebridge`: `^2.0.0`
- `engines.node`: `^22 || ^24`
- `homebridge` dev dependency: current stable 2.x, not beta

The package will keep:

- ESM via `"type": "module"`
- TypeScript `nodenext`
- Runtime dependencies on `knx` and `fakegato-history`
- Platform alias `knx-door`
- Current user-facing configuration shape

README requirements will be updated so they no longer mention Homebridge 1 or Node 20 support.

## Architecture

`src/index.ts` remains the Homebridge entrypoint and registers the static platform.

`src/platform.ts` remains a `StaticPlatformPlugin`. It will own:

- Config normalization and validation
- KNX connection creation
- fakegato history factory creation
- Contact sensor accessory creation
- Returning the static accessory list from `accessories(callback)`

`src/accessory.ts` remains the contact sensor implementation. It will own:

- HomeKit service setup
- Eve custom characteristics
- KNX datapoint subscription
- HomeKit characteristic updates
- fakegato history writes

History-specific code should be kept behind small typed helpers where practical, so normal contact sensor behavior is not spread across fakegato internals.

`src/settings.ts` should expose stable package metadata. The plugin identifier should match the scoped npm package name where Homebridge APIs require the package identifier, while the platform alias remains `knx-door`.

## Configuration

The platform should normalize raw Homebridge config into a typed internal config:

- `ip`: default `224.0.23.12`
- `port`: default `3671`
- `devices`: required array
- each device requires a non-empty `name` and valid KNX group address in `listen`

Malformed device entries should be skipped with a warning. A malformed or missing `devices` value should not crash Homebridge; it should log a clear error and produce no accessories.

`config.schema.json` should be tightened to match the normalized config:

- `port` should be a number, not a string
- `devices` should be required
- device `name` and `listen` should remain required
- the KNX group address pattern should remain explicit

## Runtime Data Flow

Startup:

1. Homebridge loads `dist/index.js`.
2. The plugin registers the `knx-door` static platform.
3. The platform normalizes config defaults.
4. The platform creates one KNX connection.
5. The platform creates one contact sensor accessory per valid configured device.
6. Homebridge calls `accessories(callback)`.
7. The platform returns the static accessory list.

KNX updates:

1. A KNX datapoint emits a `change` event.
2. The accessory normalizes the `DPT1.001` value to a HomeKit `ContactSensorState` value.
3. The HomeKit contact sensor characteristic is updated.
4. A fakegato history entry is appended with the current timestamp and normalized open/closed status.

The implementation should verify existing open/closed semantics before changing the mapping. If the current behavior is preserved, document that choice in code or README only where useful.

## Error Handling

The implementation should improve operational errors without adding broad new abstractions:

- Log invalid platform config clearly.
- Warn and skip invalid devices instead of throwing.
- Include useful status text for KNX connection errors.
- On Homebridge shutdown, close or stop the KNX connection if the `knx` library exposes a stable method.

## Testing And Verification

The implementation must pass:

- `npm install` or equivalent dependency refresh to update `package-lock.json`
- `npm run build`
- `npm run lint`

Additional automated tests are optional for this pass. The repo has no current test harness, so a full framework should only be introduced if config/state helpers become non-trivial enough to justify it.

Manual metadata verification must confirm:

- Homebridge 1 support has been removed from package metadata and README.
- Node 20 support has been removed from package metadata and README.
- Homebridge dev dependency is stable 2.x.
- `config.schema.json` matches the normalized config.

## Out Of Scope

- Dynamic platform rewrite
- Homebridge 1 compatibility
- Node 20 compatibility
- Removing `fakegato-history`
- Changing the user-facing platform alias or basic device config shape
- Reworking unrelated repository files
