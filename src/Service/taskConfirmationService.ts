/**
 * TaskConfirmation / OMT panel – dedicated service.
 * Handles load, bind, status, time, description, comments for the Task Confirmation modal.
 * Does not modify service.ts.
 */
import { format } from 'date-fns';

const TASK_USER_SITE = 'https://hhhhteams.sharepoint.com/sites/HHHH/SP';
const TASK_USER_LIST = 'Task Users';

// ---- Helpers ----
function parseAdditionalTimeEntry(raw: any): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getEntryKey(entry: any): string {
  return `${entry?.ParentID}_${entry?.TaskID}_${entry?.ID ?? entry?.Id}_${entry?.AuthorId}_${entry?.TaskDate}`;
}

async function getListEntityType(spToken: string, siteUrl: string, listId: string): Promise<string> {
  try {
    const resp = await fetch(
      `${siteUrl}/_api/web/lists(guid'${listId}')?$select=ListItemEntityTypeFullName`,
      { headers: { Authorization: `Bearer ${spToken}`, Accept: 'application/json;odata=verbose' } }
    );
    const json = await resp.json();
    return json.d?.ListItemEntityTypeFullName || `SP.Data.ListListItem`;
  } catch {
    return `SP.Data.ListListItem`;
  }
}

/** Fetch a single timesheet item to get current AdditionalTimeEntry and __metadata.type */
async function getTimesheetItem(
  spToken: string,
  siteUrl: string,
  listId: string,
  itemId: number
): Promise<{ additionalTimeEntry: any[]; type: string }> {
  const endpoint = `${siteUrl}/_api/web/lists/getById('${listId}')/items(${itemId})?$select=Id,AdditionalTimeEntry`;
  const res = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${spToken}`, Accept: 'application/json;odata=verbose' },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`getTimesheetItem failed: ${res.status} ${text}`);
  }
  const json = await res.json();
  const d = json.d || {};
  const additionalTimeEntry = parseAdditionalTimeEntry(d.AdditionalTimeEntry);
  const type = d.__metadata?.type || (await getListEntityType(spToken, siteUrl, listId));
  return { additionalTimeEntry, type };
}

/** Find entry in array by AuthorId+TaskDate+ParentID or by ID */
function findEntry(data: any[], entry: any): { index: number; val: any } | null {
  const idMatch = (e: any) =>
    e?.ID === entry?.ID || e?.Id === entry?.ID || e?.ID === entry?.Id || e?.id === entry?.id || e?.id === entry?.ID;
  const strictMatch = (e: any) =>
    String(e?.AuthorId) === String(entry?.AuthorId) &&
    String(e?.TaskDate || '').trim() === String(entry?.TaskDate || '').trim() &&
    Number(e?.ParentID) === Number(entry?.ParentID);

  for (let i = 0; i < data.length; i++) {
    if (strictMatch(data[i])) return { index: i, val: data[i] };
  }
  for (let i = 0; i < data.length; i++) {
    if (idMatch(data[i]) && (!entry?.TaskDate || String(data[i]?.TaskDate || '').trim() === String(entry?.TaskDate || '').trim()))
      return { index: i, val: data[i] };
  }
  return null;
}

function appendTimeHistory(
  entry: any,
  payload: { Status?: string; TaskTimeInMin?: number; TaskTime?: number; date: string; AuthorName: string; AuthorImage?: string; AuthorId: any }
) {
  let history: any[] = [];
  try {
    const raw = entry.TimeHistory;
    history = typeof raw === 'string' ? JSON.parse(raw) : Array.isArray(raw) ? raw : [];
  } catch {
    history = [];
  }
  const maxId = history.length > 0 ? Math.max(...history.map((h: any) => h.Id || 0)) : 0;
  history.push({ Id: maxId + 1, ...payload });
  return JSON.stringify(history);
}

// ---- Public API ----

/**
 * Load timesheet rows for a date range (for OMT panel).
 * Uses same pattern as web loadLetestTimeData.
 */
export async function loadTimesheetForDate(
  spToken: string,
  timeSheetResult: any[],
  dateStr: string
): Promise<any[]> {
  if (!timeSheetResult?.length) return [];
  const [d, m, y] = dateStr.split('/');
  const day = parseInt(d, 10);
  const month = parseInt(m, 10) - 1;
  const year = parseInt(y, 10);
  const start = new Date(year, month, day);
  start.setDate(start.getDate() - 2);
  const startDate = start.toISOString();
  const filter = `(Modified ge '${startDate}') and (TimesheetTitle/Id ne null)`;

  const requests = timeSheetResult.map((site: any) => {
    const siteUrl = typeof site.siteUrl === 'string' ? site.siteUrl : site.siteUrl?.Url || site.siteUrl;
    const listId = site.listId;
    if (!siteUrl || !listId) return Promise.resolve([]);
    let endpoint = `${siteUrl}/_api/web/lists/getById('${listId}')/items?$filter=${encodeURIComponent(filter)}`;
    return fetch(endpoint, {
      headers: { Authorization: `Bearer ${spToken}`, Accept: 'application/json;odata=verbose' },
    })
      .then(async (res) => {
        if (!res.ok) return [];
        const json = await res.json();
        const results = json.d?.results || [];
        return results.map((item: any) => ({
          ...item,
          siteUrl,
          listId,
          Id: item.Id,
        }));
      })
      .catch(() => []);
  });

  const results = await Promise.all(requests);
  return results.flat();
}

/**
 * Bind entries for the selected date (and optionally user).
 * Returns flattened entries for the table, members with totals, and total time.
 * Each entry must have ParentID, TimesheetListId (listId), siteUrl for updates.
 */
export function bindEntriesForDate(
  timesheetRows: any[],
  dateStr: string,
  selectedUserId: string | number | null,
  teamMembers: any[],
  taskLookup?: Map<string, any>
): {
  flatEntries: any[];
  membersWithTotals: { User: string; AssingedToUserId: any; TotalTime: number; OMTStatus?: any }[];
  totalTime: number;
} {
  const todayFormatted = dateStr.trim();
  const workingDayData: any[] = [];

  timesheetRows.forEach((row: any) => {
    const additional = parseAdditionalTimeEntry(row.AdditionalTimeEntry);
    const siteUrl = row.siteUrl || row.SiteUrl;
    const listId = row.listId || row.ListId || row.TimesheetListId;

    additional.forEach((ele: any) => {
      const taskDateFormatted = ele?.TaskDate ? String(ele.TaskDate).trim() : '';
      const dateMatch =
        taskDateFormatted === todayFormatted ||
        (taskDateFormatted && taskDateFormatted.split(' ')[0] === todayFormatted);
      if (!dateMatch) return;

      workingDayData.push({
        ...ele,
        ParentID: ele.ParentID ?? row.Id,
        TimesheetListId: listId,
        siteUrl,
        CategoryId: row.Category?.Id ?? ele.CategoryId,
      });
    });
  });

  const membersWithTotals: { User: string; AssingedToUserId: any; TotalTime: number; OMTStatus?: any }[] = [];
  let allUserEntries: any[] = [];
  const taskKey = (e: any) => `${e?.siteUrl}_${e?.TimesheetListId}_${e?.TaskID ?? e?.TaskItem?.Id ?? ''}`;

  (teamMembers || []).forEach((member: any) => {
    const userEntries = workingDayData.filter(
      (e: any) => String(e.AuthorId) === String(member.AssingedToUserId) && (e.TaskID != null || e.TaskItem != null)
    );
    const totalTime = userEntries.reduce((sum: number, e: any) => sum + (Number(e.TaskTime) || 0), 0);
    if (userEntries.length > 0) {
      membersWithTotals.push({
        User: member.Title || member.User,
        AssingedToUserId: member.AssingedToUserId,
        TotalTime: totalTime,
        OMTStatus: member.OMTStatus,
      });
      userEntries.forEach((e: any) => {
        const key = taskKey(e);
        const taskItem = taskLookup?.get(key);
        allUserEntries.push({ ...e, TaskItem: taskItem || e.TaskItem });
      });
    }
  });

  allUserEntries = allUserEntries.filter((e: any) => parseFloat(e?.TaskTime) >= 0);

  allUserEntries.forEach((e: any) => {
    const s = e.Status;
    if (s === 'Draft' || s === 'Suggestion') {
      e.lableColor = 'textgreyForTimeSheet';
      e.TimelableColor = '#8a8a8a';
    } else if (s === 'Confirmed') {
      e.lableColor = 'textblueForTimeSheet';
      e.TimelableColor = '#1976d2';
    } else if (s === 'Rejected' || s === 'Question') {
      e.lableColor = 'textredForTimeSheet';
    } else if (s === 'Approved') {
      e.lableColor = 'textgreenForTimeSheet';
      e.TimelableColor = '#43a047';
    } else if (s === 'For Approval') {
      e.lableColor = 'textorangeForTimeSheet';
      e.TimelableColor = '#B2AC88';
    }
  });

  const totalTime = membersWithTotals.reduce((sum, m) => sum + (Number(m.TotalTime) || 0), 0);

  let flatEntries = allUserEntries;
  if (selectedUserId != null && selectedUserId !== '') {
    flatEntries = allUserEntries.filter((e: any) => String(e.AuthorId) === String(selectedUserId));
  }

  return { flatEntries, membersWithTotals, totalTime };
}

/**
 * Build task lookup from taskTimeSheetsData (tasks with AdditionalTimeEntry).
 * Key: siteUrl_listId_taskId (task Id from task list).
 */
export function buildTaskLookup(taskTimeSheetsData: any[], timesheetRows?: any[]): Map<string, any> {
  const map = new Map<string, any>();
  (taskTimeSheetsData || []).forEach((task: any) => {
    const siteUrl = task.siteUrl || (typeof task.siteUrl === 'string' ? task.siteUrl : task.siteUrl?.Url);
    const listId = task.listId;
    const id = task.Id;
    if (siteUrl && listId != null && id != null) {
      map.set(`${siteUrl}_${listId}_${id}`, task);
    }
  });
  if (timesheetRows?.length && taskTimeSheetsData?.length) {
    timesheetRows.forEach((row: any) => {
      const siteUrl = row.siteUrl || row.SiteUrl;
      const listId = row.listId || row.ListId;
      const entries = parseAdditionalTimeEntry(row.AdditionalTimeEntry);
      entries.forEach((entry: any) => {
        const taskId = entry.TaskID != null ? entry.TaskItem?.Id : null;
        if (taskId == null) return;
        const task = taskTimeSheetsData.find(
          (t: any) =>
            (t.Id === taskId || t.TaskID === entry.TaskID) &&
            (t.siteUrl === siteUrl || t.listId === listId)
        );
        if (task) {
          const key = `${siteUrl}_${listId}_${task.Id}`;
          if (!map.has(key)) map.set(key, task);
        }
      });
    });
  }
  return map;
}

/**
 * Flatten taskTimeSheetsData (tasks with AdditionalTimeEntry) into entries for the modal.
 * Ensures each entry has ParentID, TimesheetListId, siteUrl (from timesheet row).
 * Use when screen already has taskTimeSheetsData but not raw timesheet rows.
 */
function parseDDMMYYYY(s: string): Date | null {
  if (!s || typeof s !== 'string') return null;
  const part = s.trim().split(' ')[0];
  const parts = part.split('/');
  if (parts.length !== 3) return null;
  const d = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const y = parseInt(parts[2], 10);
  if (isNaN(d) || isNaN(m) || isNaN(y)) return null;
  const date = new Date(y, m, d);
  return isNaN(date.getTime()) ? null : date;
}

export function flattenTasksToEntries(
  taskTimeSheetsData: any[],
  dateStr: string,
  selectedUserId: string | number | null
): any[] {
  const targetDate = parseDDMMYYYY(dateStr);
  if (!targetDate) return [];

  const out: any[] = [];
  taskTimeSheetsData.forEach((task: any) => {
    const entries = parseAdditionalTimeEntry(task.AdditionalTimeEntry);
    const siteUrl = task.siteUrl || (typeof task.siteUrl === 'object' && task.siteUrl?.Url ? task.siteUrl.Url : '');
    const listId = task.listId;

    entries.forEach((entry: any) => {
      const entryDate = parseDDMMYYYY(entry.TaskDate);
      if (!entryDate || entryDate.getTime() !== targetDate.getTime()) return;
      if (selectedUserId != null && selectedUserId !== '' && String(entry.AuthorId) !== String(selectedUserId)) return;

      out.push({
        ...entry,
        TaskItem: task,
        ParentID: entry.ParentID ?? entry.MainParentId,
        // Use entry's TimesheetListId (set from timesheet row on the screen). task.listId is the TASK list, not the timesheet list – querying the task list for AdditionalTimeEntry causes 400.
        TimesheetListId: entry.TimesheetListId ?? listId,
        siteUrl: siteUrl || entry.siteUrl,
        CategoryId: entry.CategoryId ?? task.CategoryId,
      });
    });
  });
  return out;
}

/**
 * Update status of one time entry. Appends TimeHistory and MERGEs the timesheet item.
 */
export async function updateEntryStatus(
  spToken: string,
  entry: any,
  newStatus: string,
  loginUser: any
): Promise<void> {
  const siteUrl = entry.siteUrl;
  const listId = entry.TimesheetListId;
  const parentId = entry.ParentID;
  if (!siteUrl || !listId || parentId == null) throw new Error('Entry missing siteUrl, TimesheetListId, or ParentID');

  const { additionalTimeEntry, type } = await getTimesheetItem(spToken, siteUrl, listId, parentId);
  const found = findEntry(additionalTimeEntry, entry);
  if (!found) throw new Error('Entry not found in timesheet');
  const { index, val } = found;

  const formattedDate = format(new Date(), 'dd/MM/yyyy HH:mm');
  val.TimeHistory = appendTimeHistory(val, {
    Status: newStatus,
    TaskTimeInMin: val.TaskTimeInMin,
    TaskTime: val.TaskTime,
    date: formattedDate,
    AuthorName: loginUser?.Title || loginUser?.AuthorName || '',
    AuthorImage: loginUser?.Item_x0020_Cover?.Url || loginUser?.AuthorImage || '',
    AuthorId: loginUser?.AssingedToUserId ?? loginUser?.AuthorId,
  });
  val.Status = newStatus;
  additionalTimeEntry[index] = val;

  const endpoint = `${siteUrl}/_api/web/lists/getById('${listId}')/items(${parentId})`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${spToken}`,
      Accept: 'application/json;odata=verbose',
      'Content-Type': 'application/json;odata=verbose',
      'X-HTTP-Method': 'MERGE',
      'IF-MATCH': '*',
    },
    body: JSON.stringify({ AdditionalTimeEntry: JSON.stringify(additionalTimeEntry), __metadata: { type } }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`updateEntryStatus failed: ${res.status} ${text}`);
  }
}

