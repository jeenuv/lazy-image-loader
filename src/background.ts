import {Message, Options, PopupStatus} from "./types";
import {
  isChrome,
  isFirefox,
  Tab,
  WebReqDetail,
  TabChgInfo,
  RedirectSpec,
  Sender,
  getBrowserObject,
} from "./browser";

let browser = getBrowserObject();

const placeHolderUrl = browser.runtime.getURL("res/placeholder.png");
let allowedTabs = new Set<number>();
let allowedDomains = new Set<string>();

// Tab IDs that were individually overridden, unrelated to filtering by domain.
let overriddenTabs = new Set<number>();

let options: Options;
const defaultOptions: Options = {allowedDomains: [], extensionEnabled: true};

let numBlocked = 0;
let numAllowed = 0;

let suffixableDomains = new Set(["co", "gov"]);

function imageListener(details: WebReqDetail): RedirectSpec | null {
  // If the request is from an allowed tab, don't block it.
  if (
    details.tabId === -1 ||
    allowedTabs.has(details.tabId) ||
    overriddenTabs.has(details.tabId)
  ) {
    numAllowed++;
    return null;
  }

  // Allow placeholder image
  if (details.url === placeHolderUrl) {
    return null;
  }

  // Redirect everything else to the placeholder image
  numBlocked++;
  return {redirectUrl: placeHolderUrl};
}

// Update pageAction icon based on tab ID
function updateTabIcon(tabId: number) {
  let tabDenied =
    options.extensionEnabled &&
    !allowedTabs.has(tabId) &&
    !overriddenTabs.has(tabId);

  if (tabDenied) {
    browser.pageAction.setIcon({
      tabId: tabId,
      path: "res/no_sloth.png",
    });

    browser.pageAction.setTitle({
      tabId: tabId,
      title: "Lazy loading is enabled.",
    });
  } else {
    browser.pageAction.setIcon({
      tabId: tabId,
      path: "res/sloth.png",
    });

    browser.pageAction.setTitle({
      tabId: tabId,
      title: "Lazy loading is disabled.",
    });
  }
}

// scheme://foo.bar.com/baz => bar.com
function urlToDomain(url: string | null): string | null {
  if (!url) {
    return null;
  }

  let comp = url.toLowerCase().split("/");
  if (comp.length <= 3) {
    return null;
  }

  let hostComps = comp[2].split(".").reverse();
  let last =
    hostComps.length >= 3 && suffixableDomains.has(hostComps[1]) ? 3 : 2;

  return hostComps.slice(0, last).reverse().join(".");
}

function getLocalStorage(): Promise<Options | {}> {
  if (isFirefox(browser)) {
    return browser.storage.local.get(Object.keys(defaultOptions));
  }

  let chromeRes: (o: Options | {}) => void;
  let chromePromise = new Promise<Options | {}>((res, rej) => {
    chromeRes = res;
  });

  browser.storage.local.get(Object.keys(defaultOptions), res => {
    chromeRes(res);
  });

  return chromePromise;
}

function setLocalStorage(): Promise<object> {
  if (isFirefox(browser)) {
    return browser.storage.local.set(options);
  }

  let chromeRes: (o: object) => void;
  let chromeRej: () => void;
  let chromePromise = new Promise<object>((res, rej) => {
    chromeRes = res;
    chromeRej = rej;
  });

  browser.storage.local.set(options, o => {
    // TODO: remove this isChrome in later version of TS
    if (isChrome(browser) && browser.runtime.lastError) {
      chromeRej();
    } else {
      chromeRes(o);
    }
  });

  return chromePromise;
}

async function getCurrentTab(): Promise<Tab> {
  if (isFirefox(browser)) {
    let tabs = await browser.tabs.query({active: true, currentWindow: true});
    return tabs[0];
  }

  let chromeRes: (t: Tab) => void;
  let chromePromise = new Promise<Tab>((res, rej) => {
    chromeRes = res;
  });

  browser.tabs.query({active: true}, tabs => {
    chromeRes(tabs[0]);
  });

  return chromePromise;
}

