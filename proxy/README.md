# openid-proxy

An OpenID proxy server for communication with the Steam Community website. Valve blocks direct access to their OpenID endpoints when requesting from Cloudflare Workers, so this proxy is necessary to authenticate users with Steam.

It is deployed on [Railway](https://railway.app/).