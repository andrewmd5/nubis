import { AuthContext, AuthInterceptor, ServerContext, } from '@tempojs/server';
import { TempoLogger, Credential, TempoUtil, Base64 } from '@tempojs/common';
import nubis from '../../nubis.json';
import { ITokenPayload, TokenPayload, IUser } from './services/services.gen';

type OwnedApp = {
    appid: number;
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


/**
 * TokenInterceptor is an extension of the AuthInterceptor class, which checks
 * the validity of the session token in the authorization header and sets
 * authentication context properties based on the decoded session token.
 */
export class TokenInterceptor extends AuthInterceptor {

    /**
     * Constructs a new TokenInterceptor instance.
     * @param logger - The logger to use for debug logging.
     */
    constructor(private logger: TempoLogger) {
        super();
    }

    /**
     * The intercept method takes a server context and an authorization value as input,
     * and returns an authentication context.
     *
     * @param context - The server context.
     * @param authorizationValue - The authorization value.
     * @returns - A promise that resolves to an authentication context.
     */
    async intercept(context: ServerContext, authorizationValue: string): Promise<AuthContext | undefined> {
        let authContext = new AuthContext();
        const bearerScheme = 'Bearer';
        const headerParts = authorizationValue.trim().split(' ');

        // Check if the authorization header format is invalid
        if (headerParts.length !== 2 || headerParts[0] !== bearerScheme) {
            this.logger.debug('Invalid authorization header format', { headerParts });
            // Invalid authorization header format
            return Promise.resolve(authContext);
        }
        const token = headerParts[1];
        if (nubis.auth.secret === undefined) {
            this.logger.debug('Secret is not defined');
            return Promise.resolve(authContext);
        }

        const parts = token.split('.');
        if (parts.length !== 3) return Promise.resolve(authContext);
        const header = parts[0];
        const payload = parts[1];
        const signature = parts[2];

        const expectedSignature = await this.signToken(`${header}.${payload}`);
        if (signature !== expectedSignature) return Promise.resolve(authContext);

        const payloadDecoded: ITokenPayload = TokenPayload.fromJSON(TempoUtil.utf8GetString(Base64.decode(payload)));

        if (this.hasTimestampExpired(payloadDecoded.exp)) {
            this.logger.debug('Token has expired');
            return Promise.resolve(authContext);
        }

        authContext = new AuthContext("user");
        authContext.addProperty('user', "data", payloadDecoded.data);
        return authContext;
    }
    private async signToken(input: string): Promise<string> {
        const keyData = TempoUtil.utf8GetBytes(nubis.auth.secret);
        const key = await crypto.subtle.importKey(
            "raw",
            keyData,
            { name: "HMAC", hash: "SHA-256" },
            true,
            ["sign"]
        );
        const signature = await crypto.subtle.sign("HMAC", key, TempoUtil.utf8GetBytes(input));
        return Base64.encode(new Uint8Array(signature));
    }

    private hasTimestampExpired(input: Date) {
        // Get the current date and time
        const currentDate = new Date();
        // Convert both the current date and the input date to Unix timestamps in seconds
        const currentTimestampInSeconds = Math.floor(currentDate.getTime() / 1000);
        const inputTimestampInSeconds = Math.floor(input.getTime() / 1000);
        // Check if the input date's timestamp is less than the current timestamp
        return inputTimestampInSeconds < currentTimestampInSeconds;
    }
}