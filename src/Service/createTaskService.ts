/**
 * Create Task service: portfolio/project master data and task creation.
 * Uses shared spRestGet / spRestPost from service.ts for SharePoint REST.
 */

import { spRestGet, spRestPost } from './service';

const MASTER_TASK_LIST_ID = 'ec34b38f-0669-480a-910c-f84e92e58adf';
const PORTFOLIO_MASTER_SITE_URL = 'https://hhhhteams.sharepoint.com/sites/HHHH/SP';
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

/**
 * Fetches portfolio/project master data (same as desktop GetServiceAndComponentAllData: Props.siteUrl + Props.MasterTaskListID).
 * Prefer masterSite when provided: { siteUrl, listId } from smartMetadata (e.g. TaxType === 'Sites' && Title === 'Master Tasks').
 * Otherwise tries default site + list titles. Uses minimal select first to avoid 400. Returns [] on failure.
 */
export const getPortfolioProjectMasterData = async (spToken: any, siteUrlOrSites?: any): Promise<any[]> => {
    const top = '&$top=4999';
    const selectMinimal = 'Id,Title';
    const selectFull = 'Id,Title,PortfolioStructureID,Item_x0020_Type,ParentID';

    type SiteAndList = { baseUrl: string; listId: string };
    const explicitMaster: SiteAndList | null = (() => {
        if (!siteUrlOrSites || Array.isArray(siteUrlOrSites)) return null;
        const siteUrl = normalizeSiteUrl(siteUrlOrSites?.siteUrl ?? siteUrlOrSites?.Url);
        const listId = normalizeListId(siteUrlOrSites?.listId ?? siteUrlOrSites?.MasterTaskListID);
        if (siteUrl && listId) return { baseUrl: `${siteUrl}/_api/web`, listId };
        return null;
    })();

    const tryFetch = async (baseUrl: string, listId: string): Promise<any[] | null> => {
        const guid = listId.toLowerCase().replace(/^\{|\}$/g, '');
        const urls = [
            `${baseUrl}/lists(guid'${guid}')/items?$select=${selectMinimal}${top}`,
            `${baseUrl}/lists(guid'${guid}')/items?$select=${selectFull}${top}`,
        ];
        for (const url of urls) {
            try {
                const json = await spRestGet(spToken, url);
                const items = json.d?.results ?? json.d ?? [];
                const arr = Array.isArray(items) ? items : [];
                if (arr.length > 0) {
                    return arr.map((i: any) => ({
                        ...i,
                        Item_x0020_Type: i.Item_x0020_Type ?? i.ItemType ?? i.Item_Type,
                        PortfolioStructureID: i.PortfolioStructureID ?? i.Id,
                    }));
                }
            } catch (_) {
                /* try next */
            }
        }
        return null;
    };

    if (explicitMaster) {
        const result = await tryFetch(explicitMaster.baseUrl, explicitMaster.listId);
        if (result && result.length > 0) return result;
    }

    const siteUrlsToTry = getSiteUrlsToTry(siteUrlOrSites);
    for (const base of siteUrlsToTry) {
        const baseUrl = `${base}/_api/web`;
        let result = await tryFetch(baseUrl, MASTER_TASK_LIST_ID);
        if (result && result.length > 0) return result;
        for (const title of MASTER_TASK_LIST_TITLES) {
            const byTitle = [
                `${baseUrl}/lists/getByTitle('${encodeURIComponent(title)}')/items?$select=${selectMinimal}${top}`,
                `${baseUrl}/lists/getByTitle('${encodeURIComponent(title)}')/items?$select=${selectFull}${top}`,
            ];
            for (const url of byTitle) {
                try {
                    const json = await spRestGet(spToken, url);
                    const items = json.d?.results ?? json.d ?? [];
                    const arr = Array.isArray(items) ? items : [];
                    if (arr.length > 0) {
                        return arr.map((i: any) => ({
                            ...i,
                            Item_x0020_Type: i.Item_x0020_Type ?? i.ItemType ?? i.Item_Type,
                            PortfolioStructureID: i.PortfolioStructureID ?? i.Id,
                        }));
                    }
                } catch (_) {
                    continue;
                }
            }
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
