import * as ct007 from './ct007';
// tslint:disable:no-console


// tslint:disable-next-line:interface-name
export interface ICT007Config {
  address?: string;
  name?: string;
  scanForever: boolean;
}

const defaultConfig: ICT007Config = {
  scanForever: true
};

export class CT007Poller {
  constructor(private config: ICT007Config = defaultConfig) {}

  public async poll() {
    console.log('poll');
  }
}
