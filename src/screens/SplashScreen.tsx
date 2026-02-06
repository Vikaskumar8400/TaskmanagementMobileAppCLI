import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../constants/theme';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';

import { RootStackParamList } from '../navigation/AppNavigator';

type SplashScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Splash'>;
type SplashScreenRouteProp = RouteProp<RootStackParamList, 'Splash'>;

interface Props {
    navigation: SplashScreenNavigationProp;
    route: SplashScreenRouteProp;
}

const SplashScreen: React.FC<Props> = ({ navigation, route }) => {
    // Ensure route.params is not undefined before destructuring
    const { autoNavigate = true } = route.params || {};

    useEffect(() => {
        if (!autoNavigate) return;

        const timer = setTimeout(() => {
            navigation.replace('Welcome');
        }, 3000); // 3 seconds delay

        return () => clearTimeout(timer);
    }, [navigation, autoNavigate]);

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.imagePlaceholder}>
                <Ionicons name="paw" size={80} color="#FFF" />
            </View>
            <Text style={styles.title}>HHHH</Text>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#2e5596", // Orange background
        alignItems: 'center',
        justifyContent: 'center',
    },
    imagePlaceholder: {
        width: 200,
        height: 200,
        borderRadius: 100,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: theme.spacing.l,
    },
    title: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#FFF',
    },
});

export default SplashScreen;
