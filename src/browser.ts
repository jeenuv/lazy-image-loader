// TODO: refactor runtime

import {Message, Options} from "./types";

export type RedirectFunc = (d: WebReqDetail) => RedirectSpec | null;

export interface FirefoxObject {
  runtime: {
    sendMessage: (msg: Message) => Promise<any>;
    onMessage: {
      addListener: (f: Function) => void;
    };
    getURL(u: string): string;
  };
  pageAction: {
    setIcon: (i: IconSpec) => void;
    setTitle: (t: TitleSpec) => void;
    show: (t: number) => void;
  };
  storage: {
    local: {
      get: (o: string[]) => Promise<Options | {}>;
      set: (o: object) => Promise<object>;
    };
  };
  tabs: {
    query: (o: object) => Promise<Tab[]>;
    sendMessage: (i: number, m: Message) => void;
    onRemoved: {
      addListener: (f: (i: number) => void) => void;
    };
    onUpdated: {
      addListener: (
        f: (i: number, c: TabChgInfo) => void,
        o: {properties: string[]}
      ) => void;
    };
  };
  webRequest: {
    onBeforeRequest: {
      addListener: (
        f: RedirectFunc,
        k: {types: string[]; urls: string[]},
        a: string[]
      ) => void;
      removeListener: (f: RedirectFunc) => void;
    };
  };
}

export interface ChromeObject {
  runtime: {
    sendMessage: (msg: Message, fn?: Function) => void;
    onMessage: {
      addListener: (f: Function) => void;
    };
    getURL(u: string): string;
    lastError: any;
  };
  pageAction: {
    setIcon: (i: IconSpec) => void;
    setTitle: (t: TitleSpec) => void;
    show: (t: number) => void;
  };
  storage: {
    local: {
      get: (o: string[], fn: (s: Options | {}) => void) => void;
      set: (o: object, fn: (r: object) => void) => void;
    };
  };
  tabs: {
    query: (o: object, fn: (r: Tab[]) => void) => void;
    sendMessage: (i: number, m: Message) => void;
    onRemoved: {
      addListener: (f: (i: number) => void) => void;
    };
    onUpdated: {
      addListener: (f: (i: number, c: TabChgInfo) => void) => void;
    };
  };
  webRequest: {
    onBeforeRequest: {
      addListener: (
        f: RedirectFunc,
        k: {types: string[]; urls: string[]},
        a: string[]
      ) => void;
      removeListener: (f: RedirectFunc) => void;
    };
  };
}

export interface TabChgInfo {
  url: string;
  status: string;
}

export interface Tab {
  url: string;
  id: number;
  openerTabId?: number;
}

export interface WebReqDetail {
  tabId: number;
  url: string;
}

export interface RedirectSpec {
  redirectUrl: string;
}

export interface IconSpec {
  tabId: number;
  path: string;
}

export interface TitleSpec {
  tabId: number;
  title: string;
}

export interface Sender {
  tab: Tab;
}

declare let browser: FirefoxObject | ChromeObject;
declare let chrome: ChromeObject;

export function isFirefox(
  env: ChromeObject | FirefoxObject
): env is FirefoxObject {
  return !isChrome(env);
}

export function isChrome(
  env: ChromeObject | FirefoxObject
): env is ChromeObject {
  return typeof browser === "undefined";
}

export function getBrowserObject(): FirefoxObject | ChromeObject {
  if (typeof browser === "undefined") {
    return chrome;
  } else {
    return browser;
  }
}