/**
 * Update time (minutes) for one entry. Updates TimeHistory and task TotalTime.
 * Uses existing service's incrementParentTaskTotalTime if available to avoid duplicating MERGE.
 */
export async function updateEntryTime(
  spToken: string,
  entry: any,
  newMinutes: number,
  loginUser: any,
  updateTaskTotalTimeFn?: (spToken: string, siteUrl: string, listId: string, taskId: number, deltaMinutes: number) => Promise<void>
): Promise<void> {
  const siteUrl = entry.siteUrl;
  const listId = entry.TimesheetListId;
  const parentId = entry.ParentID;
  if (!siteUrl || !listId || parentId == null) throw new Error('Entry missing siteUrl, TimesheetListId, or ParentID');

  const { additionalTimeEntry, type } = await getTimesheetItem(spToken, siteUrl, listId, parentId);
  const found = findEntry(additionalTimeEntry, entry);
  if (!found) throw new Error('Entry not found');
  const { index, val } = found;

  const oldMinutes = Number(val.TaskTimeInMin) || 0;
  const newHours = newMinutes / 60;
  val.TaskTimeInMin = newMinutes;
  val.TaskTime = newHours;

  const formattedDate = format(new Date(), 'dd/MM/yyyy HH:mm');
  val.TimeHistory = appendTimeHistory(val, {
    TaskTimeInMin: newMinutes,
    TaskTime: newHours,
    date: formattedDate,
    AuthorName: loginUser?.Title || loginUser?.AuthorName || '',
    AuthorImage: loginUser?.Item_x0020_Cover?.Url || loginUser?.AuthorImage || '',
    AuthorId: loginUser?.AssingedToUserId ?? loginUser?.AuthorId,
  });
  additionalTimeEntry[index] = val;

  const endpoint = `${siteUrl}/_api/web/lists/getById('${listId}')/items(${parentId})`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${spToken}`,
      Accept: 'application/json;odata=verbose',
      'Content-Type': 'application/json;odata=verbose',
      'X-HTTP-Method': 'MERGE',
      'IF-MATCH': '*',
    },
    body: JSON.stringify({ AdditionalTimeEntry: JSON.stringify(additionalTimeEntry), __metadata: { type } }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`updateEntryTime failed: ${res.status} ${text}`);
  }

  const taskItem = entry.TaskItem;
  if (taskItem?.Id != null && taskItem?.listId) {
    const delta = newMinutes - oldMinutes;
    if (updateTaskTotalTimeFn) {
      await updateTaskTotalTimeFn(spToken, siteUrl, taskItem.listId, taskItem.Id, delta);
    } else {
      await incrementTaskTotalTime(spToken, siteUrl, taskItem.listId, taskItem.Id, delta);
    }
  }
}

/** Increment task TotalTime by delta minutes (self-contained, no dependency on service.ts). */
async function incrementTaskTotalTime(
  spToken: string,
  siteUrl: string,
  listId: string,
  taskId: number,
  deltaMinutes: number
): Promise<void> {
  try {
    const endpoint = `${siteUrl}/_api/web/lists/getById('${listId}')/items(${taskId})`;
    const getRes = await fetch(`${endpoint}?$select=Id,TotalTime`, {
      headers: { Authorization: `Bearer ${spToken}`, Accept: 'application/json;odata=verbose' },
    });
    if (!getRes.ok) return;
    const json = await getRes.json();
    const type = json.d?.__metadata?.type;
    const existing = Number(json.d?.TotalTime) || 0;
    const updated = existing + deltaMinutes;
    await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${spToken}`,
        Accept: 'application/json;odata=verbose',
        'Content-Type': 'application/json;odata=verbose',
        'X-HTTP-Method': 'MERGE',
        'IF-MATCH': '*',
      },
      body: JSON.stringify({ TotalTime: updated, __metadata: { type } }),
    });
  } catch (e) {
    console.error('incrementTaskTotalTime error', e);
  }
}

