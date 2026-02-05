import { format } from 'date-fns';
const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";
const SITE_ID =
    "hhhhteams.sharepoint.com,7aa2fdb5-d64a-4b3a-9ff0-9f73d34636b0,2f9c54ed-a7d4-4240-839a-e04d664c0e3a";
const LIST_ID = "b318ba84-e21d-4876-8851-88b94b9dc300"

function getSharePointSiteBase(urlString: any) {
    try {
        const url = new URL(urlString) as any;
        const pathname = url.pathname || "";
        const parts = pathname.split("/").filter(Boolean);
        const origin = `${url.origin}`;
        const siteIndex = parts.indexOf("sites");
        if (siteIndex === -1) { return { url, siteApiBase: origin, pathname: pathname } }
        const siteName = parts[siteIndex + 1];
        if (!siteName) { return { url, siteApiBase: `${origin}/sites`, pathname: pathname } }
        const nextSegment = parts[siteIndex + 2];
        const knownLibraryFolders = ["SiteCollectionImages", "PublishingImages", "SharedDocuments", "Style Library", "_layouts", "_api", "Lists"];
        const isSubsite = nextSegment && !knownLibraryFolders.includes(nextSegment);

        const siteApiBase = isSubsite ? `${origin}/sites/${siteName}/${nextSegment}` : `${origin}/sites/${siteName}`;
        return {
            url: url,
            siteApiBase: siteApiBase,
            pathname: pathname
        }
    } catch (e) {
        return { url: null, siteApiBase: "", pathname: "" };
    }
}

export const calculateSmartPriority = (result: any) => {
    try {
        let smartPriority: any = 0;
        if (result?.Project?.Title !== null && result?.Project?.Title !== undefined && result?.Project?.Title !== "") {
            const priorityRank = result?.Project?.PriorityRank ?? 1;
            if (priorityRank >= 1 && result?.PriorityRank) {
                const categories = result?.TaskCategories?.results || result?.TaskCategories || [];
                const hasImmediateCategory = categories.some((cat: any) => cat.Title === 'Immediate');
                const hasEmailNotificationCategory = categories.some((cat: any) => cat.Title === 'Email Notification');
                if (hasImmediateCategory) {
                    smartPriority = ((result?.PriorityRank) + (priorityRank * 4)) / 5 * 2;
                } else if (hasEmailNotificationCategory) {
                    smartPriority = ((result?.PriorityRank * 2) + (priorityRank * 4)) / 5;
                } else {
                    smartPriority = ((result?.PriorityRank) + (priorityRank * 4)) / 5;
                }
                result.projectPriorityOnHover = priorityRank;
                smartPriority = parseFloat(smartPriority);
            }
        } else {
            const priorityRank = 1;
            result.projectPriorityOnHover = priorityRank;
            if (result?.PriorityRank) {
                const categories = result?.TaskCategories?.results || result?.TaskCategories || [];
                const hasImmediateCategory = categories.some((cat: any) => cat.Title === 'Immediate');
                const hasEmailNotificationCategory = categories.some((cat: any) => cat.Title === 'Email Notification');
                if (hasImmediateCategory) {
                    smartPriority = ((result?.PriorityRank) + (priorityRank * 4)) / 5 * 2;
                    smartPriority = parseFloat(smartPriority);
                } else if (hasEmailNotificationCategory) {
                    smartPriority = ((result?.PriorityRank * 2) + (priorityRank * 4)) / 5;
                    smartPriority = parseFloat(smartPriority);
                } else {
                    smartPriority = ((result?.PriorityRank) + (priorityRank * 4)) / 5;
                    smartPriority = parseFloat(smartPriority);
                }
            }
        }
        return smartPriority;
    } catch (error) {
        console.error("Fetch failed:", error);
        return null;
    }
}
export const getTaskAllTaskUser = async (spToken: any) => {
    try {
        const siteUrl = "https://hhhhteams.sharepoint.com/sites/HHHH/SP";
        const listTitle = "Task Users";
        const endpoint = `${siteUrl}/_api/web/lists/getByTitle('${listTitle}')/items`
            + `?$select=Id,UserGroupId,Team,IsActive,OMTStatus,Suffix,Title,Email,SortOrder,Role,Company,Status,Item_x0020_Cover,AssingedToUserId,isDeleted,AssingedToUser/Title,AssingedToUser/Id,AssingedToUser/EMail,ItemType,Approver/Id,Approver/Title,Approver/Name,UserGroup/Id,UserGroup/Title,TeamLeader/Id,TeamLeader/Title`
            + `&$expand=UserGroup,AssingedToUser,Approver,TeamLeader`
            + `&$filter=IsActive eq 1`
            + `&$top=4999`;

        const response = await fetch(endpoint, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${spToken}`,
                "Accept": "application/json;odata=verbose"
            }
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`SP REST error: ${response.status} ${errText}`);
        }

        const json = await response.json();
        return json.d.results;
    } catch (err) {
        console.error("Error fetching Task Users:", err);
        return [];
    }
};
export const fetchImageAsBase64 = async (imageUrl: string, token: any) => {
    try {
        let urlData: any = await getSharePointSiteBase(imageUrl);
        const apiUrl = `${urlData.siteApiBase}/_api/web/GetFileByServerRelativeUrl('${urlData?.url?.pathname}')/$value`;
        const response = await fetch(apiUrl, {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "*/*",
            },
        });
        const blob = await response.blob();
        return await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.error("Fetch failed:", error);
        return null;
    }
};
export const fetchTaskUserByEmail = async ({ token, userEmail }: any) => {
    try {
        const response = await fetch(
            `${GRAPH_BASE_URL}/sites/${SITE_ID}/lists/${LIST_ID}/items` +
            `?$expand=fields($select=Email,Role,Team,IsActive,IsShowTeamLeader,Title,Suffix,Item_x0020_Cover,AssingedToUser,Approver,Company)` +
            `&$filter=(fields/Email) eq '${userEmail}'`,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            }
        );
        const result = await response.json();
        if (!response.ok) {
            console.error("Graph error:", result);
            return [];
        }
        return (
            result?.value?.map((item: any) => ({
                Email: item.fields.Email,
                Role: item.fields.Role,
                Team: item.fields.Team,
                IsActive: item.fields.IsActive,
                IsShowTeamLeader: item.fields.IsShowTeamLeader,
                AssignedTo: item.fields.AssingedToUser,
                Approver: item.fields.Approver,
                UserImage: item.fields.Item_x0020_Cover?.Url,
                Title: item.fields.Title,
                Company: item.fields.Company,
                Suffix: item.fields.Suffix,
            })) || []
        );
    } catch (error) {
        console.error("Fetch failed:", error);
        return [];
    }
};
export const getSmartMetaREST = async (spToken: any) => {
    try {
        const siteUrl = "https://hhhhteams.sharepoint.com/sites/HHHH/SP";
        const listTitle = "SmartMetadata";  // already available in ContextValue

        const token = spToken; // jo SP token tumhare paas hai

        const endpoint = `${siteUrl}/_api/web/lists/getByTitle('${listTitle}')/items`
            + `?$select=Id,Title,IsVisible,ParentID,SmartSuggestions,TaxType,Configurations,Item_x005F_x0020_Cover`
            + `,listId,siteName,siteUrl,SortOrder,SmartFilters,Selectable,Color_x0020_Tag,Parent/Id,Parent/Title`
            + `&$expand=Parent`
            + `&$top=4999`;
        const response = await fetch(endpoint, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${token}`,  // authorization
                "Accept": "application/json;odata=verbose"
            }
        });
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`SP REST error: ${response.status} ${errText}`);
        }
        const json = await response.json();
        const items = json.d.results;
        return items;
    } catch (err) {
        console.error("Error fetching Smart Metadata:", err);
    }
};

