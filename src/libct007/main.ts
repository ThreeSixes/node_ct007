// tslint:disable:no-console
import { Parser } from 'binary-parser';
import * as noble from 'noble';
import { SimpleEventDispatcher } from "strongly-typed-events";

// We use these to track which services and chracteristics we're interested in using.
const btleServiceIds = {
  batteryCharacteristicId: '00002a1900001000800000805f9b34fb',
  batteryServiceId: '0000180f00001000800000805f9b34fb',
  informationCharacteristicId: '',
  informationServiceId: '',
  radCountCharacteristicId: 'f100ffd104514100b100000000000000',
  radCountServiceId: 'f100ffd004514100b100000000000000',
};

export interface ICT007Config {
  address?: string | null;
  batteryServiceCharacteristicId: string;
  batteryServiceId: string;
  informationCharacteristicId: string;
  informationServiceId: string;
  name?: string | null;
  radCountServiceId: string;
  radCountCharacteristicId: string;
  scanForever: boolean;
}

export const defaultConfig: ICT007Config = {
  address: null,
  batteryServiceCharacteristicId: btleServiceIds.batteryCharacteristicId,
  batteryServiceId: btleServiceIds.batteryServiceId,
  informationCharacteristicId: btleServiceIds.informationCharacteristicId,
  informationServiceId: btleServiceIds.batteryServiceId,
  name: null,
  radCountCharacteristicId: btleServiceIds.radCountCharacteristicId,
  radCountServiceId: btleServiceIds.radCountServiceId,
  scanForever: true,
};


export interface IDeviceInfo {
  batteryPercent?: number;
  deviceName?: string;
  firmwareRevision?: string;
  hardwareRevision?: string;
  maunfacturerName?: string;
  modelNumber?: string;
  serialNumber?: string;
};

export interface IDeviceModel {
  full: string | null;
  short: string | null;
};

interface IDoseConversionFactors {
  F: number;
  N: number;
  M: number;
  P: number;
  [key: string]: number;
};

// Export constants that might be useful for applications.
export const RadCountUpdateHz = 5;
export const DefaultDoseConversionFactors: IDoseConversionFactors = {
  F: 163,
  N: 1111,
  M: 33000,
  P: 348
};

export class CT007Poller {
  // Set up events.
  private radCountEvent = new SimpleEventDispatcher<number>();
  private stateChangeEvent = new SimpleEventDispatcher<string>();
  private devInfoEvent = new SimpleEventDispatcher<IDeviceInfo>();

  // Private variables we want to use...
  private radCtParser = new Parser().endianess('little').int32le('count');
  private detectorState: string = 'init';
  private myName: string = "";
  private myAddress: string = "";
  private myModel: IDeviceModel = {"full": null, "short": null};
  private battCharacteristic: any;
  private leLongParser = new Parser().endianess('little').int32le('number');
  private ready: boolean = false;

  constructor(private config: ICT007Config = defaultConfig) {
    // Make sure we format the address for noble: a 6-byte hex string.
    if (config.address) {
      config.address = config.address.replace(/[:\-\.]/g, '');
    }
  }

  // Expose the periphrial's properites.
  public get name(): string {
    return this.myName;
  }

  public get address(): string {
    return this.myAddress;
  }

  public get state(): string {
    return this.detectorState;
  }

  public get model(): IDeviceModel {
    return this.myModel;
  }

  public get doseConversionFactor(): number | null {
    let doseRateConversionFactor: number | null = null;

    if(this.myModel.short) {
      if(this.myModel.short in DefaultDoseConversionFactors) {
        doseRateConversionFactor = DefaultDoseConversionFactors[this.myModel.short];
      }
    }

    return doseRateConversionFactor;
  }

  // Use this to expose the rad_count event.
  public get onRadCount() {
    return this.radCountEvent.asEvent();
  }

  // Use this to expose device state change events.
  public get onStateChange() {
    return this.stateChangeEvent.asEvent();
  }

  // Use this to expose system info events.
  public get onDevInfo() {
    return this.devInfoEvent.asEvent();
  }

  // Class init.
  public async init() {
    noble.on('stateChange', state => {
      if (state === 'poweredOn') {
        this.setDetectorState('scanning');
        noble.startScanning([this.config.radCountServiceId]);
        this.scan();
      } else {
        this.setDetectorState('waitingOnBTLE');
        noble.stopScanning();
      }
    });
  }

