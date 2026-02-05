import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  Dimensions,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { format, addDays, isSameDay, startOfWeek, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import Ionicons from 'react-native-vector-icons/Ionicons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import UserAvatar from './UserAvatar';
import { postponeEntry, splitEntry } from '../Service/taskConfirmationService';

export type PostponeActionType = 'postpone' | 'split';

export interface SplitEntryItem {
  id: string;
  date: Date;
  minutes: number;
}

interface PostponeModalProps {
  visible: boolean;
  onClose: () => void;
  onSaved?: () => void;
  entry: any;
  currentUser: any;
  spToken: any;
  smartMetadata?: any[] | null;
}

function getNextWorkingDays(count: number = 7): Date[] {
  const dates: Date[] = [];
  let cursor = new Date();
  let added = 0;
  while (added < count) {
    cursor = addDays(cursor, 1);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) {
      dates.push(new Date(cursor));
      added++;
    }
  }
  return dates;
}

function getThisWeekMonday(): Date {
  return startOfWeek(new Date(), { weekStartsOn: 1 });
}

function getNextWeekMonday(): Date {
  return addDays(getThisWeekMonday(), 7);
}

function getNextWorkingDay(from: Date): Date {
  let d = addDays(from, 1);
  while (d.getDay() === 0 || d.getDay() === 6) d = addDays(d, 1);
  return d;
}

function getDaysInMonth(year: number, month: number): Date[] {
  const out: Date[] = [];
  const last = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= last; day++) {
    const d = new Date(year, month, day);
    if (d.getDay() !== 0 && d.getDay() !== 6) out.push(d);
  }
  return out;
}

/** Returns 6 rows × 7 days for calendar grid. Empty cells are null. */
function getCalendarGrid(year: number, month: number): (Date | null)[][] {
  const start = startOfMonth(new Date(year, month, 1));
  const end = endOfMonth(start);
  const days = eachDayOfInterval({ start, end });
  const firstDow = start.getDay();
  const padStart = firstDow === 0 ? 6 : firstDow - 1;
  const flat: (Date | null)[] = [];
  for (let i = 0; i < padStart; i++) flat.push(null);
  days.forEach((d) => flat.push(d));
  const total = 42;
  while (flat.length < total) flat.push(null);
  const rows: (Date | null)[][] = [];
  for (let r = 0; r < 6; r++) rows.push(flat.slice(r * 7, (r + 1) * 7));
  return rows;
}