/** Shared: authorized GET for SharePoint REST (odata=verbose). Reused by createTaskService. */
export const spRestGet = async (spToken: string, url: string): Promise<any> => {
    const res = await fetch(url, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${spToken}`,
            Accept: 'application/json;odata=verbose',
        },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json();
};

/** Shared: authorized POST for SharePoint REST (odata=verbose). Reused by createTaskService. */
export const spRestPost = async (spToken: string, url: string, body: any): Promise<any> => {
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${spToken}`,
            Accept: 'application/json;odata=verbose',
            'Content-Type': 'application/json;odata=verbose',
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json();
};

export { getPortfolioProjectMasterData, createTaskREST } from './createTaskService';
export type { CreateTaskPayload, CreateTaskSite } from './createTaskService';

export const GetTaskId = (Item: any) => {
    const { TaskID, ParentTask, Id, TaskType } = Item;
    let taskIds = "";
    if (TaskType?.Title === 'Activities' || TaskType?.Title === 'Workstream') {
        taskIds += taskIds.length > 0 ? `-${TaskID}` : `${TaskID}`;
    }
    if (ParentTask?.TaskID != undefined && TaskType?.Title === 'Task') {
        taskIds += taskIds.length > 0 ? `-${ParentTask?.TaskID}-T${Id}` : `${ParentTask?.TaskID}-T${Id}`;
    } else if (ParentTask?.TaskID == undefined && TaskType?.Title === 'Task') {
        taskIds += taskIds.length > 0 ? `-T${Id}` : `T${Id}`;
    } else if (taskIds?.length <= 0) {
        taskIds += `T${Id}`;
    }
    return taskIds;
};
export const getAllTaskByFilter = async (spToken: any, filter: any, optimizedSites: any, selectedUsers: any[] = []) => {
    try {
        if (!optimizedSites?.length) return [];

        const requests = optimizedSites.map((site: any) => {

            // skip if no list name
            if (!site?.listId) return null;

            const siteUrl = typeof site.siteUrl === "string" ? site.siteUrl : site.siteUrl?.Url;
            if (!siteUrl) return null;

            let endpoint = `${siteUrl}/_api/web/lists/getById('${site.listId}')/items`
                + `?$select=Id,Title,StartDate,CompletedDate,PercentComplete,TaskID,DueDate,PriorityRank`
                + `,ParentTask/Id,ParentTask/TaskID`
                + `,TaskType/Title,TaskType/Level`
                + `,Project/Id,Project/Title,Project/PortfolioStructureID`
                + `,Portfolio/Id,Portfolio/Title`
                + `,TaskCategories/Id,TaskCategories/Title`
                + `,ResponsibleTeam/Id,ResponsibleTeam/Title`
                + `,TeamMembers/Id,TeamMembers/Title`
                + `&$expand=Project,ParentTask,TaskType,Portfolio,TaskCategories,ResponsibleTeam,TeamMembers`
                + `&$top=4999`;

            let filterQuery = "";

            if (filter && filter?.label !== "All") {
                let filterValue = filter?.value;
                if (filterValue) {
                    filterQuery = `(PercentComplete eq ${filterValue})`;
                }
            } else if (filter?.label === "All") {
                filterQuery = `(PercentComplete lt 0.90)`;
            }
            if (selectedUsers && selectedUsers.length > 0) {
                const userFilters = selectedUsers
                    .filter(u => u?.AssingedToUserId)
                    .map(u => `(ResponsibleTeam/Id eq ${u.AssingedToUserId} or TeamMembers/Id eq ${u.AssingedToUserId})`)
                    .join(" or ");

                if (userFilters) {
                    if (filterQuery) {
                        filterQuery = `(${filterQuery}) and (${userFilters})`;
                    } else {
                        filterQuery = `(${userFilters})`;
                    }
                }
            }

            if (filterQuery) {
                endpoint += `&$filter=${filterQuery}`;
            }

            return fetch(endpoint, {
                method: "GET",
                headers: { "Authorization": `Bearer ${spToken}`, "Accept": "application/json;odata=verbose" }
            })
                .then(async res => {
                    if (!res.ok) {
                        const text = await res.text();
                        throw new Error(`Failed for ${site.listId}: ${res.status} ${text}`);
                    }
                    const data = await res.json();
                    const processedResults = await Promise.all(data.d.results.map(async (item: any) => {
                        item.siteType = site.Title;
                        item.listId = site.listId;
                        item.siteUrl = site.siteUrl;
                        item["SiteIcon"] = site?.Item_x005F_x0020_Cover?.Url
                        item.PercentComplete = (item?.PercentComplete * 100).toFixed(0);
                        item["TaskID"] = GetTaskId(item);
                        return item;
                    }));
                    return processedResults;
                })
                .catch(err => {
                    // Return error object so Promise.all doesn't fail immediately
                    return {
                        site: site.siteName,
                        listId: site.listId,
                        error: err.message
                    };
                });
        });

        // Filter out null (unsupported/no list) and run all requests
        const validRequests = requests.filter((r: any) => r !== null);
        const results = await Promise.all(validRequests);
        // console.log("results", results);
        // console.log("results", results.flat().length);
        return results.flat();
    } catch (err) {
        console.error("getAllTaskLists error:", err);
        return [];
    }
};

export const getAllTimesheetdata = async (spToken: any, site: any, filter?: any) => {
    try {
        const siteUrl = site?.siteUrl;
        const listId = site?.listId;
        let endpoint = `${siteUrl}/_api/web/lists/getById('${listId}')/items`;
        if (site?.query) {
            const queryPrefix = site.query.trim().startsWith('$') ? '?' : '?$select=';
            endpoint += `${queryPrefix}${site.query}`;
        }
        if (filter) { endpoint += endpoint.includes('?') ? `&$filter=${filter}` : `?$filter=${filter}`; }
        const response = await fetch(endpoint, {
            method: "GET",
            headers: { "Authorization": `Bearer ${spToken}`, "Accept": "application/json;odata=verbose" }
        });
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`SP REST error: ${response.status} ${errText}`);
        }
        const json = await response.json();
        const data = json.d.results;
        const enrichedData = data.map((item: any) => ({
            ...item,
            siteUrl: site?.siteUrl,
            listId: site?.listId
        }));
        return enrichedData;
    } catch (err) {
        console.error("Error fetching Timesheet Data:", err);
        return [];
    }
};
export const taskFilterBasedOnTimeSheets = async (
    spToken: any,
    currentUserSeletedtodaysTimeEntry: any
) => {
    try {
        if (!currentUserSeletedtodaysTimeEntry?.length) return [];
        const apiCache = new Map<string, Promise<any[]>>();
        const requests = currentUserSeletedtodaysTimeEntry.map((elem: any) => {
            try {
                elem.AdditionalTimeEntry = JSON.parse(elem.AdditionalTimeEntry);
            } catch (error) {
                console.error("Error parsing AdditionalTimeEntry:", error);
            }
            if (!elem?.SmartMetaInfo?.length) return null;
            console.log("elem.SmartMetaInfo", elem.SmartMetaInfo.length);
            const site = elem.SmartMetaInfo[0];
            const cacheKey = `${site.siteUrl}-${site.listId}-${site.taskId}`;
            if (apiCache.has(cacheKey)) {
                return apiCache.get(cacheKey);
            }
            const endpoint =
                `${site.siteUrl}/_api/web/lists/getById('${site.listId}')/items` +
                `?$filter=Id eq ${site.taskId}` +
                `&$select=Id,Title,PercentComplete,TaskID,PriorityRank` +
                `,ParentTask/Id,ParentTask/TaskID` +
                `,TaskType/Title,TaskType/Level` +
                `,Project/Id,Project/Title,Project/PortfolioStructureID` +
                `,TaskCategories/Id,TaskCategories/Title` +
                `&$expand=Project,ParentTask,TaskType,TaskCategories`;

            const requestPromise = fetch(endpoint, {
                method: "GET",
                headers: { Authorization: `Bearer ${spToken}`, Accept: "application/json;odata=verbose", },
            })
                .then(async (res) => {
                    if (!res.ok) {
                        const text = await res.text();
                        throw new Error(`Failed for ${site.listId}: ${res.status} ${text}`);
                    }
                    const data = await res.json();
                    return data.d.results.map((item: any) => ({
                        ...item,
                        siteType: site.Title,
                        listId: site.listId,
                        siteUrl: site.siteUrl,
                        SiteIcon: site?.Item_x005F_x0020_Cover?.Url,
                        PercentComplete: (item.PercentComplete * 100).toFixed(0),
                        TaskID: GetTaskId(item),
                    }));
                });
            // ✅ STORE in cache
            apiCache.set(cacheKey, requestPromise);
            return requestPromise;
        });
        const results = await Promise.all(requests.filter(Boolean));
        const uniqueMap = new Map<string, any>();
        results.flat().forEach(item => {
            const key = `${item.siteUrl}-${item.listId}-${item.Id}`;
            if (!uniqueMap.has(key)) {
                uniqueMap.set(key, item);
            }
        });
        return Array.from(uniqueMap.values());
    } catch (err) {
        console.error("getTaskBasedOnTime error:", err);
        return [];
    }
};


