// tslint:disable:no-console
// This file is an example implementation of a rate meter that levergeas 
import * as ct007 from './libct007/main';

export class Ratemeter {
  private readonly integrationRateMap = {
    fast: 4,
    slow: 22
  };

  private computeDose: boolean = false;
  private countsBuffer: number[] = [];
  private detector: any;
  private detectorState: string = "";
  private lastBattPct: number = -1;
  private integrationRate: number = 0;
  private myConfig = ct007.defaultConfig;

  // Get set up.
  constructor() {
    // Set a default fast integration rate.
    this.setIntegrationRate("fast");

    // Set up our detector.
    this.detector = new ct007.CT007Poller(this.myConfig);
    this.detector.init();

    // Set up events.
    this.detector.onStateChange.subscribe(this.handleStateChange);
    this.detector.onRadCount.subscribe(this.handleIncomingCounts);
    this.detector.onDevInfo.subscribe(this.handleIncomingDevInfo);
  }

  // Display our readings.
  public async start() {
    setTimeout(this.onSecond, 1000);
    setTimeout(this.requestBatteryLevel, 10000);
  }

  // Do we compute the dose rate?
  public setComputeDoseRate(enabled: boolean) {
    this.computeDose = enabled;
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
    this.detectorState = state;
    console.log("Detector state: " + state);
    if (state === "readingCounts") {
      this.detector.getBatteryLevel();
    }
  }

  // Callback for incoming counts.
  private handleIncomingCounts = (counts: number) => {
    this.countsBuffer.unshift(counts);
  }

  // Callback for incoming device information.
  private handleIncomingDevInfo = (data: any) => {
    // If our device information includes a battery level...
    if (data.batteryPercent) {
      if (this.lastBattPct !== data.batteryPercent && data.batteryPercent > -1) {
        this.lastBattPct = data.batteryPercent;
        console.log("Detector battery: " + data.batteryPercent + "%");
      }
    }
  }

  // Better rounding support.
  private round(value: number, precision: number) {
      const multiplier = Math.pow(10, precision || 0);
      return Math.round(value * multiplier) / multiplier;
  }

  // Convert counts per minute to dose rate in uSv/hr
  private getDoseRate(cpm: number): number | null {
    /*
    * null means a proper conversion failed to happen. This could be due to a conversion factor not
    * being available for the current detector. Only the CT007-F and N detectors are supported and are
    * gamma-only. The library's dose rates are calibrated against Cs137. The CT007-F alpha/beta shield
    * should be closed when dose rate readings matter.
    */
    let doseRate: number | null = null;

    if (this.detector.model.short && this.detector.doseConversionFactor) {
      // Figure out the dose rate.
      doseRate = cpm / this.detector.doseConversionFactor;
    }

    return doseRate;
  }

  // Once per second we want to handle data from our detector.
  private onSecond = async () => {
    let bufferFull = false;
    let bufferStr = "-";
    let doseStr = "";

    if (this.detector) {
      const expectedBufLen = this.integrationRate * ct007.RadCountUpdateHz;

      // If we're taking readings...
      if (this.detectorState === "readingCounts") {
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

        const computedDose = this.getDoseRate(cpm);

        // If we were able to compute a dose...
        if (computedDose !== null && this.computeDose) {
          doseStr = ", " + this.round(computedDose, 2) + " uSv/hr";
        }

        console.log("[" + bufferStr + "] CPM: " + this.round(cpm, 1) + doseStr);
      }
    }
    setTimeout(this.onSecond, 1000);
  }

  // Request battery information from the detecor periodically.
  private requestBatteryLevel = () => {
    this.detector.getBatteryLevel();
    setTimeout(this.requestBatteryLevel, 10000);
  }
}

// Use our newly-constructed reatemeter.
const rm = new Ratemeter();
rm.setIntegrationRate("fast");
rm.setComputeDoseRate(true);
rm.start();
