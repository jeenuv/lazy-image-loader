import {LazyImg, LazyElement, Message} from "./types";
import {isChrome, isFirefox, getBrowserObject} from "./browser";

let browser = getBrowserObject();
const RETRY_TOLERANCE_MS = 3000;

function getSrc(img: LazyImg): string | null {
  let src: string | null = null;

  if (img.originalUrl) {
    return img.originalUrl;
  }

  if (img.src !== "") {
    src = img.src;
  } else if (img.srcset) {
    let sources = img.srcset.split(",").map(s => s.split(" ")[0]);
    if (sources.length > 0) {
      src = sources[0];
    }
  }

  return src;
}

// Lazily load the src of an img element
async function lazyLoadImage(under: Element[]): Promise<boolean> {
  for (let i = 0; i < under.length; i++) {
    let img = under[i] as LazyImg;
    if (img.tagName.toLowerCase() !== "img") {
      continue;
    }

    if (img.src.startsWith("data:") && img.src !== loadingImage) {
      console.log("lazy: image has already been loaded");

      // The srcset attribute, if present on the node--in case it's re-added by
      // page's JS--seems to take precence over src. So, remove the srcset
      // attribute.
      img.removeAttribute("srcset");

      return true;
    }

    let originalUrl = getSrc(img);
    if (originalUrl) {
      img.originalUrl = originalUrl;
    }

    if (originalUrl === null) {
      // See if the img is inside a picture.
      let picture = img.parentElement;
      if (picture && picture.tagName.toLowerCase() === "picture") {
        let sources = picture.querySelectorAll("source");
        if (sources.length > 0 && sources[0].srcset) {
          originalUrl = sources[0].srcset;
        }
      }

      if (originalUrl === null) {
        console.warn("lazy: image has no src or srcset");
        return false;
      }
    }

    if (img.requestedAt) {
      if (img.requestedAt > new Date().getTime() - RETRY_TOLERANCE_MS) {
        console.log(
          `lazy: waiting for ${
            RETRY_TOLERANCE_MS / 1000
          }s before requesting image again`
        );
        return true;
      }
    }

    img.src = loadingImage;
    img.removeAttribute("srcset");

    function loadImage(base64: string) {
      img.src = base64;

      // If the img is contained within a picture element, the source siblings
      // seem to have priority. So remove them too.
      let picture = img.parentElement;
      if (picture && picture.tagName.toLowerCase() === "picture") {
        picture.querySelectorAll("source").forEach(src => src.remove());
      }

      console.log("lazy: loaded", originalUrl);
    }

    // The browser had already attempted to fetch the image (to which it got the
    // place holder image), and have cached the result. Even if we allow the
    // request to go through, setting the src attribute again to the same value
    // won't refresh the image. To work this around, have the background page
    // fetch the image, and convet to a base64 URL so that we can set src
    // attribute directly to it. The src attribute being a base64 URL, no more
    // requests are issued, and the browser immediately refreshes the image.
    //
    // However, before initiating the loading of the original image, as a visual
    // cue to the user that it's being loaded, we display the "loading" image.
    let msg: Message = {header: "fetch", payload: originalUrl};
    img.requestedAt = new Date().getTime();
    console.log("lazy: requesting to load", originalUrl);

    if (isChrome(browser)) {
      browser.runtime.sendMessage(msg, loadImage);
    } else if (isFirefox(browser)) {
      let url = await browser.runtime.sendMessage(msg);
      loadImage(url);
    }

    // img elements are not containers, so once we found one, we don't need to
    // look for further imgs up the chain.
    return true;
  }

  return false;
}

// Lazily load the backgroundImage of any element
async function lazyLoadBackground(under: Element[]) {
  for (let i = 0; i < under.length; i++) {
    let element = under[i] as LazyElement;
    let cs = window.getComputedStyle(element);
    let bi = cs.backgroundImage;
    if (!(bi && bi.startsWith("url(") && bi.endsWith(")"))) {
      continue;
    }

    let url = bi.slice(5, -2);
    if (url.startsWith("data:")) {
      continue;
    }

    if (element.requestedAt) {
      if (element.requestedAt > new Date().getTime() - RETRY_TOLERANCE_MS) {
        console.log(
          `lazy: waiting for ${
            RETRY_TOLERANCE_MS / 1000
          }s before requesting background image again`
        );
        continue;
      }
    }

    element.originalUrl = url;
    element.style.setProperty(
      "background-image",
      `url(${loadingImage})`,
      "important"
    );

    function loadBackgroundImage(base64: string) {
      element.style.setProperty(
        "background-image",
        `url(${base64})`,
        "important"
      );
      console.log("lazy: loaded background image", url);
    }

    let msg: Message = {header: "fetch", payload: url};
    element.requestedAt = new Date().getTime();
    console.log("lazy: requesting to load background image", url);

    if (isChrome(browser)) {
      browser.runtime.sendMessage(msg, loadBackgroundImage);
    } else if (isFirefox(browser)) {
      let url = await browser.runtime.sendMessage(msg);
      loadBackgroundImage(url);
    }

    return;
  }
}