/**
 * Update description (and optional TimeHistory entry) for one time entry.
 */
export async function updateEntryDescription(
  spToken: string,
  entry: any,
  description: string,
  loginUser: any
): Promise<void> {
  const siteUrl = entry.siteUrl;
  const listId = entry.TimesheetListId;
  const parentId = entry.ParentID;
  if (!siteUrl || !listId || parentId == null) throw new Error('Entry missing siteUrl, TimesheetListId, or ParentID');

  const { additionalTimeEntry, type } = await getTimesheetItem(spToken, siteUrl, listId, parentId);
  const found = findEntry(additionalTimeEntry, entry);
  if (!found) throw new Error('Entry not found');
  const { index, val } = found;

  val.Description = description;
  const formattedDate = format(new Date(), 'dd/MM/yyyy HH:mm');
  val.TimeHistory = appendTimeHistory(val, {
    TaskTimeInMin: val.TaskTimeInMin,
    TaskTime: val.TaskTime,
    date: formattedDate,
    AuthorName: loginUser?.Title || loginUser?.AuthorName || '',
    AuthorImage: loginUser?.Item_x0020_Cover?.Url || loginUser?.AuthorImage || '',
    AuthorId: loginUser?.AssingedToUserId ?? loginUser?.AuthorId,
  });
  additionalTimeEntry[index] = val;

  const endpoint = `${siteUrl}/_api/web/lists/getById('${listId}')/items(${parentId})`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${spToken}`,
      Accept: 'application/json;odata=verbose',
      'Content-Type': 'application/json;odata=verbose',
      'X-HTTP-Method': 'MERGE',
      'IF-MATCH': '*',
    },
    body: JSON.stringify({ AdditionalTimeEntry: JSON.stringify(additionalTimeEntry), __metadata: { type } }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`updateEntryDescription failed: ${res.status} ${text}`);
  }
}

/**
 * Add a comment to an entry. Optionally set status (e.g. Question, Rejected).
 */
export async function addEntryComment(
  spToken: string,
  entry: any,
  commentText: string,
  loginUser: any,
  newStatus?: string
): Promise<void> {
  const siteUrl = entry.siteUrl;
  const listId = entry.TimesheetListId;
  const parentId = entry.ParentID;
  if (!siteUrl || !listId || parentId == null) throw new Error('Entry missing siteUrl, TimesheetListId, or ParentID');

  const { additionalTimeEntry, type } = await getTimesheetItem(spToken, siteUrl, listId, parentId);
  const found = findEntry(additionalTimeEntry, entry);
  if (!found) throw new Error('Entry not found');
  const { index, val } = found;

  if (!Array.isArray(val.Comments)) val.Comments = [];
  const maxId = val.Comments.reduce((max: number, c: any) => (c.Id > max ? c.Id : max), 0);
  val.Comments.push({
    Id: maxId + 1,
    text: commentText,
    date: format(new Date(), 'dd/MM/yyyy HH:mm'),
    AuthorName: loginUser?.Title || loginUser?.AuthorName || '',
    AuthorImage: loginUser?.Item_x0020_Cover?.Url || loginUser?.AuthorImage || '',
    AuthorId: loginUser?.AssingedToUserId ?? loginUser?.AuthorId,
  });
  if (newStatus != null) val.Status = newStatus;
  additionalTimeEntry[index] = val;

  const endpoint = `${siteUrl}/_api/web/lists/getById('${listId}')/items(${parentId})`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${spToken}`,
      Accept: 'application/json;odata=verbose',
      'Content-Type': 'application/json;odata=verbose',
      'X-HTTP-Method': 'MERGE',
      'IF-MATCH': '*',
    },
    body: JSON.stringify({ AdditionalTimeEntry: JSON.stringify(additionalTimeEntry), __metadata: { type } }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`addEntryComment failed: ${res.status} ${text}`);
  }
}

