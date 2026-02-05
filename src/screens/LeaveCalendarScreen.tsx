import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Modal, Alert, ScrollView } from 'react-native';
import { format, parseISO, differenceInDays, subDays, isWeekend, eachDayOfInterval } from 'date-fns';
import { Calendar } from 'react-native-calendars';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useAuth } from '../context/AuthContext'; // Assuming context exists
import { getLeaveEventsResult, getTaskAllTaskUser, getComponentPermission } from '../Service/service'; // Will implement next
import LeaveApplicationModal from '../components/LeaveApplicationModal'; // Will create
import LeaveReportModal from '../components/LeaveReportModal'; // Will create
import UserAvatar from '../components/UserAvatar';
import { FlatList } from 'react-native';

// code by vikas calender
const LeaveCalendarScreen = ({ navigation }: any) => {
    const insets = useSafeAreaInsets();
    const { user, spToken } = useAuth() as any; // Cast as any if typing is strict
    const [events, setEvents] = useState<any[]>([]);
    const [filteredEvents, setFilteredEvents] = useState<any[]>([]);
    const [markedDates, setMarkedDates] = useState<any>({});
    const [loading, setLoading] = useState(false);

    // Modal States
    const [isApplyModalVisible, setIsApplyModalVisible] = useState(false);
    const [isReportModalVisible, setIsReportModalVisible] = useState(false);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);
    const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
    const [counts, setCounts] = useState({ holiday: 0, wfh: 0, leave: 0 });
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [detailsType, setDetailsType] = useState<'Holiday' | 'WFH' | 'Leave'>('Leave');
    const [monthlyDetails, setMonthlyDetails] = useState<any[]>([]);
    const [showHoverName, setShowHoverName] = useState(false);
    const [teamMembers, setTeamMembers] = useState<any[]>([]);
    const [daySelectedLeaves, setDaySelectedLeaves] = useState<any[]>([]);
    const [isDayDetailsVisible, setIsDayDetailsVisible] = useState(false);

    // Filter Logic
    const [selectedMemberIds, setSelectedMemberIds] = useState<any[]>([]);
    const [displayUsers, setDisplayUsers] = useState<any[]>([]);
    const [showLeftArrow, setShowLeftArrow] = useState(false);
    const [showRightArrow, setShowRightArrow] = useState(true);
    const [showSnackbar, setShowSnackbar] = useState(false);

    useEffect(() => {
        if (showSnackbar) {
            const timer = setTimeout(() => {
                setShowSnackbar(false);
            }, 2000);
            return () => clearTimeout(timer);
        }
    }, [showSnackbar]);

    useEffect(() => {
        if (spToken) {
            initData();
        }
    }, [spToken]);

    useEffect(() => {
        if (user || teamMembers.length > 0) {
            const list = [user, ...teamMembers].filter(Boolean);
            // Deduplicate
            const unique = list.filter((v, i, a) => a.findIndex(t => (t.AssingedToUserId || t.Id) === (v.AssingedToUserId || v.Id)) === i);
            setDisplayUsers(unique);

            // Default select current user if selection is empty
            if (selectedMemberIds.length === 0 && user) {
                setSelectedMemberIds([user.AssingedToUserId || user.Id]);
            }
        }
    }, [user, teamMembers]);

    useEffect(() => {
        updateCalendarView();
    }, [events, selectedMemberIds, currentMonth, currentYear]);

    const updateCalendarView = () => {
        const activeIds = selectedMemberIds.map(id => String(id));

        // Filter events based on selected users
        const filtered = events.filter((evt: any) => {
            const employeeId = String(evt.Employee?.Id || evt.EmployeeId || evt.AuthorId || "");
            const employeeTitle = (evt.Employee?.Title || "").toLowerCase().trim();
            const authorTitle = (evt.Author?.Title || "").toLowerCase().trim();

            // Check if this event belongs to a selected user
            // We match by ID first
            if (activeIds.includes(employeeId)) return true;

            // Fallback match by Title (if ID is missing or mismatch)
            const matchedUser = displayUsers.find(u => {
                const uid = String(u.AssingedToUserId || u.Id);
                return activeIds.includes(uid);
            });

            if (matchedUser) {
                const title = (matchedUser.Title || "").toLowerCase().trim();
                if (title && (title === employeeTitle || title === authorTitle)) return true;
            }

            return false;
        });

        // Generate Marked Dates
        // Generate Marked Dates
        const marked: any = {};
        filtered.forEach((evt: any) => {
            const dateKey = evt.EventDate ? evt.EventDate.split('T')[0] : '';
            if (dateKey) {
                if (!marked[dateKey]) {
                    marked[dateKey] = { dots: [] };
                }
                let color = '#1A73E8'; // Default blue
                if (evt.Event_x002d_Type === "Work From Home") color = "#e0a209";
                else if (evt.Event_x002d_Type === "Company Holiday" || evt.Event_x002d_Type === "National Holiday") color = "#228B22";

                if (marked[dateKey].dots.length < 3) {
                    marked[dateKey].dots.push({ color: color });
                }

                // If this is a Leave (blue dot), User wants red background (actually passed as light beige)
                if (color === '#1A73E8') {
                    marked[dateKey].selected = true;
                    marked[dateKey].selectedColor = '#e5d0b3';
                    marked[dateKey].selectedTextColor = 'white';
                }
                // If this is a Holiday (green dot), User wants green background
                else if (color === '#228B22') {
                    marked[dateKey].selected = true;
                    marked[dateKey].selectedColor = '#c4e1c5'; // Light green to match the style of the beige leave background
                    marked[dateKey].selectedTextColor = '#0d5110'; // Dark green text for contrast
                }
            }
        });
        setMarkedDates(marked);
        setFilteredEvents(filtered);
        calculateCounts(filtered, currentMonth, currentYear);
    };

    const initData = async () => {
        setLoading(true);
        try {
            const siteUrl = "https://hhhhteams.sharepoint.com/sites/HHHH/SP";
            const allUsers = await getTaskAllTaskUser(spToken);

            // 1. Find Current User (TaskDetails style + fallback)
            const currentUserEntry = allUsers.find((u: any) =>
                (user?.Email && u.Email === user.Email) ||
                u.AssingedToUserId === user?.Id ||
                u.AssingedToUserId === user?.AssingedToUserId ||
                u.Id === user?.Id
            );

            let hasFullAccess = false;

            // 2. Check Permission: DeleteLeavePermissionCalendar
            try {
                const permItem = await getComponentPermission(spToken, siteUrl, "DeleteLeavePermissionCalendar");
                if (permItem && currentUserEntry) {
                    const allowedUsers = permItem.AllowedUsers?.results || (Array.isArray(permItem.AllowedUsers) ? permItem.AllowedUsers : []);
                    const userEmail = (currentUserEntry.Email || "").toLowerCase();
                    const userId = currentUserEntry.AssingedToUserId;

                    hasFullAccess = allowedUsers.some((u: any) => {
                        const uEmail = (u.EMail || u.Email || "").toLowerCase();
                        return (uEmail && uEmail === userEmail) || (u.Id && String(u.Id) === String(userId));
                    });
                }
            } catch (e) { console.log("Permission check failed", e); }

            let finalMembers: any[] = [];

            if (hasFullAccess) {
                // If permission granted, show all active users from Smalsus matching conditions
                finalMembers = allUsers.filter((u: any) =>
                    u.IsActive &&
                    u.Company === 'Smalsus' &&
                    u.UserGroup?.Title !== "Ex Staff" &&
                    u.UserGroupId !== null &&
                    u.UserGroupId !== undefined &&
                    u.Email !== currentUserEntry?.Email
                );
            } else {
                // Fallback to Approver Logic
                let myTeam: any[] = [];
                if (currentUserEntry) {
                    const currentAssignedId = currentUserEntry.AssingedToUserId;
                    myTeam = allUsers.filter((u: any) => {
                        const approvers = u.Approver?.results || (Array.isArray(u.Approver) ? u.Approver : []);
                        if (!Array.isArray(approvers)) return false;
                        return approvers.some((ap: any) => (ap?.Id && currentAssignedId && String(ap.Id) === String(currentAssignedId)));
                    });
                }
                finalMembers = myTeam.filter(m => m.Email !== currentUserEntry?.Email);
            }

            setTeamMembers(finalMembers);
            await fetchEvents(finalMembers);
        } catch (error) {
            console.error("Init data error", error);
        } finally {
            setLoading(false);
        }
    };

    const fetchEvents = async (members: any[] = []) => {
        setLoading(true);
        try {
            // Placeholder siteUrl, ideally from user context or constant
            const siteUrl = "https://hhhhteams.sharepoint.com/sites/HHHH/SP";
            const results = await getLeaveEventsResult(spToken, siteUrl);
            const memberIds = [user?.Id, user?.AssingedToUserId, ...members.map(m => m.AssingedToUserId), ...members.map(m => m.Id)].filter(Boolean);
            const memberTitles = [user?.Title, ...members.map(m => m.Title)].map(t => (t || "").toLowerCase().trim()).filter(Boolean);

            const myResults = results.filter((evt: any) => {
                // 1. Filter out 'Test' leaves
                const titleStr = (evt.Title || "").toLowerCase();
                const descStr = (evt.Description || "").toLowerCase();
                if (titleStr.includes("test") || descStr.includes("test")) return false;

                // 2. Strict User Matching: Only match the actual Leave Owner (Employee)
                // If Employee field is missing, fallback to Author (assuming self-service).
                // But if Employee IS present, we MUST match against Employee, not Author.

                const employeeId = evt.Employee?.Id || evt.EmployeeId;
                const employeeTitle = (evt.Employee?.Title || "").toLowerCase().trim();

                // Check against member list
                if (employeeId || employeeTitle) {
                    const idMatch = employeeId && memberIds.some(id => String(id) === String(employeeId));
                    const titleMatch = employeeTitle && memberTitles.includes(employeeTitle);
                    return idMatch || titleMatch;
                }

                // If no Employee info, assume Author is the leave taker
                const authorId = evt.AuthorId;
                const authorTitle = (evt.Author?.Title || "").toLowerCase().trim();

                const authorIdMatch = authorId && memberIds.some(id => String(id) === String(authorId));
                const authorTitleMatch = authorTitle && memberTitles.includes(authorTitle);

                return authorIdMatch || authorTitleMatch;
            });

            setEvents(myResults);
        } catch (error) {
            console.error("Fetch events error", error);
        } finally {
            setLoading(false);
        }
    };

    const getDurationExcludingWeekends = (startDate: string, endDate: string, isHalfDay: boolean, isAllDay: boolean) => {
        try {
            const start = parseISO(startDate);
            let end = parseISO(endDate);
            if (isAllDay) end = subDays(end, 1);
            const days = eachDayOfInterval({ start, end });
            const workingDays = days.filter(day => !isWeekend(day)).length;
            return workingDays * (isHalfDay ? 0.5 : 1);
        } catch (e) {
            return 0;
        }
    };

    const calculateCounts = (results: any[], month: number, year: number) => {
        let h = 0, w = 0, l = 0;
        results.forEach(evt => {
            if (!evt.EventDate || !evt.EndDate) return;
            const date = parseISO(evt.EventDate);
            if (date.getMonth() + 1 === month && date.getFullYear() === year) {
                const isHalfDay = evt.HalfDay || evt.HalfDayTwo;
                const isAllDay = !!evt.fAllDayEvent;
                const duration = getDurationExcludingWeekends(evt.EventDate, evt.EndDate, isHalfDay, isAllDay);

                if (evt.Event_x002d_Type === "Company Holiday") h += duration;
                else if (evt.Event_x002d_Type === "Work From Home") w += duration;
                else l += duration;
            }
        });
        setCounts({ holiday: h, wfh: w, leave: l });
    };

    const toggleMemberSelection = (id: any) => {
        setSelectedMemberIds(prev => {
            const strId = String(id);
            const exists = prev.some(p => String(p) === strId);
            setShowSnackbar(true);
            if (exists) {
                return prev.filter(p => String(p) !== strId);
            } else {
                return [...prev, id];
            }
        });
    };

    const handleMonthChange = (month: any) => {
        setCurrentMonth(month.month);
        setCurrentYear(month.year);
        // calculateCounts handled by useEffect
    };

    const handleDayPress = (day: any) => {
        setSelectedDate(day.dateString);
        const dayLeaves = filteredEvents.filter(evt => {
            if (!evt.EventDate) return false;
            const dStr = evt.EventDate.split('T')[0];
            return dStr === day.dateString;
        });

        if (dayLeaves.length > 0) {
            setDaySelectedLeaves(dayLeaves);
            setIsDayDetailsVisible(true);
        } else {
            setIsApplyModalVisible(true);
        }
    };

    const selectedUserNames = displayUsers
        .filter(u => selectedMemberIds.some(id => String(id) === String(u.AssingedToUserId || u.Id)))
        .map(u => u.Title || u.Author?.Title || 'User')
        .join(', ');

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={24} color="#333" />
                    </TouchableOpacity>
                </View>
                <Text style={styles.headerTitle}>Leave Calendar</Text>
                <TouchableOpacity onPress={() => setIsReportModalVisible(true)}>
                    <Ionicons name="stats-chart" size={24} color="#333" />
                </TouchableOpacity>
            </View>

            {showSnackbar && selectedMemberIds.length > 0 && (
                <View style={styles.snackbarContainer}>
                    <View style={styles.snackbar}>
                        <Text style={styles.snackbarText} numberOfLines={1}>
                            {selectedUserNames}
                        </Text>
                    </View>
                </View>
            )}

            {displayUsers.length > 0 && (
                <View style={[styles.userFilterContainer, { position: 'relative' }]}>
                    {showLeftArrow && (
                        <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, justifyContent: 'center', zIndex: 10, paddingLeft: 5 }}>
                            <Ionicons name="chevron-back" size={14} color="#666" style={{ backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 10 }} />
                        </View>
                    )}

                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ paddingHorizontal: 16 }}
                        onScroll={(event) => {
                            const offsetX = event.nativeEvent.contentOffset.x;
                            const contentWidth = event.nativeEvent.contentSize.width;
                            const layoutWidth = event.nativeEvent.layoutMeasurement.width;
                            setShowLeftArrow(offsetX > 0);
                            setShowRightArrow(offsetX + layoutWidth < contentWidth - 5);
                        }}
                        scrollEventThrottle={16}
                    >
                        {displayUsers.map((u, i) => {
                            const isSelected = selectedMemberIds.some(id => String(id) === String(u.AssingedToUserId || u.Id));
                            return (
                                <TouchableOpacity
                                    key={i}
                                    style={[styles.userFilterItem, isSelected && styles.userFilterItemSelected]}
                                    onPress={() => toggleMemberSelection(u.AssingedToUserId || u.Id)}
                                >
                                    <View style={[styles.avatarBorder, isSelected && styles.avatarBorderSelected]}>
                                        <UserAvatar user={u} spToken={spToken} size={36} />
                                    </View>
                                    <View style={isSelected ? styles.badge : styles.badgeHidden}>
                                        <Ionicons name="checkmark" size={10} color="#FFF" />
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>

                    {showRightArrow && (
                        <View style={{ position: 'absolute', right: 0, top: 0, bottom: 0, justifyContent: 'center', zIndex: 10, paddingRight: 5 }}>
                            <Ionicons name="chevron-forward" size={14} color="#666" style={{ backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 10 }} />
                        </View>
                    )}
                </View>
            )}

            {loading && <ActivityIndicator size="large" color="#1A73E8" style={{ marginTop: 20 }} />}

            <Calendar
                current={selectedDate}
                onDayPress={handleDayPress}
                onMonthChange={handleMonthChange}
                markedDates={{
                    ...markedDates,
                    [selectedDate]: {
                        ...(markedDates[selectedDate] || {}),
                        selected: true,
                        selectedColor: '#E8F0FE',
                        selectedTextColor: '#1967D2'
                    }
                }}
                markingType={'multi-dot'}
                theme={{
                    selectedDayBackgroundColor: '#E8F0FE',
                    selectedDayTextColor: '#1967D2',
                    todayTextColor: '#1967D2',
                    arrowColor: '#5F6368',
                }}
            />

            <View style={styles.legend}>
                <TouchableOpacity
                    style={styles.legendItem}
                    onPress={() => {
                        setDetailsType('Holiday');
                        setMonthlyDetails(filteredEvents.filter(e => {
                            const d = parseISO(e.EventDate);
                            return d.getMonth() + 1 === currentMonth && d.getFullYear() === currentYear && e.Event_x002d_Type === "Company Holiday";
                        }));
                        setShowDetailsModal(true);
                    }}
                >
                    <View style={[styles.dot, { backgroundColor: '#228B22' }]} />
                    <Text style={styles.legendText}>Holiday ({counts.holiday})</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.legendItem}
                    onPress={() => {
                        setDetailsType('WFH');
                        setMonthlyDetails(filteredEvents.filter(e => {
                            const d = parseISO(e.EventDate);
                            return d.getMonth() + 1 === currentMonth && d.getFullYear() === currentYear && e.Event_x002d_Type === "Work From Home";
                        }));
                        setShowDetailsModal(true);
                    }}
                >
                    <View style={[styles.dot, { backgroundColor: '#e0a209' }]} />
                    <Text style={styles.legendText}>WFH ({counts.wfh})</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.legendItem}
                    onPress={() => {
                        setDetailsType('Leave');
                        setMonthlyDetails(filteredEvents.filter(e => {
                            const d = parseISO(e.EventDate);
                            return d.getMonth() + 1 === currentMonth && d.getFullYear() === currentYear && e.Event_x002d_Type !== "Work From Home" && e.Event_x002d_Type !== "Company Holiday";
                        }));
                        setShowDetailsModal(true);
                    }}
                >
                    <View style={[styles.dot, { backgroundColor: '#1A73E8' }]} />
                    <Text style={styles.legendText}>Leave ({counts.leave})</Text>
                </TouchableOpacity>
            </View>

            <Modal visible={isDayDetailsVisible} transparent animationType="fade" onRequestClose={() => setIsDayDetailsVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { height: 'auto', maxHeight: '70%', paddingBottom: 20 }]}>
                        <View style={styles.modalHeader}>
                            <View>
                                <Text style={styles.modalTitle}>Leaves on {format(parseISO(selectedDate), 'dd MMM yyyy')}</Text>
                                <Text style={styles.modalSubTitle}>{daySelectedLeaves.length} Entry Found</Text>
                            </View>
                            <TouchableOpacity onPress={() => setIsDayDetailsVisible(false)} style={styles.closeBtn}>
                                <Ionicons name="close" size={24} color="#666" />
                            </TouchableOpacity>
                        </View>
                        <FlatList
                            data={daySelectedLeaves}
                            keyExtractor={(item, index) => index.toString()}
                            renderItem={({ item }) => {
                                const isHalfDay = item.HalfDay || item.HalfDayTwo;
                                let typeColor = '#1A73E8';
                                if (item.Event_x002d_Type === "Work From Home") typeColor = "#e0a209";
                                else if (item.Event_x002d_Type === "Company Holiday") typeColor = "#228B22";

                                return (
                                    <View style={styles.dayLeaveRow}>
                                        <View style={styles.dayLeaveHeader}>
                                            <View style={styles.userSection}>
                                                {(() => {
                                                    const empId = item.Employee?.Id || item.Author?.Id;

                                                    // priority 1: Check if it's the current user
                                                    let fullUser = null;
                                                    if (user && (String(user.Id) === String(empId) || String(user.AssingedToUserId) === String(empId))) {
                                                        fullUser = user;
                                                    }

                                                    // priority 2: Check displayUsers list
                                                    if (!fullUser) {
                                                        fullUser = displayUsers.find(u => String(u.AssingedToUserId || u.Id) === String(empId));
                                                    }

                                                    return <UserAvatar user={fullUser || item.Employee || item.Author} spToken={spToken} size={32} />;
                                                })()}
                                                <View style={{ marginLeft: 10 }}>
                                                    <Text style={styles.userNameText}>{item.Employee?.Title || item.Author?.Title || "User"}</Text>
                                                    <Text style={styles.userRoleText}>{item.Designation || "Team Member"}</Text>
                                                </View>
                                            </View>
                                            <View style={[styles.typeBadge, { backgroundColor: typeColor + '15', borderColor: typeColor }]}>
                                                <Text style={[styles.typeBadgeText, { color: typeColor }]}>{item.Event_x002d_Type || "Leave"}</Text>
                                            </View>
                                        </View>
                                        <View style={styles.dayLeaveBody}>
                                            <Text style={styles.dayLeaveTitle}>{(item.Title || "").split('-').pop()?.trim() || item.Title}</Text>
                                            {item.Description && <Text style={styles.dayLeaveDesc}>{item.Description.replace(/<[^>]*>?/gm, '').trim()}</Text>}
                                            <View style={styles.dayLeaveFooter}>
                                                <View style={styles.durationTag}>
                                                    <Ionicons name="time-outline" size={14} color="#666" />
                                                    <Text style={styles.durationTagText}>{isHalfDay ? '0.5 Day' : 'Full Day'}</Text>
                                                </View>
                                                <Text style={[styles.statusMiniTag, item.Approved ? styles.approvedTag : (item.Rejected ? styles.rejectedTag : styles.pendingTag)]}>
                                                    {item.Approved ? 'Approved' : (item.Rejected ? 'Rejected' : 'Pending')}
                                                </Text>
                                            </View>
                                        </View>
                                    </View>
                                );
                            }}
                            ItemSeparatorComponent={() => <View style={styles.separator} />}
                        />
                        <TouchableOpacity
                            style={styles.addMoreBtn}
                            onPress={() => {
                                setIsDayDetailsVisible(false);
                                setIsApplyModalVisible(true);
                            }}
                        >
                            <Ionicons name="add" size={20} color="#FFF" />
                            <Text style={styles.addMoreBtnText}>Apply Leave for more users</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>



            <LeaveApplicationModal
                visible={isApplyModalVisible}
                onClose={() => setIsApplyModalVisible(false)}
                selectedDate={selectedDate}
                spToken={spToken}
                onSuccess={fetchEvents}
            />

            <LeaveReportModal
                visible={isReportModalVisible}
                onClose={() => setIsReportModalVisible(false)}
                events={events} // Pass events for client side filtering or implement server side in modal
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FFF' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
    headerTitle: { fontSize: 16, fontWeight: 'bold', color: '#1A73E8' },
    headerLeft: { flexDirection: 'row', alignItems: 'center' },
    avatarWrapper: { position: 'relative', marginLeft: 12 },
    userInfo: { flexDirection: 'row', alignItems: 'center' },
    tooltip: {
        position: 'absolute',
        top: 45,
        left: -10,
        backgroundColor: '#333',
        paddingVertical: 5,
        paddingHorizontal: 10,
        borderRadius: 6,
        zIndex: 9999,
        elevation: 5,
        minWidth: 100,
    },
    tooltipText: { color: '#FFF', fontSize: 11, fontWeight: 'bold', textAlign: 'center' },
    backBtn: { padding: 4 },
    legend: { flexDirection: 'row', justifyContent: 'center', padding: 10, marginTop: 10 },
    legendItem: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 8, padding: 4 },
    dot: { width: 10, height: 10, borderRadius: 5, marginRight: 6 },
    legendText: { fontSize: 11, color: '#555' },
    actionBtnContainer: { padding: 16, alignItems: 'center' },
    reportBtn: { backgroundColor: '#1A73E8', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 },
    reportBtnText: { color: '#FFF', fontWeight: 'bold' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 16, borderTopRightRadius: 16, height: '60%', padding: 16 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 10 },
    modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#1A73E8' },
    detailRow: { flexDirection: 'row', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
    detailDate: { width: 70, alignItems: 'center', justifyContent: 'center' },
    dateText: { fontSize: 13, fontWeight: 'bold', color: '#333' },
    dateSubText: { fontSize: 10, color: '#999' },
    detailInfo: { flex: 1, marginLeft: 16 },
    detailTitle: { fontSize: 15, fontWeight: 'bold', color: '#333' },
    detailDesc: { fontSize: 13, color: '#666', marginTop: 4, lineHeight: 18 },
    durationBadge: { backgroundColor: '#E8F0FE', paddingVertical: 2, paddingHorizontal: 6, borderRadius: 4, marginTop: 4 },
    durationText: { fontSize: 10, color: '#1A73E8', fontWeight: 'bold' },
    statusRow: { marginTop: 8 },
    statusTag: { fontSize: 10, fontWeight: 'bold', paddingVertical: 2, paddingHorizontal: 8, borderRadius: 4, alignSelf: 'flex-start' },
    approvedTag: { backgroundColor: '#E6F4EA', color: '#1E8E3E' },
    pendingTag: { backgroundColor: '#FEF7E0', color: '#B06000' },
    rejectedTag: { backgroundColor: '#FCE8E6', color: '#D93025' },
    emptyText: { textAlign: 'center', marginTop: 40, color: '#999' },
    modalSubTitle: { fontSize: 12, color: '#666', marginTop: 2 },
    closeBtn: { padding: 4 },
    dayLeaveRow: { paddingVertical: 12 },
    dayLeaveHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    userSection: { flexDirection: 'row', alignItems: 'center' },
    userNameText: { fontSize: 14, fontWeight: 'bold', color: '#333' },
    userRoleText: { fontSize: 11, color: '#888' },
    typeBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, borderWidth: 1 },
    typeBadgeText: { fontSize: 10, fontWeight: 'bold' },
    dayLeaveBody: { backgroundColor: '#F8F9FA', padding: 12, borderRadius: 8 },
    dayLeaveTitle: { fontSize: 13, fontWeight: '600', color: '#444' },
    dayLeaveDesc: { fontSize: 12, color: '#666', marginTop: 4, fontStyle: 'italic' },
    dayLeaveFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
    durationTag: { flexDirection: 'row', alignItems: 'center' },
    durationTagText: { fontSize: 11, color: '#666', marginLeft: 4 },
    statusMiniTag: { fontSize: 10, fontWeight: 'bold', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    separator: { height: 1, backgroundColor: '#EEE', marginVertical: 8 },
    addMoreBtn: {
        flexDirection: 'row',
        backgroundColor: '#1A73E8',
        padding: 12,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 15
    },
    addMoreBtnText: { color: '#FFF', fontWeight: 'bold', marginLeft: 8 },
    snackbarContainer: {
        position: 'absolute',
        top: 20, // Positioned at the very top
        left: 20,
        right: 20,
        zIndex: 1000,
        alignItems: 'center',
    },
    snackbar: {
        flexDirection: 'row',
        backgroundColor: '#1A73E8',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
    },
    snackbarText: {
        color: '#FFF',
        fontSize: 14,
        flex: 1,
        marginRight: 10,
    },
    userFilterContainer: { paddingVertical: 10, backgroundColor: '#FAFAFA', borderBottomWidth: 1, borderBottomColor: '#EEE' },
    userFilterItem: { marginRight: 15, position: 'relative' },
    userFilterItemSelected: {}, // Style if needed
    avatarBorder: { padding: 2, borderRadius: 20, borderWidth: 2, borderColor: 'transparent' },
    avatarBorderSelected: { borderColor: '#1A73E8' },
    badge: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        backgroundColor: '#1A73E8',
        width: 16,
        height: 16,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#FFF'
    },
    badgeHidden: { display: 'none' }
});

export default LeaveCalendarScreen;