async function lazyLoad(e: MouseEvent) {
  // Look for images under mouse pointer
  let under = document.elementsFromPoint(e.clientX, e.clientY);

  if (!(await lazyLoadImage(under))) {
    await lazyLoadBackground(under);
  }
}

// Message handler
function messageHandler(message: Message) {
  switch (message.header) {
    case "shall-register":
      shallRegister = true;
      break;

    case "shall-unregister":
      shallRegister = false;
      unregisterMouse();
      break;
  }
}

function unregisterMouse() {
  if (!registered) {
    return;
  }

  document.removeEventListener("mousemove", lazyLoad);
  registered = false;
}

function registerMouse() {
  if (registered || !shallRegister) {
    return;
  }

  document.addEventListener("mousemove", lazyLoad);
  registered = true;
}

// Interim image to be displayed while the original image is being fetched from
// its source. We could have fetched this as web accessible resource, but Chrome
// would refuse to display it with its URL.
const loadingImage =
  "data:image/jpeg;base64," +
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAASCAIAAAC1qksFAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAA" +
  "B3RJTUUH4woaDA0DDK26RQAAAlhJREFUOMt1ldF22jAQRK+HlZEIaftT/cf+ZwLUlrzqgyQwCfXx" +
  "0QNIM7M7O/JU//wmgEGCCAkCRPqPjBUoY71BgQwFiigwCWASQSSRjJNxNs6yvjvBbZxPkCEN9MDj" +
  "ybx4gigQBHT0JM7GL+PNrOviWa8NpkZpuwoY8hnCG4fBbL2Cd+NsvFmeZU8nb6OUtGMNg6M8C5/U" +
  "iRtN40hGFFGclWddMGN1AqCHuu9YL9oC2XvT71KSiI3DOGrBNiSqA33dW8qzt/mbAY/+QBBBWHsh" +
  "Kkulq61OBcTBH3L2roadDXuOCQymIcsgiAhRHFXQhkZnDs7Bd/te9aT8Rz4DuqEHI8rFAgU2MLZC" +
  "FRUO9FJeNmo/Tnfc5oENAwze4MgFLWjpu6rjYFB3L/rapS8c90IbdMvmWUTdZAta0Nb/3wrVWIdd" +
  "7lSRwe7QepGshn6HTmrhus26oHXI35CxOp+FWZyN6j2W5lQBVJiHtzbiioOIYE403hu6ruKKFrii" +
  "DZrJxmJsTnFKwWAWs/pFNIsgsnfV9T4wbeQaNLyLqKvUWn9FDisCgRuKFKc67myF4L3Ljek0GhLE" +
  "SVTHRG25dUwtXFd1Y1e0oYzKmDzjYExOdTK4UaA6B+fD0UqANxHgJLKR2hEnGdYLdVFosVIbzf1g" +
  "G4A0AgHurE7LdXE25+/KsfAJV+dnuzKN7GSnOuYFKwi09XA1+T6GOe+ul0YWRaaP7yoO4qMwFdaV" +
  "TVQngBmptI+BzW6wwIRAvpu67Sk5X66aWWRRwR1EERfwv11Kgh+9Drkjv5+r+CgC4B93H/sac6KD" +
  "ogAAAABJRU5ErkJggg==";

let registered = false;
let shallRegister = false;

window.addEventListener("DOMContentLoaded", () => {
  document.addEventListener("keydown", e => {
    if (e.ctrlKey && e.altKey) {
      // Now that both ctrlKey and altKey are pressed, we can listen to mouse
      // moves.
      registerMouse();
    } else {
      // Otherwise, unregister
      unregisterMouse();
    }
  });

  document.addEventListener("keyup", e => {
    if (!(e.ctrlKey && e.altKey)) {
      unregisterMouse();
    }
  });

  window.setTimeout(() => {
    // Assign images' alt text or its path as its title so that the latter will be
    // displayed upon hover.
    document.querySelectorAll("img").forEach(img => {
      if (!img.title) {
        if (img.alt) {
          img.title = img.alt;
        } else {
          let src = getSrc(img);
          if (src) {
            let split = decodeURIComponent(src).split("/");
            img.title = split[split.length - 1].split("?")[0];
          }
        }
      }
    });
  }, 1000);

  // Send an online message to background script
  browser.runtime.sendMessage({header: "online"});
});

// Register message handler
browser.runtime.onMessage.addListener(messageHandler);

// vim: set tw=80:
