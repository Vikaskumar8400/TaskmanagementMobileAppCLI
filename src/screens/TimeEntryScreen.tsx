import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList, Image, RefreshControl, ActivityIndicator, Dimensions, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import UserAvatar from '../components/UserAvatar';
import TimeEntryModal from '../components/TimeEntryModal';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { format, addDays, startOfWeek, isSameDay } from 'date-fns';
import { calculateSmartPriority, getAllTimesheetdata, taskFilterBasedOnTimeSheets, fetchImageAsBase64 } from '../Service/service';
import TimesheetTimeline from '../components/TimesheetTimeline';
import TaskConfirmationModal from '../components/TaskConfirmationModal';

const TimeEntryRow = ({ entry, item, theme, onEdit }: any) => {
    const [expanded, setExpanded] = useState(false);

    return (
        <View style={styles.timeEntryRow}>
            <Text style={[styles.taskHours, { color: theme.colors.textSecondary }]}>
                {parseFloat(entry.TaskTime).toFixed(2)} h
                <Ionicons name="information-circle-outline" size={14} color={theme.colors.textSecondary} style={{ marginLeft: 4 }} />
            </Text>
            <TouchableOpacity onPress={() => setExpanded(!expanded)} style={{ flex: 1, marginHorizontal: 10 }}>
                <Text style={[styles.taskDescription, { color: theme.colors.text }]} numberOfLines={expanded ? undefined : 1}>
                    {entry.Description}
                </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onEdit}>
                <Ionicons name="pencil" size={16} color={theme.colors.primary} />
            </TouchableOpacity>
        </View>
    );
};

