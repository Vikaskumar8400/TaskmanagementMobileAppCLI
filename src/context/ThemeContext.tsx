import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';
import { lightTheme, darkTheme, Theme } from '../constants/theme';

type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextType {
    theme: Theme;
    mode: ThemeMode;
    setMode: (mode: ThemeMode) => void;
    isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
    theme: lightTheme,
    mode: 'system',
    setMode: () => { },
    isDark: false,
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const systemScheme = useColorScheme();
    const [mode, setModeState] = useState<ThemeMode>('system');

    useEffect(() => {
        loadTheme();
    }, []);

    const loadTheme = async () => {
        try {
            const savedMode = await AsyncStorage.getItem('themeMode');
            if (savedMode) {
                setModeState(savedMode as ThemeMode);
            }
        } catch (e) {
            console.error('Failed to load theme', e);
        }
    };

    const setMode = async (newMode: ThemeMode) => {
        try {
            await AsyncStorage.setItem('themeMode', newMode);
            setModeState(newMode);
        } catch (e) {
            console.error('Failed to save theme', e);
        }
    };

    const isDark = mode === 'dark' || (mode === 'system' && systemScheme === 'dark');
    const activeTheme = isDark ? darkTheme : lightTheme;

    return (
        <ThemeContext.Provider value={{ theme: activeTheme, mode, setMode, isDark }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => useContext(ThemeContext);
