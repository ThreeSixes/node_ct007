// tslint:disable:no-console
/*
 * By: ThreeSixes
 * This file is part of the node-ct007 project. It is
 * an exmaple implementation of a ratemeter. The is for
 * reference only and comes with no warranty or guarantee
 * about the accuracy of its readings.
 */
import * as ct007 from '../../dist/libct007/main.js';

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

  // Set integration rate.
  public setIntegrationRate(rate: string) {
    // There has to be a better way to do this.
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
    if (state === "reading") {
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
      // If we have a new and valid reading to report report it.
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
    * being available for the current detector. The CT007-F and P should have a closed alpha/beta
    * shield closed when gathering dose rate data as doeses are calibrated with gamma only.
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

    // If we actually have our detector set up...
    if (this.detector) {
      const expectedBufLen = this.integrationRate * ct007.RadCountUpdateHz;

      // If the detector is taking readings...
      if (this.detectorState === "reading") {
        let cpm = 0;

        if (this.countsBuffer.length >= expectedBufLen - 1) {
          bufferFull = true;
          this.countsBuffer = this.countsBuffer.slice(0, expectedBufLen - 1);
        } else {
          bufferFull = false;
        }

        // Make sure we don't divide by zero.
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

        // Get the dose rate.
        const computedDose = this.getDoseRate(cpm);

        // If we were configured and able to compute a dose...
        if (computedDose !== null && this.computeDose) {
          doseStr = ", " + this.round(computedDose, 2) + " uSv/hr";
        }

        // Show the counts per minute and optionally the dose rate.
        console.log("[" + bufferStr + "] CPM: " + this.round(cpm, 1) + doseStr);
      }
    }

    // Call this again in 1 second.
    setTimeout(this.onSecond, 1000);
  }

  // Request battery information from the detecor periodically.
  private requestBatteryLevel = () => {
    // Ask the detector for its battery level. The response will be handled by handleIncomingDevInfo().
    this.detector.getBatteryLevel();

    // Call this again in 10 seconds.
    setTimeout(this.requestBatteryLevel, 10000);
  }
}

/*
 * This is where we actually start testing the ratemeter. This is set up to mimic controls on an actual ratemeter.
 *
 * This example sets the intgration rate to fast (4 seconds) and turns on dose rate calculation for the CT007-F, N, M and P.
 * If we don't have a conversion factor for the detector it will not show up. The start() method starts the process
 * of grabbing readings.
 */
const rm = new Ratemeter();
rm.setIntegrationRate("fast");
rm.setComputeDoseRate(true);
rm.start();
