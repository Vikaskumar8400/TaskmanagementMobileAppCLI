/**
 * Create Task service: portfolio/project master data and task creation.
 * Uses shared spRestGet / spRestPost from service.ts for SharePoint REST.
 */

import { spRestGet, spRestPost } from './service';

const MASTER_TASK_LIST_ID = 'ec34b38f-0669-480a-910c-f84e92e58adf';
const PORTFOLIO_MASTER_SITE_URL = 'https://hhhhteams.sharepoint.com/sites/HHHH/SP';
// Desktop ServiceComponentPortfolioPopup uses listName "Master Tasks" and Dynamic.siteUrl + Dynamic.MasterTaskListID
const MASTER_TASK_LIST_TITLES = ['Master Tasks', 'MasterTasks', 'Portfolio Structure', 'Portfolio', 'Components'];

function normalizeSiteUrl(siteUrl: any): string | null {
    if (!siteUrl) return null;
    if (typeof siteUrl === 'string') return siteUrl.replace(/\/$/, '');
    if (siteUrl?.Url) return String(siteUrl.Url).replace(/\/$/, '');
    return null;
}

function getSiteUrlsToTry(siteUrlOrSites?: any): string[] {
    const seen = new Set<string>();
    const add = (u: string | null) => {
        if (u && !seen.has(u)) {
            seen.add(u);
            return true;
        }
        return false;
    };
    const out: string[] = [];
    if (siteUrlOrSites != null) {
        if (Array.isArray(siteUrlOrSites)) {
            siteUrlOrSites.forEach((s: any) => {
                const u = normalizeSiteUrl(s?.siteUrl ?? s?.Url ?? s);
                if (add(u)) out.push(u!);
            });
        } else {
            const u = normalizeSiteUrl(siteUrlOrSites?.siteUrl ?? siteUrlOrSites?.Url ?? siteUrlOrSites);
            if (add(u)) out.push(u!);
        }
    }
    if (add(PORTFOLIO_MASTER_SITE_URL)) out.unshift(PORTFOLIO_MASTER_SITE_URL);
    return out;
}

/** Normalize list id (GUID) from smartMetadata site entry. */
function normalizeListId(listId: any): string | null {
    if (!listId) return null;
    const s = String(listId).trim().replace(/^\{|\}$/g, '');
    return s.length > 0 ? s : null;
}

/** Parse list items from SharePoint REST response (odata=verbose uses d.results, nometadata uses value). */
function parseListItems(json: any): any[] {
    const raw = json?.d?.results ?? json?.d ?? json?.value ?? json?.results ?? [];
    return Array.isArray(raw) ? raw : [];
}

/**
 * Portfolio/Project data source info – for comparing with desktop.
 * Desktop uses Dynamic.siteUrl + Dynamic.MasterTaskListID (from SelectedProp in CreateTaskComponent).
 * IDs match desktop only when mobile uses the same siteUrl and listId.
 */
export type PortfolioSource = { siteUrl: string; listId: string } | null;

/**
 * Fetches portfolio/project master data (same list as desktop GetServiceAndComponentAllData when same siteUrl + MasterTaskListID).
 * Desktop: Props.siteUrl + Props.MasterTaskListID (from SelectedProp). Mobile: masterSite from smartMetadata or default below.
 * If you see different items/IDs than desktop, ensure smartMetadata "Master Tasks" (or Configurations) has the same siteUrl and listId as the desktop Create Task page context.
 */
/** Build portfolio -> tagged projects map and attach masterTaggedProject to each item (same as desktop globalCommon). */
function attachMasterTaggedProjects(items: any[]): any[] {
    const projectItems = items.filter(
        (i: any) => (i.Item_x0020_Type || i.Item_Type || '').toString().toLowerCase() === 'project' ||
            (i.Item_x0020_Type || i.Item_Type || '').toString().toLowerCase() === 'sprint' ||
            (i.Item_x0020_Type || i.Item_Type || '').toString().toLowerCase() === 'cycle'
    );
    const portfolioToProjectsMap = new Map<number, any[]>();
    projectItems.forEach((project: any) => {
        const portfolios = project.Portfolios?.results ?? project.Portfolios ?? [];
        if (Array.isArray(portfolios) && portfolios.length > 0) {
            portfolios.forEach((port: any) => {
                const portId = port?.Id ?? port?.ID;
                if (portId == null) return;
                if (!portfolioToProjectsMap.has(portId)) portfolioToProjectsMap.set(portId, []);
                portfolioToProjectsMap.get(portId)!.push({
                    projectStructerId: project.PortfolioStructureID,
                    ProjectTitle: project.Title || '',
                    ProjectId: project.Id,
                    ProjectDetail: project,
                    joinedData: [`Project ${project.PortfolioStructureID} - ${project.Title || ''}`],
                });
            });
        }
    });
    return items.map((i: any) => {
        const itemType = (i.Item_x0020_Type ?? i.Item_Type ?? '').toString().toLowerCase();
        const isProject = itemType === 'project' || itemType === 'sprint' || itemType === 'cycle';
        const masterTaggedProject = isProject ? [] : (portfolioToProjectsMap.get(i.Id ?? i.ID) ?? []);
        return { ...i, masterTaggedProject };
    });
}