/**
 * Get task users (duplicate of getTaskAllTaskUser so we don't touch service.ts).
 */
/**
 * Postpone (move) a time entry to a new date. Creates a new entry with the new date and removes the original.
 * newDateStr: DD/MM/YYYY
 */
export async function postponeEntry(
  spToken: string,
  entry: any,
  newDateStr: string,
  newMinutes: number,
  description: string,
  loginUser: any
): Promise<void> {
  const siteUrl = entry.siteUrl;
  const listId = entry.TimesheetListId;
  const parentId = entry.ParentID;
  if (!siteUrl || !listId || parentId == null) throw new Error('Entry missing siteUrl, TimesheetListId, or ParentID');

  const { additionalTimeEntry, type } = await getTimesheetItem(spToken, siteUrl, listId, parentId);
  const found = findEntry(additionalTimeEntry, entry);
  if (!found) throw new Error('Entry not found');
  const { index, val: originalEntry } = found;

  const newHours = newMinutes / 60;
  const maxId = additionalTimeEntry.length > 0
    ? Math.max(...additionalTimeEntry.map((e: any) => e?.ID ?? e?.Id ?? 0))
    : 0;

  let timeHistory: any[] = [];
  try {
    timeHistory = originalEntry.TimeHistory ? (typeof originalEntry.TimeHistory === 'string' ? JSON.parse(originalEntry.TimeHistory) : originalEntry.TimeHistory) : [];
  } catch {
    timeHistory = [];
  }
  const maxHistoryId = timeHistory.length > 0 ? Math.max(...timeHistory.map((h: any) => h.Id || 0)) : 0;
  timeHistory.push({
    Id: maxHistoryId + 1,
    TaskTimeInMin: newMinutes,
    TaskTime: newHours,
    Status: 'Draft',
    date: format(new Date(), 'dd/MM/yyyy HH:mm'),
    AuthorName: loginUser?.Title || loginUser?.AuthorName || '',
    AuthorId: loginUser?.AssingedToUserId ?? loginUser?.AuthorId,
  });

  const newEntry: any = {
    ...originalEntry,
    ID: maxId + 1,
    Id: maxId + 1,
    TaskDate: newDateStr,
    TaskTime: parseFloat(newHours.toFixed(2)),
    TaskTimeInMin: newMinutes,
    Description: description || originalEntry.Description || '',
    AuthorName: loginUser?.Title || loginUser?.AuthorName || originalEntry.AuthorName,
    AuthorId: loginUser?.AssingedToUserId ?? loginUser?.AuthorId ?? originalEntry.AuthorId,
    AuthorImage: loginUser?.Item_x0020_Cover?.Url || loginUser?.AuthorImage || originalEntry.AuthorImage || '',
    Status: 'Draft',
    WorkingDate: newDateStr,
    TimeHistory: JSON.stringify(timeHistory),
  };

  const existingWithoutOriginal = additionalTimeEntry.filter((e: any) => {
    const isMatch =
      (e?.ID === originalEntry?.ID || e?.Id === originalEntry?.ID || e?.ID === originalEntry?.Id || e?.Id === originalEntry?.Id) &&
      String(e?.AuthorId) === String(originalEntry?.AuthorId) &&
      String((e?.TaskDate || '').trim()) === String((originalEntry?.TaskDate || '').trim());
    return !isMatch;
  });
  existingWithoutOriginal.push(newEntry);

  const endpoint = `${siteUrl}/_api/web/lists/getById('${listId}')/items(${parentId})`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${spToken}`,
      Accept: 'application/json;odata=verbose',
      'Content-Type': 'application/json;odata=verbose',
      'X-HTTP-Method': 'MERGE',
      'IF-MATCH': '*',
    },
    body: JSON.stringify({ AdditionalTimeEntry: JSON.stringify(existingWithoutOriginal), __metadata: { type } }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`postponeEntry failed: ${res.status} ${text}`);
  }

  const taskItem = entry.TaskItem;
  const originalMinutes = Number(originalEntry.TaskTimeInMin) || 0;
  const delta = newMinutes - originalMinutes;
  if (taskItem?.Id != null && taskItem?.listId && delta !== 0) {
    await incrementTaskTotalTime(spToken, siteUrl, taskItem.listId, taskItem.Id, delta);
  }
}

/**
 * Split: add multiple new time entries (keep original). Each item has dateStr (DD/MM/YYYY) and minutes.
 */
export async function splitEntry(
  spToken: string,
  entry: any,
  splitItems: { dateStr: string; minutes: number }[],
  description: string,
  loginUser: any
): Promise<void> {
  const siteUrl = entry.siteUrl;
  const listId = entry.TimesheetListId;
  const parentId = entry.ParentID;
  if (!siteUrl || !listId || parentId == null) throw new Error('Entry missing siteUrl, TimesheetListId, or ParentID');
  if (!splitItems.length) throw new Error('Add at least one split entry');

  const { additionalTimeEntry, type } = await getTimesheetItem(spToken, siteUrl, listId, parentId);
  const found = findEntry(additionalTimeEntry, entry);
  if (!found) throw new Error('Entry not found');
  const { val: originalEntry } = found;

  const maxId = additionalTimeEntry.length > 0
    ? Math.max(...additionalTimeEntry.map((e: any) => e?.ID ?? e?.Id ?? 0))
    : 0;

  const newEntries: any[] = [];
  let totalNewMinutes = 0;
  for (let i = 0; i < splitItems.length; i++) {
    const { dateStr, minutes } = splitItems[i];
    const hours = minutes / 60;
    let timeHistory: any[] = [];
    try {
      timeHistory = originalEntry.TimeHistory ? (typeof originalEntry.TimeHistory === 'string' ? JSON.parse(originalEntry.TimeHistory) : originalEntry.TimeHistory) : [];
    } catch {
      timeHistory = [];
    }
    const maxHistoryId = timeHistory.length > 0 ? Math.max(...timeHistory.map((h: any) => h.Id || 0)) : 0;
    timeHistory.push({
      Id: maxHistoryId + 1,
      TaskTimeInMin: minutes,
      TaskTime: hours,
      Status: 'Draft',
      date: format(new Date(), 'dd/MM/yyyy HH:mm'),
      AuthorName: loginUser?.Title || loginUser?.AuthorName || '',
      AuthorId: loginUser?.AssingedToUserId ?? loginUser?.AuthorId,
    });
    newEntries.push({
      ...originalEntry,
      ID: maxId + i + 1,
      Id: maxId + i + 1,
      TaskDate: dateStr,
      TaskTime: parseFloat((minutes / 60).toFixed(2)),
      TaskTimeInMin: minutes,
      Description: description || originalEntry.Description || '',
      AuthorName: loginUser?.Title || loginUser?.AuthorName || originalEntry.AuthorName,
      AuthorId: loginUser?.AssingedToUserId ?? loginUser?.AuthorId ?? originalEntry.AuthorId,
      AuthorImage: loginUser?.Item_x0020_Cover?.Url || loginUser?.AuthorImage || originalEntry.AuthorImage || '',
      Status: 'Draft',
      WorkingDate: dateStr,
      TimeHistory: JSON.stringify(timeHistory),
    });
    totalNewMinutes += minutes;
  }

  const updated = [...additionalTimeEntry, ...newEntries];
  const endpoint = `${siteUrl}/_api/web/lists/getById('${listId}')/items(${parentId})`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${spToken}`,
      Accept: 'application/json;odata=verbose',
      'Content-Type': 'application/json;odata=verbose',
      'X-HTTP-Method': 'MERGE',
      'IF-MATCH': '*',
    },
    body: JSON.stringify({ AdditionalTimeEntry: JSON.stringify(updated), __metadata: { type } }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`splitEntry failed: ${res.status} ${text}`);
  }

  const taskItem = entry.TaskItem;
  if (taskItem?.Id != null && taskItem?.listId && totalNewMinutes > 0) {
    await incrementTaskTotalTime(spToken, siteUrl, taskItem.listId, taskItem.Id, totalNewMinutes);
  }
}

