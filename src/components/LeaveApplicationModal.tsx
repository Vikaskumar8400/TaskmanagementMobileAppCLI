import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TextInput, TouchableOpacity, ScrollView, Alert, Switch, ActivityIndicator, FlatList } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { Calendar } from 'react-native-calendars';
import { addLeaveEvent, getTaskAllTaskUser, getChoicesFromField } from '../Service/service';
import UserAvatar from './UserAvatar'; // Assuming UserAvatar component exists or we can just show text

interface LeaveApplicationModalProps {
    visible: boolean;
    onClose: () => void;
    selectedDate: string;
    spToken: string;
    onSuccess: () => void;
}

// code by vikas calender
const LeaveApplicationModal = ({ visible, onClose, selectedDate, spToken, onSuccess }: LeaveApplicationModalProps) => {
    const [title, setTitle] = useState(''); // Short Description
    const [description, setDescription] = useState('');
    const [leaveType, setLeaveType] = useState('Un-Planned');
    const [startDate, setStartDate] = useState(selectedDate);
    const [endDate, setEndDate] = useState(selectedDate);
    const [isAllDay, setIsAllDay] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Half Day
    const [firstHalf, setFirstHalf] = useState(false);
    const [secondHalf, setSecondHalf] = useState(false);

    // Dynamic Options
    const [leaveTypeOptions, setLeaveTypeOptions] = useState<string[]>([]);
    const [designationOptions, setDesignationOptions] = useState<string[]>([]);
    const [team, setTeam] = useState(''); // Designation
    const [showLeaveTypeDropdown, setShowLeaveTypeDropdown] = useState(false);
    const [showDesignationDropdown, setShowDesignationDropdown] = useState(false);

    // User Selection
    const [allUsers, setAllUsers] = useState<any[]>([]);
    const [filteredUsers, setFilteredUsers] = useState<any[]>([]);
    const [searchText, setSearchText] = useState('');
    const [selectedUser, setSelectedUser] = useState<any>(null);
    const [showUserDropdown, setShowUserDropdown] = useState(false);
    const [leaveTypeSearch, setLeaveTypeSearch] = useState('');
    const [teamSearch, setTeamSearch] = useState('');

    // Date Picker
    const [isDatePickerVisible, setDatePickerVisible] = useState(false);
    const [datePickerTarget, setDatePickerTarget] = useState<'start' | 'end'>('start');

    useEffect(() => {
        if (visible) {
            fetchUsers();
            getChoices();
            setStartDate(selectedDate);
            setEndDate(selectedDate);
            // Reset half-day selections when modal opens
            setFirstHalf(false);
            setSecondHalf(false);
            // Reset designation
            setTeam('');
            // Reset leave type
            setLeaveType('Un-Planned');
            // Reset all day
            setIsAllDay(false);
        }
    }, [visible, selectedDate]);

    const getChoices = async () => {
        try {
            // Logic to determine list name based on siteUrl (simplified for now as per snippet)
            // const listTitle = props?.props?.siteUrl.toLowerCase().indexOf("gmbh") > -1 ? "Events" : "SmalsusLeaveCalendar";
            const listTitle = "SmalsusLeaveCalendar"; // Using default from snippet for now
            const siteUrl = "https://hhhhteams.sharepoint.com/sites/HHHH/SP";

            const lTypes = await getChoicesFromField(spToken, siteUrl, listTitle, "Event_x002d_Type");
            const dTypes = await getChoicesFromField(spToken, siteUrl, listTitle, "Designation");

            setLeaveTypeOptions(lTypes);
            setDesignationOptions(dTypes);
        } catch (e) {
            console.error("Error fetching choices", e);
        }
    };

    const fetchUsers = async () => {
        try {
            const users = await getTaskAllTaskUser(spToken);
            // Filter logic as per user snippet: UserGroupId != 295, 131, 147 etc.
            // Implemented basically to just get the list for now
            const validUsers = users.filter((u: any) => u.IsActive && u.Email);
            setAllUsers(validUsers);
        } catch (e) {
            console.error("Error fetching users", e);
        }
    };

    const handleSearchUser = (text: string) => {
        setSearchText(text);
        if (text.length > 0) {
            const filtered = allUsers.filter(u => u.Title.toLowerCase().includes(text.toLowerCase()));
            setFilteredUsers(filtered);
            setShowUserDropdown(true);
        } else {
            setFilteredUsers([]);
            setShowUserDropdown(false);
        }
    };

    const selectUser = (user: any) => {
        setSelectedUser(user);
        setSearchText(user.Title);
        setShowUserDropdown(false);
    };

    const HandledLeaveType = (option: string) => {
        setLeaveType(option);
        setShowLeaveTypeDropdown(false);

        if (option === "Company Holiday" || option === "National Holiday") {
            setIsAllDay(true);
            setEndDate(startDate); // Sync dates for single day holidays usually? Or multi-day?
            setFirstHalf(false);
            setSecondHalf(false);
            // Assuming simplified logic: Holiday = All Day
        } else if (
            option !== "Planned Leave" &&
            option !== "Un-Planned" &&
            option !== "Sick" &&
            option !== "Restricted Holiday" &&
            option !== "Work From Home"
        ) {
            // Logic from snippet: "Only uncheck 'All Day' for other specific cases"
            setIsAllDay(false);
        } else {
            // keep current state or default?
        }
    };

    const handleAllDayToggle = (val: boolean) => {
        setIsAllDay(val);
        if (val) {
            setEndDate(startDate);
            setFirstHalf(false);
            setSecondHalf(false);
        }
    };

    const handleDateSelect = (day: any) => {
        if (datePickerTarget === 'start') {
            setStartDate(day.dateString);
            // Auto update end date if it's before start date or if it's an all-day event
            if (isAllDay || new Date(day.dateString) > new Date(endDate)) {
                setEndDate(day.dateString);
            }
        } else {
            // Ensure end date is not before start date
            if (new Date(day.dateString) < new Date(startDate)) {
                Alert.alert("Invalid Date", "End date cannot be before start date.");
                setEndDate(startDate); // Reset to start date if invalid
            } else {
                setEndDate(day.dateString);
            }
        }
        setDatePickerVisible(false);
    };

    const handleSave = async () => {
        if (!title) {
            Alert.alert("Required", "Please provide a short description");
            return;
        }
        if (!selectedUser && !searchText) {
            Alert.alert("Required", "Please select a person");
            return;
        }
        if (!leaveType) {
            Alert.alert("Required", "Please select a leave type");
            return;
        }
        if (!team) {
            Alert.alert("Required", "Please select a team/designation");
            return;
        }
        if (!isAllDay && (firstHalf && secondHalf)) {
            Alert.alert("Invalid Selection", "Cannot select both first half and second half for a non-all-day event.");
            return;
        }
        if (!isAllDay && !(firstHalf || secondHalf) && startDate === endDate) {
            Alert.alert("Invalid Selection", "For a single day non-all-day event, please select either first half or second half.");
            return;
        }

        setIsSubmitting(true);
        try {
            const siteUrl = "https://hhhhteams.sharepoint.com/sites/HHHH/SP";

            // Logic to determine employee ID
            const employeeId = selectedUser?.AssingedToUserId || selectedUser?.Id; // Fallback

            const userName = selectedUser?.Title || searchText || "";
            const combinedTitle = `${userName}-${leaveType}-${title}`;

            const eventData = {
                Title: combinedTitle,
                Description: description,
                EventDate: new Date(startDate).toISOString(),
                EndDate: new Date(endDate).toISOString(),
                fAllDayEvent: isAllDay,
                Event_x002d_Type: leaveType,
                EmployeeId: employeeId, // Save linked employee
                EventType: 0,
                Designation: team, // Saving Team/Designation
                HalfDay: firstHalf, // Saving Half Day flags
                HalfDayTwo: secondHalf
                // Additional Metadata for Leave
                // RecurrenceData if needed based on recurrence
            };

            await addLeaveEvent(spToken, siteUrl, eventData);
            Alert.alert("Success", "Leave applied successfully");
            onSuccess();
            onClose();
        } catch (error: any) {
            Alert.alert("Error", error.message || "Failed to save leave");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={styles.modalContainer}>
                <View style={styles.modalContent}>
                    <View style={styles.header}>
                        <Text style={styles.headerTitle}>Calendar</Text>
                        <TouchableOpacity onPress={onClose}>
                            <Ionicons name="close" size={24} color="#666" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" nestedScrollEnabled={true}>
                        <Text style={styles.label}>Select People *</Text>
                        <View>
                            <TextInput
                                style={styles.input}
                                placeholder="Enter names..."
                                value={searchText}
                                onChangeText={handleSearchUser}
                            />
                            {showUserDropdown && filteredUsers.length > 0 && (
                                <View style={styles.dropdownList}>
                                    {filteredUsers.map(u => (
                                        <TouchableOpacity key={u.Id} style={styles.dropdownItem} onPress={() => selectUser(u)}>
                                            <Text>{u.Title}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}
                        </View>

                        <Text style={styles.label}>Short Description *</Text>
                        <TextInput
                            style={styles.input}
                            value={title}
                            onChangeText={setTitle}
                            placeholder="Reason for leave"
                        />

                        <View style={styles.row}>
                            <View style={styles.col}>
                                <Text style={styles.label}>Start Date</Text>
                                <TouchableOpacity onPress={() => { setDatePickerTarget('start'); setDatePickerVisible(true); }}>
                                    <View style={styles.dateInput}>
                                        <Text>{startDate}</Text>
                                        <Ionicons name="calendar-outline" size={20} color="#666" />
                                    </View>
                                </TouchableOpacity>
                            </View>
                            <View style={styles.col}>
                                <Text style={styles.label}>End Date</Text>
                                <TouchableOpacity onPress={() => { setDatePickerTarget('end'); setDatePickerVisible(true); }}>
                                    <View style={styles.dateInput}>
                                        <Text>{endDate}</Text>
                                        <Ionicons name="calendar-outline" size={20} color="#666" />
                                    </View>
                                </TouchableOpacity>
                            </View>
                        </View>

                        <View style={styles.checkRow}>
                            <Switch value={isAllDay} onValueChange={handleAllDayToggle} />
                            <Text style={styles.checkLabel}>All Day Event</Text>
                        </View>

                        {!isAllDay && (
                            <View style={styles.halfDayContainer}>
                                <Text style={styles.label}>Select Half Day Event</Text>
                                <TouchableOpacity style={styles.checkBoxItem} onPress={() => setFirstHalf(!firstHalf)}>
                                    <Ionicons name={firstHalf ? "checkbox" : "square-outline"} size={20} color="#333" />
                                    <Text style={styles.checkLabel}>First Half Day</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.checkBoxItem} onPress={() => setSecondHalf(!secondHalf)}>
                                    <Ionicons name={secondHalf ? "checkbox" : "square-outline"} size={20} color="#333" />
                                    <Text style={styles.checkLabel}>Second Half Day</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        <View style={{ zIndex: 2000 }}>
                            <Text style={styles.label}>Leave Type *</Text>
                            <TouchableOpacity
                                style={styles.pickerFake}
                                onPress={() => {
                                    setShowLeaveTypeDropdown(!showLeaveTypeDropdown);
                                    setShowDesignationDropdown(false); // Close other
                                }}
                            >
                                <Text>{leaveType || "Select Leave Type"}</Text>
                                <Ionicons name="chevron-down" size={20} color="#666" />
                            </TouchableOpacity>

                            {showLeaveTypeDropdown && (
                                <View style={styles.pickerListAbsolute}>
                                    <TextInput
                                        style={styles.dropdownSearchInput}
                                        placeholder="Search leave type..."
                                        value={leaveTypeSearch}
                                        onChangeText={setLeaveTypeSearch}
                                    />
                                    <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 200 }}>
                                        {leaveTypeOptions.length > 0 ? (
                                            leaveTypeOptions
                                                .filter(opt => opt.toLowerCase().includes(leaveTypeSearch.toLowerCase()))
                                                .map((opt, index) => (
                                                    <TouchableOpacity key={index} style={styles.pickerItem} onPress={() => { HandledLeaveType(opt); setLeaveTypeSearch(''); }}>
                                                        <Text>{opt}</Text>
                                                    </TouchableOpacity>
                                                ))
                                        ) : (
                                            <Text style={styles.pickerItem}>Loading...</Text>
                                        )}
                                    </ScrollView>
                                </View>
                            )}
                        </View>

                        <View style={{ zIndex: 1000, marginTop: 10 }}>
                            <Text style={styles.label}>Team *</Text>
                            <TouchableOpacity
                                style={styles.pickerFake}
                                onPress={() => {
                                    setShowDesignationDropdown(!showDesignationDropdown);
                                    setShowLeaveTypeDropdown(false); // Close other
                                }}
                            >
                                <Text>{team || "Select Team"}</Text>
                                <Ionicons name="chevron-down" size={20} color="#666" />
                            </TouchableOpacity>

                            {showDesignationDropdown && (
                                <View style={styles.pickerListAbsolute}>
                                    <TextInput
                                        style={styles.dropdownSearchInput}
                                        placeholder="Search team..."
                                        value={teamSearch}
                                        onChangeText={setTeamSearch}
                                    />
                                    <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 200 }}>
                                        {designationOptions.length > 0 ? (
                                            designationOptions
                                                .filter(opt => opt.toLowerCase().includes(teamSearch.toLowerCase()))
                                                .map((opt, index) => (
                                                    <TouchableOpacity key={index} style={styles.pickerItem} onPress={() => { setTeam(opt); setShowDesignationDropdown(false); setTeamSearch(''); }}>
                                                        <Text>{opt}</Text>
                                                    </TouchableOpacity>
                                                ))
                                        ) : (
                                            <Text style={styles.pickerItem}>Loading...</Text>
                                        )}
                                    </ScrollView>
                                </View>
                            )}
                        </View>


                        <Text style={styles.label}>Description</Text>
                        <TextInput
                            style={[styles.input, styles.textArea]}
                            multiline
                            numberOfLines={4}
                            value={description}
                            onChangeText={setDescription}
                        />

                    </ScrollView>

                    <View style={styles.footer}>
                        <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                            <Text style={styles.cancelText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={isSubmitting}>
                            {isSubmitting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>Save</Text>}
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Date Picker Modal */}
                <Modal visible={isDatePickerVisible} transparent animationType="fade" onRequestClose={() => setDatePickerVisible(false)}>
                    <View style={styles.datePickerOverlay}>
                        <View style={styles.datePickerContent}>
                            <Calendar
                                current={datePickerTarget === 'start' ? startDate : endDate}
                                onDayPress={handleDateSelect}
                                theme={{
                                    selectedDayBackgroundColor: '#1967D2',
                                    todayTextColor: '#1967D2',
                                    arrowColor: '#1967D2',
                                }}
                            />
                            <TouchableOpacity style={styles.closePickerBtn} onPress={() => setDatePickerVisible(false)}>
                                <Text style={styles.closePickerText}>Cancel</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Modal>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', padding: 0 },
    modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '90%' },
    header: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderColor: '#eee' },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#1967D2' },
    body: { padding: 16 },
    label: { fontSize: 14, fontWeight: '600', color: '#333', marginTop: 12, marginBottom: 4 },
    input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 8, fontSize: 14 },
    dateInput: { borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    textArea: { height: 80, textAlignVertical: 'top' },
    row: { flexDirection: 'row', justifyContent: 'space-between' },
    col: { width: '48%' },
    checkRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
    checkLabel: { marginLeft: 8 },
    halfDayContainer: { marginBottom: 16 },
    checkBoxItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    pickerFake: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 12, marginBottom: 10, backgroundColor: '#f9f9f9' },
    pickerListAbsolute: {
        position: 'absolute',
        top: '100%',
        left: 0,
        right: 0,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#eee',
        borderRadius: 4,
        maxHeight: 150,
        zIndex: 1000,
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    pickerItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
    footer: { flexDirection: 'row', justifyContent: 'flex-end', padding: 16, borderTopWidth: 1, borderColor: '#eee' },
    cancelBtn: { marginRight: 10, padding: 10 },
    cancelText: { color: '#666' },
    saveBtn: { backgroundColor: '#1A73E8', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 4 },
    saveText: { color: '#FFF', fontWeight: 'bold' },
    dropdownList: { borderWidth: 1, borderColor: '#ccc', borderTopWidth: 0, maxHeight: 150, padding: 5, backgroundColor: '#FFF', position: 'absolute', top: 45, width: '100%', zIndex: 10 },
    dropdownItem: { padding: 10, borderBottomWidth: 1, borderBottomColor: '#eee' },
    datePickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    datePickerContent: { backgroundColor: '#FFF', borderRadius: 8, padding: 20, width: '90%' },
    closePickerBtn: { marginTop: 10, alignItems: 'center', padding: 10 },
    closePickerText: { color: '#1967D2', fontWeight: 'bold' },
    dropdownSearchInput: {
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        padding: 10,
        fontSize: 14,
        backgroundColor: '#f5f5f5'
    }
});

export default LeaveApplicationModal;
