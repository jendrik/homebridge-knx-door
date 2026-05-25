import type { AccessoryPlugin, Characteristic, CharacteristicValue, Service, WithUUID } from 'homebridge';

import { Datapoint } from 'knx';

import { ACCESSORY_UUID_NAMESPACE, PLUGIN_DISPLAY_NAME, PLUGIN_VERSION } from './settings.js';
import type { ContactSensorPlatform } from './platform.js';

export type ContactSensorDeviceConfig = {
  name: string;
  listen: string;
};

type FakeGatoHistoryEntry = {
  time?: number;
  status?: boolean;
};

type FakeGatoHistoryService = Service & {
  history: FakeGatoHistoryEntry[];
  getInitialTime(): number | undefined;
  _addEntry(entry: Required<FakeGatoHistoryEntry>): void;
};

type FakeGatoHistoryConstructor = new (
  accessoryType: 'door',
  accessory: AccessoryPlugin,
  options: { storage: 'fs'; log: ContactSensorPlatform['log'] },
) => FakeGatoHistoryService;

type EveCharacteristicConstructor = WithUUID<new () => Characteristic>;

const EVE_CONTACT_SENSOR_TIMES_OPENED_UUID = 'E863F129-079E-48FF-8F27-9C2605A29F52';
const EVE_CONTACT_SENSOR_OPEN_DURATION_UUID = 'E863F118-079E-48FF-8F27-9C2605A29F52';
const EVE_CONTACT_SENSOR_CLOSED_DURATION_UUID = 'E863F119-079E-48FF-8F27-9C2605A29F52';
const EVE_CONTACT_SENSOR_LAST_ACTIVATION_UUID = 'E863F11A-079E-48FF-8F27-9C2605A29F52';

function addHistoryEntry(loggingService: FakeGatoHistoryService, entry: Required<FakeGatoHistoryEntry>): void {
  loggingService._addEntry(entry);
}

export class ContactSensorAccessory implements AccessoryPlugin {
  public readonly displayName: string;

  private readonly uuidBase: string;
  private readonly name: string;
  private readonly listen: string;

  private readonly contactSensorService: Service;
  private readonly loggingService: FakeGatoHistoryService;
  private readonly informationService: Service;

  constructor(
    private readonly platform: ContactSensorPlatform,
    config: ContactSensorDeviceConfig,
  ) {
    this.name = config.name;
    this.listen = config.listen;
    this.uuidBase = platform.uuid.generate(`${ACCESSORY_UUID_NAMESPACE}-${this.name}-${this.listen}`);
    this.displayName = this.uuidBase;

    this.informationService = new platform.Service.AccessoryInformation()
      .setCharacteristic(platform.Characteristic.Name, this.name)
      .setCharacteristic(platform.Characteristic.Manufacturer, '@jendrik')
      .setCharacteristic(platform.Characteristic.Model, PLUGIN_DISPLAY_NAME)
      .setCharacteristic(platform.Characteristic.SerialNumber, this.displayName)
      .setCharacteristic(platform.Characteristic.FirmwareRevision, PLUGIN_VERSION);

    this.contactSensorService = new platform.Service.ContactSensor(this.name);
    this.contactSensorService.getCharacteristic(platform.Characteristic.StatusActive).updateValue(true);
    this.addEveCharacteristics();

    const FakeGatoHistory = platform.fakeGatoHistoryService as FakeGatoHistoryConstructor;
    this.loggingService = new FakeGatoHistory('door', this, { storage: 'fs', log: platform.log });

    const datapoint = new Datapoint({
      ga: this.listen,
      dpt: 'DPT1.001',
      autoread: true,
    }, platform.connection);

    datapoint.on('change', (_oldValue: unknown, newValue: unknown) => {
      this.updateContactState(newValue);
    });
  }

  getServices(): Service[] {
    return [
      this.informationService,
      this.contactSensorService,
      this.loggingService,
    ];
  }

