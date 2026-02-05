import React from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    TouchableWithoutFeedback,
    Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { theme } from '../constants/theme';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';

type LoginScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Login'>;

interface Props {
    navigation: LoginScreenNavigationProp;
}

const LoginScreen: React.FC<Props> = ({ navigation }) => {
    const { login, isLoading, error } = useAuth();

    const handleLogin = async () => {
        try {
            await login();
        } catch (e) {
            // Error managed by context
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.keyboardView}
            >
                <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                    <View style={styles.content}>

                        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
                            <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
                        </TouchableOpacity>

                        <View style={styles.headerContainer}>
                            <Text style={styles.header}>Log in</Text>
                            <Text style={styles.subHeader}>
                                By logging in, you agree to our <Text style={styles.linkText}>Terms of Use</Text>.
                            </Text>
                        </View>

                        {error && (
                            <View style={styles.errorContainer}>
                                <Text style={styles.errorText}>{error}</Text>
                            </View>
                        )}

                        <View style={styles.form}>
                            <Text style={styles.infoText}>
                                Sign in with your Microsoft account to access your tasks and calendar.
                            </Text>

                            <TouchableOpacity
                                style={styles.microsoftButton}
                                onPress={handleLogin}
                                disabled={isLoading}
                            >
                                {isLoading ? (
                                    <ActivityIndicator color="#FFF" />
                                ) : (
                                    <>
                                        <Ionicons name="logo-microsoft" size={20} color="#FFF" style={styles.socialIcon} />
                                        <Text style={styles.microsoftButtonText}>Sign in with Microsoft</Text>
                                    </>
                                )}
                            </TouchableOpacity>

                            <Text style={styles.footerText}>
                                For more information, please see our <Text style={styles.footerLink}>Privacy policy</Text>.
                            </Text>

                        </View>
                    </View>
                </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    keyboardView: {
        flex: 1,
    },
    content: {
        flex: 1,
        paddingHorizontal: theme.spacing.l,
        paddingTop: theme.spacing.m,
    },
    backButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        marginBottom: theme.spacing.m,
    },
    headerContainer: {
        marginBottom: theme.spacing.l,
    },
    header: {
        fontSize: 32,
        fontWeight: 'bold',
        color: theme.colors.text,
        marginBottom: theme.spacing.s,
    },
    subHeader: {
        fontSize: 14,
        color: theme.colors.textSecondary,
        lineHeight: 20,
    },
    linkText: {
        fontWeight: 'bold',
        color: theme.colors.text,
    },
    form: {
        width: '100%',
    },
    inputGroup: {
        marginBottom: theme.spacing.m,
    },
    label: {
        fontSize: 14,
        color: theme.colors.textSecondary,
        marginBottom: theme.spacing.xs,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.surface,
        borderRadius: 12, // More rounded as per design
        borderWidth: 0, // Removed border for cleaner look
    },
    input: {
        flex: 1,
        padding: 16,
        fontSize: 16,
        color: theme.colors.text,
    },
    eyeIcon: {
        padding: 16,
    },
    infoText: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        marginBottom: theme.spacing.l,
    },
    microsoftButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0078D4', // Microsoft brand color
        paddingVertical: 16,
        borderRadius: 50, // Fully rounded button
        marginBottom: theme.spacing.l,
    },
    microsoftButtonText: {
        fontSize: 18,
        fontWeight: '600',
        color: '#FFFFFF',
    },
    dividerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: theme.spacing.l,
    },
    dividerLine: {
        flex: 1,
        height: 1,
        backgroundColor: theme.colors.border,
    },
    dividerText: {
        marginHorizontal: theme.spacing.m,
        color: theme.colors.textSecondary,
        fontSize: 14,
    },
    socialButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: theme.colors.border,
        paddingVertical: 14,
        borderRadius: 50,
        marginBottom: theme.spacing.m,
    },
    socialIcon: {
        marginRight: theme.spacing.s,
    },
    socialButtonText: {
        fontSize: 16,
        color: theme.colors.text,
        fontWeight: '500',
    },
    footerText: {
        textAlign: 'center',
        fontSize: 12,
        color: theme.colors.textSecondary,
        marginTop: theme.spacing.s,
    },
    footerLink: {
        fontWeight: 'bold',
        color: theme.colors.text,
    },
    errorContainer: {
        backgroundColor: '#FFEBE6',
        padding: theme.spacing.m,
        borderRadius: theme.borderRadius.m,
        marginBottom: theme.spacing.m,
    },
    errorText: {
        color: theme.colors.error,
        fontSize: 14,
    },
});

export default LoginScreen;