// --- Time Spent logic matching user's reference ---

const normalizeSiteType = (siteType: string | undefined): string => {
    if (!siteType) return "";
    let s = siteType.replace(/%20/g, " ");
    if (s === "Offshore Tasks" || s === "SharewebQA") return "OffshoreTasks";
    return s.replace(/\s/g, "");
};

const generateUniqueId = (): string => {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

const getListItemEntityTypeFullName = async (spToken: string, siteUrl: string, listName: string) => {
    try {
        const resp = await fetch(`${siteUrl}/_api/web/lists/getByTitle('${listName}')?$select=ListItemEntityTypeFullName`, {
            headers: { "Authorization": `Bearer ${spToken}`, "Accept": "application/json;odata=verbose" }
        });
        const json = await resp.json();
        return json.d.ListItemEntityTypeFullName;
    } catch (e) {
        return `SP.Data.${listName}ListItem`;
    }
};

const moveMainRowToFolder = async (spToken: string, siteUrl: string, listName: string, mainRowId: number, currentUser: any) => {
    try {
        const company = currentUser.Company || "HHH";
        const authorName = currentUser.AuthorName || currentUser.Title;
        const listNameEncoded = encodeURIComponent(listName);
        const sourcePath = `/sites/HHHH/SP/Lists/${listNameEncoded}/${mainRowId}_.000`;
        const targetFolder = `/sites/HHHH/SP/Lists/${listNameEncoded}/${company}/${authorName}`;
        const targetPath = `${targetFolder}/${mainRowId}_.000`;

        console.log(`Moving row ${mainRowId} to ${targetPath}`);

        // 1. Create Folder structure if missing (simplified - assume it exists or use REST to create)
        // 2. Perform Move
        const moveUrl = `${siteUrl}/_api/web/getFileByServerRelativeUrl('${sourcePath}')/moveTo(newUrl='${targetPath}',flags=1)`;
        const resp = await fetch(moveUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${spToken}`,
                "Accept": "application/json;odata=verbose",
                "X-RequestDigest": "ignored"
            }
        });

        if (!resp.ok) {
            console.warn("Move operation failed (might already be in folder)", await resp.text());
        }
    } catch (err) {
        console.error("moveMainRowToFolder error", err);
    }
};

const createMainRow = async (spToken: string, siteUrl: string, listName: string, categoryTitle: string, CategoryId: number, siteType: string, taskId: number) => {
    const normalizedSiteType = normalizeSiteType(siteType);
    const smartTermId = `Task${normalizedSiteType}Id`;
    const entityType = await getListItemEntityTypeFullName(spToken, siteUrl, listName);

    const payload = {
        Title: categoryTitle,
        CategoryId: CategoryId,
        [smartTermId]: taskId,
        AdditionalTimeEntry: "[]",
        __metadata: { "type": entityType }
    };

    const endpoint = `${siteUrl}/_api/web/lists/getByTitle('${listName}')/items`;
    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${spToken}`,
            "Accept": "application/json;odata=verbose",
            "Content-Type": "application/json;odata=verbose"
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Failed to create main row: ${err}`);
    }
    const json = await response.json();
    return json.d.Id;
};

const incrementParentTaskTotalTime = async (spToken: string, siteUrl: string, parentListId: string, taskId: number, addedMinutes: number) => {
    try {
        const endpoint = `${siteUrl}/_api/web/lists(guid'${parentListId}')/items(${taskId})`;
        const getResp = await fetch(`${endpoint}?$select=TotalTime,Id`, {
            headers: { "Authorization": `Bearer ${spToken}`, "Accept": "application/json;odata=verbose" }
        });
        if (!getResp.ok) return;
        const json = await getResp.json();
        const metadataType = json.d.__metadata.type;

        const existing = Number(json.d.TotalTime) || 0;
        const updated = existing + addedMinutes;

        await fetch(endpoint, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${spToken}`,
                "Accept": "application/json;odata=verbose",
                "Content-Type": "application/json;odata=verbose",
                "X-HTTP-Method": "MERGE",
                "IF-MATCH": "*"
            },
            body: JSON.stringify({ TotalTime: updated, __metadata: { type: metadataType } })
        });
    } catch (e) {
        console.error("incrementTotalTime error", e);
    }
};

