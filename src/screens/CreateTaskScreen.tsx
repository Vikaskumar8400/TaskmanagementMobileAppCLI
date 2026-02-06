import React, { useState, useMemo, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TextInput,
    TouchableOpacity,
    Modal,
    FlatList,
    Image,
    ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { Calendar } from 'react-native-calendars';
import { addDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, format } from 'date-fns';
import { fetchImageAsBase64 } from '../Service/service';
import { getPortfolioProjectMasterData, createTaskREST } from '../Service/createTaskService';

const CreateTaskScreen = ({ navigation }: any) => {
    const { theme } = useTheme();
    const { user, smartMetadata, spToken, taskUsers } = useAuth();

    // General
    const [taskName, setTaskName] = useState('');
    const [taskUrl, setTaskUrl] = useState('');

    // Master Tasks site (same as desktop: Dynamic.siteUrl + Dynamic.MasterTaskListID for GetServiceAndComponentAllData)
    const masterSite = useMemo(() => {
        if (!smartMetadata?.length) return null;
        const sites = smartMetadata.filter((m: any) => m.TaxType === 'Sites');
        const normalize = (s: string) => (s || '').replace(/\/$/, '');
        const toListId = (v: any) => (v != null ? String(v).trim().replace(/^\{|\}$/g, '') : null);

        // 1) Explicit "Master Tasks" site row (listId + siteUrl on item)
        const masterRow = sites.find((m: any) => m.Title === 'Master Tasks');
        if (masterRow) {
            const siteUrl = masterRow.siteUrl && (typeof masterRow.siteUrl === 'string' ? masterRow.siteUrl : masterRow.siteUrl?.Url);
            const listId = toListId(masterRow.listId);
            if (siteUrl && listId) return { siteUrl: normalize(siteUrl), listId };
        }

        // 2) From Configurations (desktop UserTimeEntry: JSONData[0].MasterTaskListID + siteUrl)
        for (const item of smartMetadata) {
            const raw = item.Configurations;
            if (raw == null) continue;
            try {
                const c = typeof raw === 'string' ? JSON.parse(raw) : raw;
                const arr = Array.isArray(c) ? c : [c];
                const first = arr[0];
                if (first?.MasterTaskListID != null) {
                    const siteUrl = first.siteUrl ?? first.Url ?? item.siteUrl ?? (typeof item.siteUrl === 'string' ? item.siteUrl : item.siteUrl?.Url);
                    const listId = toListId(first.MasterTaskListID ?? first.listId);
                    if (siteUrl && listId) return { siteUrl: normalize(siteUrl), listId };
                }
            } catch (_) {
                /* skip */
            }
        }

        // 3) First Sites entry URL + known Master Tasks list GUID (desktop fallback)
        const firstSite = sites[0];
        if (firstSite) {
            const siteUrl = firstSite.siteUrl && (typeof firstSite.siteUrl === 'string' ? firstSite.siteUrl : firstSite.siteUrl?.Url);
            if (siteUrl) return { siteUrl: normalize(siteUrl), listId: 'ec34b38f-0669-480a-910c-f84e92e58adf' };
        }
        return null;
    }, [smartMetadata]);

    // Portfolio / Project master data (Component = portfolio, Project = project)
    const [portfolioProjectMasterData, setPortfolioProjectMasterData] = useState<any[]>([]);
    const [portfolioProjectLoading, setPortfolioProjectLoading] = useState(true);
    const [portfolioProjectError, setPortfolioProjectError] = useState<string | null>(null);
    const loadPortfolioProjectData = React.useCallback(() => {
        if (!spToken) {
            setPortfolioProjectLoading(false);
            setPortfolioProjectError(null);
            return;
        }
        setPortfolioProjectError(null);
        setPortfolioProjectLoading(true);
        // Pass masterSite first (same as desktop ServiceComponentPortfolioPopup: Dynamic.siteUrl + Dynamic.MasterTaskListID)
        getPortfolioProjectMasterData(spToken, masterSite ?? sites)
            .then((items) => {
                setPortfolioProjectMasterData(Array.isArray(items) ? items : []);
                setPortfolioProjectError(null);
            })
            .catch((err: any) => {
                setPortfolioProjectMasterData([]);
                setPortfolioProjectError(err?.message || 'Unable to load portfolios. Check your connection or try again.');
            })
            .finally(() => setPortfolioProjectLoading(false));
    }, [spToken, masterSite, sites]);
    useEffect(() => {
        loadPortfolioProjectData();
    }, [loadPortfolioProjectData]);

    const portfolioOptions = useMemo(() => {
        return portfolioProjectMasterData
            .filter((item: any) => (item.Item_x0020_Type || item.Item_Type) === 'Component')
            .sort((a: any, b: any) => (a.PortfolioStructureID || '').localeCompare(b.PortfolioStructureID || '', undefined, { sensitivity: 'base' }));
    }, [portfolioProjectMasterData]);
    const projectOptions = useMemo(() => {
        return portfolioProjectMasterData
            .filter((item: any) => (item.Item_x0020_Type || item.Item_Type) === 'Project' || (item.Item_x0020_Type || item.Item_Type) === 'Sprint' || (item.Item_x0020_Type || item.Item_Type) === 'Cycle')
            .sort((a: any, b: any) => (a.PortfolioStructureID || '').localeCompare(b.PortfolioStructureID || '', undefined, { sensitivity: 'base' }));
    }, [portfolioProjectMasterData]);
    const [portfolioModalVisible, setPortfolioModalVisible] = useState(false);
    const [portfolioSearch, setPortfolioSearch] = useState('');
    const [selectedPortfolio, setSelectedPortfolio] = useState<any>(null);
    const [selectedProject, setSelectedProject] = useState<any>(null);
    const [projectModalVisible, setProjectModalVisible] = useState(false);
    const [projectSearch, setProjectSearch] = useState('');
    const filteredPortfolioOptions = useMemo(() => {
        if (!portfolioSearch.trim()) return portfolioOptions;
        const q = portfolioSearch.toLowerCase();
        return portfolioOptions.filter(
            (c: any) =>
                (c.Title || '').toLowerCase().includes(q) ||
                (c.PortfolioStructureID || '').toLowerCase().includes(q)
        );
    }, [portfolioOptions, portfolioSearch]);
    const suggestedProjectsForPortfolio = useMemo(() => {
        if (!selectedPortfolio?.Id) return [];
        const portId = selectedPortfolio.Id;
        const list = (p: any) => {
            const ports = p.Portfolios?.results ?? p.Portfolios;
            return Array.isArray(ports) && ports.some((port: any) => port?.Id === portId);
        };
        return projectOptions.filter(list);
    }, [selectedPortfolio, projectOptions]);
    useEffect(() => {
        if (!selectedPortfolio) {
            setSelectedProject(null);
            return;
        }
        const suggested = suggestedProjectsForPortfolio;
        const fromTag = selectedPortfolio.masterTaggedProject?.results?.[0]?.ProjectDetail ?? selectedPortfolio.masterTaggedProject?.[0]?.ProjectDetail;
        if (fromTag) {
            const match = projectOptions.find((p: any) => p.Id === fromTag.Id);
            setSelectedProject(match || fromTag);
        } else if (suggested.length > 0) {
            setSelectedProject(suggested[0]);
        } else {
            setSelectedProject(null);
        }
    }, [selectedPortfolio?.Id, suggestedProjectsForPortfolio.length, projectOptions.length]);
    const projectListForModal = useMemo(() => {
        const list = suggestedProjectsForPortfolio.length > 0 ? suggestedProjectsForPortfolio : projectOptions;
        if (!projectSearch.trim()) return list;
        const q = projectSearch.toLowerCase();
        return list.filter((p: any) => (p.Title || '').toLowerCase().includes(q) || (p.PortfolioStructureID || '').toLowerCase().includes(q));
    }, [suggestedProjectsForPortfolio, projectOptions, projectSearch]);

    // Websites (Sites)
    const sites = useMemo(() => {
        if (!smartMetadata?.length) return [];
        return smartMetadata
            .filter((item: any) => item.TaxType === 'Sites' && item.Title !== 'Master Tasks')
            .sort((a: any, b: any) => (a.SortOrder ?? 0) - (b.SortOrder ?? 0));
    }, [smartMetadata]);
    const [selectedWebsiteSite, setSelectedWebsiteSite] = useState<any>(null);

    // Parent title helper (lowercase)
    const parentTitle = (item: any) => (item.Parent?.Title || '').toLowerCase();
    const isActionParent = (item: any) => {
        const pt = parentTitle(item);
        return pt === 'action' || pt === 'actions';
    };

    // Type – desktop tile types only: subCategories, exclude Admin, Approval, Action/Actions, Immediate
    const types = useMemo(() => {
        if (!smartMetadata?.length) return [];
        return smartMetadata
            .filter(
                (item: any) =>
                    item.TaxType === 'Categories' &&
                    item.ParentID != null &&
                    item.ParentID !== 0 &&
                    item.IsVisible !== false &&
                    item.Title !== 'Immediate' &&
                    parentTitle(item) !== 'admin' &&
                    parentTitle(item) !== 'approval' &&
                    !isActionParent(item)
            )
            .sort((a: any, b: any) => (a.Title || '').localeCompare(b.Title || '', undefined, { sensitivity: 'base' }));
    }, [smartMetadata]);

    // Action – Categories whose parent is "Action" or "Actions"; shown as tiles
    const actionTiles = useMemo(() => {
        if (!smartMetadata?.length) return [];
        return smartMetadata
            .filter(
                (item: any) =>
                    item.TaxType === 'Categories' && isActionParent(item)
            )
            .sort((a: any, b: any) => (a.SortOrder ?? 0) - (b.SortOrder ?? 0));
    }, [smartMetadata]);
    const [selectedAction, setSelectedAction] = useState<any>(null);
    const [typeModalVisible, setTypeModalVisible] = useState(false);
    const [typeSearch, setTypeSearch] = useState('');
    const [selectedType, setSelectedType] = useState<any>(null);
    const filteredTypes = useMemo(() => {
        if (!typeSearch.trim()) return types;
        const q = typeSearch.toLowerCase();
        return types.filter(
            (c: any) =>
                (c.Title || '').toLowerCase().includes(q) ||
                (c.Parent?.Title || '').toLowerCase().includes(q)
        );
    }, [types, typeSearch]);

    // Admin – Categories whose parent is "Admin" only; dropdown with search
    const adminOptions = useMemo(() => {
        if (!smartMetadata?.length) return [];
        return smartMetadata
            .filter(
                (item: any) =>
                    item.TaxType === 'Categories' &&
                    (item.Parent?.Title || '').toLowerCase() === 'admin'
            )
            .sort((a: any, b: any) => (a.Title || '').localeCompare(b.Title || '', undefined, { sensitivity: 'base' }));
    }, [smartMetadata]);
    const [adminModalVisible, setAdminModalVisible] = useState(false);
    const [adminSearch, setAdminSearch] = useState('');
    const [selectedAdmin, setSelectedAdmin] = useState<any>(null);
    const filteredAdminOptions = useMemo(() => {
        if (!adminSearch.trim()) return adminOptions;
        const q = adminSearch.toLowerCase();
        return adminOptions.filter((c: any) => (c.Title || '').toLowerCase().includes(q));
    }, [adminOptions, adminSearch]);

    // Priority (Priority Rank)
    const priorities = useMemo(() => {
        if (!smartMetadata?.length) return [];
        return smartMetadata
            .filter((item: any) => item.TaxType === 'Priority Rank')
            .sort((a: any, b: any) => (a.SortOrder ?? 999) - (b.SortOrder ?? 999));
    }, [smartMetadata]);
    const [priorityModalVisible, setPriorityModalVisible] = useState(false);
    const [selectedPriority, setSelectedPriority] = useState<any>(null);

    // Due Date
    const [dueDatePreset, setDueDatePreset] = useState<string | null>(null);
    const [dueDateCustom, setDueDateCustom] = useState<string | null>(null);
    const [calendarVisible, setCalendarVisible] = useState(false);
    const today = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);
    const dueDateDisplay = useMemo(() => {
        if (dueDateCustom) return dueDateCustom;
        if (!dueDatePreset) return null;
        const now = new Date();
        switch (dueDatePreset) {
            case 'Today':
                return format(now, 'yyyy-MM-dd');
            case 'Tomorrow':
                return format(addDays(now, 1), 'yyyy-MM-dd');
            case 'This Week':
                return `${format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd')} – ${format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd')}`;
            case 'Next Week':
                const nextWeek = addDays(now, 7);
                return `${format(startOfWeek(nextWeek, { weekStartsOn: 1 }), 'yyyy-MM-dd')} – ${format(endOfWeek(nextWeek, { weekStartsOn: 1 }), 'yyyy-MM-dd')}`;
            case 'This Month':
                return `${format(startOfMonth(now), 'yyyy-MM-dd')} – ${format(endOfMonth(now), 'yyyy-MM-dd')}`;
            default:
                return null;
        }
    }, [dueDatePreset, dueDateCustom]);

    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);

    const handleCreate = async () => {
        const title = (taskName || '').trim();
        if (!title) {
            setCreateError('Task name is required.');
            return;
        }
        const site = selectedWebsiteSite;
        const siteUrl = typeof site?.siteUrl === 'string' ? site.siteUrl : site?.siteUrl?.Url;
        if (!site?.listId || !siteUrl) {
            setCreateError('Please select a site under Websites.');
            return;
        }
        setCreateError(null);
        setCreating(true);
        try {
            const currentUser = taskUsers?.find((u: any) => (u?.Email || u?.EMail)?.toLowerCase() === (user?.Email)?.toLowerCase());
            const assignedToId = currentUser?.AssingedToUserId ?? currentUser?.Id;
            let dueDate: string | null = dueDateCustom;
            if (!dueDate && dueDatePreset) {
                const now = new Date();
                if (dueDatePreset === 'Today') dueDate = format(now, 'yyyy-MM-dd');
                else if (dueDatePreset === 'Tomorrow') dueDate = format(addDays(now, 1), 'yyyy-MM-dd');
                else if (dueDatePreset === 'This Week') dueDate = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
                else if (dueDatePreset === 'Next Week') dueDate = format(startOfWeek(addDays(now, 7), { weekStartsOn: 1 }), 'yyyy-MM-dd');
                else if (dueDatePreset === 'This Month') dueDate = format(startOfMonth(now), 'yyyy-MM-dd');
            }
            await createTaskREST(spToken!, { listId: site.listId, siteUrl, Title: site.Title }, {
                Title: title,
                TaskUrl: (taskUrl || '').trim() || null,
                DueDate: dueDate,
                CategoryTitle: selectedType ? selectedType.Title : null,
                TaskCategoriesId: selectedType ? [selectedType.Id] : [],
                PriorityRank: selectedPriority ? parseInt(selectedPriority.Title, 10) || 4 : 4,
                PortfolioId: selectedPortfolio?.Id ?? null,
                ProjectId: selectedProject?.Id ?? null,
                AssignedToId: assignedToId != null ? [assignedToId] : [],
            });
            navigation.goBack();
        } catch (err: any) {
            setCreateError(err?.message || 'Failed to create task.');
        } finally {
            setCreating(false);
        }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.colors.text }]}>New Task</Text>
                <TouchableOpacity onPress={handleCreate} style={styles.createBtn} disabled={creating}>
                    {creating ? <ActivityIndicator size="small" color={theme.colors.primary} /> : <Text style={[styles.createBtnText, { color: theme.colors.primary }]}>Create</Text>}
                </TouchableOpacity>
            </View>

            {createError ? (
                <View style={[styles.errorBanner, { backgroundColor: theme.colors.surface, borderColor: theme.colors.error, marginHorizontal: 16, marginTop: 8 }]}>
                    <Text style={[styles.errorBannerText, { color: theme.colors.error }]}>{createError}</Text>
                </View>
            ) : null}

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                {/* General Information */}
                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>General Information</Text>
                    <TextInput
                        style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border }]}
                        placeholder="Task Name"
                        placeholderTextColor={theme.colors.placeholder}
                        value={taskName}
                        onChangeText={setTaskName}
                    />
                    <TextInput
                        style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border }]}
                        placeholder="Task URL"
                        placeholderTextColor={theme.colors.placeholder}
                        value={taskUrl}
                        onChangeText={setTaskUrl}
                        autoCapitalize="none"
                        keyboardType="url"
                    />
                </View>

                {/* Portfolio – dropdown with search */}
                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Portfolio</Text>
                    {portfolioProjectLoading ? (
                        <View style={[styles.dropdown, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                            <ActivityIndicator size="small" color={theme.colors.primary} />
                            <Text style={[styles.dropdownText, { color: theme.colors.placeholder, marginLeft: 8 }]}>Loading...</Text>
                        </View>
                    ) : (
                        <TouchableOpacity
                            onPress={() => setPortfolioModalVisible(true)}
                            style={[styles.dropdown, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
                        >
                            <Text style={[styles.dropdownText, { color: selectedPortfolio ? theme.colors.text : theme.colors.placeholder }]}>
                                {selectedPortfolio ? `${selectedPortfolio.PortfolioStructureID || ''} ${selectedPortfolio.Title || ''}`.trim() || selectedPortfolio.Title : 'Select portfolio'}
                            </Text>
                            <Ionicons name="chevron-down" size={20} color={theme.colors.textSecondary} />
                        </TouchableOpacity>
                    )}
                </View>

                {/* Project – auto-set when portfolio selected; dropdown to change */}
                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Project</Text>
                    <TouchableOpacity
                        onPress={() => setProjectModalVisible(true)}
                        style={[styles.dropdown, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
                    >
                        <Text style={[styles.dropdownText, { color: selectedProject ? theme.colors.text : theme.colors.placeholder }]}>
                            {selectedProject ? `${selectedProject.PortfolioStructureID || ''} ${selectedProject.Title || ''}`.trim() || selectedProject.Title : 'Select project'}
                        </Text>
                        <Ionicons name="chevron-down" size={20} color={theme.colors.textSecondary} />
                    </TouchableOpacity>
                </View>

                {/* Websites (Sites) */}
                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Websites</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tilesRow}>
                        {sites.map((site: any) => {
                            const isSelected = selectedWebsiteSite?.Id === site.Id;
                            return (
                                <TouchableOpacity
                                    key={site.Id}
                                    onPress={() => setSelectedWebsiteSite(isSelected ? null : site)}
                                    style={[
                                        styles.tile,
                                        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
                                        isSelected && { borderColor: theme.colors.primary, borderWidth: 2 },
                                    ]}
                                >
                                    <SiteTileIcon site={site} spToken={spToken} theme={theme} />
                                    <Text style={[styles.tileTitle, { color: theme.colors.text }]} numberOfLines={2}>
                                        {site.Title}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>

                {/* Admin – dropdown with search (Admin parent categories only) */}
                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Admin</Text>
                    <TouchableOpacity
                        onPress={() => setAdminModalVisible(true)}
                        style={[styles.dropdown, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
                    >
                        <Text style={[styles.dropdownText, { color: selectedAdmin ? theme.colors.text : theme.colors.placeholder }]}>
                            {selectedAdmin ? selectedAdmin.Title : 'Select admin'}
                        </Text>
                        <Ionicons name="chevron-down" size={20} color={theme.colors.textSecondary} />
                    </TouchableOpacity>
                </View>

                {/* Action – tiles (Action parent categories only) */}
                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Action</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tilesRow}>
                        {actionTiles.map((item: any) => {
                            const isSelected = selectedAction?.Id === item.Id;
                            return (
                                <TouchableOpacity
                                    key={item.Id}
                                    onPress={() => setSelectedAction(isSelected ? null : item)}
                                    style={[
                                        styles.tile,
                                        styles.actionTile,
                                        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
                                        isSelected && { borderColor: theme.colors.primary, borderWidth: 2 },
                                    ]}
                                >
                                    <Text style={[styles.tileTitle, { color: theme.colors.text }]} numberOfLines={2}>
                                        {item.Title}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>

                {/* Type – dropdown with search (no Action/Admin/Approval) */}
                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Type</Text>
                    <TouchableOpacity
                        onPress={() => setTypeModalVisible(true)}
                        style={[styles.dropdown, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
                    >
                        <Text style={[styles.dropdownText, { color: selectedType ? theme.colors.text : theme.colors.placeholder }]}>
                            {selectedType ? selectedType.Title : 'Select'}
                        </Text>
                        <Ionicons name="chevron-down" size={20} color={theme.colors.textSecondary} />
                    </TouchableOpacity>
                </View>

                {/* Priority */}
                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Priority</Text>
                    <TouchableOpacity
                        onPress={() => setPriorityModalVisible(true)}
                        style={[styles.dropdown, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
                    >
                        <Text style={[styles.dropdownText, { color: selectedPriority ? theme.colors.text : theme.colors.placeholder }]}>
                            {selectedPriority ? selectedPriority.Title : 'Select priority'}
                        </Text>
                        <Ionicons name="chevron-down" size={20} color={theme.colors.textSecondary} />
                    </TouchableOpacity>
                </View>

                {/* Due Date */}
                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Due Date</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetRow}>
                        {['Today', 'Tomorrow', 'This Week', 'Next Week', 'This Month'].map((preset) => {
                            const isSelected = dueDatePreset === preset && !dueDateCustom;
                            return (
                                <TouchableOpacity
                                    key={preset}
                                    onPress={() => {
                                        setDueDatePreset(preset);
                                        setDueDateCustom(null);
                                    }}
                                    style={[
                                        styles.presetChip,
                                        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
                                        isSelected && { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
                                    ]}
                                >
                                    <Text style={[styles.presetChipText, { color: isSelected ? '#fff' : theme.colors.text }]}>
                                        {preset}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                    <TouchableOpacity
                        onPress={() => setCalendarVisible(true)}
                        style={[styles.dropdown, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, marginTop: 8 }]}
                    >
                        <Ionicons name="calendar-outline" size={20} color={theme.colors.primary} />
                        <Text style={[styles.dropdownText, { color: theme.colors.text, marginLeft: 8 }]}>
                            {dueDateDisplay || 'Pick a date'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>

            {/* Portfolio dropdown modal with search */}
            <Modal visible={portfolioModalVisible} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalBox, { backgroundColor: theme.colors.background }]}>
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Select Portfolio</Text>
                            <TouchableOpacity onPress={() => { setPortfolioModalVisible(false); setPortfolioSearch(''); }}>
                                <Ionicons name="close" size={28} color={theme.colors.text} />
                            </TouchableOpacity>
                        </View>
                        {portfolioProjectError ? (
                            <View style={[styles.errorBanner, { backgroundColor: theme.colors.surface, borderColor: theme.colors.error }]}>
                                <Text style={[styles.errorBannerText, { color: theme.colors.text }]}>{portfolioProjectError}</Text>
                                <TouchableOpacity onPress={loadPortfolioProjectData} style={styles.retryBtn}>
                                    <Text style={[styles.retryBtnText, { color: theme.colors.primary }]}>Retry</Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <>
                                <TextInput
                                    style={[styles.searchInput, { color: theme.colors.text, borderColor: theme.colors.border }]}
                                    placeholder="Search portfolio..."
                                    placeholderTextColor={theme.colors.placeholder}
                                    value={portfolioSearch}
                                    onChangeText={setPortfolioSearch}
                                    autoFocus
                                />
                                <FlatList
                                    data={filteredPortfolioOptions}
                                    keyExtractor={(item) => String(item.Id)}
                                    renderItem={({ item }) => (
                                        <TouchableOpacity
                                            style={[styles.modalItem, { borderBottomColor: theme.colors.border }]}
                                            onPress={() => {
                                                setSelectedPortfolio(item);
                                                setPortfolioModalVisible(false);
                                                setPortfolioSearch('');
                                            }}
                                        >
                                            <Text style={[styles.modalItemText, { color: theme.colors.text }]}>
                                                {[item.PortfolioStructureID, item.Title].filter(Boolean).join(' - ')}
                                            </Text>
                                        </TouchableOpacity>
                                    )}
                                    style={styles.modalList}
                                    ListEmptyComponent={
                                        !portfolioProjectLoading ? (
                                            <View style={styles.emptyList}>
                                                <Text style={[styles.emptyListText, { color: theme.colors.textSecondary }]}>No portfolios found</Text>
                                            </View>
                                        ) : null
                                    }
                                />
                            </>
                        )}
                    </View>
                </View>
            </Modal>

            {/* Project dropdown modal with search */}
            <Modal visible={projectModalVisible} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalBox, { backgroundColor: theme.colors.background }]}>
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Select Project</Text>
                            <TouchableOpacity onPress={() => { setProjectModalVisible(false); setProjectSearch(''); }}>
                                <Ionicons name="close" size={28} color={theme.colors.text} />
                            </TouchableOpacity>
                        </View>
                        <TextInput
                            style={[styles.searchInput, { color: theme.colors.text, borderColor: theme.colors.border }]}
                            placeholder="Search project..."
                            placeholderTextColor={theme.colors.placeholder}
                            value={projectSearch}
                            onChangeText={setProjectSearch}
                            autoFocus
                        />
                        <FlatList
                            data={projectListForModal}
                            keyExtractor={(item) => String(item.Id)}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={[styles.modalItem, { borderBottomColor: theme.colors.border }]}
                                    onPress={() => {
                                        setSelectedProject(item);
                                        setProjectModalVisible(false);
                                        setProjectSearch('');
                                    }}
                                >
                                    <Text style={[styles.modalItemText, { color: theme.colors.text }]}>
                                        {[item.PortfolioStructureID, item.Title].filter(Boolean).join(' - ')}
                                    </Text>
                                </TouchableOpacity>
                            )}
                            style={styles.modalList}
                        />
                    </View>
                </View>
            </Modal>

            {/* Admin dropdown modal with search */}
            <Modal visible={adminModalVisible} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalBox, { backgroundColor: theme.colors.background }]}>
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Select Admin</Text>
                            <TouchableOpacity onPress={() => { setAdminModalVisible(false); setAdminSearch(''); }}>
                                <Ionicons name="close" size={28} color={theme.colors.text} />
                            </TouchableOpacity>
                        </View>
                        <TextInput
                            style={[styles.searchInput, { color: theme.colors.text, borderColor: theme.colors.border }]}
                            placeholder="Search admin..."
                            placeholderTextColor={theme.colors.placeholder}
                            value={adminSearch}
                            onChangeText={setAdminSearch}
                            autoFocus
                        />
                        <FlatList
                            data={filteredAdminOptions}
                            keyExtractor={(item) => String(item.Id)}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={[styles.modalItem, { borderBottomColor: theme.colors.border }]}
                                    onPress={() => {
                                        setSelectedAdmin(item);
                                        setAdminModalVisible(false);
                                        setAdminSearch('');
                                    }}
                                >
                                    <Text style={[styles.modalItemText, { color: theme.colors.text }]}>{item.Title}</Text>
                                </TouchableOpacity>
                            )}
                            style={styles.modalList}
                        />
                    </View>
                </View>
            </Modal>

            {/* Type dropdown modal with search */}
            <Modal visible={typeModalVisible} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalBox, { backgroundColor: theme.colors.background }]}>
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Select Type</Text>
                            <TouchableOpacity onPress={() => { setTypeModalVisible(false); setTypeSearch(''); }}>
                                <Ionicons name="close" size={28} color={theme.colors.text} />
                            </TouchableOpacity>
                        </View>
                        <TextInput
                            style={[styles.searchInput, { color: theme.colors.text, borderColor: theme.colors.border }]}
                            placeholder="Search types..."
                            placeholderTextColor={theme.colors.placeholder}
                            value={typeSearch}
                            onChangeText={setTypeSearch}
                            autoFocus
                        />
                        <FlatList
                            data={filteredTypes}
                            keyExtractor={(item) => String(item.Id)}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={[styles.modalItem, { borderBottomColor: theme.colors.border }]}
                                    onPress={() => {
                                        setSelectedType(item);
                                        setTypeModalVisible(false);
                                        setTypeSearch('');
                                    }}
                                >
                                    <Text style={[styles.modalItemText, { color: theme.colors.text }]}>
                                        {item.Title}
                                    </Text>
                                </TouchableOpacity>
                            )}
                            style={styles.modalList}
                        />
                    </View>
                </View>
            </Modal>

            {/* Priority modal */}
            <Modal visible={priorityModalVisible} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalBox, { backgroundColor: theme.colors.background }]}>
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Select Priority</Text>
                            <TouchableOpacity onPress={() => setPriorityModalVisible(false)}>
                                <Ionicons name="close" size={28} color={theme.colors.text} />
                            </TouchableOpacity>
                        </View>
                        <FlatList
                            data={priorities}
                            keyExtractor={(item) => String(item.Id)}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={[styles.modalItem, { borderBottomColor: theme.colors.border }]}
                                    onPress={() => {
                                        setSelectedPriority(item);
                                        setPriorityModalVisible(false);
                                    }}
                                >
                                    <Text style={[styles.modalItemText, { color: theme.colors.text }]}>{item.Title}</Text>
                                </TouchableOpacity>
                            )}
                            style={styles.modalList}
                        />
                    </View>
                </View>
            </Modal>

            {/* Calendar modal */}
            <Modal visible={calendarVisible} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalBox, styles.calendarModal, { backgroundColor: theme.colors.background }]}>
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Due Date</Text>
                            <TouchableOpacity onPress={() => setCalendarVisible(false)}>
                                <Ionicons name="close" size={28} color={theme.colors.text} />
                            </TouchableOpacity>
                        </View>
                        <Calendar
                            current={dueDateCustom || today}
                            onDayPress={(day) => {
                                setDueDateCustom(day.dateString);
                                setDueDatePreset(null);
                                setCalendarVisible(false);
                            }}
                            theme={{
                                backgroundColor: theme.colors.background,
                                calendarBackground: theme.colors.background,
                                textSectionTitleColor: theme.colors.textSecondary,
                                selectedDayBackgroundColor: theme.colors.primary,
                                selectedDayTextColor: '#fff',
                                todayTextColor: theme.colors.primary,
                                dayTextColor: theme.colors.text,
                                textDisabledColor: theme.colors.placeholder,
                                arrowColor: theme.colors.primary,
                            }}
                        />
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
};

function SiteTileIcon({ site, spToken, theme }: { site: any; spToken: string | null; theme: any }) {
    const [loading, setLoading] = useState(!!(site?.Item_x005F_x0020_Cover?.Url && spToken));
    const [imgUri, setImgUri] = useState<string | null>(null);
    React.useEffect(() => {
        const url = site?.Item_x005F_x0020_Cover?.Url;
        if (!url || !spToken) {
            setLoading(false);
            return;
        }
        let cancelled = false;
        fetchImageAsBase64(url, spToken)
            .then((base64) => {
                if (!cancelled && base64) setImgUri(base64);
            })
            .catch(() => {})
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, [site?.Item_x005F_x0020_Cover?.Url, spToken]);
    if (loading) {
        return <ActivityIndicator size="small" color={theme.colors.primary} style={styles.tileIcon} />;
    }
    if (imgUri) {
        return <Image source={{ uri: imgUri }} style={styles.tileIcon} />;
    }
    return <View style={[styles.tileIcon, { backgroundColor: theme.colors.border }]} />;
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0,0,0,0.06)',
    },
    backBtn: { padding: 4 },
    headerTitle: { fontSize: 18, fontWeight: '600' },
    createBtn: { padding: 4 },
    createBtnText: { fontSize: 16, fontWeight: '600' },
    scroll: { flex: 1 },
    scrollContent: { padding: 16, paddingBottom: 40 },
    section: { marginBottom: 24 },
    sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 10 },
    input: {
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 16,
        marginBottom: 10,
    },
    inputMultiline: { minHeight: 60, textAlignVertical: 'top' },
    tilesRow: { marginHorizontal: -4 },
    tile: {
        width: 100,
        marginHorizontal: 4,
        padding: 10,
        borderRadius: 8,
        borderWidth: 1,
        alignItems: 'center',
    },
    tileIcon: { width: 40, height: 40, borderRadius: 20, marginBottom: 6 },
    actionTile: { justifyContent: 'center' },
    tileTitle: { fontSize: 12, textAlign: 'center' },
    dropdown: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 12,
    },
    dropdownText: { fontSize: 16 },
    presetRow: { marginHorizontal: -4 },
    presetChip: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        marginHorizontal: 4,
    },
    presetChipText: { fontSize: 14 },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalBox: {
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        maxHeight: '70%',
        paddingBottom: 24,
    },
    calendarModal: { maxHeight: '50%' },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0,0,0,0.08)',
    },
    modalTitle: { fontSize: 18, fontWeight: '600' },
    searchInput: {
        borderWidth: 1,
        borderRadius: 8,
        marginHorizontal: 16,
        marginVertical: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 16,
    },
    modalList: { maxHeight: 320 },
    modalItem: {
        padding: 16,
        borderBottomWidth: 1,
    },
    modalItemText: { fontSize: 16 },
    errorBanner: {
        marginHorizontal: 16,
        marginVertical: 8,
        padding: 12,
        borderRadius: 8,
        borderWidth: 1,
    },
    errorBannerText: { fontSize: 14, marginBottom: 8 },
    retryBtn: { alignSelf: 'flex-start' },
    retryBtnText: { fontSize: 14, fontWeight: '600' },
    emptyList: { padding: 24, alignItems: 'center' },
    emptyListText: { fontSize: 14 },
});

export default CreateTaskScreen;
