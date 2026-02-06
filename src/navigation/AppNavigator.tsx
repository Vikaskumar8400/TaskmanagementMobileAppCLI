import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../context/AuthContext';
import { theme } from '../constants/theme';
import Ionicons from 'react-native-vector-icons/Ionicons';

// Screens
import LoginScreen from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import SplashScreen from '../screens/SplashScreen';
import WelcomeScreen from '../screens/WelcomeScreen';
import ProfileScreen from '../screens/ProfileScreen';
import TaskDetailsScreen from '../screens/TaskDetailsScreen';
import TimeEntryScreen from '../screens/TimeEntryScreen';
import LeaveCalendarScreen from '../screens/LeaveCalendarScreen';
import CreateTaskScreen from '../screens/CreateTaskScreen';

export type RootStackParamList = {
    Splash: undefined;
    Welcome: undefined;
    Login: undefined;
    MainTabs: undefined;
    Tasks: undefined; // Added Tasks
    TimeEntry: undefined;
    LeaveCalendar: undefined;
    CreateTask: undefined;
};

export type MainTabParamList = {
    Dashboard: undefined;
    TimeEntry: undefined; // Added TimeEntry
    Profile: undefined;
    Tasks: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

const MainTabNavigator = () => {
    return (
        <Tab.Navigator
            screenOptions={({ route }) => ({
                headerShown: false,
                tabBarActiveTintColor: theme.colors.primary,
                tabBarInactiveTintColor: theme.colors.textSecondary,
                tabBarIcon: ({ focused, color, size }) => {
                    let iconName: string = 'list';

                    if (route.name === 'Dashboard') {
                        iconName = focused ? 'list' : 'list-outline';
                    } else if (route.name === 'Tasks') {
                        iconName = focused ? 'document-text' : 'document-text-outline';
                    } else if (route.name === 'Profile') {
                        iconName = focused ? 'person' : 'person-outline';
                    } else if (route.name === 'TimeEntry') {
                        iconName = focused ? 'time' : 'time-outline';
                    }

                    return <Ionicons name={iconName} size={size} color={color} />;
                },
            })}
        >
            <Tab.Screen name="Dashboard" component={DashboardScreen} />
            <Tab.Screen name="Tasks" component={TaskDetailsScreen} options={{ tabBarLabel: 'Tasks' }} />
            <Tab.Screen name="TimeEntry" component={TimeEntryScreen} options={{ tabBarLabel: 'Time Entry' }} />
            <Tab.Screen name="Profile" component={ProfileScreen} />
        </Tab.Navigator>
    );
};

const AppNavigator = () => {
    const { user, isLoading } = useAuth();

    // Show splash screen while checking auth status
    if (isLoading) {
        return (
            <NavigationContainer>
                <Stack.Navigator screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="Splash" component={SplashScreen} />
                </Stack.Navigator>
            </NavigationContainer>
        );
    }

    return (
        <NavigationContainer>
            <Stack.Navigator
                screenOptions={{
                    headerShown: false,
                }}
            >
                {user ? (
                    <>
                        <Stack.Screen name="MainTabs" component={MainTabNavigator} />
                        <Stack.Screen name="Tasks" component={TaskDetailsScreen} />
                        <Stack.Screen name="TimeEntry" component={TimeEntryScreen} />
                        <Stack.Screen name="LeaveCalendar" component={LeaveCalendarScreen} />
                        <Stack.Screen name="CreateTask" component={CreateTaskScreen} />
                    </>
                ) : (
                    <>
                        <Stack.Screen name="Splash" component={SplashScreen} />
                        <Stack.Screen name="Welcome" component={WelcomeScreen} />
                        <Stack.Screen name="Login" component={LoginScreen} />
                    </>
                )}
            </Stack.Navigator>
        </NavigationContainer>
    );
};

export default AppNavigator;