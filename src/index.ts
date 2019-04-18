'use strict';

var noble = require('noble');
var Parser = require("binary-parser").Parser;

const TARGET_DEV_NAME = 'CT-F-54';
const RAD_CT_SERVICE_UUID = 'f100ffd004514100b100000000000000';
const RAD_CT_CHARACTERISTIC_UUID = 'f100ffd104514100b100000000000000';
const BATT_SERVICE_UUID = '0000180f00001000800000805f9b34fb';
const BATT_CHARACTERISTIC_UUID = '00002a1900001000800000805f9b34fb';

noble.on('stateChange', state => {
  if (state === 'poweredOn') {
    console.log('Scanning for "' + TARGET_DEV_NAME + '"...');
    noble.startScanning([RAD_CT_SERVICE_UUID]);
  } else {
    noble.stopScanning();
  }
});

noble.on('discover', peripheral => {
    // connect to the first peripheral that is scanned
    noble.stopScanning();
    const name = peripheral.advertisement.localName;

    // Does this device have the name we're interested in?
    if (name == TARGET_DEV_NAME) {
      console.log(`Connecting to '${name}': ${peripheral.id}`);
      connectAndSetUp(peripheral);
    }
});

function connectAndSetUp(peripheral) {

  peripheral.connect(error => {
    console.log('Connected to', peripheral.id);

    // specify the services and characteristics to discover
    //const serviceUUIDs = [RAD_CT_SERVICE_UUID, BATT_SERVICE_UUID];
    //const characteristicUUIDs = [RAD_CT_CHARACTERISTIC_UUID, BATT_CHARACTERISTIC_UUID];
    const serviceUUIDs = [RAD_CT_SERVICE_UUID];
    const characteristicUUIDs = [RAD_CT_CHARACTERISTIC_UUID];

    peripheral.discoverSomeServicesAndCharacteristics(
        serviceUUIDs,
        characteristicUUIDs,
        onServicesAndCharacteristicsDiscovered
    );
  });

  peripheral.on('disconnect', () => console.log('Disconnected.'));
}

function onServicesAndCharacteristicsDiscovered(error, services, characteristics) {
  console.log('Discovered services and characteristics');
  const radCtCharacteristic = characteristics[0];
  const radCtParser = new Parser()
    .endianess("little")
    .int32le("count");

  // data callback receives notifications
  radCtCharacteristic.on('data', (data, isNotification) => {
    var buf = Buffer.from(data);
    var counts = radCtParser.parse(buf).count
    console.log('Count: ' + counts);
  });

  // subscribe to be notified whenever the peripheral update the characteristic
  radCtCharacteristic.subscribe(error => {
    if (error) {
      console.error('Error subscribing to Rad_Count');
    } else {
      console.log('Subscribed for Rad_Count notifications');
    }
  });
}