export const saveTimeSpent = async (spToken: any, params: any) => {
    const {
        currentSiteUrl, // e.g. https://hhhhteams.sharepoint.com/sites/HHHH/SP
        relativeUrl,
        listName = "TaskTimesheet",
        categoryTitle,
        taskId,
        date, // Date object
        hours,
        description,
        currentUser,
        siteType,
        parentListId,
        CreatedFrom,
        forceCreateNew = false
    } = params;

    console.log(`saveTimeSpent: Triggered for Task: ${taskId}, User: ${currentUser?.AuthorName}`);

    try {
        if (!categoryTitle || !date || hours === undefined) {
            throw new Error("Missing required parameters: category, date, and hours are required");
        }

        // Step 1: Resolve Category
        const smartMeta = await getSmartMetaREST(spToken);
        const category = smartMeta?.find((item: any) => item.Title === categoryTitle && item.TaxType === "TimesheetCategories");
        if (!category) throw new Error(`Category "${categoryTitle}" not found`);
        const CategoryId = category.Id;

        // Step 2: Get or Create Main Row
        let mainRowId: number;
        let existing: any[] = [];
        const normalizedSiteType = normalizeSiteType(siteType);
        const taskLookupField = `Task${normalizedSiteType}Id`;
        const company = currentUser.Company || "HHHH";
        const authorName = currentUser.AuthorName || currentUser.Title;
        const expectedFolderSuffix = `/${company}/${authorName}`;

        // Query for existing main row in user folder
        const filter = `${taskLookupField} eq ${taskId} and CategoryId eq ${CategoryId} and Title eq '${categoryTitle.replace(/'/g, "''")}'`;
        const checkEndpoint = `${currentSiteUrl}/_api/web/lists/getByTitle('${listName}')/items?$select=Id,AdditionalTimeEntry,Title,FileDirRef&$filter=${filter}`;

        const res = await fetch(checkEndpoint, {
            headers: { "Authorization": `Bearer ${spToken}`, "Accept": "application/json;odata=verbose" }
        });
        const json = await res.json();
        const allMatchingRows = json.d.results;

        const mainRowsOnly = allMatchingRows?.filter((r: any) => r.Title === categoryTitle);
        const inFolder = mainRowsOnly?.find((r: any) => (r.FileDirRef || '').endsWith(expectedFolderSuffix));

        if (inFolder) {
            mainRowId = inFolder.Id;
            if (inFolder.AdditionalTimeEntry) {
                try {
                    const parsed = JSON.parse(inFolder.AdditionalTimeEntry);
                    existing = Array.isArray(parsed) ? parsed : [];
                } catch (e) { existing = []; }
            }
        } else {
            // Create & Move
            mainRowId = await createMainRow(spToken, currentSiteUrl, listName, categoryTitle, CategoryId, siteType, taskId);
            await moveMainRowToFolder(spToken, currentSiteUrl, listName, mainRowId, currentUser);
            existing = [];
        }

        // Step 3: Match existing entry for UPDATE or CREATE
        const formattedDate = format(date, "dd/MM/yyyy");
        const normalizedAuthorId = String(currentUser?.AuthorId || "");

        let existingEntryToUpdate: any = null;
        let entryIndex = -1;

        // SKIP MATCHING IF forceCreateNew IS TRUE
        if (!forceCreateNew) {
            // Priority: Try to match by ID first if provided
            if (params.entryId) {
                for (let i = 0; i < existing.length; i++) {
                    const entry = existing[i];
                    // Match by ID or UniqueId
                    if (String(entry.id || entry.ID) === String(params.entryId) || entry.UniqueId === params.entryId) {
                        existingEntryToUpdate = entry;
                        entryIndex = i;
                        break;
                    }
                }
            }

            // Fallback: If no ID or not found by ID, try legacy matching
            if (!existingEntryToUpdate && !params.entryId) {
                for (let i = 0; i < existing.length; i++) {
                    const entry = existing[i];
                    const authorMatch = String(entry?.AuthorId || "") === normalizedAuthorId;
                    const dateMatch = (entry?.TaskDate || "").trim() === formattedDate;
                    const categoryMatch = Number(entry?.CategoryId || 0) === Number(CategoryId);

                    if (authorMatch && dateMatch && categoryMatch) {
                        existingEntryToUpdate = entry;
                        entryIndex = i;
                        break;
                    }
                }
            }
        }

        let updatedEntries: any[];
        let minutesDiff = 0;

        if (existingEntryToUpdate) {
            // UPDATE
            const oldMins = Number(existingEntryToUpdate.TaskTimeInMin) || 0;
            const newMins = Math.round(Number(hours) * 60);
            minutesDiff = newMins - oldMins;

            const updatedEntry = {
                ...existingEntryToUpdate,
                TaskTime: Number(hours).toFixed(2),
                TaskTimeInMin: newMins,
                TaskDate: formattedDate,
                TaskDates: format(date, 'EEE, dd/MM/yyyy'),
                Description: description || existingEntryToUpdate.Description || ""
            };
            updatedEntries = [...existing];
            updatedEntries[entryIndex] = updatedEntry;
        } else {
            // CREATE
            const entryUniqueId = generateUniqueId();
            const entryId = existing.length > 0 ? (Math.max(...existing.map((e: any) => e.ID || e.Id || 0)) + 1) : 1;
            const newMins = Math.round(Number(hours) * 60);
            minutesDiff = newMins;

            const newEntry = {
                AuthorName: authorName,
                AuthorId: currentUser.AuthorId,
                AuthorImage: currentUser.AuthorImage || currentUser.UserImage || "",
                Status: "Draft",
                ID: entryId,
                UniqueId: entryUniqueId,
                MainParentId: mainRowId,
                ParentID: mainRowId,
                TaskTime: Number(hours).toFixed(2),
                TaskTimeInMin: newMins,
                TaskDate: formattedDate,
                TaskDates: format(date, 'EEE, dd/MM/yyyy'),
                CategoryId: CategoryId,
                CreatedFrom: CreatedFrom || "Mobile",
                Description: description || ""
            };
            updatedEntries = [...existing, newEntry];
        }

        // Step 4: Save Update
        const entityType = await getListItemEntityTypeFullName(spToken, currentSiteUrl, listName);
        const updatePayload = {
            AdditionalTimeEntry: JSON.stringify(updatedEntries),
            TimesheetTitleId: mainRowId,
            __metadata: { type: entityType }
        };

        const saveUrl = `${currentSiteUrl}/_api/web/lists/getByTitle('${listName}')/items(${mainRowId})`;
        const saveResp = await fetch(saveUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${spToken}`,
                "Accept": "application/json;odata=verbose",
                "Content-Type": "application/json;odata=verbose",
                "X-HTTP-Method": "MERGE",
                "IF-MATCH": "*"
            },
            body: JSON.stringify(updatePayload)
        });

        if (!saveResp.ok) {
            const errBody = await saveResp.text();
            console.error("saveTimeSpent: API Update FAILED:", errBody);
            throw new Error(`Failed to save: ${saveResp.status} ${errBody.substring(0, 100)}`);
        }

        console.log("saveTimeSpent: API Update successful. Status:", saveResp.status);

        // Step 5: Update Parent TotalTime
        if (parentListId && minutesDiff !== 0) {
            await incrementParentTaskTotalTime(spToken, currentSiteUrl, parentListId, taskId, minutesDiff);
        }

        return { success: true, mainRowId };
    } catch (e: any) {
        console.error("saveTimeSpent error", e);
        throw e;
    }
};


// code by vikas
// code by vikas
export const buildAdditionalEntry = (params: any) => {
    const { date, hours, description, mainRowId, currentUser, id, CreatedFrom } = params;
    return {
        AuthorName: currentUser.AuthorName,
        AuthorId: currentUser.AuthorId,
        AuthorImage: currentUser.AuthorImage || currentUser.UserImage || "",
        Status: "Draft",
        ID: id,
        UniqueId: generateUniqueId(),
        MainParentId: mainRowId,
        ParentID: mainRowId,
        TaskTime: Number(hours).toFixed(2),
        TaskTimeInMin: Math.round(Number(hours) * 60),
        TaskDate: format(date, 'dd/MM/yyyy'),
        TaskDates: format(date, 'EEE, dd/MM/yyyy'),
        CreatedFrom: CreatedFrom || "Mobile",
        Description: description || ""
    };
};

export const saveMultipleTimeSpent = async (spToken: string, params: any) => {
    const {
        currentSiteUrl,
        listName = "TaskTimeSheetListNew",
        categoryTitle,
        taskId,
        entries, // Array of { date, hours, description }
        currentUser,
        siteType,
        parentListId,
        CreatedFrom
    } = params;

    try {
        // Step 1: Resolve Category
        const smartMeta = await getSmartMetaREST(spToken);
        const category = smartMeta?.find((item: any) => item.Title === categoryTitle && item.TaxType === "TimesheetCategories");
        if (!category) throw new Error(`Category "${categoryTitle}" not found`);
        const CategoryId = category.Id;

        // Step 2: Get or Create Main Row
        let mainRowId: number;
        let existing: any[] = [];
        const normalizedSiteType = normalizeSiteType(siteType);
        const taskLookupField = `Task${normalizedSiteType}Id`;
        const company = currentUser.Company || "HHHH";
        const authorName = currentUser.AuthorName || currentUser.Title;
        const expectedFolderSuffix = `/${company}/${authorName}`;

        const filter = `${taskLookupField} eq ${taskId} and CategoryId eq ${CategoryId} and Title eq '${categoryTitle.replace(/'/g, "''")}'`;
        const checkEndpoint = `${currentSiteUrl}/_api/web/lists/getByTitle('${listName}')/items?$select=Id,AdditionalTimeEntry,Title,FileDirRef&$filter=${filter}`;

        const res = await fetch(checkEndpoint, {
            headers: { "Authorization": `Bearer ${spToken}`, "Accept": "application/json;odata=verbose" }
        });
        const json = await res.json();
        const allMatchingRows = json.d.results;
        const mainRowsOnly = allMatchingRows?.filter((r: any) => r.Title === categoryTitle);
        const inFolder = mainRowsOnly?.find((r: any) => (r.FileDirRef || '').endsWith(expectedFolderSuffix));

        if (inFolder) {
            mainRowId = inFolder.Id;
            if (inFolder.AdditionalTimeEntry) {
                try {
                    const parsed = JSON.parse(inFolder.AdditionalTimeEntry);
                    existing = Array.isArray(parsed) ? parsed : [];
                } catch (e) { existing = []; }
            }
        } else {
            mainRowId = await createMainRow(spToken, currentSiteUrl, listName, categoryTitle, CategoryId, siteType, taskId);
            await moveMainRowToFolder(spToken, currentSiteUrl, listName, mainRowId, currentUser);
            existing = [];
        }

        // Step 3: Add Entries
        const allEntries = [...existing];
        let totalAddedMinutes = 0;

        for (const item of entries) {
            const entryId = allEntries.length > 0 ? (Math.max(...allEntries.map((e: any) => e.ID || e.Id || 0)) + 1) : 1;
            const entryJson = buildAdditionalEntry({
                date: item.date,
                hours: item.hours,
                description: item.description,
                mainRowId,
                currentUser,
                id: entryId,
                CreatedFrom
            });

            // Avoid exact duplicates if needed, but usually we just append
            allEntries.push(entryJson);
            totalAddedMinutes += Math.round(Number(item.hours || 0) * 60);
        }

        // Step 4: Save
        const entityType = await getListItemEntityTypeFullName(spToken, currentSiteUrl, listName);
        const updatePayload = {
            AdditionalTimeEntry: JSON.stringify(allEntries),
            TimesheetTitleId: mainRowId,
            __metadata: { type: entityType }
        };

        const saveUrl = `${currentSiteUrl}/_api/web/lists/getByTitle('${listName}')/items(${mainRowId})`;
        await fetch(saveUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${spToken}`,
                "Accept": "application/json;odata=verbose",
                "Content-Type": "application/json;odata=verbose",
                "X-HTTP-Method": "MERGE",
                "IF-MATCH": "*"
            },
            body: JSON.stringify(updatePayload)
        });

        // Step 5: Update Parent
        if (parentListId && totalAddedMinutes > 0) {
            await incrementParentTaskTotalTime(spToken, currentSiteUrl, parentListId, taskId, totalAddedMinutes);
        }

        return { success: true, mainRowId, entries: allEntries.length };
    } catch (e) {
        console.error("saveMultipleTimeSpent error", e);
        throw e;
    }
};




export const deleteTimeEntry = async (spToken: any, params: any) => {
    const {
        currentSiteUrl,
        listName = "TaskTimesheet",
        categoryTitle,
        taskId,
        currentUser,
        siteType,
        entryId,
        parentListId
    } = params;

    console.log(`deleteTimeEntry: Deleting entry ${entryId} from ${categoryTitle}`);

    try {
        // Step 1: Find the Main Row for the Category
        const smartMeta = await getSmartMetaREST(spToken);
        const category = smartMeta?.find((item: any) => item.Title === categoryTitle && item.TaxType === "TimesheetCategories");
        if (!category) throw new Error(`Category "${categoryTitle}" not found`);
        const CategoryId = category.Id;

        const normalizedSiteType = normalizeSiteType(siteType);
        const taskLookupField = `Task${normalizedSiteType}Id`;
        const company = currentUser.Company || "HHHH";
        const authorName = currentUser.AuthorName || currentUser.Title;
        const expectedFolderSuffix = `/${company}/${authorName}`;

        const filter = `${taskLookupField} eq ${taskId} and CategoryId eq ${CategoryId} and Title eq '${categoryTitle.replace(/'/g, "''")}'`;
        const checkEndpoint = `${currentSiteUrl}/_api/web/lists/getByTitle('${listName}')/items?$select=Id,AdditionalTimeEntry,Title,FileDirRef&$filter=${filter}`;

        const res = await fetch(checkEndpoint, {
            headers: { "Authorization": `Bearer ${spToken}`, "Accept": "application/json;odata=verbose" }
        });
        const json = await res.json();
        const allMatchingRows = json.d.results;
        const mainRowsOnly = allMatchingRows?.filter((r: any) => r.Title === categoryTitle);
        const inFolder = mainRowsOnly?.find((r: any) => (r.FileDirRef || '').endsWith(expectedFolderSuffix));

        if (!inFolder) {
            console.warn("deleteTimeEntry: No row found for category");
            return;
        }

        let existing: any[] = [];
        try {
            existing = JSON.parse(inFolder.AdditionalTimeEntry || "[]");
        } catch (e) { existing = []; }

        // Step 2: Remove the entry
        const entryToRemove = existing.find((e: any) => String(e.id || e.ID) === String(entryId) || e.UniqueId === entryId);
        if (!entryToRemove) {
            console.warn("deleteTimeEntry: Entry ID not found");
            return;
        }

        const updatedEntries = existing.filter((e: any) => String(e.id || e.ID) !== String(entryId) && e.UniqueId !== entryId);

        // Step 3: Save Update
        const jsonString = JSON.stringify(updatedEntries);
        const updateUrl = `${currentSiteUrl}/_api/web/lists/getByTitle('${listName}')/items(${inFolder.Id})`;

        await fetch(updateUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${spToken}`,
                "Accept": "application/json;odata=verbose",
                "Content-Type": "application/json;odata=verbose",
                "X-HTTP-Method": "MERGE",
                "IF-MATCH": "*"
            },
            body: JSON.stringify({ AdditionalTimeEntry: jsonString, __metadata: { type: inFolder.__metadata?.type || `SP.Data.${listName}ListItem` } })
        });

        // Step 4: Decrement Total Time
        const removedMins = Number(entryToRemove.TaskTimeInMin) || 0;
        if (parentListId && removedMins > 0) {
            await incrementParentTaskTotalTime(spToken, currentSiteUrl, parentListId, taskId, -removedMins);
        }

        console.log("deleteTimeEntry success");
    } catch (err) {
        console.error("deleteTimeEntry error:", err);
        throw err;
    }
};

export const updateTimeEntryStatus = async (spToken: any, params: any) => {
    const {
        currentSiteUrl,
        listName = "TaskTimesheet",
        categoryTitle,
        taskId,
        currentUser,
        siteType,
        entryId,
        newStatus,
        comments
    } = params;

    console.log(`updateTimeEntryStatus: Updating ${entryId} to ${newStatus}`);

    try {
        const smartMeta = await getSmartMetaREST(spToken);
        const category = smartMeta?.find((item: any) => item.Title === categoryTitle && item.TaxType === "TimesheetCategories");
        if (!category) throw new Error(`Category "${categoryTitle}" not found`);
        const CategoryId = category.Id;

        const normalizedSiteType = normalizeSiteType(siteType);
        const taskLookupField = `Task${normalizedSiteType}Id`;
        const company = currentUser.Company || "HHHH";
        const authorName = currentUser.AuthorName || currentUser.Title;
        const expectedFolderSuffix = `/${company}/${authorName}`;

        const filter = `${taskLookupField} eq ${taskId} and CategoryId eq ${CategoryId} and Title eq '${categoryTitle.replace(/'/g, "''")}'`;
        const checkEndpoint = `${currentSiteUrl}/_api/web/lists/getByTitle('${listName}')/items?$select=Id,AdditionalTimeEntry,Title,FileDirRef&$filter=${filter}`;

        const res = await fetch(checkEndpoint, {
            headers: { "Authorization": `Bearer ${spToken}`, "Accept": "application/json;odata=verbose" }
        });
        const json = await res.json();
        const mainRowsOnly = json.d.results?.filter((r: any) => r.Title === categoryTitle);
        const inFolder = mainRowsOnly?.find((r: any) => (r.FileDirRef || '').endsWith(expectedFolderSuffix));

        if (!inFolder) throw new Error("TimeSheet row not found");

        let existing: any[] = [];
        try { existing = JSON.parse(inFolder.AdditionalTimeEntry || "[]"); } catch (e) { existing = []; }

        const entryIndex = existing.findIndex((e: any) => String(e.id || e.ID) === String(entryId) || e.UniqueId === entryId);
        if (entryIndex === -1) throw new Error("Entry not found");

        // Update Status
        existing[entryIndex].Status = newStatus;
        if (comments) existing[entryIndex].Comments = comments;

        // Add to TimeHistory if needed (simplified)
        if (!existing[entryIndex].TimeHistory) existing[entryIndex].TimeHistory = [];
        existing[entryIndex].TimeHistory.push({
            Status: newStatus,
            Date: new Date(),
            AuthorName: currentUser.Title,
            AuthorId: currentUser.Id
        });

        const updateUrl = `${currentSiteUrl}/_api/web/lists/getByTitle('${listName}')/items(${inFolder.Id})`;
        await fetch(updateUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${spToken}`,
                "Accept": "application/json;odata=verbose",
                "Content-Type": "application/json;odata=verbose",
                "X-HTTP-Method": "MERGE",
                "IF-MATCH": "*"
            },
            body: JSON.stringify({ AdditionalTimeEntry: JSON.stringify(existing), __metadata: { type: inFolder.__metadata.type } })
        });

        return { success: true };
    } catch (err) {
        console.error("updateTimeEntryStatus error:", err);
        throw err;
    }
};

export const updateTaskTotalTime = async (spToken: string, siteUrl: string, listId: string, taskId: number, newTotalTime: number) => {
    try {
        const endpoint = `${siteUrl}/_api/web/lists(guid'${listId}')/items(${taskId})`;
        // Get type first
        const getResp = await fetch(`${endpoint}?$select=Id`, {
            headers: { "Authorization": `Bearer ${spToken}`, "Accept": "application/json;odata=verbose" }
        });
        if (!getResp.ok) return;
        const json = await getResp.json();
        const type = json.d.__metadata.type;

        await fetch(endpoint, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${spToken}`,
                "Accept": "application/json;odata=verbose",
                "Content-Type": "application/json;odata=verbose",
                "X-HTTP-Method": "MERGE",
                "IF-MATCH": "*"
            },
            body: JSON.stringify({ TotalTime: newTotalTime, __metadata: { type } })
        });
    } catch (e) {
        console.error("updateTaskTotalTime error", e);
    }
};

