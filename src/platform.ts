import { isIP } from 'node:net';

import type { API, StaticPlatformPlugin, Logging, PlatformConfig, AccessoryPlugin, Service, Characteristic, uuid } from 'homebridge';

import fakegato from 'fakegato-history';
import { Connection } from 'knx';

import { ContactSensorAccessory, type ContactSensorDeviceConfig } from './accessory.js';

const DEFAULT_KNX_IP = '224.0.23.12';
const DEFAULT_KNX_PORT = 3671;
const KNX_GROUP_ADDRESS_PATTERN = /^[0-9]{1,4}\/[0-9]{1,4}\/[0-9]{1,4}$/;

type NormalizedPlatformConfig = {
  ip: string;
  port: number;
  devices: ContactSensorDeviceConfig[];
};

export class ContactSensorPlatform implements StaticPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly uuid: typeof uuid;

  public readonly fakeGatoHistoryService: unknown;
  public readonly connection: Connection;

  private readonly devices: ContactSensorAccessory[] = [];

  constructor(
    public readonly log: Logging,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;
    this.uuid = api.hap.uuid;
    this.fakeGatoHistoryService = fakegato(this.api);

    const normalizedConfig = this.normalizeConfig(config);

    this.connection = new Connection({
      ipAddr: normalizedConfig.ip,
      ipPort: normalizedConfig.port,
      handlers: {
        connected: () => {
          log.info('KNX connected');
        },
        disconnected: () => {
          log.info('KNX disconnected');
        },
        error: (connectionStatus: unknown) => {
          log.error(`KNX status: ${String(connectionStatus)}`);
        },
      },
    });

    this.devices = normalizedConfig.devices.map((device) => new ContactSensorAccessory(this, device));

    this.api.on('shutdown', () => {
      this.connection.Disconnect();
    });

    log.info(`Initialized ${this.devices.length} KNX contact sensor accessory/accessories`);
  }

  accessories(callback: (foundAccessories: AccessoryPlugin[]) => void): void {
    callback(this.devices);
  }

  private normalizeConfig(config: PlatformConfig): NormalizedPlatformConfig {
    const ip = this.normalizeIp(config.ip);
    const port = this.normalizePort(config.port);
    const devices = this.normalizeDevices(config.devices);

    return { ip, port, devices };
  }

  private normalizeIp(value: unknown): string {
    if (value === undefined) {
      return DEFAULT_KNX_IP;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0 && isIP(trimmed) === 4) {
        return trimmed;
      }
    }

    this.log.warn(`Invalid KNX IP "${String(value)}"; using ${DEFAULT_KNX_IP}`);
    return DEFAULT_KNX_IP;
  }

  private normalizePort(value: unknown): number {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 65535) {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) {
        return parsed;
      }
    }

    if (value !== undefined) {
      this.log.warn(`Invalid KNX port "${String(value)}"; using ${DEFAULT_KNX_PORT}`);
    }

    return DEFAULT_KNX_PORT;
  }

  private normalizeDevices(value: unknown): ContactSensorDeviceConfig[] {
    if (!Array.isArray(value)) {
      this.log.error('No devices configured. Add at least one KNX contact sensor device.');
      return [];
    }

    return value.flatMap((entry, index) => {
      const device = this.normalizeDevice(entry, index);
      return device === undefined ? [] : [device];
    });
  }

  private normalizeDevice(value: unknown, index: number): ContactSensorDeviceConfig | undefined {
    if (typeof value !== 'object' || value === null) {
      this.log.warn(`Skipping device at index ${index}: expected an object.`);
      return undefined;
    }

    const candidate = value as Record<string, unknown>;
    const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
    const listen = typeof candidate.listen === 'string' ? candidate.listen.trim() : '';

    if (name.length === 0) {
      this.log.warn(`Skipping device at index ${index}: missing name.`);
      return undefined;
    }

    if (!KNX_GROUP_ADDRESS_PATTERN.test(listen)) {
      this.log.warn(`Skipping device "${name}": invalid listen address "${listen}".`);
      return undefined;
    }

    return { name, listen };
  }
}
