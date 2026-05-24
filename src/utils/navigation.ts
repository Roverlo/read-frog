import { browser } from "#imports"

export async function openOptionsPage(hashPath = "") {
  await browser.tabs.create({
    active: true,
    url: browser.runtime.getURL(`/options.html${hashPath ? `#${hashPath}` : ""}`),
  })
}
