import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';
import { authorize } from 'react-native-app-auth';
import { AuthManager } from '../auth/AuthManager';
import { GraphManager } from '../graph/GraphManager';
import { getSharePointAccessToken } from '../auth/SharePointRestAPIToken';
import { AuthConfig } from '../auth/AuthConfig';
import { fetchTaskUserByEmail, getSmartMetaREST, getTaskAllTaskUser } from '../Service/service';

const config = {
    issuer: `https://login.microsoftonline.com/${AuthConfig.tenantId}/v2.0`,
    clientId: AuthConfig.appId,
    redirectUrl: 'graph-sample://react-native-auth',
    scopes: AuthConfig.appScopes,
    additionalParameters: {
        prompt: 'select_account' as const,
    },
    serviceConfiguration: {
        authorizationEndpoint: `https://login.microsoftonline.com/${AuthConfig.tenantId}/oauth2/v2.0/authorize`,
        tokenEndpoint: `https://login.microsoftonline.com/${AuthConfig.tenantId}/oauth2/v2.0/token`,
    }
};

interface AuthContextType {
    user: any | null;
    spToken: string | null;
    isLoading: boolean;
    error: string | null;
    login: () => Promise<void>;
    logout: () => Promise<void>;
    checkAuthStatus: () => Promise<void>;
    smartMetadata: any | null;
    taskUsers: any | null;
    refreshTaskUsers: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Helper function to map Graph API user to our User type
const mapGraphUserToUser = async (graphUser: any, accessToken: string): Promise<any> => {
    try {
        const CurrentUserDetails = await fetchTaskUserByEmail({ token: accessToken, userEmail: graphUser.userPrincipalName || graphUser.email || graphUser.mail });
        const userDetails = CurrentUserDetails?.[0] || {};

        return {
            CurrentUserId: graphUser.id || graphUser.userId || '',
            Title: graphUser.displayName || graphUser.givenName,
            Email: graphUser.userPrincipalName || graphUser.email || graphUser.mail,
            UserImage: userDetails.UserImage,
            UserToken: accessToken,
            Suffix: userDetails.Suffix,
            Approver: userDetails.Approver,
            AssignedTo: userDetails.AssignedTo,
            Role: userDetails.Role,
            Team: userDetails.Team,
            IsActive: userDetails.IsActive,
            IsShowTeamLeader: userDetails.IsShowTeamLeader
        };
    } catch (e) {
        console.error("Failed to map user details", e);
        return {
            CurrentUserId: graphUser.id || '',
            Title: graphUser.displayName,
            Email: graphUser.userPrincipalName || graphUser.mail
        };
    }
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<any | null>(null);
    const [spToken, setSpToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [smartMetadata, setSmartMetadata] = useState<any | null>(null);
    const [taskUsers, setTaskUsers] = useState<any | null>(null);

    const setupSession = async (accessToken: string, refreshToken: string | null, expirationDate: string) => {
        try {
            await AuthManager.saveTokenAsync(accessToken, refreshToken || '', expirationDate);

            let spAccessToken = "";
            if (refreshToken) {
                spAccessToken = await getSharePointAccessToken(refreshToken);
                setSpToken(spAccessToken);
            }

            const graphUser = await GraphManager.getUserAsync();
            const mappedUser = await mapGraphUserToUser(graphUser, accessToken);

            if (spAccessToken) {
                const smartMeta = await getSmartMetaREST(spAccessToken);
                const tUsers = await getTaskAllTaskUser(spAccessToken);
                setSmartMetadata(smartMeta);
                setTaskUsers(tUsers);
            }

            setUser(mappedUser);
            setError(null);
        } catch (e: any) {
            console.error('Session setup failed', e);
            throw e;
        }
    };

    const login = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const result = await authorize(config);
            await setupSession(result.accessToken, result.refreshToken, result.accessTokenExpirationDate);
        } catch (e: any) {
            console.error('Login error:', e);
            setError(e.message || 'Failed to sign in');
        } finally {
            setIsLoading(false);
        }
    };

    const logout = async () => {
        setIsLoading(true);
        try {
            await AuthManager.signOutAsync();
            setUser(null);
            setSpToken(null);
            setSmartMetadata(null);
            setTaskUsers(null);
            setError(null);
        } catch (e: any) {
            console.error('Logout error:', e);
            setError(e.message || 'Failed to sign out');
        } finally {
            setIsLoading(false);
        }
    };

    const checkAuthStatus = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const token = await AuthManager.getAccessTokenAsync();
            if (token) {
                const refreshToken = await AuthManager.getRefreshTokenAsync();
                let spAccessToken = spToken;

                if (!spAccessToken && refreshToken) {
                    try {
                        spAccessToken = await getSharePointAccessToken(refreshToken);
                        setSpToken(spAccessToken);
                    } catch (spError) {
                        console.warn("Failed to refresh SP token on startup", spError);
                    }
                }

                const [graphUser, smartMeta, tUsers] = await Promise.all([
                    GraphManager.getUserAsync().catch(e => null),
                    spAccessToken && !smartMetadata ? getSmartMetaREST(spAccessToken).catch((e: any) => null) : Promise.resolve(smartMetadata),
                    spAccessToken && !taskUsers ? getTaskAllTaskUser(spAccessToken).catch((e: any) => null) : Promise.resolve(taskUsers),
                ]);

                if (graphUser) {
                    const mappedUser = await mapGraphUserToUser(graphUser, token);
                    setUser(mappedUser);
                    if (smartMeta) setSmartMetadata(smartMeta);
                    if (tUsers) setTaskUsers(tUsers);
                }
            } else {
                setUser(null);
            }
        } catch (e: any) {
            console.error('Auth check status failed', e);
            await logout();
        } finally {
            setIsLoading(false);
        }
    };

    const refreshTaskUsers = async () => {
        try {
            const token = await AuthManager.getAccessTokenAsync();
            if (!token) return;
            const refreshToken = await AuthManager.getRefreshTokenAsync();
            if (!refreshToken) return;
            const spAccessToken = await getSharePointAccessToken(refreshToken);
            if (!spAccessToken) return;
            const users = await getTaskAllTaskUser(spAccessToken);
            setTaskUsers(users);
        } catch (e) {
            console.error('refreshTaskUsers error', e);
        }
    };

    useEffect(() => {
        checkAuthStatus();
    }, []);

    return (
        <AuthContext.Provider value={{
            user,
            spToken,
            smartMetadata,
            taskUsers,
            isLoading,
            error,
            login,
            logout,
            checkAuthStatus,
            refreshTaskUsers
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