  // When try to discover devices.
  public async scan() {
    // When we've discovered a device...
    noble.on('discover', peripheral => {
      let connectToPeriphrial = false;
      this.myName = peripheral.advertisement.localName;
      this.myAddress = peripheral.id;

      // If we're searching for both a name and address...
      if (this.config.name && this.config.address) {
        connectToPeriphrial = (peripheral.id === this.config.address) &&
          (this.myName === this.config.name);
      } else {
        // Does either the address or name match?
        connectToPeriphrial = (peripheral.id === this.config.address) ||
          (this.myName === this.config.name);

        // If we aren't looking for a specific name or address
        // just grab the first device we find since it has the Rad_Count service.
        if (!this.config.name && !this.config.address) {
          connectToPeriphrial = true;
        }
      }

      // If we selected this device connect to it.
      if (connectToPeriphrial) {
          noble.stopScanning();
          this.setDetectorState('discovered');
          this.connectAndSetUp(peripheral);
      }
    });
  }

  // Any activities we want to do at the end of operation
  public async cleanup() {
    console.log('cleaning up');
  }

  // We use this to allow the user to check the detector's state.
  public async getDetectorState() {
    return this.detectorState;
  }

  // Get the device's battery level as a percentage.
  public getBatteryLevel() {
    // Make sure we're in a state to communicate with the detector otherwise the promise may never resolve.
    if (this.ready) {
      this.battCharacteristic.read((error: Error, data: string) => {
        this.devInfoEvent.dispatch({batteryPercent: this.leLongParser.parse(Buffer.from(data)).number});
      });
    } else {
      this.devInfoEvent.dispatch({batteryPercent: -1});
    }
  }

  // Connect to our detector and set it up.
  private connectAndSetUp(peripheral: any) {
    // Figure out what model we are.
    peripheral.connect((error: Error) => {
      this.setDetectorState('connected');

      // specify the services and characteristics to discover
      const serviceUUIDs = [this.config.radCountServiceId, this.config.batteryServiceId];
      const characteristicUUIDs = [this.config.radCountCharacteristicId, this.config.batteryServiceCharacteristicId];

      const myModelShort = this.getModelShortFromName();

      if (myModelShort) {
        this.myModel = {"full": "CT007-${myModelShort}", "short": myModelShort};
      }

      // Look for service and characteristic IDs we want.
      peripheral.discoverSomeServicesAndCharacteristics(
        serviceUUIDs,
        characteristicUUIDs,
        this.onServicesAndCharacteristicsDiscovered,
      );
    });

    // When a device disconnects this is what we want to do.
    peripheral.on('disconnect', () => {
      // Reset some of our basic device info.
      this.setDetectorState('disconnected');
      this.myModel = {"full": null, "short": null};
      this.myName = "";
      this.ready = false;

      // If we want to reconnected when the detector shows back up...
      if (this.config.scanForever) {
        this.scan();
      }
    });
  }

  // Figure out our model give the device's name.
  private getModelShortFromName(): string | null {
    let modelShort:string | null = null;
    const modelRegex = /CT-([A-Z])-[0-9]+/;
    const regexResult = this.myName.match(modelRegex);

    // If we matched...
    if (regexResult) {
      modelShort = regexResult[1];
    }

    return modelShort;
  }

  private setDetectorState(state: string) {
    // Set our global tracker. Maybe we don't need this.
    this.stateChangeEvent.dispatch(state);
    this.detectorState = state;
  }

  private onServicesAndCharacteristicsDiscovered = (error: Error, services: any, characteristics: any) => {
    const radCtCharacteristic = characteristics[0];
    this.setDetectorState('subscribingToCounts');
    this.battCharacteristic = characteristics[1];
    this.ready = true;

    // Handle incoming data from Rad_Count.
    radCtCharacteristic.on('data', (data: any, isNotification: boolean) => {
      const counts = this.leLongParser.parse(Buffer.from(data)).number;
      this.radCountEvent.dispatch(counts);
    });

    // subscribe to be notified whenever the peripheral update the characteristic
    // tslint:disable-next-line:variable-name
    radCtCharacteristic.subscribe((_error: Error) => {
      if (_error) {
        this.setDetectorState('subscribeError');
      } else {
        this.setDetectorState('readingCounts');
      }
    });
  }
}