const TimeEntryTaskItem = ({ item, theme, spToken, setSelectedTaskForEntry, setIsTimeEntryModalVisible, setSelectedEntryForEdit }: any) => {
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
        <View style={[styles.taskCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            {/* Header: Avatar/Icon + ID + Title */}
            <View style={styles.taskHeader}>
                {item.SiteIcon ? (
                    imageSource ? (
                        <Image source={imageSource} style={styles.taskAvatar} />
                    ) : (
                        <ActivityIndicator size="small" color={theme.colors.primary} style={styles.taskAvatar} />
                    )
                ) : (
                    <View style={[styles.taskAvatar, { backgroundColor: '#ccc' }]} />
                )}
                <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[styles.taskTitle, { color: theme.colors.primary }]}>
                        {item.TaskID} - {item.Title}
                    </Text>
                </View>
            </View>

            {/* Sub-Header details */}
            <View style={styles.taskMetaRow}>
                <Text style={styles.metaLabel}>S-Prio: </Text>
                <Text style={styles.metaValue}>{calculateSmartPriority(item) || '-'}</Text>
                <Text style={[styles.metaLabel, { marginLeft: 15 }]}>Status: </Text>
                <Text style={styles.metaValue}>{item.PercentComplete}%</Text>
            </View>

            {/* Bottom Row: Hours + Description + Edit */}
            <View style={styles.taskFooterContainer}>
                {item.AdditionalTimeEntry?.map((entry: any, index: number) => (
                    <TimeEntryRow
                        key={index}
                        entry={entry}
                        item={item}
                        theme={theme}
                        onEdit={() => {
                            setSelectedTaskForEntry(item);
                            setSelectedEntryForEdit(entry); // Set entry for edit
                            setIsTimeEntryModalVisible(true);
                        }}
                    />
                ))}
                {(!item.AdditionalTimeEntry || item.AdditionalTimeEntry.length === 0) && (
                    <View style={styles.timeEntryRow}>
                        <Text style={[styles.taskHours, { color: theme.colors.textSecondary }]}>
                            0.00 h
                            <Ionicons name="information-circle-outline" size={14} color={theme.colors.textSecondary} style={{ marginLeft: 4 }} />
                        </Text>
                        <Text style={[styles.taskDescription, { color: theme.colors.textSecondary, fontStyle: 'italic' }]} numberOfLines={1}>
                            No entries
                        </Text>
                        <TouchableOpacity onPress={() => {
                            setSelectedTaskForEntry(item);
                            setSelectedEntryForEdit(null); // Ensure no entry is set when clicking the placeholder edit
                            setIsTimeEntryModalVisible(true);
                        }}>
                            <Ionicons name="pencil" size={16} color={theme.colors.primary} />
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        </View>
    );
};

const TimeEntryScreen = ({ navigation }: any) => {
    const { theme } = useTheme();
    const { taskUsers, user, spToken, smartMetadata, refreshTaskUsers } = useAuth();
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [dates, setDates] = useState<Date[]>([]);
    const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
    const [isTimeEntryModalVisible, setIsTimeEntryModalVisible] = useState(false);
    const [selectedTaskForEntry, setSelectedTaskForEntry] = useState<any>(null);
    const [selectedEntryForEdit, setSelectedEntryForEdit] = useState<any>(null); // New state for editing
    const [displayUsers, setDisplayUsers] = useState<any>([]);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [taskTimeSheetsData, setTaskTimeSheetsData] = useState<any>([]);
    const [perUserTimeSummary, setPerUserTimeSummary] = useState<Record<number, { count: number; totalHours: number }>>({});
    const [isTaskConfirmationVisible, setIsTaskConfirmationVisible] = useState(false);
    const [confirmationPanelType, setConfirmationPanelType] = useState<'Draft' | 'Suggestion' | 'Confirmed' | 'For Approval' | 'Approved'>('Suggestion');
    // Map taskUsers to UI format
    useEffect(() => {
        if (!taskUsers?.length || !user?.Email) return;
        try {
            const currentUser = taskUsers.find((u: any) => u?.Email == user.Email);
            if (!currentUser) return;
            const teamMembers = taskUsers.filter((u: any) => Array.isArray(u?.Approver?.results) && u.Approver?.results?.some((ap: any) => ap?.Id === currentUser.AssingedToUserId));
            const visibleUsers = [currentUser, ...teamMembers];
            setDisplayUsers(visibleUsers);
            setCurrentUser(currentUser);
        } catch (err) {
            console.error("Error filtering task users:", err);
        }
    }, [taskUsers, user]);
    function formatTaskDateToDate(taskDate: string): Date {
        // dd/MM/yyyy → JS Date
        const [day, month, year] = taskDate.split("/");
        const date = new Date(Number(year), Number(month) - 1, Number(day));
        date.setHours(0, 0, 0, 0); // zero time for safe comparison
        return date;
    }
    const LoadTodayTimeSheetData = async () => {
        try {
            let TimeSheetResult: any = [];
            smartMetadata?.forEach(function (obj: any) { if (obj.TaxType == "timesheetListConfigrations") { let JSONData = JSON.parse(obj.Configurations); TimeSheetResult = [...TimeSheetResult, ...JSONData]; } });
            let todayDate = new Date();
            if (selectedDate) {
                todayDate = selectedDate;
            }
            todayDate.setHours(0, 0, 0, 0);
            const TodayServerDate = todayDate.toISOString();
            const filter = `(Modified ge '${TodayServerDate}') and (TimesheetTitle/Id ne null)`;
            const allFetchedData: any = await Promise.all(
                TimeSheetResult?.map((site: any) => getAllTimesheetdata(spToken, site, filter)) || []
            );
            let data = allFetchedData.flat();
            const todaysTimeEntry: any[] = [];
            const addedItemIds = new Set();
            for (const item of data) {
                let entryDetails: any[] = [];
                if (item?.AdditionalTimeEntry) {
                    entryDetails = Array.isArray(item.AdditionalTimeEntry) ? item.AdditionalTimeEntry : JSON.parse(item.AdditionalTimeEntry);
                }
                for (const timeEntry of entryDetails) {
                    const parts = timeEntry?.TaskDate?.split('/');
                    if (!parts || parts.length !== 3) continue;

                    const taskDate = new Date(+parts[2], +parts[1] - 1, +parts[0]);
                    taskDate.setHours(0, 0, 0, 0);

                    if (taskDate.getTime() === todayDate.getTime() && !addedItemIds.has(item.Id)) {
                        todaysTimeEntry.push(item);
                        addedItemIds.add(item.Id);
                        break;
                    }
                }
            }
            // Per-user time summary for selected date (show for all users like desktop)
            const summary: Record<number, { count: number; totalHours: number }> = {};
            const selectedDateZeroed = new Date(todayDate);
            selectedDateZeroed.setHours(0, 0, 0, 0);
            for (const item of todaysTimeEntry) {
                let entryDetailsForSummary: any[] = [];
                if (item?.AdditionalTimeEntry) {
                    entryDetailsForSummary = Array.isArray(item.AdditionalTimeEntry) ? item.AdditionalTimeEntry : JSON.parse(item.AdditionalTimeEntry);
                }
                const entriesForDate = entryDetailsForSummary.filter((e: any) => {
                    try {
                        const d = formatTaskDateToDate(e.TaskDate);
                        return d.getTime() === selectedDateZeroed.getTime();
                    } catch {
                        return false;
                    }
                });
                const usersInThisTask = new Set<number>();
                for (const e of entriesForDate) {
                    const uid = e.AuthorId;
                    if (uid == null) continue;
                    if (!summary[uid]) summary[uid] = { count: 0, totalHours: 0 };
                    summary[uid].totalHours += parseFloat(e.TaskTime) || 0;
                    usersInThisTask.add(uid);
                }
                usersInThisTask.forEach((uid) => { summary[uid].count += 1; });
            }
            setPerUserTimeSummary(summary);

            let currentUserSeletedtodaysTimeEntry = todaysTimeEntry?.filter((item: any) => {
                try {
                    const entries = Array.isArray(item.AdditionalTimeEntry)
                        ? item.AdditionalTimeEntry
                        : JSON.parse(item.AdditionalTimeEntry);
                    return entries.some((e: any) => e.AuthorId == selectedUserId);
                } catch (err) {
                    return false;
                }
            });
            if (currentUserSeletedtodaysTimeEntry?.length > 0) {
                const optimizedSites = smartMetadata?.filter((item: any) => item.TaxType === 'Sites' && item.listId !== undefined && item.Title !== 'Master Tasks' && item.Title !== 'SDC Sites' && item.Title !== 'Shareweb Old').sort((a: any, b: any) => (a.SortOrder ?? 0) - (b.SortOrder ?? 0));
                optimizedSites?.forEach((meta: any) => {
                    const taskKey = "Task" + meta.Title; // TaskHHHH, TaskEPS
                    currentUserSeletedtodaysTimeEntry?.forEach((timeItem: any) => {
                        const taskObj = timeItem[taskKey];
                        if (taskObj && typeof taskObj === "object" && taskObj.Id) {
                            if (!Array.isArray(timeItem?.SmartMetaInfo)) {
                                timeItem.SmartMetaInfo = [];
                            }
                            const alreadyAdded = timeItem?.SmartMetaInfo?.some(
                                (x: any) => x.Title === meta.Title && x.taskId === taskObj.Id
                            );
                            if (!alreadyAdded) {
                                timeItem.SmartMetaInfo?.push({
                                    listId: meta.listId,
                                    siteUrl: meta.siteUrl?.Url || meta.siteUrl,
                                    Item_x005F_x0020_Cover: meta.Item_x005F_x0020_Cover,
                                    Title: meta.Title,
                                    taskId: taskObj.Id      // 👈 TaskHHHH.Id
                                });
                            }
                        }
                    });
                });
                let taskFilterBasedOnTimeSheetsData: any = await taskFilterBasedOnTimeSheets(spToken, currentUserSeletedtodaysTimeEntry);
                currentUserSeletedtodaysTimeEntry?.map((elem: any) => {
                    console.log("item", elem);
                    let site = elem.SmartMetaInfo[0];
                    taskFilterBasedOnTimeSheetsData?.map((item: any) => {
                        if (item.Id === site.taskId && item.siteType === site.Title) {
                            try {
                                if (elem.AdditionalTimeEntry) {
                                    let AdditionalTimeEntry = Array.isArray(elem.AdditionalTimeEntry) ? elem.AdditionalTimeEntry : JSON.parse(elem.AdditionalTimeEntry);
                                    if (AdditionalTimeEntry.length > 0) {
                                        console.log("AdditionalTimeEntry10", AdditionalTimeEntry);
                                        let currentUserSeletedAdditionalTimeEntry = AdditionalTimeEntry?.filter((item: any) => item.AuthorId == selectedUserId);
                                        if (currentUserSeletedAdditionalTimeEntry?.length > 0) {
                                            // Inject Category from the parent item (elem.Title)
                                            currentUserSeletedAdditionalTimeEntry.forEach((entry: any) => {
                                                entry.Category = elem.Category?.Title;
                                                entry.CategoryId = elem.Category?.Id;
                                            });
                                            const filteredData = currentUserSeletedAdditionalTimeEntry?.filter((item: any) => {
                                                const selectedDateZeroed = new Date(selectedDate);
                                                selectedDateZeroed.setHours(0, 0, 0, 0);
                                                const taskDate = formatTaskDateToDate(item.TaskDate);
                                                return taskDate.getTime() === selectedDateZeroed.getTime();
                                            });
                                            // Required for TaskConfirmationModal / taskConfirmationService updates
                                            const rowSiteUrl = typeof elem.siteUrl === 'string' ? elem.siteUrl : (elem.siteUrl?.Url ?? elem.siteUrl);
                                            filteredData?.forEach((entry: any) => {
                                                entry.ParentID = elem.Id;
                                                entry.TimesheetListId = elem.listId;
                                                entry.siteUrl = rowSiteUrl;
                                            });
                                            item.AdditionalTimeEntry = [...(item.AdditionalTimeEntry || []), ...filteredData];
                                        }
                                    }
                                }
                            } catch (error) {
                                console.error("parsing AdditionalTimeEntry: ", error);
                            }
                        }
                    })
                })
                if (taskFilterBasedOnTimeSheetsData.length > 0) {
                    setTaskTimeSheetsData(taskFilterBasedOnTimeSheetsData);
                } else {
                    setTaskTimeSheetsData([]);
                }
            } else {
                setTaskTimeSheetsData([]);
            }
            return todaysTimeEntry;
        } catch (err) {
            console.error("Error loading today's timesheet data", err);
            return [];
        }
    };
    useEffect(() => {
        LoadTodayTimeSheetData();
    }, [spToken, smartMetadata, selectedDate, selectedUserId]);

    useEffect(() => {
        if (displayUsers.length > 0 && selectedUserId === null) {
            setSelectedUserId(currentUser?.AssingedToUserId);
        }
    }, [displayUsers]);

    // Generate dates for the strip (current date +/- 5 days)
    useEffect(() => {
        const today = new Date();
        const range = [];
        for (let i = -5; i <= 5; i++) {
            range.push(addDays(today, i));
        }
        setDates(range);
    }, []);

    // Date Strip Item
    const renderDateItem = (date: Date) => {
        const isSelected = isSameDay(date, selectedDate);
        const userEntries = taskTimeSheetsData
        const count = userEntries.length;
        const totalHours = userEntries.reduce((acc: number, entry: any) => {
            let entryHours = 0;
            try {
                if (entry.AdditionalTimeEntry) {
                    const timeEntries = Array.isArray(entry.AdditionalTimeEntry) ? entry.AdditionalTimeEntry : JSON.parse(entry.AdditionalTimeEntry);
                    entryHours = timeEntries.reduce((subAcc: number, subEntry: any) => subAcc + (parseFloat(subEntry.TaskTime) || 0), 0);
                }
            } catch (e) {
                console.error("Error parsing AdditionalTimeEntry for stats:", e);
            }
            return acc + entryHours;
        }, 0);

        return (
            <TouchableOpacity
                key={date.toISOString()}
                style={[
                    styles.dateItem,
                    isSelected && { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }
                ]}
                onPress={() => setSelectedDate(date)}
            >
                <Text style={[styles.dateDay, isSelected ? { color: 'white' } : { color: theme.colors.text }]}>
                    {format(date, 'EEE d MMM')}
                </Text>
                <Text style={[styles.dateStats, isSelected ? { color: 'white' } : { color: theme.colors.textSecondary }]}>
                    {isSelected ? `${count} | ${totalHours.toFixed(2)}` : "0 | 0.00"}
                </Text>
            </TouchableOpacity>
        );
    };

    // User Strip Item – show each user's time summary for selected date (like desktop)
    const renderUserItem = ({ item }: { item: any }) => {
        const isSelected = item.AssingedToUserId === selectedUserId;
        const name = item.Title?.split(' ')[0] || item.Title || 'User';
        const userSummary = perUserTimeSummary[item.AssingedToUserId];
        const count = userSummary?.count ?? 0;
        const totalHours = userSummary?.totalHours ?? 0;

        return (
            <TouchableOpacity
                style={[
                    styles.userItem,
                    isSelected && { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }
                ]}
                onPress={() => setSelectedUserId(item.AssingedToUserId)}
            >
                <UserAvatar
                    user={item}
                    spToken={spToken}
                    containerStyle={styles.avatar}
                />
                <View style={styles.userInfo}>
                    <Text style={[styles.userName, isSelected && { color: 'white' }]}>{name}</Text>
                    <Text style={[styles.userStats, isSelected ? { color: '#E0E0E0' } : { color: theme.colors.primary }]}>
                        {`${count} | ${totalHours.toFixed(2)}`}
                    </Text>
                </View>
            </TouchableOpacity>
        );
    };

    // Task List Item
    const renderTaskItem = ({ item }: { item: any }) => {
        return (
            <TimeEntryTaskItem
                item={item}
                theme={theme}
                spToken={spToken}
                setSelectedTaskForEntry={setSelectedTaskForEntry}
                setIsTimeEntryModalVisible={setIsTimeEntryModalVisible}
                setSelectedEntryForEdit={setSelectedEntryForEdit}
            />
        );
    };

    const [refreshing, setRefreshing] = useState(false);

    const onRefresh = async () => {
        setRefreshing(true);
        await LoadTodayTimeSheetData();
        setRefreshing(false);
    };

    const dateScrollRef = useRef<ScrollView>(null);

    const viewingUser = useMemo(() => displayUsers?.find((u: any) => u.AssingedToUserId === selectedUserId) || currentUser, [displayUsers, selectedUserId, currentUser]);
    const isViewingSelf = viewingUser?.AssingedToUserId === currentUser?.AssingedToUserId;
    const approversList = viewingUser?.Approver?.results ?? (Array.isArray(viewingUser?.Approver) ? viewingUser.Approver : []);
    const isLeadForViewingUser = approversList.some((ap: any) => ap?.Id === currentUser?.AssingedToUserId);

    const canOpenPanel = (panelType: string): boolean => {
        if (isLeadForViewingUser && !isViewingSelf) {
            return panelType === 'Confirmed' || panelType === 'Approved';
        }
        return panelType === 'Suggestion' || panelType === 'Draft' || panelType === 'For Approval';
    };

    const disabledSteps = useMemo(() => {
        const steps: string[] = [];
        if (isLeadForViewingUser && !isViewingSelf) {
            steps.push('Suggestion', 'For Approval');
        } else {
            steps.push('Confirmed', 'Approved');
        }
        return steps;
    }, [isLeadForViewingUser, isViewingSelf]);

    const handleTimelineStepPress = (step: string) => {
        setConfirmationPanelType(step as 'Draft' | 'Suggestion' | 'Confirmed' | 'For Approval' | 'Approved');
        setIsTaskConfirmationVisible(true);
        if (!canOpenPanel(step)) {
            if (isLeadForViewingUser && !isViewingSelf) {
                Alert.alert('Not allowed', 'As team lead you can only open Confirm WT and EOD Approved panels for team members.');
            } else {
                Alert.alert('Not allowed', 'You can only open WT Suggested and EOD Submitted panels. Confirm and Approve are for your team lead.');
            }
        }
    };

    // Scroll to selected date when dates or selectedDate changes
    useEffect(() => {
        if (dates.length > 0 && dateScrollRef.current) {
            const index = dates.findIndex(d => isSameDay(d, selectedDate));
            if (index !== -1) {
                const itemWidth = 108; // 100 width + 4*2 margin
                const screenWidth = Dimensions.get('window').width;
                // Center the item: (index * itemWidth) - (half screen) + (half item)
                const x = (index * itemWidth) - (screenWidth / 2) + (itemWidth / 2);

                dateScrollRef.current.scrollTo({ x: x > 0 ? x : 0, animated: true });
            }
        }
    }, [dates, selectedDate]);

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
            {/* Header / Top Navigation */}
            {/* Note: Assuming typical header is wanted, or just safe area spacing */}

            <View style={styles.content}>
                {/* Date Strip */}
                <View style={styles.dateStripContainer}>
                    <TouchableOpacity style={styles.navButton}>
                        <Ionicons name="chevron-back" size={24} color={theme.colors.primary} />
                    </TouchableOpacity>
                    <ScrollView
                        ref={dateScrollRef}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.dateScroll}
                    >
                        {dates.map(renderDateItem)}
                    </ScrollView>
                    <TouchableOpacity style={styles.navButton}>
                        <Ionicons name="chevron-forward" size={24} color={theme.colors.primary} />
                    </TouchableOpacity>
                </View>

                {/* User Strip */}
                <View style={styles.userStripContainer}>
                    <FlatList
                        data={displayUsers}
                        renderItem={renderUserItem}
                        keyExtractor={(item: any) => item.Id.toString()}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ paddingHorizontal: 10 }}
                    />
                </View>

                {/* Task List */}
                <View style={styles.taskListContainer}>
                    {/* Timesheet Timeline */}
                    <View style={{ marginBottom: 10, paddingHorizontal: 5 }} pointerEvents="box-none">
                        <TimesheetTimeline
                            omtStatus={viewingUser?.OMTStatus}
                            selectedDay={format(selectedDate, 'dd/MM/yyyy')}
                            onStepPress={handleTimelineStepPress}
                            disabledSteps={disabledSteps}
                        />
                    </View>

                    <View style={styles.dashedBorder}>
                        <FlatList
                            data={taskTimeSheetsData} // Filtering logic could be added here
                            renderItem={renderTaskItem}
                            keyExtractor={item => item.Id.toString() + item.siteType}
                            contentContainerStyle={{ padding: 10, flexGrow: 1 }}
                            refreshControl={
                                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />
                            }
                            ListEmptyComponent={
                                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 50 }}>
                                    <Text style={{ color: theme.colors.textSecondary }}>No time entries found</Text>
                                </View>
                            }
                        />
                    </View>
                </View>
            </View>

            {
                isTimeEntryModalVisible && selectedTaskForEntry && (
                    <TimeEntryModal
                        visible={isTimeEntryModalVisible}
                        onClose={() => {
                            setIsTimeEntryModalVisible(false);
                            setSelectedTaskForEntry(null);
                            setSelectedEntryForEdit(null); // Clear edit state
                            LoadTodayTimeSheetData(); // Refresh data after close
                        }}
                        task={selectedTaskForEntry}
                        currentUser={currentUser} // Pass actual filtered current user
                        teamMembers={displayUsers}
                        spToken={spToken}
                        initialEntry={selectedEntryForEdit} // Pass the entry to edit
                    />
                )
            }

            {
                isTaskConfirmationVisible && (
                    <TaskConfirmationModal
                        visible={isTaskConfirmationVisible}
                        onClose={async (refresh) => {
                            setIsTaskConfirmationVisible(false);
                            if (refresh) {
                                await refreshTaskUsers?.();
                                await LoadTodayTimeSheetData();
                            }
                        }}
                        panelType={confirmationPanelType}
                        selectedDate={selectedDate}
                        currentUser={currentUser}
                        viewingUser={displayUsers?.find((u: any) => u.AssingedToUserId === selectedUserId) || currentUser}
                        spToken={spToken}
                        taskTimeSheetsData={taskTimeSheetsData}
                        teamMembers={displayUsers}
                        smartMetadata={smartMetadata}
                    />
                )
            }
        </SafeAreaView >
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    content: {
        flex: 1,
        paddingTop: 10,
    },
    // Date Strip Styles
    dateStripContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 5,
        marginBottom: 10,
        height: 60,
    },
    navButton: {
        padding: 5,
        justifyContent: 'center',
        alignItems: 'center',
        // backgroundColor: '#2e5596', // Optional: circle bg
        // borderRadius: 15,
    },
    dateScroll: {
        paddingHorizontal: 5,
    },
    dateItem: {
        width: 100,
        height: 50,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#E0E0E0',
        borderRadius: 5,
        marginHorizontal: 4,
        backgroundColor: '#FFFFFF',
    },
    dateDay: {
        fontSize: 12,
        fontWeight: 'bold',
    },
    dateStats: {
        fontSize: 10,
        marginTop: 2,
    },

    // User Strip Styles
    userStripContainer: {
        height: 50,
        marginBottom: 10,
    },
    userItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F5F5F5',
        borderRadius: 20,
        paddingHorizontal: 8,
        paddingVertical: 5,
        marginRight: 10,
        borderWidth: 1,
        borderColor: '#E0E0E0',
    },
    avatar: {
        width: 24,
        height: 24,
        borderRadius: 12,
        marginRight: 6,
        borderWidth: 0, // Override default border
    },
    userInfo: {
        justifyContent: 'center',
    },
    userName: {
        fontSize: 10, // Small text like in screenshot
        fontWeight: 'bold',
        color: '#000',
    },
    userStats: {
        fontSize: 10,
        fontWeight: 'bold',
    },

    // Task List Styles
    taskListContainer: {
        flex: 1,
        paddingHorizontal: 10,
    },
    dashedBorder: {
        flex: 1,
        borderWidth: 1,
        borderColor: '#2e5596',
        borderStyle: 'dashed',
        borderRadius: 10,
    },
    taskCard: {
        backgroundColor: 'white',
        borderRadius: 8,
        padding: 10,
        marginBottom: 10,
        // Shadow (simple)
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
        borderWidth: 1,
        borderColor: '#efefef'
    },
    taskHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 5,
    },
    taskAvatar: {
        width: 24,
        height: 24,
        borderRadius: 12,
    },
    taskTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        lineHeight: 18,
    },
    taskMetaRow: {
        flexDirection: 'row',
        marginLeft: 34, // Align with title text
        marginBottom: 5,
    },
    metaLabel: {
        fontSize: 12,
        color: '#888',
    },
    metaValue: {
        fontSize: 12,
        fontWeight: '600',
        color: '#333',
    },
    taskFooterContainer: {
        marginTop: 5,
    },
    timeEntryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginLeft: 34,
        justifyContent: 'space-between',
        marginBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#efefef',
        paddingBottom: 5
    },
    taskHours: {
        fontSize: 12,
        fontWeight: '600',
        width: 60,
        flexDirection: 'row',
        alignItems: 'center'
    },
    taskDescription: {
        flex: 1,
        fontSize: 12,
        marginHorizontal: 10,
        fontStyle: 'italic',
    },
});

export default TimeEntryScreen;
