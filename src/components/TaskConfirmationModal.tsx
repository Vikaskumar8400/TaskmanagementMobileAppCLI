import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  TextInput,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { format, addDays } from 'date-fns';
import TimesheetTimeline from './TimesheetTimeline';
import {
  flattenTasksToEntries,
  updateEntryStatus,
  updateEntryTime,
  updateEntryDescription,
  addEntryComment,
  getFallbackPreviousStatus,
} from '../Service/taskConfirmationService';
import Ionicons from 'react-native-vector-icons/Ionicons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

interface TaskConfirmationModalProps {
  visible: boolean;
  onClose: (refresh?: boolean) => void;
  panelType: 'Draft' | 'Suggestion' | 'Confirmed' | 'For Approval' | 'Approved';
  selectedDate: Date;
  currentUser: any;
  viewingUser?: any;
  spToken: any;
  taskTimeSheetsData: any[];
  teamMembers: any[];
}

const DEBOUNCE_MS = 1000;
const TASK_USER_SITE = 'https://hhhhteams.sharepoint.com/sites/HHHH/SP';
const TASK_USER_LIST_TITLE = 'Task Users';
// Web reference: globalCommon.sendNotoficationfromOMTtoTeams() uses this exact workflow URL
const OMT_CONFIRM_FLOW_URL =
  'https://default249283bb0d3b45218dc1e1aff77432.66.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/42ff48d0bb9a4516bb783ca6c8e4ffd8/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=TBjjdf4RBr2svpH6oYgGwVhnXj_p9SU8NjPuZYkOU2I';

/** Panel title for header (like web: "Confirm WT - Vikas Kumar Yadav") */
function getPanelTitleLabel(panelType: string): string {
  switch (panelType) {
    case 'Draft':
    case 'Suggestion':
      return 'WT Suggested';
    case 'Confirmed':
      return 'Confirm WT';
    case 'For Approval':
      return 'Submit EOD';
    case 'Approved':
      return 'EOD Approved';
    default:
      return panelType || 'Task Confirmation';
  }
}

/** Status label like web: Draft/Suggestion -> Suggested, For Approval -> Submitted, etc. */
function getStatusDisplayText(status: string): string {
  switch (status) {
    case 'Draft':
    case 'Suggestion':
      return 'Suggested';
    case 'Confirmed':
      return 'Confirmed';
    case 'For Approval':
      return 'Submitted';
    case 'Approved':
      return 'Approved';
    case 'Question':
      return 'Question';
    case 'Rejected':
      return 'Rejected';
    default:
      return status || 'Suggested';
  }
}

/** Status badge background color (like web TimelableColor) */
function getStatusBadgeColor(status: string): string {
  switch (status) {
    case 'Draft':
    case 'Suggestion':
      return '#8a8a8a';
    case 'Confirmed':
      return '#1976d2';
    case 'For Approval':
      return '#B2AC88';
    case 'Approved':
      return '#43a047';
    case 'Question':
    case 'Rejected':
      return '#D92D20';
    default:
      return '#8a8a8a';
  }
}

/** Which button key is active for this entry based on status/panel (for initial state). */
function getActiveButtonForEntry(entry: any, panelType: string, isLead: boolean): string | null {
  const key = `${entry?.ParentID}_${entry?.TaskID}_${entry?.ID ?? entry?.Id}`;
  const s = entry?.Status;
  if (panelType === 'Approved') {
    if (s === 'Approved') return `Approved_${key}`;
    return null;
  }
  if (panelType === 'For Approval') {
    if (s === 'For Approval') return `For Approval_${key}`;
    if (s === 'Question') return `Question_${key}`;
    if (s === 'Rejected') return `Rejected_${key}`;
    return null;
  }
  if (panelType === 'Confirmed' || panelType === 'Draft' || panelType === 'Suggestion') {
    if (s === 'Confirmed') return `Confirmed_${key}`;
    if (s === 'Approved') return `Approved_${key}`;
    if (s === 'Question') return `Question_${key}`;
    if (s === 'Rejected') return `Rejected_${key}`;
    if (isLead && (s === 'Suggestion' || s === 'Draft')) return `Confirmed_${key}`;
    if (!isLead && (s === 'Suggestion' || s === 'Draft')) return `For Approval_${key}`;
    if (s === 'For Approval' && !isLead) return `For Approval_${key}`;
  }
  return null;
}

