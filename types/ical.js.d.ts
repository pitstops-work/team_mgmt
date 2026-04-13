declare module "ical.js" {
  function parse(input: string): unknown[];

  class Component {
    constructor(jCal: unknown);
    getAllSubcomponents(name: string): Component[];
    getFirstPropertyValue(name: string): unknown;
  }

  class Event {
    constructor(component: Component);
    uid: string;
    summary: string;
    startDate: Time;
    endDate: Time;
  }

  class Time {
    isDate: boolean;
    toJSDate(): Date;
  }
}
