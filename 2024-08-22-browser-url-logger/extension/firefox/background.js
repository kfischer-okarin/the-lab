if (typeof browser == "undefined") {
  // Chrome does not support the browser namespace yet.
  globalThis.browser = chrome;
}

const loggerPort = browser.runtime.connectNative("com.my_private_extension.url_logger");

loggerPort.onMessage.addListener((message) => {
  console.log("Received: " + JSON.stringify(message));
});

const freshlyReloadedTabIds = new Set();

browser.tabs.onActivated.addListener(async (activeInfo) => {
  // Ignore freshly reloaded tabs since they don't have their proper title and URL yet
  if (!freshlyReloadedTabIds.has(activeInfo.tabId)) {
    const tab = await browser.tabs.get(activeInfo.tabId);

    if (tab.url !== "about:newtab") {
      logURL(tab);
    }
  }
});

browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Remember tabs that were freshly reloaded so we can ignore them in onActivated
  if (changeInfo.discarded === false) {
    freshlyReloadedTabIds.add(tabId);
  }

  // A freshly reloaded tab will first have a complete status with an URL change which we want to ignore
  // We only want to log the URL when the tab is fully loaded, i.e. when URL was already set and the status is complete
  if (changeInfo.status === "complete" && !changeInfo.url) {
    freshlyReloadedTabIds.delete(tabId);
    logURL(tab);
  }
});

const logURL = (tab) => {
  const message = { url: tab.url, title: tab.title };
  console.log(`Sending: ${JSON.stringify(message)}`);
  loggerPort.postMessage(message);
};