export type GetPortfolioOptions = { onSourceUsed?: (source: PortfolioSource) => void };

export const getPortfolioProjectMasterData = async (
    spToken: any,
    siteUrlOrSites?: any,
    options?: GetPortfolioOptions
): Promise<any[]> => {
    const top = '&$top=4999';
    const selectMinimal = 'Id,Title';
    const selectFull = 'Id,Title,PortfolioStructureID,Item_x0020_Type,ParentID';
    const selectWithPortfolios = 'Id,Title,PortfolioStructureID,Item_x0020_Type,ParentID,Portfolios/Id,Portfolios/Title';
    const expandPortfolios = '&$expand=Portfolios';
    const defaultBase = `${PORTFOLIO_MASTER_SITE_URL}/_api/web`;
    const onSourceUsed = options?.onSourceUsed;

    const notifySource = (baseUrl: string, listId: string) => {
        const siteUrl = baseUrl.replace(/\/_api\/web\/?$/, '');
        onSourceUsed?.({ siteUrl, listId });
    };

    type SiteAndList = { baseUrl: string; listId: string };
    const explicitMaster: SiteAndList | null = (() => {
        if (!siteUrlOrSites || Array.isArray(siteUrlOrSites)) return null;
        const siteUrl = normalizeSiteUrl(siteUrlOrSites?.siteUrl ?? siteUrlOrSites?.Url);
        const listId = normalizeListId(siteUrlOrSites?.listId ?? siteUrlOrSites?.MasterTaskListID);
        if (siteUrl && listId) return { baseUrl: `${siteUrl}/_api/web`, listId };
        return null;
    })();

    const tryFetch = async (baseUrl: string, listId: string, withPortfolios = false): Promise<any[] | null> => {
        const guid = listId.toLowerCase().replace(/^\{|\}$/g, '');
        const select = withPortfolios ? selectWithPortfolios : selectFull;
        const expand = withPortfolios ? expandPortfolios : '';
        const urls = withPortfolios
            ? [`${baseUrl}/lists(guid'${guid}')/items?$select=${select}${expand}${top}`]
            : [
                `${baseUrl}/lists(guid'${guid}')/items?$select=${select}${top}`,
                `${baseUrl}/lists(guid'${guid}')/items?$select=${selectMinimal}${top}`,
            ];
        for (const url of urls) {
            try {
                const json = await spRestGet(spToken, url);
                const arr = parseListItems(json);
                if (arr.length > 0) {
                    const mapped = arr.map((i: any) => ({
                        ...i,
                        Item_x0020_Type: i.Item_x0020_Type ?? i.ItemType ?? i.Item_Type ?? 'Component',
                        PortfolioStructureID: i.PortfolioStructureID ?? i.Id,
                    }));
                    return withPortfolios ? attachMasterTaggedProjects(mapped) : attachMasterTaggedProjects(mapped);
                }
            } catch (_) {
                /* try next */
            }
        }
        return null;
    };

    const tryFetchWithPortfolios = async (baseUrl: string, listId: string): Promise<any[] | null> => {
        const withExpand = await tryFetch(baseUrl, listId, true);
        if (withExpand && withExpand.length > 0) return withExpand;
        const without = await tryFetch(baseUrl, listId, false);
        return without;
    };

    const hasPortfoliosData = (items: any[]): boolean =>
        items.some(
            (i: any) =>
                (i.masterTaggedProject?.length ?? 0) > 0 ||
                (Array.isArray(i.Portfolios?.results ?? i.Portfolios) && (i.Portfolios?.results ?? i.Portfolios)?.length > 0)
        );

    // Prefer list that has desktop-style IDs (e.g. C001, P002) over plain numeric Id
    const hasDesktopStyleIds = (items: any[]): boolean =>
        items.some((i: any) => {
            const v = i.PortfolioStructureID ?? i.Id;
            const s = String(v ?? '');
            return /^[A-Za-z]\d+/.test(s) || (s.length >= 4 && /^[A-Za-z]/.test(s));
        });

    // Discover lists on site whose title contains "Master", "Portfolio", or "Component" – desktop C001 list may have a variant name
    const discoverAndTryLists = async (baseUrl: string): Promise<{ result: any[]; listId: string } | null> => {
        try {
            const listRes = await spRestGet(spToken, `${baseUrl}/lists?$select=Id,Title&$filter=Hidden eq false&$top=100`);
            const lists = parseListItems(listRes).filter(
                (l: any) => /master|portfolio|component|structure/i.test(String(l.Title ?? ''))
            );
            let best: { result: any[]; listId: string } | null = null;
            for (const list of lists) {
                const listId = (list.Id ?? list.ID ?? '').toString().replace(/^\{|\}$/g, '');
                if (!listId) continue;
                const result = await tryFetchWithPortfolios(baseUrl, listId);
                if (result && result.length > 0) {
                    const candidate = { result, listId: list.Title || listId };
                    if (hasDesktopStyleIds(result)) return candidate;
                    if (!best) best = candidate;
                }
            }
            return best;
        } catch (_) {
            /* ignore */
        }
        return null;
    };

    // Resolve list by title to GUID (desktop uses listName "Master Tasks" + Dynamic.MasterTaskListID; we resolve same title on site)
    const getListIdByTitle = async (baseUrl: string, listTitle: string): Promise<string | null> => {
        try {
            const url = `${baseUrl}/lists/getByTitle('${encodeURIComponent(listTitle)}')?$select=Id`;
            const json = await spRestGet(spToken, url);
            const id = json?.d?.Id ?? json?.d?.ID ?? json?.Id ?? json?.ID;
            if (id) return String(id).replace(/^\{|\}$/g, '').toLowerCase();
        } catch (_) {
            /* ignore */
        }
        return null;
    };

    const tryFetchByTitle = async (baseUrl: string, listTitle: string): Promise<any[] | null> => {
        const urls = [
            `${baseUrl}/lists/getByTitle('${encodeURIComponent(listTitle)}')/items?$select=${selectWithPortfolios}${expandPortfolios}${top}`,
            `${baseUrl}/lists/getByTitle('${encodeURIComponent(listTitle)}')/items?$select=${selectFull}${top}`,
        ];
        for (const url of urls) {
            try {
                const json = await spRestGet(spToken, url);
                const arr = parseListItems(json);
                if (arr.length > 0) {
                    const mapped = arr.map((i: any) => ({
                        ...i,
                        Item_x0020_Type: i.Item_x0020_Type ?? i.ItemType ?? i.Item_Type ?? 'Component',
                        PortfolioStructureID: i.PortfolioStructureID ?? i.Id,
                    }));
                    const hasPortfolios = arr.some((i: any) => (i.Portfolios?.results ?? i.Portfolios)?.length > 0);
                    return hasPortfolios ? attachMasterTaggedProjects(mapped) : mapped;
                }
            } catch (_) {
                /* try next */
            }
        }
        return null;
    };

    let result: any[] | null = null;

    // Build list of (baseUrl, explicitListId?) to try: explicit master site first (may be subsite with C001 list), then default, then other sites
    const basesToTry: { baseUrl: string; explicitListId?: string }[] = [];
    if (explicitMaster) {
        basesToTry.push({ baseUrl: explicitMaster.baseUrl, explicitListId: explicitMaster.listId });
    }
    basesToTry.push({ baseUrl: defaultBase });
    const siteUrlsToTry = getSiteUrlsToTry(siteUrlOrSites);
    for (const base of siteUrlsToTry) {
        const baseUrl = `${base}/_api/web`;
        if (!basesToTry.some((b) => b.baseUrl === baseUrl)) {
            basesToTry.push({ baseUrl });
        }
    }

    // For each site: same as desktop (listName "Master Tasks" + siteUrl) – resolve "Master Tasks" to GUID then fetch, then by title, discover, explicit listId, fallback GUID
    for (const { baseUrl, explicitListId } of basesToTry) {
        // 1) Resolve list "Master Tasks" to GUID on this site (desktop uses this list name), then fetch by that GUID
        const masterTasksListId = await getListIdByTitle(baseUrl, 'Master Tasks');
        if (masterTasksListId) {
            result = await tryFetchWithPortfolios(baseUrl, masterTasksListId);
            if (result && result.length > 0) {
                if (!hasPortfoliosData(result)) {
                    const byTitle = await tryFetchByTitle(baseUrl, 'Master Tasks');
                    if (byTitle?.length && hasPortfoliosData(byTitle)) {
                        result = byTitle;
                    }
                }
                notifySource(baseUrl, 'Master Tasks');
                return result;
            }
        }
        for (const listTitle of MASTER_TASK_LIST_TITLES) {
            result = await tryFetchByTitle(baseUrl, listTitle);
            if (result && result.length > 0) {
                notifySource(baseUrl, listTitle);
                return result;
            }
        }
        const discovered = await discoverAndTryLists(baseUrl);
        if (discovered) {
            notifySource(baseUrl, discovered.listId);
            return discovered.result;
        }
        if (explicitListId && explicitListId !== MASTER_TASK_LIST_ID) {
            result = await tryFetchWithPortfolios(baseUrl, explicitListId);
            if (result && result.length > 0) {
                notifySource(baseUrl, explicitListId);
                return result;
            }
        }
        result = await tryFetchWithPortfolios(baseUrl, MASTER_TASK_LIST_ID);
        if (result && result.length > 0) {
            notifySource(baseUrl, MASTER_TASK_LIST_ID);
            return result;
        }
    }
    return [];
};