  private addEveCharacteristics(): void {
    const EveContactSensorTimesOpened = this.createEveCharacteristic(
      'Times Opened',
      EVE_CONTACT_SENSOR_TIMES_OPENED_UUID,
      this.platform.api.hap.Formats.UINT32,
      undefined,
      false,
    );
    const EveContactSensorOpenDuration = this.createEveCharacteristic(
      'Open Duration',
      EVE_CONTACT_SENSOR_OPEN_DURATION_UUID,
      this.platform.api.hap.Formats.UINT32,
      this.platform.api.hap.Units.SECONDS,
      true,
    );
    const EveContactSensorClosedDuration = this.createEveCharacteristic(
      'Closed Duration',
      EVE_CONTACT_SENSOR_CLOSED_DURATION_UUID,
      this.platform.api.hap.Formats.UINT32,
      this.platform.api.hap.Units.SECONDS,
      true,
    );
    const EveContactSensorLastActivation = this.createEveCharacteristic(
      'Last Activation',
      EVE_CONTACT_SENSOR_LAST_ACTIVATION_UUID,
      this.platform.api.hap.Formats.UINT32,
      this.platform.api.hap.Units.SECONDS,
      false,
    );

    this.contactSensorService.addCharacteristic(EveContactSensorTimesOpened);
    this.contactSensorService.getCharacteristic(EveContactSensorTimesOpened).onGet(async () => this.getTimesOpened());

    this.contactSensorService.addCharacteristic(EveContactSensorOpenDuration);
    this.contactSensorService.getCharacteristic(EveContactSensorOpenDuration).onGet(async () => this.getDuration(true));

    this.contactSensorService.addCharacteristic(EveContactSensorClosedDuration);
    this.contactSensorService.getCharacteristic(EveContactSensorClosedDuration).onGet(async () => this.getDuration(false));

    this.contactSensorService.addCharacteristic(EveContactSensorLastActivation);
    this.contactSensorService.getCharacteristic(EveContactSensorLastActivation).onGet(async () => this.getLastActivation());
  }

  private createEveCharacteristic(
    displayName: string,
    uuid: string,
    format: string,
    unit: string | undefined,
    writable: boolean,
  ): EveCharacteristicConstructor {
    const platform = this.platform;
    const permissions = [
      platform.api.hap.Perms.PAIRED_READ,
      platform.api.hap.Perms.NOTIFY,
    ];

    if (writable) {
      permissions.push(platform.api.hap.Perms.PAIRED_WRITE);
    }

    return class EveContactSensorCharacteristic extends platform.Characteristic {
      public static readonly UUID: string = uuid;

      constructor() {
        super(displayName, uuid, {
          format,
          unit,
          perms: permissions,
        });
        this.value = this.getDefaultValue();
      }
    };
  }

  private updateContactState(value: unknown): void {
    const isOpen = this.normalizeContactValue(value);
    if (isOpen === undefined) {
      this.platform.log.warn(`Ignoring unsupported KNX contact sensor value "${String(value)}" for "${this.name}".`);
      return;
    }

    const contactState = isOpen
      ? this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
      : this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED;

    this.contactSensorService.getCharacteristic(this.platform.Characteristic.ContactSensorState).updateValue(contactState);
    addHistoryEntry(this.loggingService, { time: Math.round(Date.now() / 1000), status: isOpen });
  }

  private normalizeContactValue(value: unknown): boolean | undefined {
    if (value === true || value === 1) {
      return true;
    }

    if (value === false || value === 0) {
      return false;
    }

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true' || normalized === '1' || normalized === 'open') {
        return true;
      }

      if (normalized === 'false' || normalized === '0' || normalized === 'closed') {
        return false;
      }
    }

    return undefined;
  }

  private getTimesOpened(): CharacteristicValue {
    let count = 0;
    let previousStatus: boolean | undefined;

    for (const entry of this.loggingService.history) {
      if (entry.status === undefined) {
        continue;
      }

      if (entry.status !== previousStatus && previousStatus !== true) {
        count++;
      }

      previousStatus = entry.status;
    }

    return count;
  }

  private getDuration(open: boolean): CharacteristicValue {
    let duration = 0;
    let previousStatus: boolean | undefined;
    let previousTime: number | undefined;

    for (const entry of this.loggingService.history) {
      if (entry.status === undefined || entry.time === undefined) {
        continue;
      }

      if (previousStatus === open && previousTime !== undefined) {
        duration += entry.time - previousTime;
      }

      previousStatus = entry.status;
      previousTime = entry.time;
    }

    return duration;
  }

  private getLastActivation(): CharacteristicValue {
    const initialTime = this.loggingService.getInitialTime();
    if (initialTime === undefined || this.loggingService.history.length === 0) {
      return 0;
    }

    if (this.contactSensorService.getCharacteristic(this.platform.Characteristic.ContactSensorState).value) {
      return Math.round(Date.now() / 1000) - initialTime;
    }

    let lastActivation = this.loggingService.history[this.loggingService.history.length - 1].time ?? initialTime;
    for (let i = this.loggingService.history.length - 1; i >= 0; --i) {
      const historyTime = this.loggingService.history[i].time;
      if (this.loggingService.history[i].status === false && historyTime !== undefined) {
        lastActivation = historyTime;
      } else {
        break;
      }
    }

    return lastActivation - initialTime;
  }
}
