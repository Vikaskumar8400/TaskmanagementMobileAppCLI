export const palette = {
    primary: '#2e5596',
    primaryLight: '#4a7ecf',
    secondary: '#FF6D00',
    secondaryLight: '#FF8A33',
    white: '#FFFFFF',
    black: '#121212',
    gray100: '#F4F6F8',
    gray800: '#1E1E1E',
    gray900: '#172B4D',
    gray200: '#DFE1E6',
    gray700: '#2C2C2C',
    gray500: '#6B778C',
    gray400: '#A0A0A0',
    red: '#DE350B',
    redLight: '#EF5350',
    green: '#00875A',
    greenLight: '#66BB6A',
};

const spacing = {
    xs: 4,
    s: 8,
    m: 16,
    l: 24,
    xl: 32,
};

const borderRadius = {
    s: 8,
    m: 12,
    l: 16,
    round: 50,
};

const typography = {
    header: {
        fontSize: 24,
        fontWeight: 'bold' as const,
        lineHeight: 32,
    },
    subHeader: {
        fontSize: 18,
        fontWeight: '600' as const,
        lineHeight: 24,
    },
    body: {
        fontSize: 16,
        lineHeight: 24,
    },
    caption: {
        fontSize: 14,
        lineHeight: 20,
    },
    button: {
        fontSize: 16,
        fontWeight: '600' as const,
    },
};

export const lightTheme = {
    dark: false,
    colors: {
        primary: palette.primary,
        secondary: palette.secondary,
        background: palette.white,
        surface: palette.gray100,
        text: palette.gray900,
        textSecondary: palette.gray500,
        error: palette.red,
        border: palette.gray200,
        placeholder: '#A1A1A1',
        success: palette.green,
    },
    spacing,
    borderRadius,
    typography,
};

export const darkTheme = {
    dark: true,
    colors: {
        primary: palette.primaryLight,
        secondary: palette.secondaryLight,
        background: palette.black,
        surface: palette.gray800,
        text: '#E1E1E1',
        textSecondary: palette.gray400,
        error: palette.redLight,
        border: palette.gray700,
        placeholder: '#666666',
        success: palette.greenLight,
    },
    spacing,
    borderRadius,
    typography,
};

export type Theme = typeof lightTheme;
export const theme = lightTheme; // Backward compatibility
