import { AuthConfig } from './AuthConfig';
import qs from 'qs';
export async function getSharePointAccessToken(refreshToken: string) {
    try {
        const tenant = AuthConfig.tenantId;
        const clientId = AuthConfig.appId;
        const sharepointScope = `https://hhhhteams.sharepoint.com/.default`;
        const tokenUrl = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;

        const body = qs.stringify({
            client_id: clientId,
            refresh_token: refreshToken,
            grant_type: "refresh_token",
            scope: sharepointScope,
            redirect_uri: 'graph-sample://react-native-auth'
        });

        const response = await fetch(tokenUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            credentials: "include",
            body
        });

        const result = await response.json();
        if (!response.ok) {
            console.error("SharePoint Token Response Error:", result);
            throw new Error(result.error_description || "Failed to get SP token");
        }

        return result.access_token; // ye SharePoint token
    } catch (err) {
        console.error("SharePoint Token Catch Error:", err);
        throw err;
    }
}