// code by vikas calender
export const LEAVE_CALENDAR_LIST_ID = "SmalsusLeaveCalendar"; // Update this with actual ID

export const getUtcTime = (date: any) => {
    if (!date) return "";
    return new Date(date).toISOString();
};

// code by leavereport
export const getLeaveEventsResult = async (spToken: string, siteUrl: string) => {
    try {
        const query =
            "$select=RecurrenceData,Duration,Author/Title,Editor/Title,Employee/Id,Employee/Title,Category,Designation,Description,ID,EndDate,EventDate,Location,Title,fAllDayEvent,EventType,UID,fRecurrence,Event_x002d_Type,HalfDay,HalfDayTwo,Color,Created,Modified,Approved,Rejected" +
            "&$expand=Author,Editor,Employee" +
            "&$top=4999";

        const endpoint = `${siteUrl}/_api/web/lists/getByTitle('${LEAVE_CALENDAR_LIST_ID}')/items?${query}`;

        const response = await fetch(endpoint, {
            headers: {
                "Authorization": `Bearer ${spToken}`,
                "Accept": "application/json;odata=verbose"
            }
        });

        if (!response.ok) return [];
        const json = await response.json();
        return json.d.results;
    } catch (error) {
        console.error("Error fetching events", error);
        return [];
    }
};

