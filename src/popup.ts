import {Message, PopupStatus} from "./types";
import {isChrome, isFirefox, getBrowserObject} from "./browser";

window.addEventListener("load", async () => {
  let browser = getBrowserObject();

  let extensionCheckbox = document.getElementById(
    "extension-enable"
  ) as HTMLInputElement;
  let siteCheckbox = document.getElementById("site-enable") as HTMLInputElement;
  let pageContent = document.getElementById("page-content")!;
  let tabCheckbox = document.getElementById("tab-enable") as HTMLInputElement;

  extensionCheckbox.addEventListener("click", () => {
    let msg: Message = {
      header: "extension-enable",
      payload: extensionCheckbox.checked,
    };

    siteCheckbox.disabled = !extensionCheckbox.checked;
    browser.runtime.sendMessage(msg);
  });

  siteCheckbox.addEventListener("click", e => {
    let msg: Message = {header: "site-enable", payload: siteCheckbox.checked};
    browser.runtime.sendMessage(msg);
  });

  tabCheckbox.addEventListener("click", e => {
    let msg: Message = {header: "tab-enable", payload: tabCheckbox.checked};
    browser.runtime.sendMessage(msg);
  });

  function readyPage(stat: PopupStatus): void {
    extensionCheckbox.checked = stat.extensionEnabled;
    siteCheckbox.checked = stat.siteEnabled;
    tabCheckbox.checked = stat.tabEnabled;

    pageContent.style.display = "block";
    siteCheckbox.disabled = !stat.extensionEnabled;
    tabCheckbox.disabled = !stat.extensionEnabled;

    document.getElementById("num-blocked")!.innerText =
      stat.numBlocked.toString();
    document.getElementById("num-allowed")!.innerText =
      stat.numAllowed.toString();
  }

  let msg: Message = {header: "get-status"};
  if (isChrome(browser)) {
    browser.runtime.sendMessage(msg, readyPage);
  } else {
    let response = await browser.runtime.sendMessage(msg);
    readyPage(response);
  }
});

// vim: set tw=80:
