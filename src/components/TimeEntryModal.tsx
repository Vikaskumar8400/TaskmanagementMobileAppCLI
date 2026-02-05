import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, TextInput, Platform, Dimensions, Image, Alert, ActivityIndicator } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { format, addDays, startOfWeek, isSameDay } from 'date-fns';
import UserAvatar from './UserAvatar';
import { saveTimeSpent, saveMultipleTimeSpent, deleteTimeEntry } from '../Service/service';


const CATEGORIES = [
    "Investigation", "Verification", "Development", "Design", "QA",
    "Implementation", "Support", "Coordination", "Preparation", "Conception",
    "Bug-Fixing", "Improvement", "Leave"
];

interface TimeEntryModalProps {
    visible: boolean;
    onClose: () => void;
    task: any;
    currentUser: any;
    teamMembers?: any[];
    spToken: any | null;
    taskImageSource?: any;
    initialEntry?: any; // Added for edit mode
}

const TimeEntryModal = ({ visible, onClose, task, currentUser, teamMembers = [], spToken, taskImageSource, initialEntry }: TimeEntryModalProps) => {
    const [activeTab, setActiveTab] = useState('Single Entry');
    const [selectedCategory, setSelectedCategory] = useState<string | null>('Preparation');
    const [showAllCategories, setShowAllCategories] = useState(false);
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [minutes, setMinutes] = useState(30);
    const [description, setDescription] = useState('');
    const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 })); // Monday start

    // code by vikas
    const [selectedDays, setSelectedDays] = useState<Date[]>([new Date()]);
    const [splitMethod, setSplitMethod] = useState<'Distribute Manually' | 'Split Equally' | 'Fixed Per Day'>('Distribute Manually');
    const [dayEntries, setDayEntries] = useState<any[]>([]);
    const [isAnyDatePickerVisible, setIsAnyDatePickerVisible] = useState(false);
    // code by vikas

    // User Selection State
    const [isUserSelectionVisible, setIsUserSelectionVisible] = useState(false);
    const [selectedUserForTimeEntry, setSelectedUserForTimeEntry] = useState<any>(currentUser);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [entryForUserSelection, setEntryForUserSelection] = useState<string | null>(null);

    // Pre-fill data if editing an existing entry
    useEffect(() => {
        if (visible) {
            // 1. Set Category from Task Title (Critical for Updates to find correct parent row)
            if (task?.Title && CATEGORIES.includes(task.Title)) {
                setSelectedCategory(task.Title);
            } else if (initialEntry?.Category && CATEGORIES.includes(initialEntry.Category)) {
                // Fallback if initialEntry has it clearly
                setSelectedCategory(initialEntry.Category);
            } else {
                // Default only if not found
                setSelectedCategory('Preparation');
            }

            if (initialEntry) {
                setMinutes(initialEntry.TaskTimeInMin || Math.round(parseFloat(initialEntry.TaskTime) * 60));
                setDescription(initialEntry.Description || '');

                // Parse Date
                if (initialEntry.TaskDate) {
                    const [day, month, year] = initialEntry.TaskDate.split('/');
                    const dateObj = new Date(Number(year), Number(month) - 1, Number(day));
                    setSelectedDate(dateObj);
                }

                // Set Selected User based on initialEntry
                if (initialEntry.AuthorId && teamMembers.length > 0) {
                    const foundUser = teamMembers.find(u =>
                        u.AssingedToUserId === initialEntry.AuthorId ||
                        u.Id === initialEntry.AuthorId ||
                        u.AuthorId === initialEntry.AuthorId
                    );
                    if (foundUser) {
                        setSelectedUserForTimeEntry(foundUser);
                    }
                }
            } else {
                // Reset defaults for new entry
                setMinutes(30);
                setDescription('');
                setSelectedDate(new Date());
                // Reset to current user or default passed user
                if (currentUser) {
                    setSelectedUserForTimeEntry(currentUser);
                }
            }
        }
    }, [visible, initialEntry, currentUser, teamMembers, task]);

    const canSelectUser = teamMembers && teamMembers.length > 1;

    const handleLogTime = async () => {
        console.log("handleLogTime: Button click detected");
        if (!selectedCategory) {
            Alert.alert("Required", "Please select a category");
            return;
        }

        setIsSubmitting(true);
        try {
            const resolvedSiteUrl = task.siteUrl?.Url || (typeof task.siteUrl === 'string' ? task.siteUrl : '');

            if (activeTab === 'Single Entry') {
                const finalUser = selectedUserForTimeEntry;
                const authorId = finalUser?.AssignedTo?.Id || finalUser?.AssingedToUser?.Id || finalUser?.AuthorId || finalUser?.Id || finalUser?.AssingedToUserId;
                console.log("authorId", authorId);
                console.log("currentUser", finalUser);
                if (!authorId) throw new Error("Could not determine user ID.");

                const userForService = {
                    AuthorId: authorId,
                    AuthorName: finalUser?.Title || finalUser?.AuthorName,
                    Company: finalUser?.Company || "HHHH",
                    AuthorImage: finalUser?.UserImage || finalUser?.AuthorImage || finalUser?.Item_x0020_Cover?.Url,
                };

                // Check for Category Change (Move Operation)
                if (initialEntry && initialEntry.Category && initialEntry.Category !== selectedCategory) {
                    console.log(`Moving entry from ${initialEntry.Category} to ${selectedCategory}`);
                    // 1. Delete from Old Category
                    await deleteTimeEntry(spToken, {
                        currentSiteUrl: resolvedSiteUrl,
                        siteType: task.siteType || "",
                        listName: "TaskTimeSheetListNew",
                        categoryTitle: initialEntry.Category,
                        taskId: task.Id,
                        currentUser: userForService,
                        entryId: initialEntry.id || initialEntry.ID || initialEntry.UniqueId,
                        parentListId: task.listId
                    });

                    // 2. Clear initialEntry ID so saveTimeSpent creates a NEW entry in the new category
                    // (We want it to be a new entry in the new list, not trying to update a non-existent one)
                    // But simplest is to treat it as a new creation in the new destination.
                }

                const isCategoryChanged = initialEntry && initialEntry.Category && initialEntry.Category !== selectedCategory;

                const saveParams = {
                    currentSiteUrl: resolvedSiteUrl,
                    siteType: task.siteType || "",
                    listName: "TaskTimeSheetListNew",
                    categoryTitle: selectedCategory,
                    taskId: task.Id,
                    date: selectedDate,
                    hours: hourValue,
                    description: description?.trim() || undefined,
                    currentUser: userForService,
                    parentListId: task.listId,
                    CreatedFrom: "OMT",
                    forceCreateNew: !initialEntry || isCategoryChanged, // Create new if not editing OR if moved
                    entryId: (!isCategoryChanged && (initialEntry?.id || initialEntry?.ID || initialEntry?.UniqueId)) || undefined
                };
                await saveTimeSpent(spToken, saveParams);
            } else {
                // code by vikas
                // Multiple Entries - Group by User
                const entriesWithUser = dayEntries.map(de => ({
                    ...de,
                    resolvedUser: de.user || selectedUserForTimeEntry
                }));

                // Group entries by user email (or some unique identifier)
                const entriesByUser: { [email: string]: { user: any, entries: any[] } } = {};

                entriesWithUser.forEach(entry => {
                    const userEmail = entry.resolvedUser?.Email || entry.resolvedUser?.Title; // Fallback to Title if Email missing
                    if (!entriesByUser[userEmail]) {
                        entriesByUser[userEmail] = {
                            user: entry.resolvedUser,
                            entries: []
                        };
                    }
                    entriesByUser[userEmail].entries.push(entry);
                });

                // Iterate over each user group and save
                const savePromises = Object.values(entriesByUser).map(async group => {
                    const finalUser = group.user;
                    const authorId = finalUser?.AssignedTo?.Id || finalUser?.AssingedToUser?.Id || finalUser?.AuthorId || finalUser?.Id || finalUser?.AssingedToUserId;

                    if (!authorId) {
                        console.warn("Skipping entry group due to missing AuthorId", finalUser);
                        return;
                    }

                    const userForService = {
                        AuthorId: authorId,
                        AuthorName: finalUser?.Title || finalUser?.AuthorName,
                        Company: finalUser?.Company || "HHHH",
                        AuthorImage: finalUser?.UserImage || finalUser?.AuthorImage || finalUser?.Item_x0020_Cover?.Url,
                    };

                    const groupEntriesToSave = group.entries.map(de => ({
                        date: de.date,
                        hours: de.minutes / 60,
                        description: de.description || description
                    }));

                    const multiParams = {
                        currentSiteUrl: resolvedSiteUrl,
                        siteType: task.siteType || "",
                        listName: "TaskTimeSheetListNew",
                        categoryTitle: selectedCategory,
                        taskId: task.Id,
                        entries: groupEntriesToSave,
                        currentUser: userForService,
                        parentListId: task.listId,
                        CreatedFrom: "OMT"
                    };

                    return saveMultipleTimeSpent(spToken, multiParams);
                });

                await Promise.all(savePromises);
                // code by vikas
            }

            Alert.alert("Success", "Time logged successfully");
            onClose();
        } catch (e: any) {
            console.error("handleLogTime Error:", e);
            Alert.alert("Error", e.message || "Failed to log time");
        } finally {
            setIsSubmitting(false);
        }
    };

    // Update selected user when currentUser changes or modal re-opens
    useEffect(() => {
        if (currentUser && !initialEntry) { // Only update if NOT editing
            setSelectedUserForTimeEntry(currentUser);
        }
    }, [currentUser, visible, initialEntry]);

    const hourValue = (minutes / 60).toFixed(2);

    const incrementTime = () => setMinutes(prev => prev + 15);
    const decrementTime = () => setMinutes(prev => Math.max(0, prev - 15));

    // Determine if we should show the pencil icon (is Team Lead or has members)
    const handleThisWeek = () => {
        setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
    };

    const handleNextWeek = () => {
        setWeekStart(addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 7));
    };

    const toggleDaySelection = (date: Date) => {
        setSelectedDays(prev => {
            const isSelected = prev.some(d => isSameDay(d, date));
            if (isSelected) {
                if (prev.length === 1) return prev; // Keep at least one
                return prev.filter(d => !isSameDay(d, date));
            } else {
                return [...prev, date].sort((a, b) => a.getTime() - b.getTime());
            }
        });
    };
    // code by vikas

    const renderWeekCalendar = () => {
        const days = [];
        // Only show Monday to Friday (5 days)
        for (let i = 0; i < 5; i++) {
            const date = addDays(weekStart, i);
            const dayOfWeek = date.getDay();

            // Skip if it's Saturday or Sunday (shouldn't happen with i < 5, but safety check)
            if (dayOfWeek === 0 || dayOfWeek === 6) continue;

            const isSelected = activeTab === 'Single Entry'
                ? isSameDay(date, selectedDate)
                : selectedDays.some(d => isSameDay(d, date));

            const isToday = isSameDay(date, new Date());
            days.push(
                <TouchableOpacity
                    key={i}
                    style={[styles.dateItem, isSelected && styles.selectedDateItem]}
                    onPress={() => activeTab === 'Single Entry' ? setSelectedDate(date) : toggleDaySelection(date)}
                    activeOpacity={0.7}
                >
                    <Text style={[styles.dayName, isSelected && styles.selectedDateText, isToday && !isSelected && styles.todayText]}>
                        {format(date, 'EEE')}
                    </Text>
                    <Text style={[styles.dayNumber, isSelected && styles.selectedDateText, isToday && !isSelected && styles.todayText]}>
                        {format(date, 'd')}
                    </Text>
                </TouchableOpacity>
            );
        }
        return (
            <View style={styles.calendarContainer}>
                <View style={styles.calendarHeader}>
                    <TouchableOpacity onPress={() => setWeekStart(addDays(weekStart, -7))}>
                        <Ionicons name="chevron-back" size={20} color="#5F6368" />
                    </TouchableOpacity>
                    <Text style={styles.monthTitle}>{format(weekStart, 'MMMM yyyy')}</Text>
                    <TouchableOpacity onPress={() => setWeekStart(addDays(weekStart, 7))}>
                        <Ionicons name="chevron-forward" size={20} color="#5F6368" />
                    </TouchableOpacity>
                </View>
                <View style={styles.daysRow}>
                    {days}
                </View>
                <TouchableOpacity
                    style={styles.anyDateButton}
                    onPress={() => setIsAnyDatePickerVisible(true)}
                >
                    <MaterialCommunityIcons name="calendar-month-outline" size={18} color="#1A73E8" />
                    <Text style={styles.anyDateText}>Any Date</Text>
                </TouchableOpacity>
            </View>
        );
    };

    const renderAnyDatePicker = () => {
        const today = new Date();
        const startOfMonthDate = new Date(weekStart.getFullYear(), weekStart.getMonth(), 1);
        const endOfMonthDate = new Date(weekStart.getFullYear(), weekStart.getMonth() + 1, 0);
        const daysInMonth = endOfMonthDate.getDate();

        const days = [];
        // Add empty spaces for days before the first of the month
        const firstDayOfWeek = startOfMonthDate.getDay(); // 0 is Sunday
        const offset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1; // Adjust to Monday start

        // Only add offset for weekdays (Mon-Fri)
        for (let i = 0; i < Math.min(offset, 5); i++) {
            days.push(<View key={`empty-${i}`} style={styles.pickerDateItem} />);
        }

        for (let i = 1; i <= daysInMonth; i++) {
            const date = new Date(weekStart.getFullYear(), weekStart.getMonth(), i);
            const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

            // Skip weekends completely - don't render them at all
            if (isWeekend) continue;

            const isSelected = selectedDays.some(d => isSameDay(d, date));

            days.push(
                <TouchableOpacity
                    key={i}
                    style={[
                        styles.pickerDateItem,
                        isSelected && styles.selectedPickerDateItem
                    ]}
                    onPress={() => toggleDaySelection(date)}
                >
                    <Text style={[
                        styles.pickerDateText,
                        isSelected && styles.selectedPickerDateText
                    ]}>{i}</Text>
                </TouchableOpacity>
            );
        }

        return (
            <Modal
                visible={isAnyDatePickerVisible}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setIsAnyDatePickerVisible(false)}
            >
                <View style={styles.pickerOverlay}>
                    <View style={styles.pickerWindow}>
                        <View style={styles.pickerHeader}>
                            <Text style={styles.pickerTitle}>{format(weekStart, 'MMMM yyyy')}</Text>
                            <TouchableOpacity onPress={() => setIsAnyDatePickerVisible(false)}>
                                <Ionicons name="close" size={24} color="#5F6368" />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.pickerCalendar}>
                            <View style={styles.pickerWeekDays}>
                                {['M', 'T', 'W', 'T', 'F'].map((d, idx) => (
                                    <Text key={`${d}-${idx}`} style={styles.pickerWeekDayText}>{d}</Text>
                                ))}
                            </View>
                            <View style={styles.pickerGrid}>
                                {days}
                            </View>
                        </View>

                        <TouchableOpacity
                            style={styles.confirmBtn}
                            onPress={() => setIsAnyDatePickerVisible(false)}
                        >
                            <Text style={styles.confirmBtnText}>Confirm {selectedDays.length} Days</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        );
    };

    // code by vikas
    useEffect(() => {
        if (activeTab === 'Multiple Entries') {
            const count = selectedDays.length || 1;
            let updatedEntries = [...dayEntries];

            // 1. Ensure each selected day has at least one entry
            selectedDays.forEach(date => {
                const dayHasEntry = updatedEntries.some(de => isSameDay(de.date, date));
                if (!dayHasEntry) {
                    updatedEntries.push({
                        id: Math.random().toString(36).substr(2, 9),
                        date,
                        minutes: 0,
                        description: ''
                    });
                }
            });

            // 2. Remove entries for unselected days
            updatedEntries = updatedEntries.filter(de => selectedDays.some(sd => isSameDay(sd, de.date)));

            // Group entries by day to handle distribution per day
            const entriesGroupedByDay: { [key: string]: any[] } = updatedEntries.reduce((acc, entry) => {
                const dateKey = format(entry.date, 'yyyy-MM-dd');
                if (!acc[dateKey]) {
                    acc[dateKey] = [];
                }
                acc[dateKey].push(entry);
                return acc;
            }, {});

            // 3. Redistribute minutes
            selectedDays.forEach(date => {
                const dateKey = format(date, 'yyyy-MM-dd');
                const entriesForDay = entriesGroupedByDay[dateKey] || [];
                const dayEntryCount = entriesForDay.length;

                let dayQuota = 0;
                if (splitMethod === 'Fixed Per Day') {
                    dayQuota = minutes;
                } else { // Distribute Manually or Split Equally
                    dayQuota = Math.floor(minutes / count);
                }

                // Divide dayQuota among entries of THIS day
                if (dayEntryCount > 0) {
                    const minsPerEntry = Math.floor(dayQuota / dayEntryCount);
                    const remainder = dayQuota - (minsPerEntry * dayEntryCount);

                    entriesForDay.forEach((entry, idx) => {
                        entry.minutes = minsPerEntry + (idx === 0 ? remainder : 0);
                    });
                }
            });

            // Flatten the grouped entries back into a single array
            const finalEntries = Object.values(entriesGroupedByDay).flat();

            // 4. Special case: if Split Equally or Distribute Manually, the REMAINDER of TotalMinutes / count
            // should go to the first day's first entry to ensure total sum matches exactly.
            if (activeTab === 'Multiple Entries' && (splitMethod === 'Split Equally' || splitMethod === 'Distribute Manually')) {
                const totalCalculated = finalEntries.reduce((acc, curr) => acc + curr.minutes, 0);
                const globalRemainder = minutes - totalCalculated;
                if (finalEntries.length > 0 && globalRemainder !== 0) {
                    // Find the first entry for the earliest selected day
                    const firstEntry = finalEntries.sort((a, b) => a.date.getTime() - b.date.getTime())[0];
                    if (firstEntry) {
                        firstEntry.minutes += globalRemainder;
                    }
                }
            }

            setDayEntries(finalEntries);
        }
    }, [selectedDays, activeTab, splitMethod, minutes]);

    const addAnotherEntry = (date: Date) => {
        const newId = Math.random().toString(36).substr(2, 9);
        const newEntry = {
            id: newId,
            date,
            minutes: 0,
            description: '',
            user: undefined // Will fallback to selectedUserForTimeEntry
        };
        setDayEntries(prev => [...prev, newEntry]);

        // Auto-open user selection for the new entry if possible
        if (canSelectUser) {
            setEntryForUserSelection(newId);
            setIsUserSelectionVisible(true);
        }
    };

    const removeEntry = (id: string, date: Date) => {
        setDayEntries(prev => {
            const entriesForDay = prev.filter(de => isSameDay(de.date, date));
            if (entriesForDay.length <= 1) return prev; // Keep at least one entry per day
            return prev.filter(de => de.id !== id);
        });
    };

    const updateDayEntryMins = (id: string, val: string) => {
        const num = parseInt(val) || 0;
        setDayEntries(prev => prev.map(de => de.id === id ? { ...de, minutes: num } : de));
    };

    const updateDayEntryDesc = (id: string, txt: string) => {
        setDayEntries(prev => prev.map(de => de.id === id ? { ...de, description: txt } : de));
    };
    // code by vikas

    const updateDayEntryUser = (id: string, user: any) => {
        setDayEntries(prev => prev.map(de => de.id === id ? { ...de, user } : de));
    };

    const renderUserSelectionModal = () => {
        // Determine the target user for highlighting in the modal
        let currentTargetUser = selectedUserForTimeEntry;
        if (entryForUserSelection) {
            const entry = dayEntries.find(d => d.id === entryForUserSelection);
            if (entry && entry.user) {
                currentTargetUser = entry.user;
            }
        }

        return (
            <Modal
                visible={isUserSelectionVisible}
                animationType="slide"
                transparent={true}
                onRequestClose={() => {
                    setIsUserSelectionVisible(false);
                    setEntryForUserSelection(null);
                }}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { height: '50%' }]}>
                        <View style={styles.header}>
                            <Text style={styles.headerTitle}>Select User</Text>
                            <View style={styles.headerRight}>
                                <TouchableOpacity onPress={() => {
                                    setIsUserSelectionVisible(false);
                                    setEntryForUserSelection(null);
                                }}>
                                    <Ionicons name="close" size={24} color="#5F6368" />
                                </TouchableOpacity>
                            </View>
                        </View>
                        <ScrollView contentContainerStyle={styles.scrollContent}>
                            {teamMembers.map((member: any, index: number) => {
                                const isActive = member.Email === currentTargetUser?.Email;
                                return (
                                    <TouchableOpacity
                                        key={index}
                                        style={[styles.userSelectionRow, isActive && styles.activeUserSelectionRow]}
                                        onPress={() => {
                                            if (entryForUserSelection) {
                                                updateDayEntryUser(entryForUserSelection, member);
                                                setEntryForUserSelection(null);
                                            } else {
                                                setSelectedUserForTimeEntry(member);
                                            }
                                            setIsUserSelectionVisible(false);
                                        }}
                                    >
                                        <UserAvatar user={member} spToken={spToken} disabled={true} />
                                        <Text style={[styles.userSelectionName, isActive && styles.activeUserSelectionName]}>
                                            {member.Title}
                                        </Text>
                                        {isActive && (
                                            <Ionicons name="checkmark" size={20} color="#1967D2" style={{ marginLeft: 'auto' }} />
                                        )}
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        );
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            onRequestClose={onClose}
        >
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={styles.headerTitle}>Time Entry</Text>
                        <View style={styles.headerRight}>
                            <TouchableOpacity onPress={onClose}>
                                <Ionicons name="menu-outline" size={24} color="#5F6368" style={{ marginRight: 15 }} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={onClose}>
                                <Ionicons name="close" size={24} color="#5F6368" />
                            </TouchableOpacity>
                        </View>
                    </View>

                    <ScrollView contentContainerStyle={styles.scrollContent}>
                        {/* Task Title */}
                        <View style={styles.taskBar}>
                            {taskImageSource ? (
                                <Image source={taskImageSource} style={{ width: 20, height: 20, marginRight: 8, borderRadius: 10 }} />
                            ) : (
                                <MaterialCommunityIcons name="checkbox-blank-circle" size={16} color="#4285F4" style={styles.taskIcon} />
                            )}
                            <Text style={styles.taskTitle} numberOfLines={1}>
                                {task?.TaskID} - {task?.Title}
                            </Text>
                        </View>

                        {/* Categories */}
                        <Text style={styles.sectionLabel}>Category</Text>
                        <View style={styles.categoriesContainer}>
                            {(showAllCategories ? CATEGORIES : CATEGORIES.slice(0, 5)).map(cat => (
                                <TouchableOpacity
                                    key={cat}
                                    style={[styles.categoryBadge, selectedCategory === cat && styles.activeCategoryBadge]}
                                    onPress={() => setSelectedCategory(cat)}
                                >
                                    <Text style={[styles.categoryText, selectedCategory === cat && styles.activeCategoryText]}>
                                        {cat}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                            {showAllCategories ? (
                                <TouchableOpacity
                                    style={styles.categoryBadge}
                                    onPress={() => setShowAllCategories(false)}
                                >
                                    <Text style={styles.categoryText}>Less...</Text>
                                </TouchableOpacity>
                            ) : (
                                <TouchableOpacity
                                    style={styles.categoryBadge}
                                    onPress={() => setShowAllCategories(true)}
                                >
                                    <Text style={styles.categoryText}>More...</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        {/* Tabs: Single / Multiple */}
                        {!initialEntry && (
                            <View style={styles.tabContainer}>
                                <TouchableOpacity onPress={() => setActiveTab('Single Entry')} style={[styles.tabButton, activeTab === 'Single Entry' && styles.activeTabButton]}>
                                    <Text style={[styles.tabText, activeTab === 'Single Entry' && styles.activeTabText]}>Single Entry</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => setActiveTab('Multiple Entries')} style={[styles.tabButton, activeTab === 'Multiple Entries' && styles.activeTabButton]}>
                                    <Text style={[styles.tabText, activeTab === 'Multiple Entries' && styles.activeTabText]}>Multiple Entries</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        {/* Week Selection & Calendar */}
                        <View style={styles.weekSelector}>
                            <Text style={styles.sectionLabel}>Select Date</Text>
                            <View style={styles.weekToggle}>
                                <TouchableOpacity style={styles.weekBtn} onPress={handleThisWeek}>
                                    <Text style={styles.weekBtnText}>This Week</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.weekBtn} onPress={handleNextWeek}>
                                    <Text style={styles.weekBtnText}>Next Week</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                        {renderWeekCalendar()}

                        {/* code by vikas */}
                        {activeTab === 'Multiple Entries' && (
                            <View style={styles.splitMethodContainer}>
                                <Text style={styles.sectionLabel}>Split Method</Text>
                                <View style={styles.splitRow}>
                                    {['Distribute Manually', 'Split Equally', 'Fixed Per Day'].map((method: any) => (
                                        <TouchableOpacity key={method} style={styles.splitItem} onPress={() => setSplitMethod(method)}>
                                            <MaterialCommunityIcons
                                                name={splitMethod === method ? "radiobox-marked" : "radiobox-blank"}
                                                size={20} color={splitMethod === method ? "#1A73E8" : "#5F6368"}
                                            />
                                            <Text style={styles.splitText}>{method}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                        )}
                        {/* code by vikas */}

                        {/* Time Input */}
                        <Text style={styles.hoursLabel}>{activeTab === 'Single Entry' ? 'Hours' : 'Total Hours'}</Text>
                        <View style={styles.timeInputContainer}>
                            <TouchableOpacity onPress={decrementTime} style={styles.timeIcrBtn}>
                                <MaterialCommunityIcons name="minus" size={24} color="#1A73E8" />
                            </TouchableOpacity>
                            <View style={styles.timeDisplay}>
                                <Text style={styles.minsText}>{minutes} <Text style={styles.minLabel}>min</Text></Text>
                                <Text style={styles.hoursText}>{hourValue} h</Text>
                            </View>
                            <TouchableOpacity onPress={incrementTime} style={styles.timeIcrBtn}>
                                <MaterialCommunityIcons name="plus" size={24} color="#1A73E8" />
                            </TouchableOpacity>
                        </View>

                        {/* User Selection */}
                        <View style={styles.userSection}>
                            {selectedUserForTimeEntry && (
                                <View style={styles.userRow}>
                                    <View style={styles.userAvatarContainer}>
                                        <UserAvatar user={selectedUserForTimeEntry} spToken={spToken} disabled={true} />
                                    </View>
                                    <Text style={styles.userName}>{selectedUserForTimeEntry.Title}</Text>
                                    {canSelectUser && (
                                        <TouchableOpacity onPress={() => {
                                            setEntryForUserSelection(null);
                                            setIsUserSelectionVisible(true);
                                        }}>
                                            <MaterialCommunityIcons name="pencil-outline" size={20} color="#5F6368" />
                                        </TouchableOpacity>
                                    )}
                                </View>
                            )}
                        </View>

                        {/* code by vikas */}
                        {activeTab === 'Multiple Entries' && (
                            <View style={styles.dayEntriesList}>
                                <Text style={styles.entriesTitle}>Enter minutes for each entry:</Text>
                                {selectedDays.map((date, dayIdx) => {
                                    const entriesForDay = dayEntries.filter(de => isSameDay(de.date, date));
                                    return (
                                        <View key={dayIdx} style={styles.dayGroup}>
                                            <Text style={styles.dayLabel}>{format(date, 'eeee, MMM d')}</Text>
                                            {entriesForDay.map((entry) => {
                                                const entUser = entry.user || selectedUserForTimeEntry;
                                                return (
                                                    <View key={entry.id} style={styles.dayEntryRow}>
                                                        {canSelectUser ? (
                                                            <TouchableOpacity
                                                                style={styles.subUserIcon}
                                                                onPress={() => {
                                                                    setEntryForUserSelection(entry.id);
                                                                    setIsUserSelectionVisible(true);
                                                                }}
                                                            >
                                                                <View>
                                                                    <UserAvatar user={entUser} spToken={spToken} disabled={true} size={32} />
                                                                    <View style={styles.avatarPencilBadge}>
                                                                        <MaterialCommunityIcons name="pencil" size={12} color="#FFF" />
                                                                    </View>
                                                                </View>
                                                            </TouchableOpacity>
                                                        ) : (
                                                            <View style={styles.subUserIcon}>
                                                                <UserAvatar user={entUser} spToken={spToken} disabled={true} size={32} />
                                                            </View>
                                                        )}

                                                        <TextInput
                                                            style={styles.minInput}
                                                            keyboardType="numeric"
                                                            placeholder="Minutes"
                                                            value={entry.minutes.toString()}
                                                            onChangeText={(val) => updateDayEntryMins(entry.id, val)}
                                                        />
                                                        <TextInput
                                                            style={styles.descInput}
                                                            placeholder="Description"
                                                            value={entry.description}
                                                            onChangeText={(val) => updateDayEntryDesc(entry.id, val)}
                                                        />
                                                        <TouchableOpacity onPress={() => removeEntry(entry.id, date)}>
                                                            <Ionicons name="trash-outline" size={20} color={entriesForDay.length > 1 ? "#D93025" : "#BDC1C6"} />
                                                        </TouchableOpacity>
                                                    </View>
                                                );
                                            })}
                                            <TouchableOpacity
                                                style={styles.addEntryBtn}
                                                onPress={() => addAnotherEntry(date)}
                                            >
                                                <Ionicons name="add" size={16} color="#1A73E8" />
                                                <Text style={styles.addEntryText}>Add another entry</Text>
                                            </TouchableOpacity>
                                        </View>
                                    );
                                })}
                                <View style={styles.distributeInfo}>
                                    <Text style={styles.distributeInfoText}>
                                        {dayEntries.reduce((acc, curr) => acc + curr.minutes, 0)} / {splitMethod === 'Fixed Per Day' ? (minutes * selectedDays.length) : minutes} minutes distributed
                                    </Text>
                                </View>
                            </View>
                        )}
                        {/* code by vikas */}

                        {/* Description */}
                        {activeTab === 'Single Entry' && (
                            <>
                                <Text style={styles.sectionLabel}>Description</Text>
                                <TextInput
                                    style={styles.descriptionInput}
                                    placeholder="What did you work on?"
                                    multiline
                                    numberOfLines={3}
                                    value={description}
                                    onChangeText={setDescription}
                                    textAlignVertical="top"
                                />
                            </>
                        )}

                        {/* Submit Button */}
                        <TouchableOpacity style={styles.logButton} activeOpacity={0.8} onPress={handleLogTime} disabled={isSubmitting}>
                            {isSubmitting ? (
                                <ActivityIndicator color="#FFF" />
                            ) : (
                                <Text style={styles.logButtonText}>
                                    {activeTab === 'Single Entry' ? 'Log Time' : `Log Time for ${selectedDays.length} Day${selectedDays.length > 1 ? 's' : ''}`}
                                </Text>
                            )}
                        </TouchableOpacity>
                        <View style={{ height: 40 }} />
                    </ScrollView>
                </View>
            </View>
            {renderUserSelectionModal()}
            {renderAnyDatePicker()}
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        maxHeight: '90%',
        height: '90%', // Almost full screen as per image
        width: '100%',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#E8EAED',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#304F8A',
    },
    headerRight: {
        flexDirection: 'row',
    },
    scrollContent: {
        padding: 16,
    },
    taskBar: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    taskIcon: {
        marginRight: 8,
    },
    // code by vikas
    splitMethodContainer: {
        marginTop: 16,
    },
    splitRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginTop: 8,
    },
    splitItem: {
        flexDirection: 'row',
        alignItems: 'center',
        marginRight: 16,
        marginBottom: 8,
    },
    splitText: {
        fontSize: 12,
        color: '#5F6368',
        marginLeft: 4,
    },
    dayLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: '#5F6368',
        marginBottom: 8,
    },
    dayGroup: {
        backgroundColor: '#F8F9FA',
        padding: 12,
        borderRadius: 8,
        marginBottom: 12,
    },
    dayEntriesList: {
        marginTop: 20,
    },
    dayEntryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    subUserIcon: {
        marginRight: 8,
    },
    addEntryBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
        paddingVertical: 4,
    },
    addEntryText: {
        fontSize: 13,
        color: '#1A73E8',
        marginLeft: 4,
    },
    dayEntryInputs: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
    },
    minInput: {
        width: 60,
        height: 36,
        backgroundColor: '#FFF',
        borderWidth: 1,
        borderColor: '#DADCE0',
        borderRadius: 4,
        paddingHorizontal: 8,
        fontSize: 13,
        marginRight: 8,
    },
    descInput: {
        flex: 1,
        height: 36,
        backgroundColor: '#FFF',
        borderWidth: 1,
        borderColor: '#DADCE0',
        borderRadius: 4,
        paddingHorizontal: 8,
        fontSize: 13,
        marginRight: 8,
    },
    userAvatarContainer: {
        marginRight: 8,
    },
    avatarPencilBadge: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        backgroundColor: '#5F6368',
        borderRadius: 8,
        padding: 2,
    },
    distributeInfo: {
        alignItems: 'center',
        paddingVertical: 12,
    },
    distributeInfoText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#202124',
    },
    pickerOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    pickerWindow: {
        backgroundColor: '#FFF',
        width: '90%',
        borderRadius: 12,
        padding: 16,
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
    },
    pickerCalendar: {
        padding: 10,
    },
    pickerWeekDays: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginBottom: 10,
    },
    pickerWeekDayText: {
        fontSize: 12,
        color: '#5F6368',
        fontWeight: '600',
        width: '18%',
        textAlign: 'center',
    },
    pickerGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'flex-start',
    },
    pickerDateItem: {
        width: '18%',
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 20,
        marginBottom: 8,
        marginHorizontal: '1%',
    },
    selectedPickerDateItem: {
        backgroundColor: '#1A73E8',
    },
    pickerDateText: {
        fontSize: 14,
        color: '#202124',
    },
    selectedPickerDateText: {
        color: '#FFF',
        fontWeight: 'bold',
    },
    disabledPickerDateItem: {
        backgroundColor: '#F8F9FA',
        opacity: 0.5,
    },
    disabledPickerDateText: {
        color: '#BDC1C6',
    },
    pickerHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#E8EAED',
        paddingBottom: 12,
    },
    pickerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#202124',
    },
    confirmBtn: {
        backgroundColor: '#1A73E8',
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 16,
    },
    confirmBtnText: {
        color: '#FFF',
        fontSize: 14,
        fontWeight: '600',
    },
    // code by vikas
    taskTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#304F8A',
        flex: 1,
    },
    sectionLabel: {
        fontSize: 13,
        color: '#304F8A',
        marginBottom: 8,
        fontWeight: '500',
    },
    categoriesContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginBottom: 16,
    },
    categoryBadge: {
        borderWidth: 1,
        borderColor: '#E8EAED',
        borderRadius: 4,
        paddingHorizontal: 12,
        paddingVertical: 6,
        marginRight: 8,
        marginBottom: 8,
        backgroundColor: '#FFFFFF',
    },
    activeCategoryBadge: {
        backgroundColor: '#E8F0FE',
        borderColor: '#1967D2',
    },
    categoryText: {
        fontSize: 12,
        color: '#3C4043',
    },
    activeCategoryText: {
        color: '#1967D2',
        fontWeight: '500',
    },
    tabContainer: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#E8EAED',
        marginBottom: 16,
    },
    tabButton: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    activeTabButton: {
        borderBottomColor: '#304F8A',
    },
    tabText: {
        fontSize: 14,
        color: '#5F6368',
    },
    activeTabText: {
        color: '#304F8A',
        fontWeight: '600',
    },
    weekSelector: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    weekToggle: {
        flexDirection: 'row',
    },
    weekBtn: {
        marginLeft: 8,
        backgroundColor: '#F8F9FA',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: '#E8EAED',
    },
    weekBtnText: {
        fontSize: 12,
        color: '#3C4043',
        fontWeight: '600',
    },
    calendarContainer: {
        backgroundColor: '#F8F9FA',
        borderRadius: 8,
        padding: 12,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#E8EAED',
    },
    calendarHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    monthTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#202124',
    },
    daysRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    dateItem: {
        alignItems: 'center',
        padding: 6,
        borderRadius: 6,
    },
    selectedDateItem: {
        backgroundColor: '#304F8A',
    },
    dayName: {
        fontSize: 11,
        color: '#5F6368',
        marginBottom: 4,
    },
    dayNumber: {
        fontSize: 14,
        fontWeight: '600',
        color: '#202124',
    },
    selectedDateText: {
        color: '#FFFFFF',
    },
    todayText: {
        color: '#1967D2', // Highlight today if not selected
    },
    anyDateButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: '#E8EAED',
        borderStyle: 'dashed',
    },
    anyDateText: {
        marginLeft: 6,
        fontSize: 12,
        color: '#1A73E8',
        fontWeight: '500',
    },
    hoursLabel: {
        fontSize: 13,
        color: '#304F8A',
        alignSelf: 'center',
        marginBottom: 8,
    },
    timeInputContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    timeIcrBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#F1F3F4',
        justifyContent: 'center',
        alignItems: 'center',
    },
    timeDisplay: {
        alignItems: 'center',
        marginHorizontal: 24,
    },
    minsText: {
        fontSize: 32,
        fontWeight: '700',
        color: '#202124',
    },
    minLabel: {
        fontSize: 16,
        color: '#5F6368',
        fontWeight: '400',
    },
    hoursText: {
        fontSize: 14,
        color: '#5F6368',
        marginTop: 4,
    },
    userSection: {
        alignItems: 'center',
        marginBottom: 16,
    },
    userRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8F9FA',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: '#E8EAED',
    },
    userName: {
        fontSize: 14,
        fontWeight: '500',
        color: '#3C4043',
        marginLeft: 8,
        marginRight: 8,
    },
    descriptionInput: {
        borderWidth: 1,
        borderColor: '#E8EAED',
        borderRadius: 4,
        padding: 12,
        fontSize: 14,
        color: '#202124',
        minHeight: 80,
        marginBottom: 20,
        backgroundColor: '#FFFFFF',
    },
    entriesHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    entriesTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#202124',
    },
    entriesBadge: {
        backgroundColor: '#E8F0FE',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    entriesBadgeText: {
        fontSize: 12,
        color: '#1967D2',
        fontWeight: '600',
    },
    divider: {
        height: 1,
        backgroundColor: '#E8EAED',
        marginBottom: 20,
    },
    logButton: {
        backgroundColor: '#304F8A',
        borderRadius: 4,
        paddingVertical: 12,
        alignItems: 'center',
    },
    logButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
    },
    userSelectionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 8,
        backgroundColor: '#FFFFFF',
        marginBottom: 8,
        borderWidth: 1,
        borderColor: '#E8EAED',
    },
    activeUserSelectionRow: {
        backgroundColor: '#E8F0FE',
        borderColor: '#1967D2',
    },
    userSelectionName: {
        fontSize: 14,
        color: '#3C4043',
        marginLeft: 12,
        fontWeight: '500',
    },
    activeUserSelectionName: {
        color: '#1967D2',
        fontWeight: '600',
    },
});

export default TimeEntryModal;
