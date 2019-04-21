// tslint:disable:no-console

import { Parser } from 'binary-parser';
import * as noble from 'noble';

// We use these to track which services and chracteristics we're interested in using.
const btleServiceIds = {
  radCountCharacteristicId: 'f100ffd104514100b100000000000000',
  radCountServiceId: 'f100ffd004514100b100000000000000',
};

export interface ICT007Config {
  address?: string | null;
  name?: string | null;
  radCountServiceId: string;
  radCountCharacteristicId: string;
  scanForever?: boolean;
}

export const defaultConfig: ICT007Config = {
  address: null,
  name: null,
  radCountCharacteristicId: btleServiceIds.radCountCharacteristicId,
  radCountServiceId: btleServiceIds.radCountServiceId,
  scanForever: true,
};

export class CT007Poller {
  // Provide some useful constants for people's libraries.
  public static readonly RadCountUpdateHz = 5;
  public static readonly DoseDefaultConversionFactors = {
    F: 163,
    N: 1111,
  };

  // Track what the detector's state is. It'll start in init.
  private detectorState = 'init';
  private myName = "";
  private myModel = {"full": "unkown", "short": "unkown"};

  constructor(private config: ICT007Config = defaultConfig) {}

  public async init() {
    noble.on('stateChange', state => {
      if (state === 'poweredOn') {
        this.setDetectorState('scanning');
        console.log('Scanning for "' + this.config.name + '"...');
        noble.startScanning([this.config.radCountServiceId]);
        this.scan();
      } else {
        this.setDetectorState('waitingOnBTLE');
        noble.stopScanning();
      }
    });
  }

  public async scan() {
    noble.on('discover', peripheral => {
      let connectToPeriphrial = false;
      this.myName = peripheral.advertisement.localName;

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
          console.log(`Connecting to '${this.myName}': ${peripheral.id}`);
          this.connectAndSetUp(peripheral);
      }
    });
  }

  public async cleanup() {
    console.log('cleaning up');
  }

  // We use this to allow the user to check the detector's state.
  public async getDetectorState() {
    return this.detectorState;
  }

  // Give our device's model.
  private async getModelFromInfo(info: string) {
    return
  }

  // Connect to our detector and set it up.
  private connectAndSetUp(peripheral: any) {
    // Figure out what model we are.
    peripheral.connect((error: Error) => {
      console.log('Connected to', peripheral.id);
      this.setDetectorState('connected');

      // specify the services and characteristics to discover
      const serviceUUIDs = [this.config.radCountServiceId];
      const characteristicUUIDs = [this.config.radCountCharacteristicId];

      // Look for service and characteristic IDs we want.
      peripheral.discoverSomeServicesAndCharacteristics(
        serviceUUIDs,
        characteristicUUIDs,
        this.onServicesAndCharacteristicsDiscovered,
      );
    });

    peripheral.on('disconnect', () => {
      // Reset some of our basic device info.
      this.setDetectorState('disconnected');
      this.myModel = {"full": "unkown", "short": "unkown"};
      this.myName = "";
      console.log('Disconnected.');

      // If we want to reconnected when the detector shows back up...
      if (this.config.scanForever) {
        this.scan();
      }
    });
  }

  private setDetectorState(state: string) {
    // Set our global tracker. Maybe we don't need this.
    console.log(state);
    this.detectorState = state;

    // TODO: Create an event here? We can use this to send signals about the detector's state to clients.
  }

  private onServicesAndCharacteristicsDiscovered(error: Error, services: any, characteristics: any) {
    console.log('Discovered services and characteristics');
    const radCtCharacteristic = characteristics[0];
    const radCtParser = new Parser().endianess('little').int32le('count');

    // Handle incoming data from Rad_Count.
    radCtCharacteristic.on('data', (data: any, isNotification: boolean) => {
      const counts = radCtParser.parse(Buffer.from(data)).count;
      console.log('Count: ' + counts);
    });

    // subscribe to be notified whenever the peripheral update the characteristic
    // TODO: Figure out scoping issue here.
    // tslint:disable-next-line:variable-name
    radCtCharacteristic.subscribe((_error: Error) => {
      if (_error) {
        //this.setDetectorState('error');
        console.error('Error subscribing to Rad_Count');
      } else {
        //this.setDetectorState('readingCounts');
        console.log('Subscribed for Rad_Count notifications');
      }
    });
  }
}