export interface CreateTaskPayload {
    Title: string;
    TaskUrl?: string | null;
    DueDate?: string | null;
    CategoryTitle?: string | null;
    TaskCategoriesId?: number[];
    PriorityRank?: number;
    PortfolioId?: number | null;
    ProjectId?: number | null;
    AssignedToId?: number[];
}

export interface CreateTaskSite {
    listId: string;
    siteUrl: string | { Url?: string };
    Title?: string;
}

/**
 * Fetches the list item entity type required for POST (SharePoint requires __metadata.type).
 */
async function getListItemEntityType(spToken: string, baseUrl: string, listId: string): Promise<string> {
    const url = `${baseUrl}/_api/web/lists(guid'${listId}')?$select=ListItemEntityTypeFullName`;
    const json = await spRestGet(spToken, url);
    const typeName = json.d?.ListItemEntityTypeFullName;
    if (!typeName) throw new Error('Could not get list item type');
    return typeName;
}

/**
 * Create a task on the given site (same payload shape as desktop CreateTaskComponent).
 * Portfolio and Project are optional. Uses spRestPost from service.
 * Includes list item __metadata.type so SharePoint accepts the payload (fixes 400 "entry without a type name").
 */
export const createTaskREST = async (
    spToken: string,
    site: CreateTaskSite,
    payload: CreateTaskPayload
): Promise<{ data: any }> => {
    const siteUrl = typeof site.siteUrl === 'string' ? site.siteUrl : (site.siteUrl?.Url || (site.siteUrl as any));
    if (!siteUrl || !site.listId) throw new Error('Site URL and list ID are required');

    const base = String(siteUrl).replace(/\/$/, '');
    const listItemType = await getListItemEntityType(spToken, base, site.listId);

    const priorityRank = payload.PriorityRank ?? 4;
    let priority = '(2) Normal';
    if (priorityRank >= 8 && priorityRank <= 10) priority = '(1) High';
    else if (priorityRank >= 1 && priorityRank <= 3) priority = '(3) Low';

    const assignedToIds = payload.AssignedToId ?? [];
    const item: any = {
        __metadata: { type: listItemType },
        Title: payload.Title,
        Priority: priority,
        Categories: payload.CategoryTitle || null,
        DueDate: payload.DueDate || null,
        PercentComplete: 0,
        Status: 'Not Started',
        ResponsibleTeamId: { results: [] },
        PortfolioId: payload.PortfolioId ?? null,
        TeamMembersId: { results: assignedToIds },
        ProjectId: payload.ProjectId ?? null,
        TaskCategoriesId: { results: payload.TaskCategoriesId ?? [] },
        PriorityRank: priorityRank,
        TaskTypeId: 2,
        AssignedToId: { results: assignedToIds },
        ComponentLink: payload.TaskUrl
            ? {
                __metadata: { type: 'SP.FieldUrlValue' },
                Description: payload.TaskUrl,
                Url: payload.TaskUrl,
            }
            : null,
    };

    const endpoint = `${base}/_api/web/lists(guid'${site.listId}')/items`;
    const json = await spRestPost(spToken, endpoint, item);
    return { data: json.d };
};
