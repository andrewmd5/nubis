import { Hono } from 'hono';
import { cors } from 'hono/cors';
import nubis from "../../nubis.json";
import { ITokenPayload, IUser, TokenPayload } from './types.gen';

const steamApiBaseUrl = 'https://partner.steam-api.com';

const ErrorCode = {
  InternalError: 0,
  AuthFailed: 1,
  NoOwnership: 2,
  MissingRequiredDlcs: 3,
  SteamError: 4,
};

type SteamUser = {
  steamId: string;
  playTime: number;
  playerLevel: number;
  avatar: string;
  profileUrl: string;
  name: string;
  ownedApps: OwnedApp[];
};


type App = {
  appid: number;
  ownsapp: boolean;
  ownership: boolean;
  timestamp: string;
  ownersteamid: string;
  sitelicense: boolean;
};
type PublisherAppOwnership = {
  appownership: {
    apps: App[];
  };
};

type OwnedApp = {
  appid: number;
};

type OwnershipCheckResult = {
  ownsBaseApp: boolean;
  ownsRequiredDlcs: boolean;
  ownedApps: OwnedApp[];
};

async function fetchSteamApi<T>(endpoint: string, params: Record<string, string | number | boolean> = {}): Promise<T | undefined> {
  const url = new URL(`${steamApiBaseUrl}${endpoint}`);
  url.searchParams.append('key', nubis.steam.apiKey);
  Object.keys(params).forEach(key => url.searchParams.append(key, String(params[key])));
  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'curl/8.4.0',
        'Accept': '*/*',
      }
    });
    if (!response.ok) throw new Error(`Steam API responded with status: ${response.status}`);
    // @ts-ignore
    const data = (await response.json()) as object | undefined;
    if (!data) {
      console.error(`no data from Steam API: ${response.status}`);
      return undefined;
    }
    if ('response' in data) {
      return data.response as T;
    }
    if ('appownership' in data) {
      return data as T;
    }
    console.error(`Unexpected response from Steam API: ${JSON.stringify(data)}`);
    return undefined;
  } catch (error) {
    console.error(`Failed to fetch from Steam API: ${error}`);
    return undefined;
  }
}

async function checkAppOwnership(steamId: string): Promise<OwnershipCheckResult | undefined> {
  const ownershipData = await fetchSteamApi<PublisherAppOwnership>('/ISteamUser/GetPublisherAppOwnership/v3/', {
    steamid: steamId
  });

  if (!ownershipData) {
    console.error(`Failed to fetch app ownership data for SteamID: ${steamId}`);
    return undefined;
  }

  const apps = ownershipData.appownership.apps;

  const ownsBaseApp = apps.some(app => app.appid === nubis.steam.baseAppId && app.ownsapp);
  const ownsRequiredDlcs = nubis.steam.requiredDlcs.every(dlc => apps.some(app => app.appid === dlc && app.ownsapp));
  const ownedApps = apps.filter(app => app.ownsapp).map(app => ({ appid: app.appid }));

  return {
    ownsBaseApp,
    ownsRequiredDlcs,
    ownedApps
  };
}

async function generateToken(payload: ITokenPayload): Promise<string> {
  const header = {
    alg: "HS256",
    typ: "JWT",
  };

  const encodedHeader = btoa(JSON.stringify(header));
  const encodedPayload = btoa(TokenPayload.encodeToJSON(payload));

  const signature = await sign(`${encodedHeader}.${encodedPayload}`, nubis.auth.secret);
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

async function getSteamUser(steamId: string, ownedApps: OwnershipCheckResult): Promise<SteamUser | undefined> {
  const playTimeData = await fetchSteamApi<{ playtime_forever?: number; }>('/IPlayerService/GetSingleGamePlaytime/v1/', {
    steamid: steamId,
    appid: nubis.steam.baseAppId,
  });

  const playTime = playTimeData?.playtime_forever ? Math.round(playTimeData.playtime_forever) : undefined;
  if (playTime === undefined) {
    console.error(`Failed to fetch playtime data for SteamID: ${steamId}`);
    return undefined;
  }

  const playerLevelData = await fetchSteamApi<{ player_level?: number; }>('/IPlayerService/GetSteamLevel/v1/', { steamid: steamId });
  const playerLevel = playerLevelData?.player_level ?? 0;

  const summaryData = await fetchSteamApi<{ players: [{ avatarfull: string; profileurl: string; personaname: string; }]; }>('/ISteamUser/GetPlayerSummaries/v2/', { steamids: steamId });
  const summary = summaryData?.players[0];
  if (!summary) {
    console.error(`Failed to fetch player summary data for SteamID: ${steamId}`);
    return undefined;
  }

  return {
    steamId,
    playTime,
    playerLevel,
    avatar: summary.avatarfull,
    profileUrl: summary.profileurl,
    name: summary.personaname,
    ownedApps: ownedApps.ownedApps,
  };
}

async function sign(input: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    true,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(input));

  // Convert Uint8Array to base64 without using Buffer
  const base64String = btoa(String.fromCharCode.apply(null, new Uint8Array(signature) as unknown as number[]));
  return base64String;
}

const app = new Hono();

app.use('/*', cors());


