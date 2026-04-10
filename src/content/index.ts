// Stamp the extension version onto the page so the webapp can detect it.
document.documentElement.setAttribute('data-easy-apply-ext', chrome.runtime.getManifest().version);

export {}
