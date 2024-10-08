export type Message =
  | {
      header: "fetch";
      payload: string;
    }
  | {
      header: "get-status";
    }
  | {
      header: "extension-enable";
      payload: boolean;
    }
  | {
      header: "online";
      payload?: boolean;
    }
  | {
      header: "shall-register";
    }
  | {
      header: "shall-unregister";
    }
  | {
      header: "site-enable";
      payload: boolean;
    }
  | {
      header: "tab-enable";
      payload: boolean;
    };

export type PopupStatus = {
  extensionEnabled: boolean;
  siteEnabled: boolean;
  tabEnabled: boolean;
  numAllowed: number;
  numBlocked: number;
};

export interface Options {
  allowedDomains: string[];
  extensionEnabled: boolean;
}

export interface LazyImg extends HTMLImageElement {
  originalUrl?: string;
  requestedAt?: number;
}

export interface LazyElement extends HTMLElement {
  originalUrl?: string;
  requestedAt?: number;
}
