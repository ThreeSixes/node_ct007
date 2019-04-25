// tslint:disable:no-console
// This file is an example implementation of a rate meter that levergeas 
import * as ct007 from './libct007/main';

export class Ratemeter {
  private readonly integrationRateMap = {
    fast: 4,
    slow: 22
  };

  private counter: any;
  private counterState: string = "";
  private countsBuffer: number[] = [];
  private integrationRate: number = 0;
  private myConfig = ct007.defaultConfig;

  // Get set up.
  constructor() {
    // Set a default fast integration rate.
    this.setIntegrationRate("fast");

    // Set up our detector.
    this.counter = new ct007.CT007Poller(this.myConfig);
    this.counter.init();
    this.counter.onStateChange.subscribe(this.handleStateChange);
    this.counter.onRadCount.subscribe(this.handleIncomingCounts);
    this.counter.onDevInfo.subscribe(this.handleIncomingDevInfo);
  }

  // Display our readings.
  public async display() {
    setTimeout(this.onSecond, 1000);
  }

  public setIntegrationRate(rate: string) {
    switch(rate) {
      case "fast":
      case "slow":
        this.integrationRate = this.integrationRateMap[rate];
        break;
      default:
        break;
    }
  }

  // Callback for incoming counts.
  private handleStateChange = (state: string) => {
    this.counterState = state;
    console.log("Device state: " + state);
    if (state === "readingCounts") {
      this.counter.getBatteryLevel();
    }
  }

  // Callback for incoming counts.
  private handleIncomingCounts = (counts: number) => {
    this.countsBuffer.unshift(counts);
  }

  // Callback for incoming device information.
  private handleIncomingDevInfo = (data: any) => {
    if (data.batteryPercent) {
      console.log("Battery: " + data.batteryPercent + "%");
    }
  }

  // Better rounding support.
  private round(value: number, precision: number) {
      const multiplier = Math.pow(10, precision || 0);
      return Math.round(value * multiplier) / multiplier;
  }

  // Once per second we want to handle data from our detector.
  private onSecond = async () => {
    let bufferFull = false;
    let bufferStr = "-";

    if (this.counter) {
      const expectedBufLen = this.integrationRate * ct007.RadCountUpdateHz;

      // If we're taking readings...
      if (this.counterState === "readingCounts") {
        let cpm = 0;

        if (this.countsBuffer.length >= expectedBufLen - 1) {
          bufferFull = true;
          this.countsBuffer = this.countsBuffer.slice(0, expectedBufLen - 1);
        } else {
          bufferFull = false;
        }

        if (this.countsBuffer.length > 0) {
          const countsSum = this.countsBuffer.reduce((accum, cur) => accum + cur);
          const sumAvg = countsSum / this.countsBuffer.length;
          cpm = sumAvg * ct007.RadCountUpdateHz * 60;
        } else {
          cpm = 0;
        }

        // If we have a full buffer...
        if (bufferFull) {
          bufferStr = "*";
        }

        console.log("[" + bufferStr + "] CPM: " + this.round(cpm, 1));
      }
    }
    setTimeout(this.onSecond, 1000);
  }
}

// Use our newly-constructed reatemeter.
const rm = new Ratemeter();
rm.setIntegrationRate("fast");
rm.display();

