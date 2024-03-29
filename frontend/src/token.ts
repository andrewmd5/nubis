import { BearerCredential, CallCredential, LocalStorageStrategy } from "@tempojs/client";
import { TempoUtil, Base64 } from "@tempojs/common";
import { ITokenPayload, TokenPayload } from "./client.gen";

// Utility function to check if the token is valid (assuming isTokenExpired exists)
export async function checkAuthToken(credentials: CallCredential): Promise<{ hasAuth: boolean, message: string; }> {
    // Attempt to retrieve an existing credential
    const existingCredential = await credentials.getCredential();
    if (existingCredential && existingCredential.token) {
        const isExpired = isTokenExpired(existingCredential.token as string);
        if (isExpired) {
            await credentials.removeCredential();
        }
        return { hasAuth: !isExpired, message: 'User has a valid session.' };
    }

    // No valid existing token, check URL for new token
    const url = new URL(window.location.href);
    const searchParams = url.searchParams;
    if (searchParams.has('token')) {
        const tokenValue = searchParams.get('token');
        searchParams.delete('token'); // Remove the token from the URL search parameters

        // Update the URL in the address bar without reloading the page
        window.history.pushState({}, '', url.toString());
        if (!tokenValue) {
            return { hasAuth: false, message: 'The "token" query parameter exists but has no value.' };
        }
        const isExpired = isTokenExpired(tokenValue);
        if (isExpired) {
            return { hasAuth: false, message: 'The provided token is expired.' };
        }
        await credentials.storeCredential({ token: tokenValue });
        // Verify newly stored token
        return { hasAuth: !isExpired, message: 'New token processed.' };
    }
    // No token in URL or existing token is invalid
    return { hasAuth: false, message: 'No valid token found.' };
}

export const getUserFromToken = async (callCred: CallCredential) => {
    const credential = await callCred.getCredential();
    if (!credential?.token) {
        throw new Error('No credential found.');
    }
    const token = credential.token as string;
    const parts = token.split('.');
    const payload = parts[1];
    const payloadDecoded: ITokenPayload = TokenPayload.fromJSON(TempoUtil.utf8GetString(Base64.decode(payload)));
    return payloadDecoded.data;
};

const isTokenExpired = (token: string): boolean => {
    const parts = token.split('.');
    if (parts.length !== 3) {
        return true;
    }
    const payload = parts[1];
    const payloadDecoded: ITokenPayload = TokenPayload.fromJSON(TempoUtil.utf8GetString(Base64.decode(payload)));
    // Get the current date and time
    const currentDate = new Date();
    // Convert both the current date and the input date to Unix timestamps in seconds
    const currentTimestampInSeconds = Math.floor(currentDate.getTime() / 1000);
    const inputTimestampInSeconds = Math.floor(payloadDecoded.exp.getTime() / 1000);
    // Check if the input date's timestamp is less than the current timestamp
    return inputTimestampInSeconds < currentTimestampInSeconds;
};