app.get('/auth/steam', (c) => {
  // get the base url
  const params = {
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'checkid_setup',
    'openid.return_to': `${nubis.gateway.realm}${nubis.gateway.returnTo}`, // URL to which Steam will redirect after authentication
    'openid.realm': nubis.gateway.realm, // Identifier of your service
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
  };
  const query = new URLSearchParams(params).toString();
  const redirectURL = `https://steamcommunity.com/openid/login?${query}`;
  return c.redirect(redirectURL, 302);
});

app.get('/auth/steam/verify', async (c) => {
  try {

    const url = new URL(c.req.url);
    const params = url.searchParams;


    if (params.get('openid.mode') !== 'id_res') {
      return c.redirect(`${nubis.gateway.realm}?error=${ErrorCode.InternalError}'`, 301);
    }

    if (params.get('openid.claimed_id') !== params.get('openid.identity') ||
      params.get('openid.op_endpoint') !== 'https://steamcommunity.com/openid/login' ||
      params.get('openid.ns') !== 'http://specs.openid.net/auth/2.0' ||
      !params.get('openid.return_to')?.startsWith(nubis.gateway.realm)) {
      return c.redirect(`${nubis.gateway.realm}?error=${ErrorCode.InternalError}`, 301);
    }

    // Regex to extract SteamID
    const steamIdMatch = params.get('openid.identity')?.match(/\/id\/(7656119[0-9]{10})\/?$/);
    if (!steamIdMatch) {
      return c.redirect(`${nubis.gateway.realm}?error=${ErrorCode.AuthFailed}`, 301);
    }

    // Prepare parameters for Steam's validation request
    const validationParams = new URLSearchParams();
    params.forEach((value, key) => validationParams.set(key, value));
    validationParams.set('openid.mode', 'check_authentication');

    const checkAuthResponse = await fetch(nubis.gateway.proxy.url, {
      method: 'POST',

      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'curl/8.4.0',
        'Authorization': `Bearer ${nubis.gateway.proxy.accessToken}`,
        'Accept': '*/*',
      },
      body: validationParams.toString(),
    });

    if (checkAuthResponse.status !== 204) {
      return c.redirect(`${nubis.gateway.realm}?error=${ErrorCode.AuthFailed}`, 301);
    }

    const steamId = steamIdMatch[1];

    // check if they own the user voice DLC
    const ownershipData = await checkAppOwnership(steamId);
    if (!ownershipData) {
      console.error(`Failed to check app ownership for SteamID: ${steamId}`);
      return c.redirect(`${nubis.gateway.realm}?error=${ErrorCode.SteamError}`, 301);
    }

    if (!ownershipData.ownsBaseApp) {
      console.error(`User does not own the base app: ${steamId}`);
      return c.redirect(`${nubis.gateway.realm}?error=${ErrorCode.NoOwnership}`, 301);
    }

    if (!ownershipData.ownsRequiredDlcs) {
      console.error(`User does not own the required DLCs: ${steamId}`);
      return c.redirect(`${nubis.gateway.realm}?error=${ErrorCode.MissingRequiredDlcs}`, 301);
    }

    const steamUser = await getSteamUser(steamId, ownershipData);


    if (!steamUser) {
      console.error(`Failed to fetch Steam user data for SteamID: ${steamId}`);
      return c.redirect(`${nubis.gateway.realm}?error=${ErrorCode.SteamError}`, 301);
    }

    // calculate the weight based on:
    // - if they own the donation DLC
    // - if they own the dark mode DLC
    // - their playtime
    // - weights can be 0 to 100
    // - the higher the weight, the higher their post are on the suggestion board
    // - we reward users who own more and play more
    const getWeight = () => {
      let weight = 0;
      // check their owned apps against the nubis list
      try {
        steamUser.ownedApps.forEach(app => {
          if (app.appid !== nubis.steam.baseAppId) {
            nubis.steam.dlcs.forEach(dlc => {
              if (app.appid === dlc.appId && app.appid !== nubis.steam.baseAppId) {
                weight += dlc.weight;
              }
            });
          }
        });


        // playtime is in minutes
        // it should have less impact the higher the playtime is
        // to be fair, no one should hit 100 weight
        weight += Math.min(80, Math.round(steamUser.playTime / 60 / 10));
        return weight;
      } catch (e) {
        console.error("Error calculating weight from DLCs", e);
        return 0;
      }
    };

    const user: IUser = {
      id: BigInt(steamUser.steamId),
      name: steamUser.name,
      avatar: steamUser.avatar,
      profileUrl: steamUser.profileUrl,
      playTime: steamUser.playTime,
      level: steamUser.playerLevel,
      ownedApps: steamUser.ownedApps.map(app => app.appid),
      weight: getWeight(),
    };

    const payload: ITokenPayload = {
      exp: new Date(new Date().getTime() + 7 * 24 * 60 * 60 * 1000),
      data: user,
    };

    const token = await generateToken(payload);

    return c.redirect(`${nubis.gateway.realm}?token=${token}`, 301);
  } catch (e) {
    console.error("Error", e);
    return c.redirect(`${nubis.gateway.realm}?error=${ErrorCode.InternalError}`, 301);
  }
});

export default app;
