import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../context/ThemeContext';

interface TimesheetTimelineProps {
    // Backward compatible (older usage); when omtStatus+selectedDay provided we compute from history like web.
    currentStatus?: 'Suggestion' | 'Confirmed' | 'For Approval' | 'Approved' | string;
    // Web reference uses OMTStatus array history to mark completed steps.
    omtStatus?: any[] | string | { results?: any[] } | null;
    // Selected day in "DD/MM/YYYY" (web compares `props.selectedDay` to `TaskDate.split(' ')[0]`)
    selectedDay?: string;
    onStepPress: (step: string) => void;
    disabledSteps?: string[];
}

const STEPS = [
    { key: 'Suggestion', label: 'WT Suggested' },
    { key: 'Confirmed', label: 'WT Confirmed' },
    { key: 'For Approval', label: 'EOD Submitted' },
    { key: 'Approved', label: 'EOD Approved' },
];

function normalizeOMTStatus(omtStatus: TimesheetTimelineProps['omtStatus']): any[] {
    if (!omtStatus) return [];
    if (Array.isArray(omtStatus)) return omtStatus;
    if (typeof omtStatus === 'string') {
        try {
            const parsed = JSON.parse(omtStatus);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
    if (typeof omtStatus === 'object' && Array.isArray((omtStatus as any).results)) {
        return (omtStatus as any).results;
    }
    return [];
}

const TimesheetTimeline: React.FC<TimesheetTimelineProps> = ({ currentStatus, omtStatus, selectedDay, onStepPress, disabledSteps = [] }) => {
    const { theme } = useTheme();

    // Web logic: build completedStatusSet from OMTStatus filtered by selected day, then mark each step completed.
    const { stepStates, lastCompletedIndex } = useMemo(() => {
        const omtList = normalizeOMTStatus(omtStatus);
        const day = selectedDay;
        if (day && omtList.length > 0) {
            const completedStatusSet = new Set(
                omtList
                    .filter((item: any) => item?.Status && item?.TaskDate && String(item.TaskDate).split(' ')[0] === day)
                    .map((item: any) => item.Status)
            );
            const states = STEPS.map((s) => ({
                ...s,
                status: completedStatusSet.has(s.key) ? 'completed' : '',
            }));
            let lastLabelIndex = -1;
            for (let i = 0; i < states.length; i++) {
                if (String(states[i].status).toLowerCase() === 'completed') {
                    lastLabelIndex = i;
                }
            }
            return { stepStates: states, lastCompletedIndex: lastLabelIndex };
        }

        // Fallback (legacy): derive progress from currentStatus
        let idx = 0;
        if (currentStatus === 'Confirmed') idx = 1;
        if (currentStatus === 'For Approval') idx = 2;
        if (currentStatus === 'Approved') idx = 3;
        const states = STEPS.map((s, i) => ({
            ...s,
            status: i <= idx ? 'completed' : '',
        }));
        return { stepStates: states, lastCompletedIndex: idx };
    }, [omtStatus, selectedDay, currentStatus]);

    // Web progress width formula:
    // return (0 - (-lastCompletedIndex) / timeline.length) * 100;
    const progressWidthPercent = useMemo(() => {
        const timelineLength = stepStates.length;
        const totalSteps = timelineLength - 1;
        const minWidthPercent = 0;
        if (totalSteps <= 0) return 100;
        if (lastCompletedIndex < 0) return minWidthPercent;
        return (0 - (-lastCompletedIndex) / timelineLength) * 100;
    }, [stepStates.length, lastCompletedIndex]);

    return (
        <View style={styles.container}>
            <View style={styles.lineBackground}>
                <View style={[styles.lineProgress, { width: `${progressWidthPercent}%`, backgroundColor: theme.colors.primary }]} />
            </View>

            <View style={styles.stepsContainer}>
                {stepStates.map((step, index) => {
                    const isCompleted = String(step.status).toLowerCase() === 'completed';
                    const isCurrent = index === lastCompletedIndex;
                    const isDisabled = disabledSteps.includes(step.key);

                    return (
                        <View key={step.key} style={styles.stepWrapper}>
                            <TouchableOpacity
                                onPress={() => !isDisabled && onStepPress(step.key)}
                                disabled={isDisabled}
                                style={[
                                    styles.circle,
                                    {
                                        backgroundColor: isDisabled ? '#E0E0E0' : (isCompleted ? theme.colors.primary : '#E0E0E0'),
                                        borderColor: isDisabled ? '#BDBDBD' : (isCompleted ? theme.colors.primary : '#BDBDBD'),
                                        opacity: isDisabled ? 0.6 : 1,
                                    },
                                    isCurrent && !isDisabled && styles.currentCircle
                                ]}
                            >
                                {isCompleted && !isDisabled && (
                                    <View style={styles.innerCircle} />
                                )}
                            </TouchableOpacity>
                            <Text style={[styles.label, { color: isDisabled ? theme.colors.textSecondary : (isCompleted ? theme.colors.text : theme.colors.textSecondary) }]}>
                                {step.label}
                            </Text>
                        </View>
                    );
                })}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        paddingVertical: 15,
        paddingHorizontal: 20,
        backgroundColor: 'transparent',
    },
    lineBackground: {
        position: 'absolute',
        top: 24, // Vertically center with circles (approx)
        left: 40,
        right: 40,
        height: 2,
        backgroundColor: '#E0E0E0',
        zIndex: -1,
    },
    lineProgress: {
        height: '100%',
        backgroundColor: '#2e5596',
    },
    stepsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    stepWrapper: {
        alignItems: 'center',
        width: 80,
    },
    circle: {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: '#E0E0E0',
        borderWidth: 2,
        borderColor: '#BDBDBD',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 5,
        zIndex: 1,
    },
    currentCircle: {
        transform: [{ scale: 1.2 }],
    },
    innerCircle: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: 'white',
    },
    label: {
        fontSize: 10,
        textAlign: 'center',
        color: '#888',
    },
});

export default TimesheetTimeline;
