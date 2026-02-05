import React, { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    TextInput,
    FlatList,
    RefreshControl,
    ActivityIndicator,
    Platform,
    Image
} from 'react-native';
// import { Image } from "expo-image";
import { format } from "date-fns";
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { statusFilters } from '../Service/MockData';
import { useAuth } from '../context/AuthContext';
import { calculateSmartPriority, fetchImageAsBase64, getAllTaskByFilter } from '../Service/service';
import UserAvatar from '../components/UserAvatar';
import TimeEntryModal from '../components/TimeEntryModal';

const getBorderColor = (priority: any, percentComplete: any) => {
    if (priority === 'Critical') return '#D93025';
    if (priority === 'High') return '#FBBC04';
    if (percentComplete === 100 || percentComplete == '100') return '#1E8E3E';
    return '#4285F4';
};

const TaskCard = React.memo(({ item, index, spToken, onWTClick }: any) => {
    const [imageSource, setImageSource] = useState<any>(null);

    useEffect(() => {
        let isMounted = true;
        const fetchIcon = async () => {
            if (item.SiteIcon) {
                try {
                    const base64 = await fetchImageAsBase64(item.SiteIcon, spToken);
                    if (isMounted && base64) {
                        setImageSource({ uri: base64 });
                    }
                } catch (e) {
                    console.error("Failed to fetch icon", e);
                }
            }
        };
        fetchIcon();
        return () => { isMounted = false; };
    }, [item.SiteIcon, spToken]);

    return (
        <View style={[styles.taskCard, { borderLeftColor: getBorderColor(item.Priority, item.PercentComplete) }]}>
            {/* Top Row */}
            <View style={styles.taskHeaderRow}>
                <View style={styles.taskTypeIcon}>
                    {item.SiteIcon ? (
                        imageSource ? (
                            <Image
                                source={imageSource}
                                style={{ width: 30, height: 30 }}
                            />
                        ) : (
                            <ActivityIndicator size="small" color="#4285F4" />
                        )
                    ) : (
                        <MaterialCommunityIcons name="checkbox-blank-circle" size={16} color="#4285F4" />
                    )}

                </View>
                <View style={styles.taskTitleContainer}>
                    <Text style={styles.taskTitle} numberOfLines={1}>
                        <Text style={styles.taskId}>{item.TaskID || 'N/A'}</Text> - {item.Title || 'No Title'}
                    </Text>
                </View>
                <View style={styles.taskActions}>
                    <TouchableOpacity
                        onPress={() => { console.log('Info:', item.Id); /* Navigate to details */ }}
                        activeOpacity={0.7}
                        style={{ marginRight: 8 }}
                    >
                        <Ionicons name="information-circle-outline" size={20} color="#5F6368" />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.wtBadge}
                        onPress={() => onWTClick(item, imageSource)}
                        activeOpacity={0.7}
                    >
                        <Text style={styles.wtText}>WT</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => { console.log('Dock:', item.Id); /* Handle dock */ }}
                        activeOpacity={0.7}
                        style={{ marginLeft: 8 }}
                    >
                        <MaterialCommunityIcons name="dock-window" size={20} color="#5F6368" />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Details Row */}
            <View style={styles.taskDetailsRow}>
                <Text style={styles.detailText} numberOfLines={1}>
                    <Text style={styles.detailLabel}>PXC: </Text>
                    {item.Project?.PortfolioStructureID || 'N/A'} - {item.Project?.Title || 'No Project'}
                </Text>
            </View>

            {/* Stats Row */}
            <View style={styles.taskStatsRow}>
                <View style={styles.statItem}>
                    <Text style={styles.detailLabel}>Status: </Text>
                    <Text style={styles.detailValue} numberOfLines={1}>{item.PercentComplete || 'N/A'}</Text>
                </View>
                <View style={styles.statItem}>
                    <Text style={styles.detailLabel}>S-Prio: </Text>
                    <MaterialCommunityIcons name="arrow-up" size={14} color="#F9AB00" />
                    <Text style={styles.detailValue}>{calculateSmartPriority(item)}</Text>
                </View>
                <View style={styles.statItem}>
                    <MaterialCommunityIcons name="clock-outline" size={14} color="#5F6368" style={{ marginRight: 2 }} />
                    <Text style={styles.detailValue} numberOfLines={1}>{item.EstimatedTimeDescription || 'N/A'}</Text>
                </View>
                <View style={styles.statItem}>
                    <Text style={styles.detailLabel}>DueDate: </Text>
                    <Text style={styles.detailValue}>{format(new Date(item.DueDate != "" && item.DueDate != null && item.DueDate != undefined ? item.DueDate : new Date()), 'dd-MM-yyyy') || ''}</Text>
                </View>
            </View>
        </View>
    );
});