const PostponeModal: React.FC<PostponeModalProps> = ({
  visible,
  onClose,
  onSaved,
  entry,
  currentUser,
  spToken,
  smartMetadata,
}) => {
  const { theme } = useTheme();
  const [selectedAction, setSelectedAction] = useState<PostponeActionType>('postpone');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [durationMinutes, setDurationMinutes] = useState(0);
  const [comment, setComment] = useState('');
  const [progressInfo, setProgressInfo] = useState('');
  const [timeTitle, setTimeTitle] = useState('');
  const [category, setCategory] = useState('');
  const [detailsExpanded, setDetailsExpanded] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [calendarFor, setCalendarFor] = useState<'postpone' | { type: 'split'; id: string }>('postpone');
  const [splitEntries, setSplitEntries] = useState<SplitEntryItem[]>([]);

  const taskItem = entry?.TaskItem || entry;
  const taskTitle = `${entry?.TaskID ?? taskItem?.TaskID ?? ''} - ${taskItem?.Title ?? entry?.Title ?? 'Task'}`;
  const workingDays = useMemo(() => getNextWorkingDays(7), []);
  const todayDate = useMemo(() => new Date(), []);
  const thisWeekMonday = useMemo(() => getThisWeekMonday(), []);
  const nextWeekMonday = useMemo(() => getNextWeekMonday(), []);

  const categories = useMemo(() => {
    if (!smartMetadata || !Array.isArray(smartMetadata)) return [];
    return smartMetadata
      .filter((item: any) => item.TaxType === 'TimesheetCategories' && item.Parent?.Title === 'Components')
      .sort((a: any, b: any) => (a.SortOrder ?? 0) - (b.SortOrder ?? 0));
  }, [smartMetadata]);

  const userName = useMemo(() => {
    const assignedTo = taskItem?.AssignedTo || taskItem?.AssignedToId;
    if (Array.isArray(assignedTo) && assignedTo[0]) return assignedTo[0].Title || entry?.AuthorName || '';
    return entry?.AuthorName || currentUser?.Title || 'N/A';
  }, [taskItem, entry, currentUser]);

  useEffect(() => {
    if (!visible || !entry) return;
    const mins = Number(entry.TaskTimeInMin) || (parseFloat(entry.TaskTime || 0) * 60) || 0;
    setDurationMinutes(mins);
    setComment('');
    setProgressInfo(entry.Description ?? '');
    // Entry can have Category as string (from TimeEntryScreen) or as object with Title
    const categoryTitle =
      typeof entry.Category === 'string'
        ? entry.Category
        : entry.Category?.Title;
    const byId = entry.CategoryId && categories?.length
      ? categories.find((c: any) => String(c.Id) === String(entry.CategoryId))?.Title
      : undefined;
    const initialCategory = categoryTitle ?? byId ?? categories[0]?.Title ?? '';
    setTimeTitle(initialCategory);
    setCategory(initialCategory);
    const tomorrow = workingDays[0];
    setSelectedDate(tomorrow || addDays(new Date(), 1));
    setSplitEntries([]);
  }, [visible, entry, categories]);

  useEffect(() => {
    if (selectedAction === 'split' && splitEntries.length === 0 && entry) {
      const mins = Number(entry.TaskTimeInMin) || (parseFloat(entry.TaskTime || 0) * 60) || 0;
      const firstDate = getNextWorkingDay(new Date());
      setSplitEntries([{ id: 'split-0', date: firstDate, minutes: mins }]);
    }
  }, [selectedAction]);

  const handleSave = async () => {
    if (selectedAction === 'split') {
      if (!splitEntries.length || splitEntries.every((e) => e.minutes <= 0)) {
        Alert.alert('Invalid split', 'Add at least one split with minutes > 0.');
        return;
      }
      const total = splitEntries.reduce((s, e) => s + e.minutes, 0);
      const orig = Number(entry?.TaskTimeInMin) || (parseFloat(entry?.TaskTime || 0) * 60) || 0;
      if (Math.abs(total - orig) > 1) {
        Alert.alert('Total mismatch', `Split total (${total} min) should match entry time (${orig} min).`);
        return;
      }
      setIsSaving(true);
      try {
        const splitItems = splitEntries.map((e) => ({ dateStr: format(e.date, 'dd/MM/yyyy'), minutes: e.minutes }));
        const description = (progressInfo || comment || entry.Description || '').trim();
        await splitEntry(spToken, entry, splitItems, description, currentUser);
        onSaved?.();
        onClose();
      } catch (e: any) {
        Alert.alert('Error', e?.message || 'Failed to split.');
      } finally {
        setIsSaving(false);
      }
      return;
    }
    if (!entry || !selectedDate) {
      Alert.alert('Select date', 'Please select a new date.');
      return;
    }
    setIsSaving(true);
    try {
      const newDateStr = format(selectedDate, 'dd/MM/yyyy');
      const description = (progressInfo || comment || entry.Description || '').trim();
      await postponeEntry(spToken, entry, newDateStr, durationMinutes, description, currentUser);
      onSaved?.();
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to postpone.');
    } finally {
      setIsSaving(false);
    }
  };

  const adjustMinutes = (delta: number) => {
    setDurationMinutes((prev) => Math.max(0, prev + delta));
  };

  const selectDate = (d: Date) => {
    setSelectedDate(d);
  };

  const openCalendarForSplit = (id: string) => {
    const item = splitEntries.find((e) => e.id === id);
    setCalendarFor({ type: 'split', id });
    setCalendarMonth(item ? new Date(item.date) : new Date());
    setCalendarVisible(true);
  };

  const onCalendarDaySelect = (d: Date) => {
    const day = d.getDay();
    if (day === 0 || day === 6) return;
    if (calendarFor === 'postpone') {
      setSelectedDate(d);
      setCalendarVisible(false);
      return;
    }
    if (calendarFor.type === 'split') {
      setSplitEntries((prev) =>
        prev.map((e) => (e.id === calendarFor.id ? { ...e, date: d } : e))
      );
      setCalendarVisible(false);
    }
  };

  const addSplitEntry = () => {
    const last = splitEntries[splitEntries.length - 1];
    const nextDate = last ? getNextWorkingDay(last.date) : getNextWorkingDay(new Date());
    setSplitEntries((prev) => [...prev, { id: `split-${Date.now()}`, date: nextDate, minutes: 0 }]);
  };

  const removeSplitEntry = (id: string) => {
    if (splitEntries.length <= 1) return;
    setSplitEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const updateSplitEntryMinutes = (id: string, delta: number) => {
    setSplitEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, minutes: Math.max(0, e.minutes + delta) } : e))
    );
  };

  const splitTotalMinutes = splitEntries.reduce((sum, e) => sum + e.minutes, 0);
  const calendarGrid = getCalendarGrid(calendarMonth.getFullYear(), calendarMonth.getMonth());

  if (!visible) return null;

  const { height: winHeight } = Dimensions.get('window');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity
        activeOpacity={1}
        style={styles.overlay}
        onPress={onClose}
      >
        <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={styles.modalCardWrapper}>
          <View style={[styles.modalCard, { backgroundColor: theme.colors.background, maxHeight: winHeight * 0.92 }]}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
              <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
                <Ionicons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
              <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Postpone / Split</Text>
              <View style={styles.headerBtn} />
            </View>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Task title */}
              <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                <Text style={[styles.taskTitle, { color: theme.colors.primary }]} numberOfLines={2}>{taskTitle}</Text>
              </View>

              {/* Action selector */}
              <Text style={[styles.sectionLabel, { color: theme.colors.textSecondary }]}>Action</Text>
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[
                    styles.actionCard,
                    selectedAction === 'postpone' && { backgroundColor: theme.colors.primary + '18', borderColor: theme.colors.primary },
                    { borderColor: theme.colors.border },
                  ]}
                  onPress={() => setSelectedAction('postpone')}
                >
                  <Ionicons name="arrow-forward" size={22} color={selectedAction === 'postpone' ? theme.colors.primary : theme.colors.textSecondary} />
                  <Text style={[styles.actionLabel, { color: selectedAction === 'postpone' ? theme.colors.primary : theme.colors.text }]}>Postpone WT</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.actionCard,
                    selectedAction === 'split' && { backgroundColor: theme.colors.primary + '18', borderColor: theme.colors.primary },
                    { borderColor: theme.colors.border },
                  ]}
                  onPress={() => setSelectedAction('split')}
                >
                  <MaterialCommunityIcons name="source-branch" size={22} color={selectedAction === 'split' ? theme.colors.primary : theme.colors.textSecondary} />
                  <Text style={[styles.actionLabel, { color: selectedAction === 'split' ? theme.colors.primary : theme.colors.text }]}>Split Working Today</Text>
                </TouchableOpacity>
              </View>

              {selectedAction === 'postpone' && (
                <>
                  {/* Current date */}
                  <Text style={[styles.sectionLabel, { color: theme.colors.textSecondary }]}>Current date</Text>
                  <Text style={[styles.currentDateText, { color: theme.colors.text }]}>
                    {entry?.TaskDate ? (() => {
                      const [d, m, y] = (entry.TaskDate || '').trim().split('/');
                      if (!d || !m || !y) return '—';
                      const dt = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
                      return isNaN(dt.getTime()) ? '—' : format(dt, 'EEEE, MMM dd, yyyy');
                    })() : '—'}
                  </Text>

                  {/* Select new date: This Week | Next Week | Choose date... (calendar) */}
                  <Text style={[styles.sectionLabel, { color: theme.colors.textSecondary }]}>Select new date</Text>
                  <View style={styles.dateButtonsRow}>
                    <TouchableOpacity
                      style={[
                        styles.dateActionBtn,
                        { borderColor: theme.colors.border },
                        selectedDate && isSameDay(thisWeekMonday, selectedDate) && { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
                      ]}
                      onPress={() => selectDate(thisWeekMonday)}
                    >
                      <Text style={[styles.dateActionBtnText, { color: selectedDate && isSameDay(thisWeekMonday, selectedDate) ? '#fff' : theme.colors.text }]}>This Week</Text>
                      <Text style={[styles.dateActionBtnSub, { color: selectedDate && isSameDay(thisWeekMonday, selectedDate) ? 'rgba(255,255,255,0.9)' : theme.colors.textSecondary }]}>{format(thisWeekMonday, 'd MMM')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.dateActionBtn,
                        { borderColor: theme.colors.border },
                        selectedDate && isSameDay(nextWeekMonday, selectedDate) && { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
                      ]}
                      onPress={() => selectDate(nextWeekMonday)}
                    >
                      <Text style={[styles.dateActionBtnText, { color: selectedDate && isSameDay(nextWeekMonday, selectedDate) ? '#fff' : theme.colors.text }]}>Next Week</Text>
                      <Text style={[styles.dateActionBtnSub, { color: selectedDate && isSameDay(nextWeekMonday, selectedDate) ? 'rgba(255,255,255,0.9)' : theme.colors.textSecondary }]}>{format(nextWeekMonday, 'd MMM')}</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    style={[styles.chooseDateBtn, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
                    onPress={() => { setCalendarFor('postpone'); setCalendarMonth(selectedDate ? new Date(selectedDate) : new Date()); setCalendarVisible(true); }}
                  >
                    <Ionicons name="calendar-outline" size={20} color={theme.colors.primary} />
                    <Text style={[styles.chooseDateBtnText, { color: theme.colors.primary }]}>
                      {selectedDate ? format(selectedDate, 'EEEE, d MMM yyyy') : 'Choose date...'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.splitInsteadBtn} onPress={() => setSelectedAction('split')}>
                    <MaterialCommunityIcons name="source-branch" size={16} color={theme.colors.primary} style={{ transform: [{ rotate: '90deg' }] }} />
                    <Text style={[styles.splitInsteadText, { color: theme.colors.primary }]}>Split Working Today instead</Text>
                  </TouchableOpacity>
                </>
              )}

              {selectedAction === 'split' && (
                <>
                  <Text style={[styles.sectionLabel, { color: theme.colors.textSecondary }]}>Split entries</Text>
                  {splitEntries.map((item) => (
                    <View key={item.id} style={[styles.splitEntryRow, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                      <TouchableOpacity
                        style={[styles.splitEntryDateBtn, { borderColor: theme.colors.border }]}
                        onPress={() => openCalendarForSplit(item.id)}
                      >
                        <Ionicons name="calendar-outline" size={18} color={theme.colors.primary} />
                        <Text style={[styles.splitEntryDateText, { color: theme.colors.text }]}>{format(item.date, 'EEE, d MMM yyyy')}</Text>
                      </TouchableOpacity>
                      <View style={[styles.splitEntryMinsRow, { borderColor: theme.colors.border }]}>
                        <TouchableOpacity onPress={() => updateSplitEntryMinutes(item.id, -15)} style={styles.splitMinsBtn}>
                          <Ionicons name="remove" size={18} color={theme.colors.primary} />
                        </TouchableOpacity>
                        <Text style={[styles.splitMinsText, { color: theme.colors.text }]}>{item.minutes} m</Text>
                        <TouchableOpacity onPress={() => updateSplitEntryMinutes(item.id, 15)} style={styles.splitMinsBtn}>
                          <Ionicons name="add" size={18} color={theme.colors.primary} />
                        </TouchableOpacity>
                      </View>
                      <TouchableOpacity
                        onPress={() => removeSplitEntry(item.id)}
                        disabled={splitEntries.length <= 1}
                        style={[styles.splitRemoveBtn, splitEntries.length <= 1 && { opacity: 0.4 }]}
                      >
                        <Ionicons name="trash-outline" size={20} color={theme.colors.error || '#c00'} />
                      </TouchableOpacity>
                    </View>
                  ))}
                  <TouchableOpacity style={[styles.addSplitBtn, { borderColor: theme.colors.primary }]} onPress={addSplitEntry}>
                    <Ionicons name="add-circle-outline" size={20} color={theme.colors.primary} />
                    <Text style={[styles.addSplitBtnText, { color: theme.colors.primary }]}>Add another date</Text>
                  </TouchableOpacity>
                  <View style={[styles.splitTotalRow, { borderColor: theme.colors.border }]}>
                    <Text style={[styles.splitTotalLabel, { color: theme.colors.textSecondary }]}>Total</Text>
                    <Text style={[styles.splitTotalValue, { color: theme.colors.text }]}>{splitTotalMinutes} min ({(splitTotalMinutes / 60).toFixed(2)} h)</Text>
                  </View>
                  <TouchableOpacity style={styles.splitInsteadBtn} onPress={() => setSelectedAction('postpone')}>
                    <Ionicons name="arrow-forward" size={16} color={theme.colors.primary} />
                    <Text style={[styles.splitInsteadText, { color: theme.colors.primary }]}>Postpone WT instead</Text>
                  </TouchableOpacity>
                </>
              )}

              {/* Comment */}
              <Text style={[styles.sectionLabel, { color: theme.colors.textSecondary }]}>Comment (optional)</Text>
              <TextInput
                style={[styles.commentInput, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, color: theme.colors.text }]}
                placeholder="Add a reason for postponing or splitting..."
                placeholderTextColor={theme.colors.textSecondary}
                value={comment}
                onChangeText={setComment}
                multiline
                numberOfLines={2}
              />

              {/* Entry Details accordion */}
              <TouchableOpacity
                style={[styles.accordionHeader, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
                onPress={() => setDetailsExpanded(!detailsExpanded)}
                activeOpacity={0.7}
              >
                <Text style={[styles.accordionTitle, { color: theme.colors.text }]}>Entry Details</Text>
                <Ionicons name={detailsExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={theme.colors.textSecondary} />
              </TouchableOpacity>
              {detailsExpanded && (
                <View style={[styles.accordionBody, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                  {/* User */}
                  <Text style={[styles.detailLabel, { color: theme.colors.textSecondary }]}>User - {userName}</Text>
                  {/* Suggested By */}
                  {currentUser?.Title && (
                    <View style={[styles.suggestedByRow, { backgroundColor: theme.colors.background }]}>
                      <UserAvatar user={currentUser} spToken={spToken} containerStyle={styles.suggestedByAvatar} />
                      <Text style={[styles.suggestedByText, { color: theme.colors.text }]}>Suggested By : {currentUser.Title}</Text>
                    </View>
                  )}

                  {/* Category */}
                  {categories.length > 0 && (
                    <>
                      <Text style={[styles.detailLabel, { color: theme.colors.textSecondary }]}>Category</Text>
                      <View style={styles.categoryWrap}>
                        {(categories as any[]).slice(0, 8).map((cat: any) => {
                          const catTitle = cat?.Title ?? '';
                          const isSelected = category === catTitle;
                          return (
                            <TouchableOpacity
                              key={cat?.Id ?? catTitle}
                              style={[styles.categoryPill, isSelected && { backgroundColor: theme.colors.primary }, { borderColor: theme.colors.border }]}
                              onPress={() => { setCategory(catTitle); setTimeTitle(catTitle); }}
                            >
                              <Text style={[styles.categoryPillText, isSelected ? { color: '#fff' } : { color: theme.colors.text }]}>{catTitle}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </>
                  )}

                  {/* Time Title */}
                  <Text style={[styles.detailLabel, { color: theme.colors.textSecondary }]}>Time Title</Text>
                  <TextInput
                    style={[styles.detailInput, { backgroundColor: theme.colors.background, borderColor: theme.colors.border, color: theme.colors.text }]}
                    value={timeTitle}
                    onChangeText={(t) => { setTimeTitle(t); setCategory(t); }}
                    placeholder="Time title"
                    placeholderTextColor={theme.colors.textSecondary}
                  />

                  {/* Expected Task Progress Information */}
                  <Text style={[styles.detailLabel, { color: theme.colors.textSecondary }]}>Expected Task Progress Information</Text>
                  <TextInput
                    style={[styles.progressInput, { backgroundColor: theme.colors.background, borderColor: theme.colors.border, color: theme.colors.text }]}
                    value={progressInfo}
                    onChangeText={setProgressInfo}
                    placeholder="Progress / description..."
                    placeholderTextColor={theme.colors.textSecondary}
                    multiline
                    numberOfLines={3}
                  />

                  {/* Duration - only when postpone */}
                  {selectedAction === 'postpone' && (
                    <>
                      <Text style={[styles.detailLabel, { color: theme.colors.textSecondary }]}>Duration</Text>
                      <View style={[styles.durationRow, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}>
                        <TouchableOpacity style={styles.durationBtn} onPress={() => adjustMinutes(-60)}>
                          <Ionicons name="remove" size={20} color={theme.colors.primary} />
                          <Text style={[styles.durationBtnLabel, { color: theme.colors.primary }]}>60m</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.durationBtn} onPress={() => adjustMinutes(-15)}>
                          <Ionicons name="remove" size={18} color={theme.colors.primary} />
                          <Text style={[styles.durationBtnLabel, { color: theme.colors.primary }]}>15m</Text>
                        </TouchableOpacity>
                        <View style={styles.durationDisplay}>
                          <Text style={[styles.durationMins, { color: theme.colors.text }]}>{durationMinutes} min</Text>
                          <Text style={[styles.durationHours, { color: theme.colors.textSecondary }]}>{(durationMinutes / 60).toFixed(2)} h</Text>
                        </View>
                        <TouchableOpacity style={styles.durationBtn} onPress={() => adjustMinutes(15)}>
                          <Ionicons name="add" size={18} color={theme.colors.primary} />
                          <Text style={[styles.durationBtnLabel, { color: theme.colors.primary }]}>15m</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.durationBtn} onPress={() => adjustMinutes(60)}>
                          <Ionicons name="add" size={20} color={theme.colors.primary} />
                          <Text style={[styles.durationBtnLabel, { color: theme.colors.primary }]}>60m</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  )}
                </View>
              )}
            </ScrollView>

            {/* Footer */}
            <View style={[styles.footer, { borderTopColor: theme.colors.border }]}>
              <TouchableOpacity style={[styles.cancelBtn, { borderColor: theme.colors.border }]} onPress={onClose} disabled={isSaving}>
                <Text style={[styles.cancelBtnText, { color: theme.colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: theme.colors.primary }]} onPress={handleSave} disabled={isSaving}>
                {isSaving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveBtnText}>{selectedAction === 'split' ? 'Split' : 'Postpone'}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>

      {/* Calendar picker modal */}
      <Modal visible={calendarVisible} transparent animationType="fade">
        <TouchableOpacity activeOpacity={1} style={styles.calendarOverlay} onPress={() => setCalendarVisible(false)}>
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={[styles.calendarCard, { backgroundColor: theme.colors.background }]}>
            <View style={[styles.calendarHeader, { borderBottomColor: theme.colors.border }]}>
              <TouchableOpacity onPress={() => setCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))} style={styles.calendarNavBtn}>
                <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
              </TouchableOpacity>
              <Text style={[styles.calendarMonthTitle, { color: theme.colors.text }]}>
                {format(calendarMonth, 'MMMM yyyy')}
              </Text>
              <TouchableOpacity onPress={() => setCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))} style={styles.calendarNavBtn}>
                <Ionicons name="chevron-forward" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            <View style={styles.calendarWeekRow}>
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((w) => (
                <Text key={w} style={[styles.calendarWeekDay, { color: theme.colors.textSecondary }]}>{w}</Text>
              ))}
            </View>
            {calendarGrid.map((row, ri) => (
              <View key={ri} style={styles.calendarRow}>
                {row.map((cell, ci) => {
                  if (!cell) return <View key={ci} style={styles.calendarCell} />;
                  const isWeekend = cell.getDay() === 0 || cell.getDay() === 6;
                  const isSelected =
                    (calendarFor === 'postpone' && selectedDate && isSameDay(cell, selectedDate)) ||
                    (calendarFor.type === 'split' && (() => { const se = splitEntries.find((e) => e.id === calendarFor.id); return se && isSameDay(cell, se.date); })());
                  return (
                    <TouchableOpacity
                      key={ci}
                      style={[
                        styles.calendarCell,
                        isWeekend && styles.calendarCellWeekend,
                        isSelected && { backgroundColor: theme.colors.primary },
                      ]}
                      onPress={() => !isWeekend && onCalendarDaySelect(cell)}
                      disabled={isWeekend}
                    >
                      <Text style={[
                        styles.calendarCellText,
                        { color: isWeekend ? theme.colors.textSecondary : theme.colors.text },
                        isSelected && { color: '#fff' },
                      ]}>{format(cell, 'd')}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
  },
  modalCardWrapper: {
    width: '100%',
    maxWidth: 480,
    borderRadius: 12,
    overflow: 'hidden',
    ...(Platform.OS === 'android' ? { elevation: 8, shadowColor: '#000' } : {}),
  },
  modalCard: {
    borderRadius: 12,
    overflow: 'hidden',
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600' },
  scroll: { maxHeight: 520 },
  scrollContent: { padding: 16, paddingBottom: 24 },
  card: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 16,
  },
  taskTitle: { fontSize: 15, fontWeight: '600' },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  actionCard: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  currentDateText: { fontSize: 14, marginBottom: 12 },
  dateButtonsRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  dateActionBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateActionBtnText: { fontSize: 14, fontWeight: '600' },
  dateActionBtnSub: { fontSize: 11, marginTop: 2 },
  chooseDateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 2,
    borderStyle: 'dashed',
    marginBottom: 12,
    gap: 8,
  },
  chooseDateBtnText: { fontSize: 14, fontWeight: '600' },
  splitEntryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    gap: 10,
  },
  splitEntryDateBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 8,
  },
  splitEntryDateText: { fontSize: 13, fontWeight: '500' },
  splitEntryMinsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 6,
    minWidth: 100,
  },
  splitMinsBtn: { padding: 6 },
  splitMinsText: { fontSize: 14, fontWeight: '600', marginHorizontal: 8 },
  splitRemoveBtn: { padding: 8 },
  addSplitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 8,
    marginBottom: 12,
    gap: 6,
  },
  addSplitBtnText: { fontSize: 13, fontWeight: '600' },
  splitTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 16,
  },
  splitTotalLabel: { fontSize: 14, fontWeight: '600' },
  splitTotalValue: { fontSize: 14, fontWeight: '700' },
  calendarOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  calendarCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 12,
    overflow: 'hidden',
    paddingBottom: 16,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
  },
  calendarNavBtn: { padding: 8 },
  calendarMonthTitle: { fontSize: 17, fontWeight: '600' },
  calendarWeekRow: {
    flexDirection: 'row',
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  calendarWeekDay: { flex: 1, fontSize: 11, fontWeight: '600', textAlign: 'center' },
  calendarRow: { flexDirection: 'row', paddingHorizontal: 4 },
  calendarCell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 2,
    borderRadius: 8,
  },
  calendarCellWeekend: { opacity: 0.5 },
  calendarCellText: { fontSize: 14, fontWeight: '500' },
  splitInsteadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 8,
    borderColor: '#ccc',
  },
  splitInsteadText: { fontSize: 13, fontWeight: '600', marginLeft: 6 },
  commentInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    minHeight: 64,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  accordionTitle: { fontSize: 15, fontWeight: '600' },
  accordionBody: {
    padding: 14,
    borderWidth: 1,
    borderTopWidth: 0,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    marginBottom: 16,
  },
  detailLabel: { fontSize: 12, fontWeight: '600', marginBottom: 4, marginTop: 10 },
  suggestedByRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
  },
  suggestedByAvatar: { width: 32, height: 32, borderRadius: 16, marginRight: 10 },
  suggestedByText: { fontSize: 13 },
  categoryWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  categoryPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  categoryPillText: { fontSize: 12, fontWeight: '500' },
  detailInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    marginBottom: 8,
  },
  progressInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    minHeight: 72,
    textAlignVertical: 'top',
    marginBottom: 8,
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 4,
  },
  durationBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 8 },
  durationBtnLabel: { fontSize: 11, fontWeight: '600', marginLeft: 2 },
  durationDisplay: { alignItems: 'center' },
  durationMins: { fontSize: 15, fontWeight: '700' },
  durationHours: { fontSize: 11, marginTop: 2 },
  footer: {
    flexDirection: 'row',
    padding: 12,
    gap: 10,
    borderTopWidth: 1,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: { fontSize: 15, fontWeight: '600' },
  saveBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
});

export default PostponeModal;
