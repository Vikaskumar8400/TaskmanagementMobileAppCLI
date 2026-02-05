import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, TextInput, FlatList, Image, Alert, Platform } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Share from 'react-native-share';
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear, subYears, isWithinInterval, parseISO, differenceInDays, isWeekend, eachDayOfInterval } from 'date-fns';
import { getTaskAllTaskUser, getLeaveEventsResult } from '../Service/service';
import { useAuth } from '../context/AuthContext';
import UserAvatar from './UserAvatar';

interface LeaveReportModalProps {
    visible: boolean;
    onClose: () => void;
    events: any[]; // Optionally filtered by caller, but we might fetch all if needed
}

// code by vikas calender
const LeaveReportModal = ({ visible, onClose, events }: LeaveReportModalProps) => {
    const [view, setView] = useState<'filter' | 'report'>('filter');
    const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-01'));
    const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [selectedDateOption, setSelectedDateOption] = useState('This Month');

    // Team Members
    const [teamMembers, setTeamMembers] = useState<any[]>([]);
    const [selectedMemberIds, setSelectedMemberIds] = useState<number[]>([]);
    const [selectAllMembers, setSelectAllMembers] = useState(false);

    // Processed Data
    const [reportData, setReportData] = useState<any[]>([]);

    const { spToken } = useAuth();
    const siteUrl = "https://hhhhteams.sharepoint.com/sites/HHHH/SP";
    const [allLeaves, setAllLeaves] = useState<any[]>([]);
    const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [showLeftArrow, setShowLeftArrow] = useState(false);
    const [showRightArrow, setShowRightArrow] = useState(true);

    useEffect(() => {
        if (visible) {
            setView('filter');
        }
        if (visible && spToken) {
            getTaskAllTaskUser(spToken).then(users => {
                const activeers = users.filter((u: any) =>
                    u.IsActive &&
                    u.Company === 'Smalsus' &&
                    u.UserGroup?.Title !== "Ex Staff" &&
                    u.UserGroupId !== null &&
                    u.UserGroupId !== undefined
                );
                setTeamMembers(activeers);
            });
            getLeaveEventsResult(spToken, siteUrl).then(data => {
                setAllLeaves(data || []);
            });
        }
    }, [visible, spToken, siteUrl]);

    const filteredMembers = teamMembers.filter(m =>
        m.Title?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleDateOption = (option: string) => {
        setSelectedDateOption(option);
        const today = new Date();
        let start = new Date();
        let end = new Date();

        switch (option) {
            case 'Today':
                // defaults are today
                break;
            case 'Yesterday':
                start = subDays(today, 1);
                end = subDays(today, 1);
                break;
            case 'This Week':
                start = startOfWeek(today, { weekStartsOn: 1 });
                end = endOfWeek(today, { weekStartsOn: 1 });
                break;
            case 'Last Week':
                start = startOfWeek(subDays(today, 7), { weekStartsOn: 1 });
                end = endOfWeek(subDays(today, 7), { weekStartsOn: 1 });
                break;
            case 'This Month':
                start = startOfMonth(today);
                end = endOfMonth(today);
                break;
            case 'Last Month':
                start = startOfMonth(subMonths(today, 1));
                end = endOfMonth(subMonths(today, 1));
                break;
            case 'This Year':
                start = startOfYear(today);
                end = endOfYear(today);
                break;
            case 'Last Year':
                start = startOfYear(subYears(today, 1));
                end = endOfYear(subYears(today, 1));
                break;
            default:
                break;
        }

        if (option !== 'Custom') {
            setStartDate(format(start, 'yyyy-MM-dd'));
            setEndDate(format(end, 'yyyy-MM-dd'));
        }
    };

    const toggleMember = (id: number) => {
        setSelectedMemberIds(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);
        setSearchQuery('');
    };

    const toggleSelectAll = () => {
        if (selectAllMembers) {
            setSelectedMemberIds([]);
        } else {
            setSelectedMemberIds(teamMembers.map(m => m.AssingedToUserId || m.Id));
        }
        setSelectAllMembers(!selectAllMembers);
    };

    const getDurationExcludingWeekends = (startDate: string, endDate: string, isHalfDay: boolean, isAllDay: boolean) => {
        try {
            const start = parseISO(startDate);
            let end = parseISO(endDate);

            // SharePoint All Day Events end at midnight of the NEXT day.
            // For duration/display, we need the actual last day of the leave.
            if (isAllDay) {
                end = subDays(end, 1);
            }

            const days = eachDayOfInterval({ start, end });
            const workingDays = days.filter(day => !isWeekend(day)).length;
            return workingDays * (isHalfDay ? 0.5 : 1);
        } catch (e) {
            return 0;
        }
    };

    const generateReport = () => {
        const start = parseISO(startDate);
        const end = subDays(parseISO(endDate), -1); // inclusive of end day

        const summaryData = teamMembers
            .filter(member => selectedMemberIds.length === 0 || selectedMemberIds.includes(member.AssingedToUserId || member.Id))
            .map(member => {
                const memberId = member.Id;
                const spUserId = member.AssingedToUserId;
                const memberTitle = (member.Title || "").toLowerCase().trim();

                const memberLeaves = allLeaves.filter(leave => {
                    if (!leave.EventDate) return false;
                    const lDate = parseISO(leave.EventDate);

                    // Filter out test leaves
                    const titleText = (leave.Title || "").toLowerCase();
                    const descText = (leave.Description || "").toLowerCase();
                    if (titleText.includes("test") || descText.includes("test")) return false;

                    // Match by Employee ID
                    const employeeIdInLeave = leave.Employee?.Id || leave.EmployeeId || leave.AuthorId;
                    const employeeTitleInLeave = (leave.Employee?.Title || "").toLowerCase().trim();
                    const authorTitleInLeave = (leave.Author?.Title || "").toLowerCase().trim();

                    const isForMember =
                        (employeeIdInLeave == memberId) ||
                        (employeeIdInLeave == spUserId) ||
                        (employeeTitleInLeave === memberTitle) ||
                        (authorTitleInLeave === memberTitle);

                    const inRange = isWithinInterval(lDate, { start, end });
                    return isForMember && inRange;
                });

                let planned = 0;
                let unplanned = 0;
                let rh = 0;
                let halfDayCount = 0;
                let totalLeaveValue = 0;

                const groups: any = {
                    'Planned': [],
                    'Un-planned': [],
                    'Restricted Holiday': [],
                    'Half-Day': []
                };

                memberLeaves.forEach(leave => {
                    const type = leave.Event_x002d_Type || '';
                    const typeLower = type.toLowerCase();
                    const isHalfDay = leave.HalfDay || leave.HalfDayTwo;
                    const isAllDay = !!leave.fAllDayEvent;
                    const duration = getDurationExcludingWeekends(leave.EventDate, leave.EndDate, isHalfDay, isAllDay);

                    const isRH = typeLower.includes('restricted');
                    const isUnplanned = typeLower.includes('un-planned') || typeLower.includes('unplanned') || typeLower.includes('sick');
                    const isPlanned = !isUnplanned && typeLower.includes('planned');

                    let displayEndDate = parseISO(leave.EndDate);
                    if (isAllDay) {
                        displayEndDate = subDays(displayEndDate, 1);
                    }

                    const detail = {
                        startDate: format(parseISO(leave.EventDate), 'dd/MM/yyyy'),
                        endDate: format(displayEndDate, 'dd/MM/yyyy'),
                        description: (leave.Description ? leave.Description.replace(/<[^>]*>?/gm, '').trim() : (leave.Title || '').split('-').pop()?.trim() || ''),
                        status: leave.Approved ? 'Approved' : (leave.Rejected ? 'Rejected' : 'Pending'),
                        duration: duration // Add duration for excel
                    };

                    if (isHalfDay) {
                        halfDayCount++;
                        groups['Half-Day'].push(detail);
                        if (!isRH) {
                            totalLeaveValue += duration;
                        }
                    }

                    if (isPlanned) {
                        planned += duration;
                        if (!isHalfDay) {
                            groups['Planned'].push(detail);
                            totalLeaveValue += duration;
                        }
                    } else if (isUnplanned) {
                        unplanned += duration;
                        if (!isHalfDay) {
                            // Ensure description and date are shown in "Un-planned" section
                            groups['Un-planned'].push(detail);
                            totalLeaveValue += duration;
                        }
                    } else if (isRH) {
                        rh += duration;
                        if (!isHalfDay) {
                            groups['Restricted Holiday'].push(detail);
                        }
                    }
                });

                return {
                    id: member.Id,
                    name: member.Title,
                    planned,
                    unplanned,
                    rh,
                    halfDay: halfDayCount,
                    total: totalLeaveValue,
                    groups: Object.keys(groups).map(key => ({
                        title: key,
                        count: key === 'Half-Day' ? halfDayCount : (key === 'Planned' ? planned : (key === 'Un-planned' ? unplanned : rh)),
                        data: groups[key]
                    })).filter(g => g.data.length > 0)
                };
            });

        setReportData(summaryData);
        setView('report');
    };

    const downloadExcel = async () => {
        if (reportData.length === 0) {
            Alert.alert("Report", "No data available to export");
            return;
        }

        // CSV Header optimized to match the summary table columns in the image + details
        let csv = "Name,Planned,Unplanned,Restricted Holiday,Half-Day,Total Leave,Leave Type,Start Date,End Date,Duration,Status,Description\n";

        reportData.forEach(member => {
            member.groups.forEach((group: any) => {
                group.data.forEach((leave: any) => {
                    const cleanDesc = (leave.description || "").replace(/"/g, '""').replace(/\n/g, ' ');

                    // Row with summary data followed by leave details
                    csv += `"${member.name || ''}","${member.planned || 0}","${member.unplanned || 0}","${member.rh || 0}","${member.halfDay || 0}","${member.total || 0}","${group.title || ''}","${leave.startDate || ''}","${leave.endDate || ''}","${leave.duration || 0}","${leave.status || ''}","${cleanDesc}"\n`;
                });
            });

            if (member.groups.length === 0) {
                csv += `"${member.name || ''}","${member.planned || 0}","${member.unplanned || 0}","${member.rh || 0}","${member.halfDay || 0}","${member.total || 0}","No Leave","","","0","",""\n`;
            }
        });

        const utf8ToBase64 = (str: string) => {
            const base64Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
            let result = "";
            let i = 0;
            // Handle UTF-8
            const utf8Str = unescape(encodeURIComponent(str));
            while (i < utf8Str.length) {
                const a = utf8Str.charCodeAt(i++) || 0;
                const b = utf8Str.charCodeAt(i++) || 0;
                const c = utf8Str.charCodeAt(i++) || 0;

                const b1 = (a >> 2) & 0x3F;
                const b2 = ((a & 0x03) << 4) | ((b >> 4) & 0x0F);
                const b3 = ((b & 0x0F) << 2) | ((c >> 6) & 0x03);
                const b4 = c & 0x3F;

                result += base64Chars.charAt(b1) + base64Chars.charAt(b2) +
                    (i > utf8Str.length + 1 ? "=" : base64Chars.charAt(b3)) +
                    (i > utf8Str.length ? "=" : base64Chars.charAt(b4));
            }
            return result;
        };

        try {
            const base64Data = utf8ToBase64(csv);
            const url = `data:text/csv;base64,${base64Data}`;

            await Share.open({
                url: url,
                filename: 'LeaveReport.csv',
                title: 'Employee Leave Report',
                type: 'text/csv',
                saveToFiles: true,
            });
        } catch (error: any) {
            if (error && error.message !== 'User did not share') {
                console.error("Export Error", error);
                Alert.alert("Export", "Could not export the report. Please ensure storage permissions are granted.");
            }
        }
    };

    const RadioOption = ({ label }: { label: string }) => (
        <TouchableOpacity style={styles.radioContainer} onPress={() => handleDateOption(label)}>
            <Ionicons
                name={selectedDateOption === label ? "radio-button-on" : "radio-button-off"}
                size={20}
                color="#1A73E8"
            />
            <Text style={styles.radioLabel}>{label}</Text>
        </TouchableOpacity>
    );

    const renderFilterView = () => (
        <ScrollView contentContainerStyle={styles.body}>
            <View style={styles.teamSection}>
                <View style={styles.teamHeader}>
                    <Text style={styles.sectionTitle}>Team members</Text>
                    <TouchableOpacity style={styles.selectAllBtn} onPress={toggleSelectAll}>
                        <Ionicons name={selectAllMembers ? "checkbox" : "square-outline"} size={20} color="#1A73E8" />
                        <Text style={styles.selectAllText}>Select All</Text>
                    </TouchableOpacity>
                </View>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.selectedMembersList}
                    contentContainerStyle={styles.selectedMembersContent}
                >
                    {teamMembers.filter(m => selectedMemberIds.includes(m.AssingedToUserId || m.Id)).map(m => (
                        <View key={m.Id} style={styles.memberChip}>
                            <Text style={styles.chipText}>{m.Title}</Text>
                            <TouchableOpacity onPress={() => toggleMember(m.AssingedToUserId || m.Id)} style={styles.chipRemoveBtn}>
                                <Ionicons name="close-circle" size={16} color="#1A73E8" />
                            </TouchableOpacity>
                        </View>
                    ))}
                </ScrollView>
                <TextInput
                    style={[styles.input, { marginBottom: 10 }]}
                    placeholder="Search member..."
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                />
                <View style={{ position: 'relative' }}>
                    {/* Left Scroll Arrow */}
                    {showLeftArrow && (
                        <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, justifyContent: 'center', zIndex: 10, paddingLeft: 5 }}>
                            <Ionicons name="chevron-back" size={14} color="#666" style={{ backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 12 }} />
                        </View>
                    )}

                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.teamList}
                        onScroll={(event) => {
                            const offsetX = event.nativeEvent.contentOffset.x;
                            const contentWidth = event.nativeEvent.contentSize.width;
                            const layoutWidth = event.nativeEvent.layoutMeasurement.width;

                            setShowLeftArrow(offsetX > 0);
                            setShowRightArrow(offsetX + layoutWidth < contentWidth - 5); // tolerance
                        }}
                        scrollEventThrottle={16}
                    >
                        {filteredMembers.map(m => (
                            <TouchableOpacity key={m.Id} onPress={() => toggleMember(m.AssingedToUserId || m.Id)} style={[styles.avatarItem]}>
                                <View style={{ alignItems: 'center', width: 60 }}>
                                    <UserAvatar
                                        user={m}
                                        spToken={spToken}
                                        isSelected={selectedMemberIds.includes(m.AssingedToUserId || m.Id)}
                                        size={45}
                                    />
                                    <Text style={styles.avatarName} numberOfLines={1}>{m.Title?.split(' ')[0]}</Text>
                                </View>
                            </TouchableOpacity>
                        ))}
                        {filteredMembers.length === 0 && <Text style={{ fontSize: 12, color: '#999', padding: 10 }}>No members found</Text>}
                    </ScrollView>

                    {/* Right Scroll Arrow */}
                    {showRightArrow && (
                        <View style={{ position: 'absolute', right: 0, top: 0, bottom: 0, justifyContent: 'center', zIndex: 10, paddingRight: 5 }}>
                            <Ionicons name="chevron-forward" size={14} color="#666" style={{ backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 12 }} />
                        </View>
                    )}
                </View>
            </View>

            <Text style={styles.sectionTitle}>Date</Text>
            <View style={styles.radioGroup}>
                <RadioOption label="Custom" />
                <RadioOption label="Today" />
                <RadioOption label="Yesterday" />
                <RadioOption label="This Week" />
                <RadioOption label="Last Week" />
                <RadioOption label="This Month" />
                <RadioOption label="Last Month" />
                <RadioOption label="This Year" />
                <RadioOption label="Last Year" />
            </View>

            <View style={styles.dateRow}>
                <View style={styles.dateCol}>
                    <Text style={styles.label}>Start Date</Text>
                    <TextInput style={styles.input} value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD" />
                </View>
                <View style={styles.dateCol}>
                    <Text style={styles.label}>End Date</Text>
                    <TextInput style={styles.input} value={endDate} onChangeText={setEndDate} placeholder="YYYY-MM-DD" />
                </View>
            </View>

            <TouchableOpacity style={styles.submitBtn} onPress={generateReport}>
                <Text style={styles.submitText}>Submit</Text>
            </TouchableOpacity>
        </ScrollView>
    );

    const renderReportView = () => (
        <View style={{ flex: 1 }}>
            <View style={styles.reportHeader}>
                <Text style={styles.reportTitle}>Monthly Report of Leave</Text>
                <TouchableOpacity style={styles.excelBtn} onPress={downloadExcel}>
                    <Ionicons name="download-outline" size={16} color="#4472c4" />
                    <Text style={[styles.excelBtnText, { color: '#4472c4' }]}>Download Excel</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.tableWrapper}>
                <View style={styles.tableHeader}>
                    <View style={{ width: 40 }} />
                    <Text style={[styles.th, { flex: 2 }]}>Name</Text>
                    <Text style={[styles.th, { flex: 1, textAlign: 'center' }]}>PL</Text>
                    <Text style={[styles.th, { flex: 1, textAlign: 'center' }]}>UL</Text>
                    <Text style={[styles.th, { flex: 1, textAlign: 'center' }]}>RH</Text>
                    <Text style={[styles.th, { flex: 1, textAlign: 'center' }]}>HD</Text>
                    <Text style={[styles.th, { flex: 1, textAlign: 'center' }]}>Total</Text>
                </View>

                <FlatList
                    data={reportData}
                    keyExtractor={(item) => item.id.toString()}
                    renderItem={({ item, index }) => (
                        <View style={styles.rowContainer}>
                            <TouchableOpacity
                                style={styles.tableRow}
                                onPress={() => setExpandedIndex(expandedIndex === index ? null : index)}
                            >
                                <View style={{ width: 40, alignItems: 'center' }}>
                                    <Ionicons name={expandedIndex === index ? "chevron-down" : "chevron-forward"} size={16} color="#666" />
                                </View>
                                <Text style={[styles.td, { flex: 2, color: '#34528d' }]}>{item.name}</Text>
                                <Text style={[styles.td, { flex: 1, textAlign: 'center' }]}>{item.planned}</Text>
                                <Text style={[styles.td, { flex: 1, textAlign: 'center' }]}>{item.unplanned}</Text>
                                <Text style={[styles.td, { flex: 1, textAlign: 'center' }]}>{item.rh}</Text>
                                <Text style={[styles.td, { flex: 1, textAlign: 'center' }]}>{item.halfDay}</Text>
                                <Text style={[styles.td, { flex: 1, textAlign: 'center', fontWeight: 'bold' }]}>{item.total}</Text>
                            </TouchableOpacity>

                            {expandedIndex === index && (
                                <View style={styles.expandedContent}>
                                    {item.groups.map((group: any, gIdx: number) => (
                                        <View key={gIdx} style={styles.groupSection}>
                                            <View style={styles.groupHeader}>
                                                <Text style={styles.groupHeaderText}>{group.title}: {group.count}</Text>
                                            </View>
                                            <View style={styles.groupTable}>
                                                <View style={styles.groupTableHeader}>
                                                    <Text style={[styles.gth, { flex: 1.5 }]}>Start Date</Text>
                                                    <Text style={[styles.gth, { flex: 1.5 }]}>End Date</Text>
                                                    <Text style={[styles.gth, { flex: 3 }]}>Description</Text>
                                                    <Text style={[styles.gth, { flex: 1 }]}>Status</Text>
                                                </View>
                                                {group.data.map((d: any, dIdx: number) => (
                                                    <View key={dIdx} style={styles.groupTableRow}>
                                                        <Text style={[styles.gtd, { flex: 1.5 }]}>{d.startDate}</Text>
                                                        <Text style={[styles.gtd, { flex: 1.5 }]}>{d.endDate}</Text>
                                                        <Text style={[styles.gtd, { flex: 3 }]}>{d.description}</Text>
                                                        <Text style={[styles.gtd, { flex: 1 }]}>{d.status}</Text>
                                                    </View>
                                                ))}
                                            </View>
                                        </View>
                                    ))}
                                </View>
                            )}
                        </View>
                    )}
                    ListEmptyComponent={<Text style={{ padding: 20, textAlign: 'center' }}>No records found</Text>}
                />
            </View>
        </View>
    );

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={styles.modalContainer}>
                <View style={styles.modalContent}>
                    <View style={styles.header}>
                        <Text style={styles.headerTitle}>Employee Leave Report</Text>
                        <TouchableOpacity onPress={onClose}>
                            <Ionicons name="close" size={24} color="#666" />
                        </TouchableOpacity>
                    </View>

                    {view === 'filter' ? renderFilterView() : renderReportView()}
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', padding: 0 },
    modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 16, borderTopRightRadius: 16, height: '90%', paddingBottom: 10 },
    header: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderColor: '#eee' },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#1967D2' },
    body: { padding: 16 },
    sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 10, marginTop: 10 },
    label: { fontSize: 14, color: '#333', marginTop: 10 },
    input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 8, marginTop: 4 },
    submitBtn: { backgroundColor: '#1A73E8', padding: 12, borderRadius: 4, marginTop: 20, alignItems: 'center' },
    submitText: { color: '#FFF', fontWeight: 'bold' },
    reportHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, alignItems: 'center' },
    reportTitle: { fontSize: 16, fontWeight: 'bold', color: '#1967D2' },
    excelBtn: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#1967D2', padding: 6, borderRadius: 4 },
    excelBtnText: { color: '#1967D2', marginLeft: 4, fontSize: 12 },
    avatarPlaceholder: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#eee', justifyContent: 'center', alignItems: 'center' },
    radioGroup: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 },
    radioContainer: { flexDirection: 'row', alignItems: 'center', width: '33%', marginBottom: 10 },
    radioLabel: { marginLeft: 6, color: '#333' },
    dateRow: { flexDirection: 'row', justifyContent: 'space-between' },
    dateCol: { width: '48%' },
    tableWrapper: { flex: 1, borderWidth: 1, borderColor: '#eee', margin: 10, borderRadius: 4 },
    tableHeader: { flexDirection: 'row', backgroundColor: '#f8f9fa', borderBottomWidth: 1, borderColor: '#eee', paddingVertical: 10 },
    th: { fontSize: 9, fontWeight: 'bold', color: '#444' },
    rowContainer: { borderBottomWidth: 1, borderColor: '#eee' },
    tableRow: { flexDirection: 'row', paddingVertical: 12, alignItems: 'center' },
    td: { fontSize: 11, color: '#666' },
    expandedContent: { backgroundColor: '#fcfcfc', padding: 10 },
    groupSection: { marginBottom: 15 },
    groupHeader: { backgroundColor: '#34528d', padding: 6, borderRadius: 4, alignSelf: 'flex-start', marginBottom: 8 },
    groupHeaderText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
    groupTable: { borderWidth: 1, borderColor: '#ddd', borderRadius: 4, backgroundColor: '#fff' },
    groupTableHeader: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#ddd', padding: 8 },
    gth: { fontSize: 10, fontWeight: 'bold', color: '#333' },
    groupTableRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#eee', padding: 8 },
    gtd: { fontSize: 10, color: '#444' },
    avatarName: { fontSize: 10, color: '#333', marginTop: 4, textAlign: 'center' },
    teamSection: { marginBottom: 10 },
    teamHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    selectAllBtn: { flexDirection: 'row', alignItems: 'center' },
    selectAllText: { color: '#1A73E8', marginLeft: 4 },
    teamList: { flexDirection: 'row', marginTop: 10, paddingBottom: 10 },
    avatarItem: { marginRight: 10, padding: 2 },
    backFilterBtn: { margin: 16, padding: 10, alignSelf: 'center' },
    backFilterText: { color: '#1A73E8' },
    selectedMembersList: { marginBottom: 8 },
    selectedMembersContent: { paddingVertical: 4 },
    memberChip: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F0F4FF',
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 6,
        marginRight: 8,
        borderWidth: 1,
        borderColor: '#E0E8F9',
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
    },
    chipText: {
        fontSize: 12,
        color: '#1A73E8',
        fontWeight: '600',
        marginRight: 4,
    },
    chipRemoveBtn: {
        marginLeft: 2,
    },
});

export default LeaveReportModal;