/**
 * Get previous status from entry's TimeHistory (same logic as desktop).
 * Sorts history by Id descending, skips consecutive entries with currentStatus, returns first different status.
 */
export function getPreviousStatus(entry: any, currentStatus: string): string | null {
  try {
    let timeHistory: any[] = [];
    if (entry?.TimeHistory) {
      const raw = entry.TimeHistory;
      timeHistory = typeof raw === 'string' ? JSON.parse(raw) : Array.isArray(raw) ? raw : [];
    }
    if (!Array.isArray(timeHistory) || timeHistory.length === 0) return null;

    const sortedHistory = [...timeHistory].sort((a: any, b: any) => (b.Id || 0) - (a.Id || 0));
    let skippedCurrentStatus = false;
    for (let i = 0; i < sortedHistory.length; i++) {
      const h = sortedHistory[i];
      if (!h.Status) continue;
      if (h.Status === currentStatus) {
        skippedCurrentStatus = true;
        continue;
      }
      if (skippedCurrentStatus) return h.Status;
      if (i === 0) return h.Status;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get previous status from backend (fetch timesheet item, find entry, read TimeHistory).
 * Use for revert so backend is source of truth.
 */
export async function getPreviousStatusFromBackend(
  spToken: string,
  entry: any,
  currentStatus: string
): Promise<string | null> {
  try {
    const siteUrl = entry.siteUrl;
    const listId = entry.TimesheetListId;
    const parentId = entry.ParentID;
    if (!siteUrl || !listId || parentId == null) return null;

    const { additionalTimeEntry } = await getTimesheetItem(spToken, siteUrl, listId, parentId);
    const found = findEntry(additionalTimeEntry, entry);
    if (!found) return null;
    const { val } = found;
    return getPreviousStatus(val, currentStatus);
  } catch {
    return null;
  }
}

/** Fallback previous status when TimeHistory is not available (match desktop). */
export function getFallbackPreviousStatus(
  currentStatus: string,
  panelType: string
): string {
  if (currentStatus === 'Question' || currentStatus === 'Rejected') {
    if (panelType === 'Approved') return 'For Approval';
    if (panelType === 'Confirmed' || panelType === 'Draft' || panelType === 'Suggestion') return 'Suggestion';
    return 'For Approval';
  }
  if (currentStatus === 'Confirmed') return 'Suggestion';
  if (currentStatus === 'Approved') return 'For Approval';
  if (currentStatus === 'For Approval') {
    if (panelType === 'For Approval' || panelType === 'Draft' || panelType === 'Suggestion') return 'Suggestion';
    return 'Confirmed';
  }
  return 'Suggestion';
}

export async function getTaskUsersForOMT(spToken: string): Promise<any[]> {
  try {
    const endpoint =
      `${TASK_USER_SITE}/_api/web/lists/getByTitle('${encodeURIComponent(TASK_USER_LIST)}')/items` +
      `?$select=Id,UserGroupId,Team,IsActive,OMTStatus,Suffix,Title,Email,SortOrder,Role,Company,Status,Item_x0020_Cover,AssingedToUserId,isDeleted,AssingedToUser/Title,AssingedToUser/Id,AssingedToUser/EMail,ItemType,Approver/Id,Approver/Title,Approver/Name,UserGroup/Id,UserGroup/Title,TeamLeader/Id,TeamLeader/Title` +
      `&$expand=UserGroup,AssingedToUser,Approver,TeamLeader` +
      `&$filter=IsActive eq 1` +
      `&$top=4999`;

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${spToken}`,
        Accept: 'application/json;odata=verbose',
      },
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`SP REST error: ${response.status} ${errText}`);
    }
    const json = await response.json();
    return json.d?.results ?? [];
  } catch (err) {
    console.error('getTaskUsersForOMT error:', err);
    return [];
  }
}