const TaskConfirmationModal: React.FC<TaskConfirmationModalProps> = ({
  visible,
  onClose,
  panelType,
  selectedDate: initialDate,
  currentUser,
  viewingUser: viewingUserProp,
  spToken,
  taskTimeSheetsData,
  teamMembers,
}) => {
  const { theme } = useTheme();
  const viewingUser = viewingUserProp || currentUser;
  const isLead = viewingUser?.AssingedToUserId !== currentUser?.AssingedToUserId;

  const [currentDate, setCurrentDate] = useState(initialDate);
  const [selectedUserId, setSelectedUserId] = useState<any>(viewingUser?.AssingedToUserId);
  const [allData, setAllData] = useState<any[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [activeBtn, setActiveBtn] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState<number[]>([]);
  const [descDraft, setDescDraft] = useState<Record<string, string>>({});
  const [commentInput, setCommentInput] = useState<Record<string, string>>({});
  const [footerSendModal, setFooterSendModal] = useState<{
    visible: boolean;
    message: string;
    mode: 'confirmWithStaff' | 'sendToManagement';
  }>({
    visible: false,
    message: '',
    mode: 'confirmWithStaff',
  });
  const footerMessageRef = useRef('');
  const [isFooterSending, setIsFooterSending] = useState(false);
  const [localOMTStatus, setLocalOMTStatus] = useState<any[] | null>(null);
  const [questionRejectModal, setQuestionRejectModal] = useState<{
    visible: boolean;
    entry: any;
    action: 'Question' | 'Rejected';
    index: number;
    comment: string;
  }>({ visible: false, entry: null, action: 'Question', index: -1, comment: '' });
  const questionRejectCommentRef = useRef('');
  const questionRejectPendingRef = useRef<{ entry: any; action: 'Question' | 'Rejected'; index: number } | null>(null);
  const descDebounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const dateStr = format(currentDate, 'dd/MM/yyyy');

  useEffect(() => {
    if (!visible) return;
    setCurrentDate(initialDate);
    setSelectedUserId(viewingUser?.AssingedToUserId);
    // reset footer send state for a fresh panel session
    setFooterSendModal({ visible: false, message: '', mode: 'confirmWithStaff' });
    footerMessageRef.current = '';
    setIsFooterSending(false);
    setLocalOMTStatus(null);
  }, [visible, initialDate, viewingUser?.AssingedToUserId]);

  useEffect(() => {
    if (!visible || !taskTimeSheetsData) {
      setAllData([]);
      setActiveBtn([]);
      setActiveIndex([]);
      return;
    }
    const flat = flattenTasksToEntries(taskTimeSheetsData, dateStr, selectedUserId);
    setAllData(flat);
    setActiveBtn([]);
    setActiveIndex([]);
  }, [visible, taskTimeSheetsData, dateStr, selectedUserId]);

  const handlePrevDay = () => setCurrentDate((d) => addDays(d, -1));
  const handleNextDay = () => setCurrentDate((d) => addDays(d, 1));

  const entryKey = (entry: any) =>
    `${entry?.ParentID}_${entry?.TaskID}_${entry?.ID ?? entry?.Id}_${entry?.AuthorId}_${entry?.TaskDate}`;

  const rowKey = (entry: any) => `${entry?.ParentID}_${entry?.TaskID}_${entry?.ID ?? entry?.Id}`;

  const isButtonDisabled = (type: string, entry: any, index: number): boolean => {
    const key = rowKey(entry);
    const typeKey = `${type}_${key}`;
    const rowIsActive = activeIndex.includes(index);
    const thisIsActive = activeBtn.includes(typeKey);
    if (panelType === 'Approved') {
      if (rowIsActive && !thisIsActive && activeBtn.some((b) => b.includes(key))) return true;
      return false;
    }
    return rowIsActive && !thisIsActive;
  };

  const isButtonActive = (type: string, entry: any, index: number): boolean =>
    activeBtn.includes(`${type}_${rowKey(entry)}`) && activeIndex.includes(index);

  const getActionButtonStyle = (type: string, isActive: boolean, disabled: boolean) => {
    if (disabled) return { bg: '#E0E0E0', iconColor: '#9E9E9E', opacity: 0.6 };
    if (isActive) {
      switch (type) {
        case 'Confirmed':
        case 'Approved':
          return { bg: '#D1FADF', iconColor: '#039855', opacity: 1 };
        case 'Question':
          return { bg: '#FFF3E0', iconColor: '#B54708', opacity: 1 };
        case 'Rejected':
          return { bg: '#FEE4E2', iconColor: '#D92D20', opacity: 1 };
        case 'For Approval':
          return { bg: '#D1FADF', iconColor: '#039855', opacity: 1 };
        case 'Forward':
          return { bg: '#D1E9FF', iconColor: '#1570EF', opacity: 1 };
        default:
          return { bg: '#F1F5F9', iconColor: '#344054', opacity: 1 };
      }
    }
    switch (type) {
      case 'Confirmed':
      case 'Approved':
        return { bg: '#E8F5E9', iconColor: '#2E7D32', opacity: 1 };
      case 'Question':
        return { bg: '#FFF8E1', iconColor: '#EF6C00', opacity: 1 };
      case 'Rejected':
        return { bg: '#FFEBEE', iconColor: '#C62828', opacity: 1 };
      case 'For Approval':
        return { bg: '#E8F5E9', iconColor: '#2E7D32', opacity: 1 };
      case 'Forward':
        return { bg: '#E3F2FD', iconColor: '#1565C0', opacity: 1 };
      default:
        return { bg: '#F5F5F5', iconColor: '#757575', opacity: 1 };
    }
  };

  const setRowActive = (entry: any, index: number, type: string) => {
    const key = rowKey(entry);
    const typeKey = `${type}_${key}`;
    setActiveIndex((prev) => (prev.includes(index) ? prev : [...prev, index]));
    setActiveBtn((prev) => [...prev.filter((b) => !b.includes(key)), typeKey]);
  };

  const clearRowActive = (entry: any, index: number) => {
    const key = rowKey(entry);
    setActiveIndex((prev) => prev.filter((i) => i !== index));
    setActiveBtn((prev) => prev.filter((b) => !b.includes(key)));
  };

  const handleStatusPress = useCallback(
    async (entry: any, newStatus: string, index: number) => {
      const key = entryKey(entry);
      // Web behavior: clicking same status = revert (clear row active, then API)
      if (entry.Status === newStatus) {
        const prev = getFallbackPreviousStatus(entry.Status, panelType);
        clearRowActive(entry, index);
        setSavingId(key);
        try {
          await updateEntryStatus(spToken, entry, prev, currentUser);
          setAllData((prevData) =>
            prevData.map((e) => (entryKey(e) === key ? { ...e, Status: prev } : e))
          );
        } catch (err: any) {
          Alert.alert('Error', err?.message || 'Failed to revert');
        } finally {
          setSavingId(null);
        }
        return;
      }
      // Forward: set this button active first (others disable), then API – like web
      setRowActive(entry, index, newStatus);
      setSavingId(key);
      try {
        await updateEntryStatus(spToken, entry, newStatus, currentUser);
        setAllData((prev) =>
          prev.map((e) => (entryKey(e) === key ? { ...e, Status: newStatus } : e))
        );
      } catch (err: any) {
        Alert.alert('Error', err?.message || 'Failed to update status');
      } finally {
        setSavingId(null);
      }
    },
    [spToken, currentUser, panelType]
  );

  const handleSubmitPress = useCallback(
    async (entry: any, index: number) => {
      const key = entryKey(entry);
      const currentStatusEntry = entry.Status;
      if (currentStatusEntry === 'For Approval') {
        const prev = getFallbackPreviousStatus('For Approval', panelType);
        clearRowActive(entry, index);
        setSavingId(key);
        try {
          await updateEntryStatus(spToken, entry, prev, currentUser);
          setAllData((prevData) =>
            prevData.map((e) => (entryKey(e) === key ? { ...e, Status: prev } : e))
          );
        } catch (err: any) {
          Alert.alert('Error', err?.message || 'Failed to revert');
        } finally {
          setSavingId(null);
        }
        return;
      }
      setRowActive(entry, index, 'For Approval');
      setSavingId(key);
      try {
        await updateEntryStatus(spToken, entry, 'For Approval', currentUser);
        setAllData((prev) =>
          prev.map((e) => (entryKey(e) === key ? { ...e, Status: 'For Approval' } : e))
        );
      } catch (err: any) {
        Alert.alert('Error', err?.message || 'Failed to submit');
      } finally {
        setSavingId(null);
      }
    },
    [spToken, currentUser, panelType]
  );

  const openQuestionRejectModal = (entry: any, action: 'Question' | 'Rejected', index: number) => {
    questionRejectCommentRef.current = '';
    questionRejectPendingRef.current = { entry, action, index };
    setQuestionRejectModal({ visible: true, entry, action, index, comment: '' });
  };

  const closeQuestionRejectModalCancel = useCallback(() => {
    const entry = questionRejectModal.entry ?? questionRejectPendingRef.current?.entry;
    const index = questionRejectModal.index ?? questionRejectPendingRef.current?.index ?? -1;
    if (entry != null && index >= 0) clearRowActive(entry, index);
    setQuestionRejectModal((p) => ({ ...p, visible: false }));
  }, [questionRejectModal.entry, questionRejectModal.index]);

  const submitQuestionRejectComment = useCallback(async () => {
    const comment =
      (questionRejectCommentRef.current?.trim() || questionRejectModal.comment?.trim() || '').trim();
    const pending = questionRejectPendingRef.current;
    const entry = pending?.entry ?? questionRejectModal.entry;
    const action = pending?.action ?? questionRejectModal.action;
    const index = pending?.index ?? questionRejectModal.index;
    if (!entry || !comment) {
      Alert.alert('Comment required', 'Please enter a comment for Question/Reject.');
      return;
    }
    const key = entryKey(entry);
    questionRejectPendingRef.current = null;
    setQuestionRejectModal((prev) => ({ ...prev, visible: false }));
    setSavingId(key);
    try {
      await addEntryComment(spToken, entry, comment, currentUser, action);
      setAllData((prev) =>
        prev.map((e) => {
          if (entryKey(e) !== key) return e;
          const comments = Array.isArray(e.Comments) ? [...e.Comments] : [];
          comments.push({
            Id: (e.Comments?.length || 0) + 1,
            text: comment,
            date: format(new Date(), 'dd/MM/yyyy HH:mm'),
            AuthorName: currentUser?.Title,
            AuthorId: currentUser?.AssingedToUserId,
          });
          return { ...e, Status: action, Comments: comments };
        })
      );
      setRowActive(entry, index, action);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to save');
    } finally {
      setSavingId(null);
    }
  }, [spToken, currentUser, questionRejectModal.comment]);

  const handleQuestionReject = useCallback(
    async (entry: any, action: 'Question' | 'Rejected', index: number) => {
      const key = entryKey(entry);
      if (entry.Status === action || (action === 'Rejected' && entry.Status === 'Rejected')) {
        const prev = getFallbackPreviousStatus(entry.Status, panelType);
        clearRowActive(entry, index);
        setSavingId(key);
        try {
          await updateEntryStatus(spToken, entry, prev, currentUser);
          setAllData((prevData) =>
            prevData.map((e) => (entryKey(e) === key ? { ...e, Status: prev } : e))
          );
        } catch (err: any) {
          Alert.alert('Error', err?.message || 'Failed to revert');
        } finally {
          setSavingId(null);
        }
        return;
      }
      setRowActive(entry, index, action);
      openQuestionRejectModal(entry, action, index);
    },
    [spToken, currentUser, panelType]
  );

  const handleTimeChange = useCallback(
    async (entry: any, deltaMinutes: number) => {
      const key = entryKey(entry);
      const currentMins = Number(entry.TaskTimeInMin) || 0;
      const newMins = Math.max(0, currentMins + deltaMinutes);
      setSavingId(key);
      try {
        await updateEntryTime(spToken, entry, newMins, currentUser);
        setAllData((prev) =>
          prev.map((e) =>
            entryKey(e) === key
              ? { ...e, TaskTimeInMin: newMins, TaskTime: newMins / 60 }
              : e
          )
        );
      } catch (err: any) {
        Alert.alert('Error', err?.message || 'Failed to update time');
      } finally {
        setSavingId(null);
      }
    },
    [spToken, currentUser]
  );

  const handleDescriptionBlur = useCallback(
    (entry: any, text: string) => {
      const key = entryKey(entry);
      if (descDebounceRef.current[key]) clearTimeout(descDebounceRef.current[key]);
      descDebounceRef.current[key] = setTimeout(async () => {
        if (!text || text === (entry.Description || '')) return;
        setSavingId(key);
        try {
          await updateEntryDescription(spToken, entry, text, currentUser);
          setAllData((prev) =>
            prev.map((e) => (entryKey(e) === key ? { ...e, Description: text } : e))
          );
        } catch (err: any) {
          Alert.alert('Error', err?.message || 'Failed to save description');
        } finally {
          setSavingId(null);
        }
      }, DEBOUNCE_MS);
    },
    [spToken, currentUser]
  );

  const handleAddComment = useCallback(
    async (entry: any, text: string) => {
      const key = entryKey(entry);
      const trimmed = (text || '').trim();
      if (!trimmed) return;
      setSavingId(key);
      try {
        await addEntryComment(spToken, entry, trimmed, currentUser);
        setAllData((prev) =>
          prev.map((e) => {
            if (entryKey(e) !== key) return e;
            const comments = Array.isArray(e.Comments) ? [...e.Comments] : [];
            comments.push({
              Id: (e.Comments?.length || 0) + 1,
              text: trimmed,
              date: format(new Date(), 'dd/MM/yyyy HH:mm'),
              AuthorName: currentUser?.Title,
              AuthorId: currentUser?.AssingedToUserId,
            });
            return { ...e, Comments: comments };
          })
        );
        setCommentInput((prev) => ({ ...prev, [key]: '' }));
      } catch (err: any) {
        Alert.alert('Error', err?.message || 'Failed to add comment');
      } finally {
        setSavingId(null);
      }
    },
    [spToken, currentUser]
  );

  const totalHours = allData.reduce((acc, e) => acc + (parseFloat(e?.TaskTime) || 0), 0);
  const totalMinutes = allData.reduce((acc, e) => acc + (Number(e?.TaskTimeInMin) || 0), 0);

  // Web-like validation for footer send buttons: enable only when at least one relevant action exists.
  const shouldApplyEmailButtonValidation = useCallback(() => {
    return panelType === 'Confirmed' || panelType === 'For Approval' || panelType === 'Approved';
  }, [panelType]);

  const hasAnyConfirmAction = useMemo(() => {
    if (!Array.isArray(allData) || allData.length === 0) return false;
    // For Confirm WT panel: at least one entry is Confirmed (mirrors web's tasksWithConfirmOrApproveAction concept)
    return allData.some((e) => e?.Status === 'Confirmed');
  }, [allData]);

  const hasAnyEodAction = useMemo(() => {
    if (!Array.isArray(allData) || allData.length === 0) return false;
    // For EOD panels: require at least one entry in submitted/approved state before sending to management
    if (panelType === 'Approved') return allData.some((e) => e?.Status === 'Approved');
    if (panelType === 'For Approval') return allData.some((e) => e?.Status === 'For Approval' || e?.Status === 'Approved');
    return false;
  }, [allData, panelType]);

  const isAlreadyManagementSentForDate = useMemo(() => {
    const omtList = getViewingUserOMTStatusList();
    const todayStr = format(currentDate, 'dd/MM/yyyy');
    return omtList.some(
      (s: any) => s?.TaskDate?.split?.(' ')?.[0] === todayStr && String(s?.Status).toLowerCase() === 'approved'
    );
  }, [localOMTStatus, viewingUser?.OMTStatus, currentDate]);

  const footerLabel = isLead
    ? panelType === 'Confirmed'
      ? 'Confirm with staff member'
      : (panelType === 'Approved' || panelType === 'For Approval')
        ? 'Send to management'
        : 'Send to management'
    : panelType === 'Draft' || panelType === 'Suggestion'
      ? 'Send for confirmation'
      : panelType === 'For Approval' || panelType === 'Confirmed'
        ? 'Send for approval'
        : 'Confirm with staff member';

  // ---- Web-equivalent API calls for footer send actions (panel-level send) ----
  // NOTE: Must be a function declaration (hoisted) because it's used above in useMemo initializers.
  function getViewingUserOMTStatusList(): any[] {
    const omt = localOMTStatus ?? viewingUser?.OMTStatus ?? viewingUser?.OMTStatus?.results;
    if (Array.isArray(omt)) return omt;
    if (typeof omt === 'string') {
      try {
        const parsed = JSON.parse(omt);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  const upsertViewingUserOMTStatus = async (newRecord: any) => {
    // Match web globalCommon.saveEmailDetails payload structure for an OMTStatus record
    // Record fields: {Id, AuthorName, AuthorId, AuthorImage, Status, ActionDate, comment, TaskDate}
    const itemId = viewingUser?.Id;
    if (!itemId) throw new Error('Viewing user item Id missing.');

    // Read current item to get __metadata.type and existing OMTStatus
    const getUrl =
      `${TASK_USER_SITE}/_api/web/lists/getByTitle('${TASK_USER_LIST_TITLE}')/items(${itemId})?$select=Id,OMTStatus`;
    const getRes = await fetch(getUrl, {
      headers: {
        Authorization: `Bearer ${spToken}`,
        Accept: 'application/json;odata=verbose',
      },
    });
    if (!getRes.ok) {
      const t = await getRes.text();
      throw new Error(`Failed to load Task User OMTStatus: ${getRes.status} ${t}`);
    }
    const getJson = await getRes.json();
    const d = getJson?.d || {};
    const type = d?.__metadata?.type || 'SP.Data.Task_x0020_UsersListItem';
    let historyArray: any[] = [];
    try {
      historyArray = Array.isArray(d.OMTStatus) ? d.OMTStatus : d.OMTStatus ? JSON.parse(d.OMTStatus) : [];
    } catch {
      historyArray = [];
    }
    const maxId = historyArray.length > 0 ? Math.max(...historyArray.map((x: any) => x?.Id || 0)) : 0;
    const recordWithId = { Id: maxId + 1, ...newRecord };
    const updated = [...historyArray, recordWithId];

    const mergeUrl =
      `${TASK_USER_SITE}/_api/web/lists/getByTitle('${TASK_USER_LIST_TITLE}')/items(${itemId})`;
    const mergeRes = await fetch(mergeUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${spToken}`,
        Accept: 'application/json;odata=verbose',
        'Content-Type': 'application/json;odata=verbose',
        'X-HTTP-Method': 'MERGE',
        'IF-MATCH': '*',
      },
      body: JSON.stringify({
        __metadata: { type },
        OMTStatus: JSON.stringify(updated),
      }),
    });
    if (!mergeRes.ok) {
      const t = await mergeRes.text();
      throw new Error(`Failed to update Task User OMTStatus: ${mergeRes.status} ${t}`);
    }

    // Update local state immediately so progress bar updates without waiting for refresh
    setLocalOMTStatus(updated);
  };

  const buildConfirmEmailPayload = (message: string) => {
    // Match web sendNotoficationfromOMTtoTeams payload structure.
    const nowDate = format(new Date(), 'dd/MM/yyyy HH:mm');
    const todayPretty = format(new Date(), 'dd MMM yyyy');

    const taskDate = allData?.[0]?.TaskDate || dateStr;
    const taskSiteUrl = allData?.[0]?.siteUrl || '';
    const approverNames = currentUser?.Title || '';
    const senderNames = currentUser?.Title || '';
    const DefaultMsg =
      `${currentUser?.Title || 'Approver'} has confirmed your suggested working today, ` +
      `go ahead with confirmed time entries and coordinate for any questions/rejections.`;
    const DefaultMsgSend =
      `Your WT timesheet for date - ${format(currentDate, 'dd MMM yyyy')} has been confirmed by ${approverNames}.`;

    // Keep shape similar to EmailHeading used in web
    const conformationTYpe = {
      Comment: message,
      Type: panelType,
      Subject: `WT Timesheet Confirmation - ${viewingUser?.Title || ''} for the period ${format(currentDate, 'EEEE dd MMM yyyy')}`,
      Text: message,
      headerName: viewingUser?.Title || '',
      regardName: currentUser?.Title || '',
    };

    return {
      finalHtmlTable: '', // web sends HTML; keeping key present to match structure
      DefaultMsg,
      DefaultMsgSend,
      senderNames,
      conformationTYpe,
      approverNames,
      TimesheetPanelType: panelType,
      Userdetails: viewingUser,
      taskRows: (allData || []).map((item: any) => ({
        Site: item?.TaskItem?.siteType || '',
        TaskID: item?.TaskItem?.Id || '',
        Title: item?.TaskItem?.Title || '',
        WTTime: Number(item?.TaskTimeInMin || 0),
        Description: item?.Description || '',
      })),
      TotalTime: totalMinutes,
      TotalTasks: (allData || []).length,
      TaskSiteUrl: taskSiteUrl,
      Date: todayPretty,
      // Include a timestamp field for debugging parity (ignored by flow if not used)
      timestamp: nowDate,
    };
  };

  const sendConfirmWithStaffMember = async (message: string) => {
    if (isFooterSending) return;
    if (!isLead || panelType !== 'Confirmed') return;
    if (shouldApplyEmailButtonValidation() && !hasAnyConfirmAction) {
      Alert.alert('Action required', 'Please confirm at least one task before sending.');
      return;
    }
    if (!Array.isArray(allData) || allData.length === 0) {
      Alert.alert('Nothing to send', 'No time entries for this date.');
      return;
    }

    setIsFooterSending(true);
    try {
      // 1) Update Task Users → OMTStatus (web globalCommon.saveEmailDetails equivalent)
      const newOMTRecord = {
        AuthorName: currentUser?.Title || '',
        AuthorId: currentUser?.AssingedToUserId ?? currentUser?.AuthorId,
        AuthorImage: currentUser?.Item_x0020_Cover?.Url || currentUser?.AuthorImage || '',
        Status: 'Confirmed', // web maps ConfirmedByLead → Confirmed
        ActionDate: format(new Date(), 'dd/MM/yyyy HH:mm'),
        comment: message,
        TaskDate: allData?.[0]?.TaskDate || dateStr,
      };
      await upsertViewingUserOMTStatus(newOMTRecord);

      // 2) Trigger the same Power Automate workflow used on web (same URL + payload structure)
      const payload = buildConfirmEmailPayload(message);
      const flowRes = await fetch(OMT_CONFIRM_FLOW_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (!flowRes.ok) {
        const t = await flowRes.text();
        throw new Error(`Confirmation send failed: ${flowRes.status} ${t}`);
      }

      // 3) Close and refresh like web (closePopup(true))
      onClose(true);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to confirm with staff member.');
    } finally {
      setIsFooterSending(false);
    }
  };

  const buildManagementEmailPayload = (message: string) => {
    // Use the same workflow payload keys as web sendNotoficationfromOMTtoTeams.
    const nowDate = format(new Date(), 'dd/MM/yyyy HH:mm');
    const todayPretty = format(new Date(), 'dd MMM yyyy');

    const formattedDatePretty = format(currentDate, 'dd MMM yyyy');
    const taskDate = allData?.[0]?.TaskDate || dateStr;
    const taskSiteUrl = allData?.[0]?.siteUrl || '';
    const approverNames = currentUser?.Title || '';
    const senderNames = currentUser?.Title || '';

    // Align message intent with web sendEmailForChangeStatus "EOD Approved" block
    const DefaultMsg =
      `${currentUser?.Title || 'Approver'} EOD submitted for ${formattedDatePretty} has been approved. ` +
      `Please have a look for any questions/rejections.`;
    const DefaultMsgSend =
      `Your EOD for the date - ${formattedDatePretty} has been Approved by ${approverNames}. Review it for any questions.`;

    const conformationTYpe = {
      Comment: message,
      Type: 'Approved',
      Subject: `Approved Timesheet Submission - ${viewingUser?.Title || ''} for the period ${format(
        currentDate,
        'EEEE dd MMM yyyy'
      )}`,
      Text: message,
      headerName: 'Management Team',
      regardName: currentUser?.Title || '',
    };

    return {
      finalHtmlTable: '',
      DefaultMsg,
      DefaultMsgSend,
      senderNames,
      conformationTYpe,
      approverNames,
      TimesheetPanelType: panelType,
      Userdetails: viewingUser,
      taskRows: (allData || []).map((item: any) => ({
        Site: item?.TaskItem?.siteType || '',
        TaskID: item?.TaskItem?.Id || '',
        Title: item?.TaskItem?.Title || '',
        WTTime: Number(item?.TaskTimeInMin || 0),
        Description: item?.Description || '',
      })),
      TotalTime: totalMinutes,
      TotalTasks: (allData || []).length,
      TaskSiteUrl: taskSiteUrl,
      Date: todayPretty,
      timestamp: nowDate,
      TaskDate: taskDate,
    };
  };

  const sendToManagement = async (message: string) => {
    if (isFooterSending) return;
    if (!isLead || !(panelType === 'Approved' || panelType === 'For Approval')) return;
    if (isAlreadyManagementSentForDate) {
      Alert.alert('Already sent', 'This EOD has already been sent to management for this date.');
      return;
    }
    // Web PostponeButton requires comment for Management
    if (!message || message.trim() === '') {
      Alert.alert('Comment required', 'Please enter a comment before sending to management.');
      return;
    }
    if (shouldApplyEmailButtonValidation() && !hasAnyEodAction) {
      Alert.alert('Action required', 'Please submit/approve at least one task before sending to management.');
      return;
    }
    if (!Array.isArray(allData) || allData.length === 0) {
      Alert.alert('Nothing to send', 'No time entries for this date.');
      return;
    }

    setIsFooterSending(true);
    try {
      // 1) Update Task Users → OMTStatus (web saveEmailDetails equivalent) with Approved
      const newOMTRecord = {
        AuthorName: currentUser?.Title || '',
        AuthorId: currentUser?.AssingedToUserId ?? currentUser?.AuthorId,
        AuthorImage: currentUser?.Item_x0020_Cover?.Url || currentUser?.AuthorImage || '',
        Status: 'Approved',
        ActionDate: format(new Date(), 'dd/MM/yyyy HH:mm'),
        comment: message,
        TaskDate: allData?.[0]?.TaskDate || dateStr,
      };
      await upsertViewingUserOMTStatus(newOMTRecord);

      // 2) Trigger the same workflow used on web for OMT notifications
      const payload = buildManagementEmailPayload(message);
      const flowRes = await fetch(OMT_CONFIRM_FLOW_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (!flowRes.ok) {
        const t = await flowRes.text();
        throw new Error(`Send to management failed: ${flowRes.status} ${t}`);
      }

      onClose(true);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to send to management.');
    } finally {
      setIsFooterSending(false);
    }
  };

  const renderTaskRow = ({ item: entry, index }: { item: any; index: number }) => {
    const key = entryKey(entry);
    const taskItem = entry.TaskItem || entry;
    const isSaving = savingId === key;
    const status = entry.Status || 'Draft';
    const statusLabel = getStatusDisplayText(status);
    const descValue = descDraft[key] !== undefined ? descDraft[key] : (entry.Description ?? '');
    const commentValue = commentInput[key] ?? '';

    const renderActionBtn = (
      type: string,
      label: string,
      icon: string,
      onPress: () => void,
      disabled?: boolean
    ) => {
      const isActive = isButtonActive(type, entry, index);
      const style = getActionButtonStyle(type, isActive, !!disabled);
      return (
        <TouchableOpacity
          key={type}
          style={[styles.actionBtn, { backgroundColor: style.bg, opacity: style.opacity }]}
          onPress={onPress}
          disabled={disabled}
        >
          <Ionicons name={icon as any} size={18} color={style.iconColor} />
        </TouchableOpacity>
      );
    };

    const actions: React.ReactNode[] = [];

    if (isLead) {
      if (panelType === 'Confirmed' || panelType === 'Draft' || panelType === 'Suggestion') {
        if (entry.Status === 'For Approval') {
          actions.push(
            renderActionBtn(
              'Approved',
              'Approve',
              'checkmark-done',
              () => handleStatusPress(entry, 'Approved', index),
              isSaving || isButtonDisabled('Approved', entry, index)
            )
          );
        } else {
          actions.push(
            renderActionBtn(
              'Confirmed',
              'Confirm',
              'checkmark',
              () => handleStatusPress(entry, 'Confirmed', index),
              isSaving || isButtonDisabled('Confirmed', entry, index)
            )
          );
        }
        actions.push(
          renderActionBtn(
            'Question',
            'Question',
            'help',
            () => handleQuestionReject(entry, 'Question', index),
            isSaving || isButtonDisabled('Question', entry, index)
          ),
          renderActionBtn(
            'Rejected',
            'Reject',
            'close',
            () => handleQuestionReject(entry, 'Rejected', index),
            isSaving || isButtonDisabled('Rejected', entry, index)
          )
        );
      }
      if (panelType === 'For Approval' || panelType === 'Approved') {
        if (panelType === 'Approved') {
          actions.push(
            renderActionBtn(
              'Approved',
              'Approve',
              'checkmark-done',
              () => handleStatusPress(entry, 'Approved', index),
              isSaving || isButtonDisabled('Approved', entry, index)
            )
          );
        } else {
          actions.push(
            renderActionBtn(
              'Confirmed',
              'Confirm',
              'checkmark',
              () => handleStatusPress(entry, 'Confirmed', index),
              isSaving || isButtonDisabled('Confirmed', entry, index)
            )
          );
        }
        actions.push(
          renderActionBtn(
            'Rejected',
            'Reject',
            'close',
            () => handleQuestionReject(entry, 'Rejected', index),
            isSaving || isButtonDisabled('Rejected', entry, index)
          ),
          renderActionBtn(
            'Question',
            'Question',
            'help',
            () => handleQuestionReject(entry, 'Question', index),
            isSaving || isButtonDisabled('Question', entry, index)
          )
        );
      }
      const forwardStyle = getActionButtonStyle('Forward', isButtonActive('Forward', entry, index), false);
      actions.push(
        <TouchableOpacity
          key="Forward"
          style={[styles.actionBtn, { backgroundColor: forwardStyle.bg, opacity: forwardStyle.opacity }]}
          onPress={() => Alert.alert('Postpone', 'Postpone to another date – coming soon.')}
        >
          <Ionicons name="arrow-forward" size={18} color={forwardStyle.iconColor} />
        </TouchableOpacity>
      );
    } else {
      actions.push(
        renderActionBtn(
          'For Approval',
          'Submit',
          'checkmark',
          () => handleSubmitPress(entry, index),
          isSaving || isButtonDisabled('For Approval', entry, index)
        ),
        renderActionBtn(
          'Question',
          'Question',
          'help',
          () => handleQuestionReject(entry, 'Question', index),
          isSaving || isButtonDisabled('Question', entry, index)
        ),
        renderActionBtn(
          'Rejected',
          'Reject',
          'close',
          () => handleQuestionReject(entry, 'Rejected', index),
          isSaving || isButtonDisabled('Rejected', entry, index)
        ),
        <TouchableOpacity
          key="Forward"
          style={[styles.actionBtn, { backgroundColor: '#E3F2FD', opacity: 1 }]}
          onPress={() => Alert.alert('Postpone', 'Postpone to another date – coming soon.')}
        >
          <Ionicons name="arrow-forward" size={18} color="#1565C0" />
        </TouchableOpacity>
      );
    }

    return (
      <View style={[styles.rowContainer, { borderColor: theme.colors.border }]}>
        <TouchableOpacity style={styles.dragHandle}>
          <MaterialCommunityIcons name="drag-vertical" size={20} color="#ccc" />
        </TouchableOpacity>

        <ScrollView style={{ flex: 1 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
          <View style={styles.taskTitleRow}>
            <Text style={[styles.taskTitle, { color: theme.colors.primary }]} numberOfLines={1}>
              {entry.TaskID ?? taskItem?.TaskID} - {taskItem?.Title ?? entry.Title}
            </Text>
            <Ionicons name="information-circle-outline" size={16} color={theme.colors.primary} />
          </View>

          <View style={styles.metaRow}>
            <View style={styles.timeControl}>
              <TouchableOpacity
                style={styles.timeBtn}
                onPress={() => handleTimeChange(entry, -15)}
                disabled={isSaving || entry.Status === 'Approved'}
              >
                <Ionicons name="remove" size={16} color="#555" />
              </TouchableOpacity>
              <View style={{ alignItems: 'center', marginHorizontal: 8 }}>
                {isSaving ? (
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                ) : (
                  <>
                    <Text style={styles.timeTextMins}>{entry.TaskTimeInMin ?? 0} min</Text>
                    <Text style={styles.timeTextHours}>
                      {parseFloat(entry.TaskTime || 0).toFixed(2)} h
                    </Text>
                  </>
                )}
              </View>
              <TouchableOpacity
                style={styles.timeBtn}
                onPress={() => handleTimeChange(entry, 15)}
                disabled={isSaving || entry.Status === 'Approved'}
              >
                <Ionicons name="add" size={16} color="#555" />
              </TouchableOpacity>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                S-Prio: {taskItem?.PriorityRank ?? entry.PriorityRank ?? '-'}
              </Text>
            </View>
            <View style={[styles.badge, { backgroundColor: entry.TimelableColor || getStatusBadgeColor(status) }]}>
              <Text style={[styles.badgeText, { color: ['#1976d2', '#43a047', '#D92D20'].includes(entry.TimelableColor || getStatusBadgeColor(status)) ? '#fff' : '#333' }]}>
                {statusLabel}
              </Text>
            </View>
          </View>

          <TextInput
            style={[styles.descInput, { borderColor: theme.colors.border }]}
            placeholder="Task Progress Expected"
            value={descValue}
            onChangeText={(text) => setDescDraft((prev) => ({ ...prev, [key]: text }))}
            multiline
            editable={entry.Status !== 'Approved'}
            onBlur={() => {
              handleDescriptionBlur(entry, descValue);
              setDescDraft((prev) => {
                const next = { ...prev };
                delete next[key];
                return next;
              });
            }}
          />

          {/* Comments */}
          {(entry?.Comments?.length ?? 0) > 0 && (
            <View style={styles.commentsSection}>
              {entry.Comments.map((c: any, i: number) => (
                <View key={i} style={styles.commentRow}>
                  <Text style={styles.commentText}>{c.text}</Text>
                  <Text style={styles.commentMeta}>
                    {c.AuthorName || 'You'} · {c.date}
                  </Text>
                </View>
              ))}
            </View>
          )}
          <View style={styles.addCommentRow}>
            <TextInput
              style={[styles.commentInput, { borderColor: theme.colors.border }]}
              placeholder="Add a comment"
              value={commentValue}
              onChangeText={(text) => setCommentInput((prev) => ({ ...prev, [key]: text }))}
            />
            <TouchableOpacity
              style={[styles.sendCommentBtn, { backgroundColor: theme.colors.primary }]}
              onPress={() => handleAddComment(entry, commentValue)}
              disabled={isSaving || !commentValue.trim()}
            >
              <Ionicons name="send" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        </ScrollView>

        <View style={styles.actionsContainer}>{actions}</View>
      </View>
    );
  };

  const panelTitle = `${getPanelTitleLabel(panelType)} - ${viewingUser?.Title ?? 'Me'}`;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => onClose(false)}>
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
        <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
          <TouchableOpacity onPress={() => onClose(false)} style={styles.closeBtn}>
            <Ionicons name="chevron-back" size={24} color={theme.colors.primary} />
            <Text style={{ color: theme.colors.primary, marginLeft: 5 }}>Back</Text>
          </TouchableOpacity>
          <Text style={[styles.panelTitle, { color: theme.colors.text }]} numberOfLines={1}>
            {panelTitle}
          </Text>
          <TouchableOpacity onPress={() => onClose(false)}>
            <Ionicons name="close" size={24} color="#555" />
          </TouchableOpacity>
        </View>
        <View style={[styles.headerDateRow, { borderBottomColor: theme.colors.border }]}>
          <View style={styles.headerTitleContainer}>
            <TouchableOpacity onPress={handlePrevDay}>
              <Ionicons name="chevron-back" size={20} color="#555" />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
              {format(currentDate, 'EEEE dd MMM yyyy')}
            </Text>
            <TouchableOpacity onPress={handleNextDay}>
              <Ionicons name="chevron-forward" size={20} color="#555" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.userStrip, { borderBottomColor: theme.colors.border }]}>
          <View style={[styles.userChip, { backgroundColor: theme.colors.primary }]}>
            <Text style={{ color: 'white', fontWeight: 'bold' }}>
              {viewingUser?.Title?.split(' ')[0] || 'Me'} ({totalHours.toFixed(2)} h)
            </Text>
          </View>
        </View>

        <TimesheetTimeline
          omtStatus={getViewingUserOMTStatusList()}
          selectedDay={format(currentDate, 'dd/MM/yyyy')}
          onStepPress={() => { }}
        />

        <FlatList
          data={allData}
          renderItem={({ item, index }) => renderTaskRow({ item, index })}
          keyExtractor={(item) => entryKey(item)}
          contentContainerStyle={{ padding: 10, paddingBottom: 80 }}
          ListEmptyComponent={
            <View style={{ padding: 20, alignItems: 'center' }}>
              <Text style={{ color: theme.colors.textSecondary }}>No time entries for this date</Text>
            </View>
          }
        />

        <View style={[styles.footer, { borderTopColor: theme.colors.border }]}>
          <TouchableOpacity
            style={[styles.footerBtn, { backgroundColor: theme.colors.primary }]}
            disabled={
              isFooterSending ||
              (isLead && panelType === 'Confirmed' && shouldApplyEmailButtonValidation() && !hasAnyConfirmAction) ||
              (isLead && (panelType === 'Approved' || panelType === 'For Approval') && (isAlreadyManagementSentForDate || (shouldApplyEmailButtonValidation() && !hasAnyEodAction)))
            }
            onPress={() => {
              // Implement web-equivalent Confirm with staff member for mobile (panel-level send)
              if (isLead && panelType === 'Confirmed') {
                footerMessageRef.current = '';
                setFooterSendModal({ visible: true, message: '', mode: 'confirmWithStaff' });
                return;
              }
              // Implement web-equivalent Send to management for mobile (panel-level send, comment required)
              if (isLead && (panelType === 'Approved' || panelType === 'For Approval')) {
                footerMessageRef.current = '';
                setFooterSendModal({ visible: true, message: '', mode: 'sendToManagement' });
                return;
              }
              // Keep existing behavior for other footer actions for now
              onClose(true);
            }}
          >
            {isFooterSending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Text style={styles.footerBtnText}>{footerLabel}</Text>
                <Ionicons name="mail-outline" size={18} color="white" style={{ marginLeft: 8 }} />
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Confirm with staff member modal (web PostponeButton SendEmail equivalent for ConfirmedByLead) */}
        <Modal
          visible={footerSendModal.visible}
          transparent
          animationType="fade"
          onRequestClose={() => setFooterSendModal({ visible: false, message: '', mode: footerSendModal.mode })}
        >
          <View style={styles.commentModalOverlay}>
            <TouchableOpacity
              activeOpacity={1}
              style={StyleSheet.absoluteFill}
              onPress={() => setFooterSendModal({ visible: false, message: '', mode: footerSendModal.mode })}
            />
            <View
              style={[
                styles.commentModalContent,
                { backgroundColor: (theme.colors as any).surface || '#fff' },
              ]}
              pointerEvents="box-none"
            >
              <Text style={[styles.commentModalTitle, { color: theme.colors.text }]}>
                {footerSendModal.mode === 'sendToManagement' ? 'Send to management' : 'Confirm with staff member'}
              </Text>
              <Text style={{ color: theme.colors.textSecondary, marginBottom: 10 }}>
                {footerSendModal.mode === 'sendToManagement' ? 'Comment (required)' : 'Message (optional)'}
              </Text>
              <TextInput
                style={[
                  styles.commentModalInput,
                  { borderColor: theme.colors.border, color: theme.colors.text },
                ]}
                placeholder="Message..."
                placeholderTextColor={theme.colors.textSecondary}
                value={footerSendModal.message}
                onChangeText={(text) => {
                  footerMessageRef.current = text;
                  setFooterSendModal((p) => ({ ...p, message: text }));
                }}
                multiline
              />
              <View style={styles.commentModalButtons}>
                <TouchableOpacity
                  style={[styles.commentModalBtn, { backgroundColor: '#E0E0E0' }]}
                  onPress={() => setFooterSendModal({ visible: false, message: '', mode: footerSendModal.mode })}
                  disabled={isFooterSending}
                >
                  <Text style={styles.commentModalBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.commentModalBtn, { backgroundColor: theme.colors.primary }]}
                  onPress={async () => {
                    const msg = (footerMessageRef.current || footerSendModal.message || '').trim();
                    setFooterSendModal((p) => ({ ...p, visible: false }));
                    if (footerSendModal.mode === 'sendToManagement') {
                      await sendToManagement(msg);
                    } else {
                      await sendConfirmWithStaffMember(msg);
                    }
                  }}
                  disabled={isFooterSending}
                >
                  <Text style={styles.commentModalBtnTextWhite}>
                    {footerSendModal.mode === 'sendToManagement' ? 'Send' : 'Send'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Question/Reject comment modal (cross-platform) – overlay and content are siblings so Submit/Cancel are not captured by overlay */}
        <Modal
          visible={questionRejectModal.visible}
          transparent
          animationType="fade"
          onRequestClose={closeQuestionRejectModalCancel}
        >
          <View style={styles.commentModalOverlay}>
            <TouchableOpacity
              activeOpacity={1}
              style={StyleSheet.absoluteFill}
              onPress={closeQuestionRejectModalCancel}
            />
            <View
              style={[styles.commentModalContent, { backgroundColor: (theme.colors as any).surface || '#fff' }]}
              pointerEvents="box-none"
            >
              <Text style={[styles.commentModalTitle, { color: theme.colors.text }]}>
                {questionRejectModal.action === 'Question' ? 'Question' : 'Reject'} – Add a comment (required)
              </Text>
              <TextInput
                style={[styles.commentModalInput, { borderColor: theme.colors.border, color: theme.colors.text }]}
                placeholder="Comment..."
                placeholderTextColor={theme.colors.textSecondary}
                value={questionRejectModal.comment}
                onChangeText={(text) => {
                  questionRejectCommentRef.current = text;
                  setQuestionRejectModal((p) => ({ ...p, comment: text }));
                }}
                multiline
              />
              <View style={styles.commentModalButtons}>
                <TouchableOpacity
                  style={[styles.commentModalBtn, { backgroundColor: '#E0E0E0' }]}
                  onPress={closeQuestionRejectModalCancel}
                >
                  <Text style={styles.commentModalBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.commentModalBtn, { backgroundColor: theme.colors.primary }]}
                  onPress={submitQuestionRejectComment}
                >
                  <Text style={styles.commentModalBtnTextWhite}>Submit</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    backgroundColor: 'white',
    borderBottomWidth: 1,
  },
  closeBtn: { flexDirection: 'row', alignItems: 'center' },
  panelTitle: { flex: 1, fontSize: 16, fontWeight: '600', textAlign: 'center', marginHorizontal: 8 },
  headerDateRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 15,
    backgroundColor: 'white',
    borderBottomWidth: 1,
  },
  headerTitleContainer: { flexDirection: 'row', alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '600', marginHorizontal: 10 },
  userStrip: {
    flexDirection: 'row',
    padding: 10,
    backgroundColor: 'white',
    borderBottomWidth: 1,
  },
  userChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginRight: 8 },
  rowContainer: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    borderWidth: 1,
  },
  dragHandle: { justifyContent: 'center', paddingRight: 5 },
  taskTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  taskTitle: { fontSize: 14, fontWeight: '600', marginRight: 5, flex: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' },
  timeControl: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 10,
    backgroundColor: '#F5F5F5',
    borderRadius: 4,
    padding: 2,
  },
  timeBtn: { padding: 2 },
  timeTextMins: { fontSize: 14, fontWeight: 'bold', color: '#333' },
  timeTextHours: { fontSize: 10, color: '#888' },
  badge: {
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 6,
    marginBottom: 4,
  },
  badgeText: { fontSize: 10, color: '#555' },
  descInput: {
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderRadius: 4,
    padding: 8,
    fontSize: 12,
    minHeight: 40,
    textAlignVertical: 'top',
  },
  commentsSection: { marginTop: 8, marginBottom: 4 },
  commentRow: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#F5F5F5',
    borderRadius: 4,
    marginBottom: 4,
  },
  commentText: { fontSize: 12, color: '#333' },
  commentMeta: { fontSize: 10, color: '#666', marginTop: 2 },
  addCommentRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  commentInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  sendCommentBtn: { padding: 8, borderRadius: 20 },
  actionsContainer: {
    justifyContent: 'flex-start',
    marginLeft: 10,
    paddingLeft: 10,
    borderLeftWidth: 1,
    borderLeftColor: '#F0F0F0',
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  actionBtnDisabled: { opacity: 0.5 },
  footer: {
    backgroundColor: 'white',
    padding: 15,
    borderTopWidth: 1,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  footerBtn: {
    borderRadius: 4,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerBtnText: { color: 'white', fontWeight: '600', fontSize: 14 },
  commentModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  commentModalContent: {
    borderRadius: 12,
    padding: 20,
  },
  commentModalTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12 },
  commentModalInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  commentModalButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 16 },
  commentModalBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 },
  commentModalBtnText: { color: '#333', fontWeight: '600' },
  commentModalBtnTextWhite: { color: '#fff', fontWeight: '600' },
});

export default TaskConfirmationModal;