export const addLeaveEvent = async (spToken: string, siteUrl: string, eventData: any) => {
    try {
        const endpoint = `${siteUrl}/_api/web/lists/getByTitle('${LEAVE_CALENDAR_LIST_ID}')/items`;

        const payload = {
            ...eventData,
            __metadata: { type: "SP.Data.SmalsusLeaveCalendarListItem" } // Assuming generic list item type, might need update
        };

        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${spToken}`,
                "Accept": "application/json;odata=verbose",
                "Content-Type": "application/json;odata=verbose"
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const txt = await response.text();
            throw new Error(txt);
        }
        return await response.json();
    } catch (error) {
        console.error("Error adding event", error);
        throw error;
    }
};

// code by vikas calender
export const getChoicesFromField = async (spToken: string, siteUrl: string, listName: string, fieldName: string) => {
    try {
        const endpoint = `${siteUrl}/_api/web/lists/getByTitle('${listName}')/fields/getByInternalNameOrTitle('${fieldName}')`;
        const response = await fetch(endpoint, {
            headers: {
                "Authorization": `Bearer ${spToken}`,
                "Accept": "application/json;odata=verbose"
            }
        });

        if (!response.ok) {
            return [];
        }

        const json = await response.json();
        return json.d.Choices?.results || json.d.Choices || [];
    } catch (error) {
        console.error(`Error fetching choices for ${fieldName}`, error);
        return [];
    }
};


// code by vikas permission in Management level

export const getComponentPermission = async (spToken: string, siteUrl: string, title: string) => {
    try {
        const query = `$select=Id,Title,AllowedUsers/Id,AllowedUsers/Title,AllowedUsers/EMail&$expand=AllowedUsers&$filter=Title eq '${title}'`;
        const endpoint = `${siteUrl}/_api/web/lists/getByTitle('ComponentPermissions')/items?${query}`;

        const response = await fetch(endpoint, {
            headers: {
                "Authorization": `Bearer ${spToken}`,
                "Accept": "application/json;odata=verbose"
            }
        });
        if (!response.ok) return null;
        const json = await response.json();
        return json.d.results[0] || null;
    } catch (error) {
        console.error("Error fetching permission", error);
        return null;
    }
};