// Chrome's message handler closes the port as soon as the handler return a
// value. If this were an async function, it'll always return promise object. To
// prevent that, this is written as a normal function, and .then/.catch are used
// at the top-level instead.
function messageListener(
  message: Message,
  sender: Sender,
  respond: (b: any) => void
) {
  console.log("Received message: ", message);
  switch (message.header) {
    // Content script request to fetch image, and return its contents as base64.
    case "fetch": {
      console.log("Lazy loader: fetching " + message.payload);
      numAllowed++;
      let ffRet = new Promise(async (res, rej) => {
        let resp = await fetch(message.payload);
        let blob = await resp.blob();
        try {
          let reader = new FileReader();
          reader.addEventListener("load", () => {
            // Resolve the promise unconditionally; and this would do for
            // Firefox. For Chrome, though, dispatch the results through the
            // respond callback.
            res(reader.result);
            if (isChrome(browser)) {
              respond(reader.result);
            }
          });

          reader.readAsDataURL(blob);
        } catch (e) {
          console.error("Lazy loader: error fetching " + message.payload);
          rej(e);
        }
      });

      // For Chrome, return true to keep the channel open, through which we send
      // the response later. For Firefox, return the promise we created.
      return isChrome(browser) ? true : ffRet;
    }

    case "get-status": {
      let ffRet = new Promise<PopupStatus>(async (res, rej) => {
        let tab = await getCurrentTab();
        let result = {
          extensionEnabled: options.extensionEnabled,
          siteEnabled: allowedTabs.has(tab.id),
          tabEnabled: overriddenTabs.has(tab.id),
          numAllowed,
          numBlocked,
        };

        // As "fetch" above
        res(result);
        if (isChrome(browser)) {
          respond(result);
        }
      });

      return isChrome(browser) ? true : ffRet;
    }

    case "extension-enable": {
      let nowEnabled = message.payload;
      // XOR
      if (
        (options.extensionEnabled && !nowEnabled) ||
        (!options.extensionEnabled && nowEnabled)
      ) {
        options.extensionEnabled = nowEnabled;
        setLocalStorage().catch(e => console.error(e));
        applyBlocking();
      }
      break;
    }

    case "online": {
      // If the tab isn't in the allowed set, ask it to register mouse handler
      // to request for blocked images via "fetch" message.
      if (!allowedTabs.has(sender.tab.id)) {
        browser.tabs.sendMessage(sender.tab.id, {header: "shall-register"});
      }
      break;
    }

    case "site-enable": {
      getCurrentTab().then(tab => siteEnableChanged(tab, message.payload));
      break;
    }

    case "tab-enable": {
      getCurrentTab().then(tab => tabEnableChanged(tab, message.payload));
      break;
    }
  }
}

function tabEnableChanged(tab: Tab, allow: boolean) {
  if (allow) {
    overriddenTabs.add(tab.id);
    console.log(`Allowing tab ${tab.id}`);
  } else {
    overriddenTabs.delete(tab.id);
    console.log(`Disallowing tab ${tab.id}`);
  }
}

function siteEnableChanged(tab: Tab, allow: boolean) {
  // Chrome displays page action on a new tab, but Firefox doesn't. So in
  // Chrome, we can get domain as null.
  let domain = urlToDomain(tab.url);

  if (allow) {
    allowedTabs.add(tab.id);
    if (domain) {
      console.log(`Allowing ${domain}`);
      allowedDomains.add(domain);
    }
  } else {
    allowedTabs.delete(tab.id);
    if (domain) {
      console.log(`Disallowing ${domain}`);
      allowedDomains.delete(domain);
    }
  }

  if (domain) {
    options.allowedDomains = [...allowedDomains.values()];
    setLocalStorage();
  }

  updateTabIcon(tab.id);
}

async function applyBlocking() {
  // Register onBeforeRequest handler.
  let blockTypes = ["image", "media"];

  // Chrome doesn't recognize 'imageset'.
  if (!isChrome(browser)) {
    blockTypes.push("imageset");
  }

  if (options.extensionEnabled) {
    browser.webRequest.onBeforeRequest.addListener(
      imageListener,
      {
        types: blockTypes,
        urls: ["<all_urls>"],
      },
      ["blocking"]
    );
  } else {
    browser.webRequest.onBeforeRequest.removeListener(imageListener);
  }

  let tab = await getCurrentTab();
  updateTabIcon(tab.id);
}

function onUpdatedHandler(tabId: number, chgInfo: TabChgInfo) {
  // Chrome calls this handler for new tab pages too. But we want the page
  // action only on tabs where a domain is loaded.
  if (
    isChrome(browser) &&
    chgInfo.url &&
    chgInfo.url.split("/")[0] === "chrome:"
  ) {
    return;
  }

  // We're only interested when tab is loading so that we can set its allowed
  // status early enough
  if (chgInfo.status && chgInfo.status !== "loading") {
    return;
  }

  // If the URL changed, update allowedTabs according to the new domain.
  let domain = urlToDomain(chgInfo.url);
  if (domain) {
    if (allowedDomains.has(domain)) {
      allowedTabs.add(tabId);
    } else {
      allowedTabs.delete(tabId);
    }
  }

  updateTabIcon(tabId);
  browser.pageAction.show(tabId);
}

async function backgroundInit() {
  browser.runtime.onMessage.addListener(messageListener);

  // When a tab is removed, remove that from the allowed set as well.
  browser.tabs.onRemoved.addListener((tabId: number) => {
    allowedTabs.delete(tabId);
    overriddenTabs.delete(tabId);
  });

  // Build a set of allowed domains from local store, if it exists.
  let ret = await getLocalStorage();
  if (Object.keys(ret).length === 0) {
    options = defaultOptions;
    setLocalStorage();
    allowedDomains = new Set();
    console.log("Extension initialized for the first time: ", options);
  } else {
    options = ret as Options;
    allowedDomains = new Set(options.allowedDomains);
    console.log("Extension initialized: ", options);
  }

  applyBlocking();

  // Chrome doesn't allow filters, but Firefox does.
  if (isChrome(browser)) {
    browser.tabs.onUpdated.addListener(onUpdatedHandler);
  } else {
    browser.tabs.onUpdated.addListener(onUpdatedHandler, {
      properties: ["status", "url"],
    });
  }
}

backgroundInit();

// vim: set tw=80:
