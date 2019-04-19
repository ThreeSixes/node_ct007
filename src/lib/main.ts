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
  name: string | null;
  scanForever: boolean;
  radCountServiceId: string;
  radCountCharacteristicId: string;
}

export const defaultConfig: ICT007Config = {
  name: 'CT-F-54',
  radCountCharacteristicId: btleServiceIds.radCountCharacteristicId,
  radCountServiceId: btleServiceIds.radCountServiceId,
  scanForever: true
};

export class CT007Poller {
  // Provide some useful constants for people's libraries.
  public static readonly RadCountUpdateHz = 5;
  public static readonly DoseDefaultConversionFactors = {
    'F': 163,
    'N': 1111
  };

  constructor(private config: ICT007Config = defaultConfig) {
  }

  public async init() {
    noble.on('stateChange', state => {
      if (state === 'poweredOn') {
        console.log('Scanning for "' + this.config.name + '"...');
        noble.startScanning([this.config.radCountServiceId]);
      } else {
        noble.stopScanning();
      }
    });
  }

  public async scan() {
    noble.on('discover', peripheral => {
      // connect to the first peripheral that is scanned
      noble.stopScanning();
      const name = peripheral.advertisement.localName;

      // TODO: If no name or address is specified we should try to find a device offering the Rad_Count service and just connect.

      // Does this device have the name we're interested in?
      if (name === this.config.name) {
        console.log(`Connecting to '${name}': ${peripheral.id}`);
        this.connectAndSetUp(peripheral);
      }
    });
  }

  public async cleanup() {
    console.log('cleaning up');
  }

  // Connect to our detector and set it up.
  private connectAndSetUp(peripheral: any) {
    peripheral.connect((error: Error) => {
      console.log('Connected to', peripheral.id);

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

    peripheral.on('disconnect', () => console.log('Disconnected.'));
  }

  private onServicesAndCharacteristicsDiscovered(error: Error, services: any, characteristics: any) {
    console.log('Discovered services and characteristics');
    const radCtCharacteristic = characteristics[0];
    const radCtParser = new Parser()
      .endianess("little")
      .int32le("count");

    // Handle incoming data from Rad_Count.
    radCtCharacteristic.on('data', (data: any, isNotification: boolean) => {
      const buf = Buffer.from(data);
      const counts = radCtParser.parse(buf).count;
      console.log('Count: ' + counts);
    });

    // subscribe to be notified whenever the peripheral update the characteristic
    // tslint:disable-next-line:variable-name
    radCtCharacteristic.subscribe((_error: Error) => {
      if (_error) {
        console.error('Error subscribing to Rad_Count');
      } else {
        console.log('Subscribed for Rad_Count notifications');
      }
    });
  }
}