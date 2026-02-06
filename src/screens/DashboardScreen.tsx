import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, Dimensions, Animated, Easing, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { getAllTaskByFilter, calculateSmartPriority } from '../Service/service';
import Ionicons from 'react-native-vector-icons/Ionicons';

import { format } from 'date-fns';

const { width } = Dimensions.get('window');

const DashboardScreen = ({ navigation }: any) => {
    const { theme } = useTheme();
    const { user, spToken, smartMetadata, taskUsers } = useAuth();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [tasks, setTasks] = useState<any[]>([]);
    const [stats, setStats] = useState({
        total: 0,
        pending: 0,
        completed: 0,
        highPriority: 0,
        completionRate: 0
    });
    const [currentUserData, setCurrentUserData] = useState<any>(null);

    // Snackbar State
    const [snackbarVisible, setSnackbarVisible] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState("");
    const fadeAnimSnackbar = useRef(new Animated.Value(0)).current;

    const showSnackbar = (message: string) => {
        setSnackbarMessage(message);
        setSnackbarVisible(true);
        Animated.timing(fadeAnimSnackbar, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
        }).start(() => {
            setTimeout(() => {
                Animated.timing(fadeAnimSnackbar, {
                    toValue: 0,
                    duration: 300,
                    useNativeDriver: true,
                }).start(() => setSnackbarVisible(false));
            }, 2000);
        });
    };

    // Animations
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(30)).current;

    const runEntranceAnimation = () => {
        fadeAnim.setValue(0);
        slideAnim.setValue(30);
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 800,
                useNativeDriver: true,
                easing: Easing.out(Easing.cubic),
            }),
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 800,
                useNativeDriver: true,
                easing: Easing.out(Easing.cubic),
            })
        ]).start();
    };

    const fetchDashboardData = useCallback(async () => {
        if (!spToken || !smartMetadata || !user?.Email || !taskUsers) {
            setLoading(false);
            return;
        }

        try {
            const currentUser = taskUsers.find((u: any) => u?.Email?.toLowerCase() === user.Email?.toLowerCase());
            setCurrentUserData(currentUser);

            if (!currentUser) {
                setLoading(false);
                return;
            }

            const optimizedSites = smartMetadata?.filter((item: any) =>
                item.TaxType === 'Sites' && item.listId !== undefined && item.Title !== 'Master Tasks'
            ).sort((a: any, b: any) => (a.SortOrder ?? 0) - (b.SortOrder ?? 0));

            const allTasks = await getAllTaskByFilter(spToken, null, optimizedSites, [currentUser]);

            let total = 0;
            let pending = 0;
            let completed = 0;
            let highPriority = 0;

            const processedTasks = Array.isArray(allTasks) ? allTasks : [];

            processedTasks.forEach(task => {
                total++;
                const percent = parseFloat(task.PercentComplete);
                if (percent >= 100) {
                    completed++;
                } else {
                    pending++;
                }
                const sPrio = calculateSmartPriority(task);
                if (sPrio && parseFloat(sPrio) >= 8) {
                    highPriority++;
                }
            });

            const completionRate = total > 0 ? (completed / total) * 100 : 0;

            setStats({ total, pending, completed, highPriority, completionRate });
            setTasks(processedTasks);

            if (loading || refreshing) {
                runEntranceAnimation();
            }

        } catch (error) {
            console.error("Dashboard fetch error:", error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [spToken, smartMetadata, user, taskUsers]);

    useEffect(() => {
        fetchDashboardData();
    }, [fetchDashboardData]);

    const onRefresh = () => {
        setRefreshing(true);
        fetchDashboardData();
    };

    const handleQuickAction = (action: string) => {
        // console.log("Action Pressed:", action);
        switch (action) {
            case 'New Task':
                navigation.navigate('CreateTask');
                break;
            case 'Log Time':
                // Navigate to MainTabs > Tasks
                // Ensure 'Tasks' exists in the navigator. Based on AppNavigator provided:
                // MainTabParamList has 'Tasks'.
                // We are inside DashboardScreen, which is likely in MainTabNavigator.
                // So navigation.navigate('Tasks') should work to switch tab or stack.
                navigation.navigate('Tasks');
                break;
            case 'Calendar':
                navigation.navigate('LeaveCalendar');
                break;
            default:
                break;
        }
    };

    // Components
    const ProgressBar = ({ progress, color }: any) => (
        <View style={styles.progresBarContainer}>
            <View style={[styles.progressBar, { backgroundColor: theme.colors.border }]}>
                <Animated.View
                    style={[
                        styles.progressFill,
                        {
                            width: `${progress}%`,
                            backgroundColor: color || theme.colors.primary
                        }
                    ]}
                />
            </View>
        </View>
    );

    const StatBox = ({ label, value, color }: any) => (
        <View style={styles.statBox}>
            <Text style={[styles.statBoxValue, { color: color || theme.colors.text }]}>{value}</Text>
            <Text style={[styles.statBoxLabel, { color: theme.colors.textSecondary }]}>{label}</Text>
        </View>
    );

    const HeroCard = () => (
        <View style={[styles.heroCard, { backgroundColor: theme.colors.primary }]}>
            <View style={styles.heroHeader}>
                <View>
                    <Text style={styles.heroGreeting}>Hello, {currentUserData?.Title?.split(' ')[0] || 'User'}</Text>
                    <Text style={styles.heroDate}>{format(new Date(), 'EEEE, d MMMM')}</Text>
                </View>
                <View style={styles.heroIconCircle}>
                    <Ionicons name="trophy" size={24} color={theme.colors.primary} />
                </View>
            </View>

            <View style={styles.heroProgressSection}>
                <View style={styles.progressLabelRow}>
                    <Text style={styles.progressLabel}>Daily Progress</Text>
                    <Text style={styles.progressPercent}>{stats.completionRate.toFixed(0)}%</Text>
                </View>
                <ProgressBar progress={stats.completionRate} color="white" />
                <Text style={styles.heroSubtext}>{stats.completed} of {stats.total} tasks completed</Text>
            </View>
        </View>
    );

    const QuickAction = ({ icon, label, color, onPress }: any) => (
        <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: theme.colors.surface }]}
            onPress={onPress}
            activeOpacity={0.7}
        >
            <View style={[styles.actionIcon, { backgroundColor: color + '20' }]}>
                <Ionicons name={icon} size={22} color={color} />
            </View>
            <Text style={[styles.actionLabel, { color: theme.colors.text }]}>{label}</Text>
        </TouchableOpacity>
    );

    const TaskItem = ({ item }: { item: any }) => {
        const priority = calculateSmartPriority(item);
        const isHigh = priority && parseFloat(priority) >= 8;
        return (
            <View style={[styles.taskItem, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                <View style={[styles.priorityStrip, { backgroundColor: isHigh ? '#EA4335' : '#FBBC04' }]} />
                <View style={styles.taskContent}>
                    <View style={styles.taskHeaderRow}>
                        <Text style={[styles.taskTitle, { color: theme.colors.text }]} numberOfLines={1}>{item.Title}</Text>
                        <Text style={[styles.taskPercent, { color: theme.colors.primary }]}>{item.PercentComplete}%</Text>
                    </View>
                    <View style={styles.taskMetaRow}>
                        <Text style={[styles.taskMeta, { color: theme.colors.textSecondary }]}>{item.TaskID}</Text>
                        <View style={styles.dotSeparator} />
                        <Text style={[styles.taskMeta, { color: theme.colors.textSecondary }]}>Prio: {parseFloat(priority || '0').toFixed(1)}</Text>
                    </View>
                </View>
            </View>
        )
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
            >
                <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

                    {/* Hero Section */}
                    <HeroCard />

                    {/* Quick Stats Row */}
                    <View style={styles.statsRow}>
                        <View style={[styles.statPanel, { backgroundColor: theme.colors.surface }]}>
                            <StatBox label="Pending" value={stats.pending} color="#FBBC04" />
                            <View style={styles.verticalDivider} />
                            <StatBox label="Critical" value={stats.highPriority} color="#EA4335" />
                        </View>
                    </View>

                    {/* Quick Actions */}
                    <Text style={[styles.sectionTitle, { color: theme.colors.text, marginTop: 10 }]}>Quick Actions</Text>
                    <View style={styles.actionsRow}>
                        <QuickAction
                            icon="add-circle"
                            label="New Task"
                            color={theme.colors.primary}
                            onPress={() => handleQuickAction('New Task')}
                        />
                        <QuickAction
                            icon="time"
                            label="Log Time"
                            color="#34A853"
                            onPress={() => handleQuickAction('Log Time')}
                        />
                        <QuickAction
                            icon="calendar"
                            label="Calendar"
                            color="#EA4335"
                            onPress={() => handleQuickAction('Calendar')}
                        />
                    </View>

                    {/* Recent Tasks */}
                    <View style={styles.sectionHeader}>
                        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Recent Pending Tasks</Text>
                    </View>

                    {loading ? (
                        <ActivityIndicator style={{ marginTop: 20 }} color={theme.colors.primary} />
                    ) : (
                        <View>
                            {tasks.filter(t => parseFloat(t.PercentComplete) < 100).slice(0, 5).map((item, index) => (
                                <TaskItem key={index} item={item} />
                            ))}
                            {tasks.filter(t => parseFloat(t.PercentComplete) < 100).length === 0 && (
                                <View style={styles.emptyState}>
                                    <Ionicons name="checkmark-done-circle" size={48} color={theme.colors.textSecondary} />
                                    <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>All caught up!</Text>
                                </View>
                            )}
                        </View>
                    )}

                </Animated.View>
            </ScrollView>

            {/* Snackbar */}
            {snackbarVisible && (
                <Animated.View style={[
                    styles.snackbar,
                    {
                        opacity: fadeAnimSnackbar,
                        transform: [{
                            translateY: fadeAnimSnackbar.interpolate({
                                inputRange: [0, 1],
                                outputRange: [20, 0]
                            })
                        }]
                    }
                ]}>
                    <Text style={styles.snackbarText}>{snackbarMessage}</Text>
                </Animated.View>
            )}

        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollContent: {
        padding: 20,
    },
    // Hero Card
    heroCard: {
        borderRadius: 20,
        padding: 24,
        marginBottom: 24,
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
    },
    heroHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 20,
    },
    heroGreeting: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 4,
    },
    heroDate: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.8)',
        fontWeight: '500',
    },
    heroIconCircle: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#fff',
        justifyContent: 'center',
        alignItems: 'center',
    },
    heroProgressSection: {
        marginTop: 10,
    },
    progressLabelRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    progressLabel: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 14,
    },
    progressPercent: {
        color: '#fff',
        fontWeight: '700',
        fontSize: 14,
    },
    progresBarContainer: {
        height: 8,
        backgroundColor: 'rgba(255,255,255,0.3)',
        borderRadius: 4,
        overflow: 'hidden',
    },
    progressBar: {
        height: '100%',
        backgroundColor: 'transparent', // using container bg
    },
    progressFill: {
        height: '100%',
        borderRadius: 4,
    },
    heroSubtext: {
        marginTop: 8,
        color: 'rgba(255,255,255,0.8)',
        fontSize: 12,
    },
    // Stats Row
    statsRow: {
        marginBottom: 24,
    },
    statPanel: {
        flexDirection: 'row',
        padding: 16,
        borderRadius: 16,
        justifyContent: 'space-around',
        alignItems: 'center',
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
    },
    statBox: {
        alignItems: 'center',
    },
    statBoxValue: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    statBoxLabel: {
        fontSize: 12,
        fontWeight: '500',
    },
    verticalDivider: {
        width: 1,
        height: 30,
        backgroundColor: '#eee',
    },
    // Quick Actions
    actionsRow: {
        flexDirection: 'row',
        justifyContent: 'flex-start',
        gap: 12,
        marginBottom: 24,
        marginTop: 12,
    },
    actionBtn: {
        alignItems: 'center',
        width: (width - 40 - 24) / 3, // 3 items with gap
        paddingVertical: 12,
        borderRadius: 12,
        // Fallback for gap not supported in older RN
        marginRight: Platform.OS === 'android' ? 10 : 0,
    },
    actionIcon: {
        width: 44,
        height: 44,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
    },
    actionLabel: {
        fontSize: 11,
        fontWeight: '500',
    },
    // Section
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
    },
    seeAllText: {
        fontSize: 14,
        fontWeight: '600',
    },
    // Task Item
    taskItem: {
        flexDirection: 'row',
        borderRadius: 12,
        overflow: 'hidden',
        marginBottom: 12,
        borderWidth: 1,
        elevation: 1,
        backgroundColor: '#fff',
    },
    priorityStrip: {
        width: 5,
    },
    taskContent: {
        flex: 1,
        padding: 14,
    },
    taskHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    taskTitle: {
        fontSize: 15,
        fontWeight: '600',
        flex: 1,
        marginRight: 10,
    },
    taskPercent: {
        fontSize: 13,
        fontWeight: '700',
    },
    taskMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    taskMeta: {
        fontSize: 12,
    },
    dotSeparator: {
        width: 3,
        height: 3,
        borderRadius: 1.5,
        backgroundColor: '#ccc',
        marginHorizontal: 6,
    },
    emptyState: {
        alignItems: 'center',
        paddingVertical: 40,
    },
    emptyText: {
        marginTop: 12,
        fontSize: 14,
        fontWeight: '500',
    },
    // Snackbar
    snackbar: {
        position: 'absolute',
        bottom: 50,
        left: 20,
        right: 20,
        backgroundColor: '#333',
        padding: 16,
        borderRadius: 8,
        alignItems: 'center',
        elevation: 6,
        zIndex: 100,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
    },
    snackbarText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    }
});

export default DashboardScreen;