const TaskDetailsScreen = () => {
    const { smartMetadata, user, spToken, taskUsers } = useAuth();
    const [activeTab, setActiveTab] = useState('STATUS');
    const [selectedFilter, setSelectedFilter] = useState({ label: "5%", value: 0.05 });
    const [currentUserData, setcurrentUserData] = useState<any>({});
    const [TeamMemberForFilter, setTeamMemberForFilter] = useState<any>([]);
    const [selectedUsers, setSelectedUsers] = useState<any>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [refreshing, setRefreshing] = useState(false);
    const [tasks, setTasks] = useState<any>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<any>(null);
    const [isTimeEntryVisible, setIsTimeEntryVisible] = useState(false);
    const [timeEntryTask, setTimeEntryTask] = useState<any>(null);
    const [timeEntryImage, setTimeEntryImage] = useState<any>(null);
    const flatListRef = useRef(null);

    const fetchTasks = useCallback(async (filter: any, selectedUsersList: any[] | null) => {
        if (!spToken || !smartMetadata?.length || selectedUsersList === null) {
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            setError(null);
            const optimizedSites = smartMetadata?.filter((item: any) => item.TaxType === 'Sites' && item.listId !== undefined && item.Title !== 'Master Tasks' && item.Title !== 'SDC Sites' && item.Title !== 'Shareweb Old').sort((a: any, b: any) => (a.SortOrder ?? 0) - (b.SortOrder ?? 0));
            const taskData = await getAllTaskByFilter(spToken, filter, optimizedSites, selectedUsersList);
            setTasks(Array.isArray(taskData) ? taskData : []);
        } catch (err) {
            setError('Failed to load tasks. Please try again.');
            setTasks([]);
        } finally {
            setLoading(false);
        }
    }, [spToken, smartMetadata]);

    useEffect(() => {
        fetchTasks(selectedFilter, selectedUsers);
    }, [fetchTasks, selectedFilter, selectedUsers]);

    useEffect(() => {
        if (!taskUsers?.length || !user?.Email) return;
        try {
            const currentUser = taskUsers.find((u: any) => u?.Email == user.Email);
            if (!currentUser) return;
            const teamMembers = taskUsers.filter((u: any) => Array.isArray(u?.Approver?.results) && u.Approver?.results?.some((ap: any) => ap?.Id === currentUser.AssingedToUserId));
            const visibleUsers = [currentUser, ...teamMembers];
            setcurrentUserData(currentUser);
            setTeamMemberForFilter(visibleUsers);
            setSelectedUsers([currentUser]);
        } catch (err) {
            console.error("Error filtering task users:", err);
        }
    }, [taskUsers, user]);

    const toggleUserSelection = useCallback((user: any) => {
        setSelectedUsers((prev: any[] | null) => {
            const currentSelected = prev || [];
            const isSelected = currentSelected.some((u) => u.Email === user.Email);
            if (isSelected) {
                return currentSelected.filter((u) => u.Email !== user.Email);
            } else {
                return [...currentSelected, user];
            }
        });
    }, []);

    const onWTClick = useCallback((item: any, imgSource: any) => {
        setTimeEntryTask(item);
        setTimeEntryImage(imgSource);
        setIsTimeEntryVisible(true);
    }, []);

    const onTimeEntryClose = useCallback(() => {
        setIsTimeEntryVisible(false);
        setTimeEntryTask(null);
        setTimeEntryImage(null);
    }, []);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        setError(null);
        fetchTasks(selectedFilter, selectedUsers).finally(() => setRefreshing(false));
    }, [fetchTasks, selectedFilter, selectedUsers]);

    const filteredTasks = useMemo(() => {
        if (!searchQuery) return tasks;
        const queryLower = searchQuery.toLowerCase();
        return tasks.filter((task: any) =>
            (task.Title?.toLowerCase().includes(queryLower)) ||
            (task.TaskID?.toString().toLowerCase().includes(queryLower)) ||
            (task.Project?.Title?.toLowerCase().includes(queryLower))
        );
    }, [tasks, searchQuery]);

    const renderHeaderTabs = useCallback(() => (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.headerTabsContainer}
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10 }}
        >
            {['HHHH OOTB', 'STATUS'].map((tab) => (
                <TouchableOpacity
                    key={tab}
                    style={[styles.headerTab, activeTab === tab && styles.activeHeaderTab]}
                    onPress={() => setActiveTab(tab)}
                    activeOpacity={0.7}
                >
                    <Text style={[styles.headerTabText, activeTab === tab && styles.activeHeaderTabText]}>
                        {tab}
                    </Text>
                </TouchableOpacity>
            ))}
        </ScrollView>
    ), [activeTab]);
    const renderFilters = useCallback(() => (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filtersContainer}
            contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}
        >
            {statusFilters?.map((filter: any, index) => {
                const isSelected = selectedFilter.label == filter.label;
                return (
                    <TouchableOpacity
                        key={`${filter.label}-${index}`}
                        style={[
                            styles.filterBadge,
                            isSelected && styles.activeFilterBadge
                        ]}
                        onPress={() => setSelectedFilter({ ...filter })}
                        activeOpacity={0.7}
                    >
                        <Text style={[
                            styles.filterText,
                            isSelected && styles.activeFilterText
                        ]}>
                            {isSelected
                                ? (loading ? `${filter.label} (...)` : `${filter.label} (${tasks.length})`)
                                : filter.label}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </ScrollView>
    ), [selectedFilter.label, tasks.length, loading]);





    const getItemLayout = useCallback((data: any, index: any) => ({
        length: 118,
        offset: 118 * index + 20,
        index,
    }), []);

    const LoadingIndicator = () => (
        <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#1A73E8" />
            <Text style={styles.loadingText}>Loading tasks...</Text>
        </View>
    );

    const ErrorMessage = () => (
        <View style={styles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={48} color="#D93025" />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={onRefresh} style={styles.retryButton}>
                <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
        </View>
    );

    const EmptyList = () => (
        <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="clipboard-text-off-outline" size={64} color="#9AA0A6" />
            <Text style={styles.emptyText}>No tasks found</Text>
            <Text style={styles.emptySubtext}>Try adjusting your filters or search</Text>
        </View>
    );

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            {/* Header Tabs */}
            <View style={styles.headerSection}>
                {renderHeaderTabs()}
                <View style={styles.divider} />
            </View>

            {/* Filters */}
            <View style={styles.filtersSection}>
                {renderFilters()}
            </View>

            {/* Content Area */}
            <View style={styles.contentContainer}>
                {/* Team Members List */}
                {TeamMemberForFilter && TeamMemberForFilter.length > 0 && (
                    <View style={{ marginVertical: 10 }}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', alignItems: 'center' }}>
                            {TeamMemberForFilter.map((member: any, index: any) => {
                                const isSelected = selectedUsers?.some((u: any) => u.Email === member.Email) ?? false;
                                return (
                                    <View key={index} style={{ marginRight: 8 }}>
                                        <UserAvatar
                                            user={member}
                                            spToken={spToken}
                                            isSelected={isSelected}
                                            onPress={() => toggleUserSelection(member)}
                                        />
                                    </View>
                                );
                            })}
                        </ScrollView>
                    </View>
                )}

                {/* Search Bar */}
                <View style={styles.searchContainer}>
                    <Ionicons name="search" size={20} color="#9AA0A6" style={styles.searchIcon} />
                    <TextInput style={styles.searchInput} placeholder="Search tasks by title, ID, or project" value={searchQuery} onChangeText={setSearchQuery} placeholderTextColor="#9AA0A6" returnKeyType="search" autoCapitalize="none" />
                    {searchQuery ? <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearSearch}><Ionicons name="close-circle" size={20} color="#9AA0A6" /></TouchableOpacity> : null}
                </View>

                {/* Task List or States */}
                {loading ? (
                    <LoadingIndicator />
                ) : error ? (
                    <ErrorMessage />
                ) : (
                    <FlatList ref={flatListRef} data={filteredTasks} renderItem={({ item, index }) => <TaskCard item={item} index={index} spToken={spToken} onWTClick={onWTClick} />} keyExtractor={(item) => `${item.listId}-${item.Id}` || `task-${Date.now()}-${Math.random()}`}
                        contentContainerStyle={styles.listContent}
                        showsVerticalScrollIndicator={false}
                        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1A73E8']} tintColor="#1A73E8" />}
                        getItemLayout={getItemLayout}
                        initialNumToRender={10}
                        maxToRenderPerBatch={10}
                        updateCellsBatchingPeriod={50}
                        windowSize={21}
                        removeClippedSubviews={Platform.OS === 'android'}
                        ListEmptyComponent={<EmptyList />}
                        ListFooterComponent={tasks.length > 0 ? <View style={styles.footer}><Text style={styles.footerText}>Showing {tasks.length} of {tasks.length} tasks</Text></View> : null}
                    />
                )}
            </View>
            {timeEntryTask && (
                <TimeEntryModal
                    visible={isTimeEntryVisible}
                    onClose={onTimeEntryClose}
                    task={timeEntryTask}
                    currentUser={selectedUsers[0]}
                    teamMembers={TeamMemberForFilter}
                    spToken={spToken}
                    taskImageSource={timeEntryImage}
                />
            )}
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    headerSection: {
        backgroundColor: '#FFFFFF',
    },
    headerTabsContainer: {
        flexGrow: 0,
    },
    headerTab: {
        paddingVertical: 10,
        paddingHorizontal: 12,
        marginRight: 8,
    },
    activeHeaderTab: {
        borderBottomWidth: 2,
        borderBottomColor: '#1A73E8',
    },
    headerTabText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#9AA0A6',
        textTransform: 'uppercase',
    },
    activeHeaderTabText: {
        color: '#1A73E8',
    },
    divider: {
        height: 1,
        backgroundColor: '#E8EAED',
    },
    filtersSection: {
        backgroundColor: '#FFFFFF',
    },
    filtersContainer: {
        flexDirection: 'row',
    },
    filterBadge: {
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderRadius: 16,
        backgroundColor: '#F1F3F4',
        marginRight: 8,
        marginBottom: 4,
    },
    activeFilterBadge: {
        backgroundColor: '#304F8A',
    },
    filterText: {
        fontSize: 13,
        fontWeight: '500',
        color: '#3C4043',
    },
    activeFilterText: {
        color: '#FFFFFF',
    },
    contentContainer: {
        flex: 1,
        backgroundColor: '#F8F9FA',
        paddingHorizontal: 16,
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        marginVertical: 12,
        borderWidth: 1,
        borderColor: '#E8EAED',
    },
    searchIcon: {
        marginRight: 8,
    },
    searchInput: {
        flex: 1,
        fontSize: 14,
        color: '#202124',
    },
    clearSearch: {
        padding: 4,
    },
    listContent: {
        paddingBottom: 20,
    },
    siteIcon: {
        width: 24,
        height: 24,
    },
    taskCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 8,
        padding: 12,
        marginBottom: 10,
        borderLeftWidth: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 2,
    },
    taskHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    taskTypeIcon: {
        marginRight: 8,
    },
    taskTitleContainer: {
        flex: 1,
    },
    taskTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#1A73E8',
    },
    taskId: {
        fontWeight: '700',
        color: '#202124',
    },
    taskActions: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    wtBadge: {
        backgroundColor: '#E0E0E0',
        borderRadius: 10,
        width: 20,
        height: 20,
        justifyContent: 'center',
        alignItems: 'center',
        marginHorizontal: 4,
    },
    wtText: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#5F6368',
    },
    taskDetailsRow: {
        marginBottom: 4,
    },
    taskStatsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
    },
    statItem: {
        flexDirection: 'row',
        alignItems: 'center',
        marginRight: 12,
        marginBottom: 4,
    },
    detailText: {
        fontSize: 12,
        color: '#5F6368',
    },
    detailLabel: {
        color: '#9AA0A6',
        fontSize: 12,
        fontWeight: '500',
    },
    detailValue: {
        color: '#3C4043',
        fontSize: 12,
        fontWeight: '500',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 40,
    },
    loadingText: {
        marginTop: 10,
        color: '#5F6368',
        fontSize: 16,
        fontWeight: '500',
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 40,
    },
    errorText: {
        marginTop: 16,
        marginBottom: 24,
        color: '#D93025',
        fontSize: 16,
        textAlign: 'center',
        lineHeight: 22,
    },
    retryButton: {
        backgroundColor: '#1A73E8',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 8,
    },
    retryButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: 40,
    },
    emptyText: {
        color: '#9AA0A6',
        fontSize: 18,
        fontWeight: '600',
        marginTop: 16,
        marginBottom: 4,
    },
    emptySubtext: {
        color: '#9AA0A6',
        fontSize: 14,
    },
    footer: {
        paddingVertical: 16,
        alignItems: 'center',
    },
    footerText: {
        color: '#9AA0A6',
        fontSize: 14,
    },
    avatarContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#E8EAED',
    },
    selectedAvatarContainer: {
        borderColor: '#1A73E8',
        borderWidth: 2,
    },
    checkIcon: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        backgroundColor: '#FFFFFF',
        borderRadius: 8,
    },
    avatarImage: {
        width: '100%',
        height: '100%',
    },
});

export default React.memo(TaskDetailsScreen);
