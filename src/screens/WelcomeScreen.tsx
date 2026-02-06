import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { theme } from '../constants/theme';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';

type WelcomeScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Welcome'>;

interface Props {
    navigation: WelcomeScreenNavigationProp;
}

const WelcomeScreen: React.FC<Props> = ({ navigation }) => {
    return (
        <View style={styles.container}>
            {/* Top Section (Orange) */}
            <View style={styles.topSection}>
                <SafeAreaView style={styles.safeArea}>
                    <View style={styles.imagePlaceholder}>
                        <Ionicons name="walk" size={100} color="rgba(255,255,255,0.8)" />
                        <Ionicons name="paw" size={60} color="rgba(255,255,255,0.8)" />
                    </View>
                </SafeAreaView>
            </View>

            {/* Bottom Section (White Card) */}
            <View style={styles.bottomSection}>
                <View style={styles.textContainer}>
                    <Text style={styles.title}>Earn rewards for{'\n'}every step you take.</Text>
                    <Text style={styles.subtitle}>
                        More than tracking transform{'\n'}walking into winning.
                    </Text>
                </View>

                <TouchableOpacity
                    style={styles.button}
                    onPress={() => navigation.navigate('Login')}
                >
                    <Text style={styles.buttonText}>Log in</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#2e5596",
    },
    safeArea: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    topSection: {
        flex: 0.55,
        backgroundColor: "#2e5596",
        alignItems: 'center',
        justifyContent: 'center',
    },
    bottomSection: {
        flex: 0.45,
        backgroundColor: "#fff", // White
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        padding: theme.spacing.l,
        justifyContent: 'space-between',
        paddingBottom: theme.spacing.xl,
        paddingTop: theme.spacing.xl,
    },
    imagePlaceholder: {
        flexDirection: 'row',
        alignItems: 'flex-end',
    },
    textContainer: {
        marginTop: theme.spacing.s,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: theme.colors.text,
        marginBottom: theme.spacing.m,
        lineHeight: 34,
    },
    subtitle: {
        fontSize: 16,
        color: theme.colors.textSecondary,
        lineHeight: 24,
    },
    button: {
        backgroundColor: "#2e5596",
        paddingVertical: 18,
        borderRadius: 50,
        alignItems: 'center',
        width: '100%',
        shadowColor: theme.colors.secondary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    buttonText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#FFF',
    },
});

export default WelcomeScreen;