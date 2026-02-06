import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Image,
  ActivityIndicator
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { format, parse } from 'date-fns';
import { Calendar } from 'react-native-calendars';
import { useTheme } from '../context/ThemeContext';
import { updateTaskBasicInfo, fetchImageAsBase64 } from '../Service/service';
import UserAvatar from './UserAvatar';

interface EditTaskModalProps {
  visible: boolean;
  onClose: (updated?: boolean) => void;
  task: any;
  spToken: string | null;
}

const EditTaskModal: React.FC<EditTaskModalProps> = ({ visible, onClose, task, spToken }) => {
  const { theme } = useTheme();

  const [title, setTitle] = useState<string>(task?.Title || '');
  const [priority, setPriority] = useState<string>(
    task?.PriorityRank != null ? String(task.PriorityRank) : ''
  );

  // Date States (Editable)
  const [startDate, setStartDate] = useState<string>(task?.StartDate || '');
  const [dueDate, setDueDate] = useState<string>(task?.DueDate || '');
  const [completionDate, setCompletionDate] = useState<string>(task?.CompletedDate || '');

  // New UI State (Placeholders & Editable Fields)
  const [itemRank, setItemRank] = useState('');
  const [relevantUrl, setRelevantUrl] = useState('');
  const [linkedPortfolio, setLinkedPortfolio] = useState('');

  const [portfolioTitle, setPortfolioTitle] = useState<string>(task?.Portfolio?.Title || '');
  const [taskCategories, setTaskCategories] = useState<string>(
    task?.TaskCategories?.results?.map((c: any) => c.Title).join(', ') || task?.TaskCategories?.Title || ''
  );

  // Status Modal State
  const [statusModalVisible, setStatusModalVisible] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<number>(task?.PercentComplete || 0);

  // Date Picker Modal State
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [datePickerType, setDatePickerType] = useState<'start' | 'due' | 'completion'>('start');

  // Logo State
  const [imageSource, setImageSource] = useState<any>(null);

  useEffect(() => {
    if (!visible || !task) return;
    setTitle(task.Title || '');
    setPriority(task.PriorityRank != null ? String(task.PriorityRank) : '');

    // Reset dates
    setStartDate(task.StartDate || '');
    setDueDate(task.DueDate || '');
    setCompletionDate(task.CompletedDate || '');

    // Reset placeholders
    setItemRank('');
    setRelevantUrl('');
    setLinkedPortfolio('');

    // Initialize editable fields
    setPortfolioTitle(task?.Portfolio?.Title || '');
    setTaskCategories(task?.TaskCategories?.results?.map((c: any) => c.Title).join(', ') || task?.TaskCategories?.Title || '');
    setSelectedStatus(task?.PercentComplete || 0);

    // Fetch Icon
    let isMounted = true;
    const fetchIcon = async () => {
      if (task.SiteIcon && spToken) {
        try {
          const base64 = await fetchImageAsBase64(task.SiteIcon, spToken);
          if (isMounted && base64) {
            setImageSource({ uri: base64 });
          }
        } catch (e) {
          console.error("Failed to fetch icon", e);
        }
      } else {
        setImageSource(null);
      }
    };
    fetchIcon();
    return () => { isMounted = false; };
  }, [visible, task, spToken]);

  if (!task) return null;

  // Helper function to format date as dd/mm/yyyy
  const formatDateDisplay = (dateString: string) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    } catch (e) {
      return dateString;
    }
  };

  // Helper function to convert dd/mm/yyyy to ISO date string
  const parseDisplayDate = (displayDate: string) => {
    if (!displayDate) return '';
    try {
      const parts = displayDate.split('/');
      if (parts.length === 3) {
        const [day, month, year] = parts;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
      return displayDate;
    } catch (e) {
      return displayDate;
    }
  };

  // Handle date selection from calendar
  const handleDateSelect = (date: string) => {
    const formattedDate = formatDateDisplay(date);
    if (datePickerType === 'start') {
      setStartDate(date);
    } else if (datePickerType === 'due') {
      setDueDate(date);
    } else if (datePickerType === 'completion') {
      setCompletionDate(date);
    }
    setDatePickerVisible(false);
  };

  // Open date picker
  const openDatePicker = (type: 'start' | 'due' | 'completion') => {
    setDatePickerType(type);
    setDatePickerVisible(true);
  };

  const formattedDueDate = task.DueDate
    ? format(new Date(task.DueDate), 'dd MMM yyyy')
    : 'N/A';

  const formattedStartDate = task.StartDate
    ? format(new Date(task.StartDate), 'dd MMM yyyy')
    : 'N/A';

  const formattedCompletionDate = task.CompletedDate
    ? format(new Date(task.CompletedDate), 'dd MMM yyyy')
    : 'N/A';

  // Restore missing variables
  const projectTitle = task.Project?.Title || '';
  const projectId = task.Project?.PortfolioStructureID || '';
  const parentTaskId = task.ParentTask?.TaskID || '';
  const parentTaskTitle = task.ParentTask?.Title || '';

  // Status Options
  const statusOptions = [
    { value: 0, label: '0% Not Started' },
    { value: 1, label: '1% For Approval' },
    { value: 2, label: '2% Follow Up' },
    { value: 3, label: '3% Approved' },
    { value: 4, label: '4% Checking' },
    { value: 5, label: '5% Acknowledged' },
    { value: 8, label: '8% Priority Check' },
    { value: 9, label: '9% Ready to Go' },
    { value: 10, label: '10% working on it' },
    { value: 70, label: '70% Re-Open' },
    { value: 75, label: '75% Deployment Pending' },
    { value: 80, label: '80% In QA Review' },
    { value: 90, label: '90% Task completed' },
    { value: 93, label: '93% For Review' },
    { value: 96, label: '96% Follow-up later' },
    { value: 99, label: '99% Completed' },
    { value: 100, label: '100% Closed' },
  ];

  // Get current status label based on selectedStatus
  const currentStatusOption = statusOptions.find(opt => opt.value === selectedStatus);
  const status = currentStatusOption ? currentStatusOption.label : '0% Not Started';

  // Placeholders or unused but kept for safety/future
  const siteComposition = task.siteType || '';
  const time = task.EstimatedTimeDescription || '';
  const teamMembers = task.TeamMembers?.results?.map((m: any) => m.Title).join(', ') || task.TeamMembers?.Title || '';

  const smartPriority =
    task && typeof task.PriorityRank === 'number'
      ? Number(task.PriorityRank).toFixed(1)
      : '';

  const handleSave = async () => {
    if (!spToken || !task?.siteUrl || !task?.listId || !task?.Id) {
      onClose(false);
      return;
    }
    try {
      const numericPriority =
        priority && !Number.isNaN(Number(priority)) ? Number(priority) : null;

      await updateTaskBasicInfo(spToken, {
        siteUrl: typeof task.siteUrl === 'string' ? task.siteUrl : task.siteUrl?.Url,
        listId: task.listId,
        taskId: task.Id,
        title,
        priorityRank: numericPriority,
      });
      onClose(true);
    } catch (e) {
      console.error('EditTaskModal save error', e);
      onClose(false);
    }
  };

  const renderReadOnlyField = (label: string, value: string, icon?: string) => (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.colors.textSecondary }]}>{label}</Text>
      <View
        style={[
          styles.readonlyBox,
          {
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.background,
            flexDirection: 'row', alignItems: 'center'
          },
        ]}
      >
        <Text style={{ color: theme.colors.text, flex: 1 }} numberOfLines={1}>{value || 'N/A'}</Text>
        {icon && <MaterialCommunityIcons name={icon} size={16} color={theme.colors.textSecondary} />}
      </View>
    </View>
  );

  const renderInputField = (
    label: string,
    val: string,
    setVal: (s: string) => void,
    placeholder: string,
    multiline = false,
    showIcon = true
  ) => (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.colors.textSecondary }]}>{label}</Text>
      <View style={[styles.inputContainer, { borderColor: theme.colors.border }]}>
        <TextInput
          value={val}
          onChangeText={setVal}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textSecondary}
          style={[
            styles.input,
            { color: theme.colors.text, height: multiline ? 60 : 40, flex: 1, borderWidth: 0 },
          ]}
          multiline={multiline}
        />
        {showIcon && <MaterialCommunityIcons name="pencil-outline" size={16} color={theme.colors.textSecondary} style={{ marginRight: 8 }} />}
      </View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={() => onClose(false)}
    >
      <View style={styles.backdrop}>
        <View style={[styles.container, { backgroundColor: theme.colors.surface }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 8 }}>
              {/* Logo Section */}
              {task.SiteIcon ? (
                imageSource ? (
                  <Image
                    source={imageSource}
                    style={{ width: 24, height: 24, marginRight: 8 }}
                  />
                ) : (
                  <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginRight: 8 }} />
                )
              ) : (
                <MaterialCommunityIcons name="checkbox-blank-circle" size={18} color={theme.colors.primary} style={{ marginRight: 8 }} />
              )}
              <Text style={[styles.headerTitle, { color: theme.colors.text }]} numberOfLines={1}>
                {task.TaskID ? `T${task.TaskID}` : ''} {title}
              </Text>
            </View>
            <TouchableOpacity onPress={() => onClose(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={22} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>

            {/* Title */}
            <View style={styles.section}>
              {renderInputField("Title", title, setTitle, "Task title", true, false)}
            </View>

            {/* Dates Row */}
            <View style={styles.fieldRow}>
              <View style={[styles.field, { flex: 1, marginRight: 8 }]}>
                <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Start Date</Text>
                <TouchableOpacity
                  style={[styles.inputContainer, { borderColor: theme.colors.border }]}
                  onPress={() => openDatePicker('start')}
                >
                  <Text style={{ color: theme.colors.text, flex: 1, paddingHorizontal: 10 }}>
                    {formatDateDisplay(startDate) || 'DD/MM/YYYY'}
                  </Text>
                  <MaterialCommunityIcons name="calendar" size={16} color={theme.colors.textSecondary} style={{ marginRight: 8 }} />
                </TouchableOpacity>
              </View>
              <View style={[styles.field, { flex: 1, marginLeft: 8 }]}>
                <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Due Date</Text>
                <TouchableOpacity
                  style={[styles.inputContainer, { borderColor: theme.colors.border }]}
                  onPress={() => openDatePicker('due')}
                >
                  <Text style={{ color: theme.colors.text, flex: 1, paddingHorizontal: 10 }}>
                    {formatDateDisplay(dueDate) || 'DD/MM/YYYY'}
                  </Text>
                  <MaterialCommunityIcons name="calendar" size={16} color={theme.colors.textSecondary} style={{ marginRight: 8 }} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Completion Date</Text>
              <TouchableOpacity
                style={[styles.inputContainer, { borderColor: theme.colors.border }]}
                onPress={() => openDatePicker('completion')}
              >
                <Text style={{ color: theme.colors.text, flex: 1, paddingHorizontal: 10 }}>
                  {formatDateDisplay(completionDate) || 'DD/MM/YYYY'}
                </Text>
                <MaterialCommunityIcons name="calendar" size={16} color={theme.colors.textSecondary} style={{ marginRight: 8 }} />
              </TouchableOpacity>
            </View>

            {/* Portfolio & Categories (Editable now) */}
            {renderInputField("Portfolio Item (CSF)", portfolioTitle, setPortfolioTitle, "Portfolio Item")}
            {renderInputField("Categories", taskCategories, setTaskCategories, "Categories")}

            {/* URLs */}
            {renderInputField("Relevant URL", relevantUrl, setRelevantUrl, "URL")}

            {/* Item Rank */}
            <View style={styles.field}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                <Text style={[styles.label, { color: theme.colors.textSecondary, marginBottom: 0 }]}>Item Rank</Text>
                <Ionicons name="information-circle-outline" size={14} color={theme.colors.textSecondary} style={{ marginLeft: 4 }} />
              </View>
              <View style={[styles.inputContainer, { borderColor: theme.colors.border }]}>
                <TextInput
                  value={itemRank}
                  onChangeText={setItemRank}
                  placeholder="Select Item Rank"
                  placeholderTextColor={theme.colors.textSecondary}
                  style={[styles.input, { color: theme.colors.text, height: 40, flex: 1, borderWidth: 0 }]}
                />
                <MaterialCommunityIcons name="chevron-down" size={20} color={theme.colors.textSecondary} style={{ marginRight: 8 }} />
              </View>
            </View>

            {/* Priority */}
            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Priority</Text>
              <TextInput
                value={priority}
                onChangeText={setPriority}
                placeholder="4"
                keyboardType="numeric"
                style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, paddingVertical: 8, paddingHorizontal: 10, borderWidth: 1, borderRadius: 8 }]}
              />
            </View>

            {/* Linked Items */}
            {renderInputField("Linked Component Task", parentTaskId ? `${parentTaskId} ${parentTaskTitle}` : "", () => { }, "Search Component Task")}
            {renderInputField("Linked Portfolio Items", linkedPortfolio, setLinkedPortfolio, "Search Portfolio Items")}
            {renderReadOnlyField("Project (PXC)", projectId ? `${projectId} - ${projectTitle}` : projectTitle, "pencil-outline")}

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={[styles.label, { color: '#1967D2' }]}>Total Time</Text>
              <Text style={[styles.label, { color: '#1967D2' }]}>2.0 h</Text>
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Status</Text>
              <TouchableOpacity
                style={[styles.inputContainer, { borderColor: theme.colors.border }]}
                onPress={() => setStatusModalVisible(true)}
              >
                <Text style={{ color: theme.colors.text, flex: 1, paddingHorizontal: 10 }}>{status}</Text>
                <MaterialCommunityIcons name="pencil-outline" size={16} color={theme.colors.textSecondary} style={{ marginRight: 8 }} />
              </TouchableOpacity>
            </View>

            {/* Time & Member */}
            <View style={styles.fieldRow}>
              <View style={[styles.field, { flex: 1, marginRight: 8 }]}>
                <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Time</Text>
                <TextInput placeholder="Time" style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, paddingVertical: 8, paddingHorizontal: 10, borderWidth: 1, borderRadius: 8 }]} />
              </View>
              <View style={[styles.field, { flex: 1, marginLeft: 8 }]}>
                <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Working Member</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}>
                  {(() => {

                    let userToDisplay = null;
                    if (task?.AssignedTo) {
                      if (task.AssignedTo.results && Array.isArray(task.AssignedTo.results) && task.AssignedTo.results.length > 0) {
                        userToDisplay = task.AssignedTo.results[0];
                      } else if (Array.isArray(task.AssignedTo) && task.AssignedTo.length > 0) {
                        userToDisplay = task.AssignedTo[0];
                      } else if (!Array.isArray(task.AssignedTo)) {
                        userToDisplay = task.AssignedTo;
                      }
                    }

                    if (userToDisplay) {
                      return <UserAvatar user={userToDisplay} spToken={spToken} size={32} />;
                    } else {
                      return (
                        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#E8EAED', justifyContent: 'center', alignItems: 'center' }}>
                          <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#5F6368' }}>?</Text>
                        </View>
                      );
                    }
                  })()}
                </View>
              </View>
            </View>

            {/* Radio Buttons (Placeholder) */}
            <View style={styles.field}>
              {['Very Quick', 'Quick', 'Medium', 'Long'].map((opt) => (
                <View key={opt} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <MaterialCommunityIcons name="radiobox-blank" size={20} color={theme.colors.textSecondary} />
                  <Text style={{ marginLeft: 8, color: theme.colors.text }}>{opt}</Text>
                </View>
              ))}
            </View>

            {/* Estimated Details */}
            <View style={[styles.readonlyBox, { borderColor: theme.colors.border, backgroundColor: '#E0E0E0', marginBottom: 20 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontWeight: '600', color: theme.colors.text }}>Estimated Task Time Details</Text>
                <MaterialCommunityIcons name="pencil-outline" size={16} color={theme.colors.textSecondary} />
              </View>
              <Text style={{ color: theme.colors.text, marginTop: 4 }}>Total Estimated Time: 0 Hr</Text>
            </View>

          </ScrollView>

          {/* Footer actions */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.footerButton, styles.secondaryButton]}
              onPress={() => onClose(false)}
              activeOpacity={0.7}
            >
              <Text style={[styles.footerButtonText, { color: theme.colors.textSecondary }]}>
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.footerButton,
                styles.primaryButton,
                { backgroundColor: theme.colors.primary },
              ]}
              onPress={handleSave}
              activeOpacity={0.7}
            >
              <Text style={[styles.footerButtonText, { color: '#FFFFFF' }]}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Status Update Modal */}
        <Modal
          visible={statusModalVisible}
          animationType="fade"
          transparent
          onRequestClose={() => setStatusModalVisible(false)}
        >
          <View style={styles.statusModalBackdrop}>
            <View style={[styles.statusModalContainer, { backgroundColor: theme.colors.surface }]}>
              {/* Header */}
              <View style={styles.statusModalHeader}>
                <Text style={[styles.statusModalTitle, { color: theme.colors.text }]}>Update Status</Text>
                <TouchableOpacity onPress={() => setStatusModalVisible(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Ionicons name="close" size={22} color={theme.colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* Status Options */}
              <ScrollView style={styles.statusModalContent} showsVerticalScrollIndicator={false}>
                {statusOptions.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={styles.statusOption}
                    onPress={() => {
                      setSelectedStatus(option.value);
                      setStatusModalVisible(false);
                    }}
                  >
                    <MaterialCommunityIcons
                      name={selectedStatus === option.value ? "radiobox-marked" : "radiobox-blank"}
                      size={20}
                      color={selectedStatus === option.value ? theme.colors.primary : theme.colors.textSecondary}
                    />
                    <Text style={[styles.statusOptionText, { color: theme.colors.text }]}>{option.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Date Picker Modal */}
        <Modal
          visible={datePickerVisible}
          animationType="fade"
          transparent
          onRequestClose={() => setDatePickerVisible(false)}
        >
          <View style={styles.statusModalBackdrop}>
            <View style={[styles.calendarModalContainer, { backgroundColor: theme.colors.surface }]}>
              {/* Header */}
              <View style={styles.statusModalHeader}>
                <Text style={[styles.statusModalTitle, { color: theme.colors.text }]}>
                  Select {datePickerType === 'start' ? 'Start' : datePickerType === 'due' ? 'Due' : 'Completion'} Date
                </Text>
                <TouchableOpacity onPress={() => setDatePickerVisible(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Ionicons name="close" size={22} color={theme.colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* Calendar */}
              <Calendar
                onDayPress={(day) => handleDateSelect(day.dateString)}
                markedDates={{
                  [datePickerType === 'start' ? startDate : datePickerType === 'due' ? dueDate : completionDate]: {
                    selected: true,
                    selectedColor: theme.colors.primary || '#1A73E8',
                  },
                }}
                theme={{
                  todayTextColor: theme.colors.primary || '#1A73E8',
                  selectedDayBackgroundColor: theme.colors.primary || '#1A73E8',
                  selectedDayTextColor: '#FFFFFF',
                  arrowColor: theme.colors.primary || '#1A73E8',
                }}
              />
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
};


const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  container: {
    width: '100%',
    maxHeight: '90%',
    borderRadius: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  field: {
    marginBottom: 12,
  },
  fieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 12,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  multilineInput: {
    minHeight: 80,
  },
  readonlyBox: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E0E0E0',
  },
  footerButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    marginLeft: 8,
  },
  secondaryButton: {
    backgroundColor: 'transparent',
  },
  primaryButton: {},
  footerButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  // Status Modal Styles
  statusModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  statusModalContainer: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
    borderRadius: 12,
    overflow: 'hidden',
  },
  calendarModalContainer: {
    width: '90%',
    maxWidth: 400,
    borderRadius: 12,
    overflow: 'hidden',
  },
  statusModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  statusModalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  statusModalContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  statusOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  statusOptionText: {
    fontSize: 14,
    marginLeft: 12,
  },
});

export default EditTaskModal;

