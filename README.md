# General Clash Config

A portable Mihomo/OpenClash routing template.

## Included routing

- IPv6 enabled
- AI selectors for OpenAI, Claude, Gemini, and Copilot
- Media selector
- Emby selector
- Mainland Steam content direct; other Steam traffic through the default proxy
- China and private networks direct
- All unmatched traffic enters the selectable `Default Proxy` group
- Custom rules: `tv.micu.hk` direct; `oceancloud.asia` and `micu.hk` through the default proxy

## Security

This repository deliberately contains no subscription URL, node credential, or access token. The placeholder `__SELF_HOSTED_SUBSCRIPTION_URL__` must be replaced only by a private distribution service or a local private copy.

Do not place a real subscription URL in this public repository.

## Private multi-device subscription

The next deployment step is a small private endpoint, such as a Cloudflare Worker. It reads this template, replaces the placeholder using a secret stored in the Worker, and serves a random private subscription URL to OpenClash and other clients.
