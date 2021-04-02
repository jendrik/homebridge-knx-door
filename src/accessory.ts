import { AccessoryConfig, AccessoryPlugin, Service } from 'homebridge';

import { Datapoint } from 'knx';
import fakegato from 'fakegato-history';

import { PLUGIN_NAME, PLUGIN_VERSION, PLUGIN_DISPLAY_NAME } from './settings';

import { ContactSensorPlatform } from './platform';


export class ContactSensorAccessory implements AccessoryPlugin {
  private readonly uuid_base: string;
  private readonly name: string;
  private readonly displayName: string;
  private readonly listen: string;

  private readonly contactSensorService: Service;
  private readonly loggingService: fakegato;
  private readonly informationService: Service;

  constructor(
    private readonly platform: ContactSensorPlatform,
    private readonly config: AccessoryConfig,
  ) {

    class EveContactSensorTimesOpened extends platform.Characteristic {
      public static readonly UUID: string = 'E863F129-079E-48FF-8F27-9C2605A29F52';

      constructor() {
        super('Times Opened', EveContactSensorTimesOpened.UUID, {
          format: platform.Characteristic.Formats.UINT32,
          perms: [platform.Characteristic.Perms.READ, platform.Characteristic.Perms.NOTIFY],
        });
        this.value = this.getDefaultValue();
      }
    }

    class EveContactSensorOpenDuration extends platform.Characteristic {
      public static readonly UUID: string = 'E863F118-079E-48FF-8F27-9C2605A29F52';

      constructor() {
        super('Open Duration', EveContactSensorOpenDuration.UUID, {
          format: platform.Characteristic.Formats.UINT32,
          unit: platform.Characteristic.Units.SECONDS,
          perms: [platform.Characteristic.Perms.READ, platform.Characteristic.Perms.NOTIFY, platform.Characteristic.Perms.WRITE],
        });
        this.value = this.getDefaultValue();
      }
    }

    class EveContactSensorClosedDuration extends platform.Characteristic {
      public static readonly UUID: string = 'E863F119-079E-48FF-8F27-9C2605A29F52';

      constructor() {
        super('Closed Duration', EveContactSensorClosedDuration.UUID, {
          format: platform.Characteristic.Formats.UINT32,
          unit: platform.Characteristic.Units.SECONDS,
          perms: [platform.Characteristic.Perms.READ, platform.Characteristic.Perms.NOTIFY, platform.Characteristic.Perms.WRITE],
        });
        this.value = this.getDefaultValue();
      }
    }

    class EveContactSensorLastActivation extends platform.Characteristic {
      public static readonly UUID: string = 'E863F11A-079E-48FF-8F27-9C2605A29F52';

      constructor() {
        super('Last Activation', EveContactSensorLastActivation.UUID, {
          format: platform.Characteristic.Formats.UINT32,
          unit: platform.Characteristic.Units.SECONDS,
          perms: [platform.Characteristic.Perms.READ, platform.Characteristic.Perms.NOTIFY],
        });
        this.value = this.getDefaultValue();
      }
    }

    this.name = config.name;
    this.listen = config.listen;
    this.uuid_base = platform.uuid.generate(PLUGIN_NAME + '-' + this.name + '-' + this.listen);
    this.displayName = this.uuid_base;

    this.informationService = new platform.Service.AccessoryInformation()
      .setCharacteristic(platform.Characteristic.Name, this.name)
      .setCharacteristic(platform.Characteristic.Identify, this.name)
      .setCharacteristic(platform.Characteristic.Manufacturer, '@jendrik')
      .setCharacteristic(platform.Characteristic.Model, PLUGIN_DISPLAY_NAME)
      .setCharacteristic(platform.Characteristic.SerialNumber, this.displayName)
      .setCharacteristic(platform.Characteristic.FirmwareRevision, PLUGIN_VERSION);

    this.contactSensorService = new platform.Service.ContactSensor(this.name);
    this.contactSensorService.getCharacteristic(platform.Characteristic.StatusActive).updateValue(true);

    // times opened
    this.contactSensorService.addCharacteristic(EveContactSensorTimesOpened);
    this.contactSensorService.getCharacteristic(EveContactSensorTimesOpened).onGet(async () => {
      let count = 0;
      let prevStatus = undefined;
      for (let i = 0; i < this.loggingService.history.length; ++i) {
        const status = this.loggingService.history[i].status;
        if (status === undefined) {
          continue;
        }
        if (status !== prevStatus && prevStatus !== true) {
          count++;
        }
        prevStatus = status;
      }
      return count;
    });

    // open duration
    this.contactSensorService.addCharacteristic(EveContactSensorOpenDuration);
    this.contactSensorService.getCharacteristic(EveContactSensorOpenDuration).onGet(async () => {
      let duration = 0;
      let prevStatus = undefined;
      let prevTime = undefined;
      for (let i =0; i < this.loggingService.history.length; ++i) {
        const status = this.loggingService.history[i].status;
        const time = this.loggingService.history[i].time;
        if (status === undefined || time === undefined) {
          continue;
        }
        if (prevStatus === true && prevTime !== undefined) {
          duration += time - prevTime;
        }
        prevStatus = status;
        prevTime = time;
      }

      return duration;
    });

    // closed duration
    this.contactSensorService.addCharacteristic(EveContactSensorClosedDuration);
    this.contactSensorService.getCharacteristic(EveContactSensorClosedDuration).onGet(async () => {
      let duration = 0;
      let prevStatus = undefined;
      let prevTime = undefined;
      for (let i =0; i < this.loggingService.history.length; ++i) {
        const status = this.loggingService.history[i].status;
        const time = this.loggingService.history[i].time;
        if (status === undefined || time === undefined) {
          continue;
        }
        if (prevStatus === false && prevTime !== undefined) {
          duration += time - prevTime;
        }
        prevStatus = status;
        prevTime = time;
      }

      return duration;
    });

    // last activation
    this.contactSensorService.addCharacteristic(EveContactSensorLastActivation);
    this.contactSensorService.getCharacteristic(EveContactSensorLastActivation).onGet(async () => {
      if (this.loggingService.getInitialTime() === undefined) {
        return 0;
      } else if (this.contactSensorService.getCharacteristic(platform.Characteristic.ContactSensorState).value) {
        return Math.round(new Date().valueOf() / 1000) - this.loggingService.getInitialTime();
      } else {
        let lastActivation = this.loggingService.history[this.loggingService.history.length - 1].time;
        for (let i = this.loggingService.history.length - 1; i >= 0; --i) {
          if (this.loggingService.history[i].status === false) {
            lastActivation = this.loggingService.history[i].time;
          } else {
            break;
          }
        }
        return lastActivation - this.loggingService.getInitialTime();
      }
    });

    this.loggingService = new platform.fakeGatoHistoryService('door', this, { storage: 'fs', log: platform.log });

    const dp = new Datapoint({
      ga: this.listen,
      dpt: 'DPT1.001',
      autoread: true,
    }, platform.connection);

    dp.on('change', (oldValue: number, newValue: number) => {
      this.contactSensorService.getCharacteristic(platform.Characteristic.ContactSensorState).updateValue(newValue);
      this.loggingService._addEntry({ time: Math.round(new Date().valueOf() / 1000), status: newValue });
    });
  }

  getServices(): Service[] {
    return [
      this.informationService,
      this.contactSensorService,
      this.loggingService,
    ];
  }
}
