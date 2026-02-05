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

    return (
        <View style={styles.container}>
            <View style={styles.stepsContainer}>
                {stepStates.map((step, index) => {
                    const isCompleted = String(step.status).toLowerCase() === 'completed';
                    const isCurrent = index === lastCompletedIndex;
                    const isDisabled = disabledSteps.includes(step.key);
                    const isSegmentFilled = index > 0 && lastCompletedIndex >= index;

                    return (
                        <React.Fragment key={step.key}>
                            {/* Line segment to the left of this step (between previous circle and this one) */}
                            {index > 0 && (
                                <View style={styles.segmentWrapper}>
                                    <View style={[styles.segmentBackground]} />
                                    <View
                                        style={[
                                            styles.segmentProgress,
                                            { backgroundColor: isSegmentFilled ? theme.colors.primary : '#E0E0E0' },
                                        ]}
                                    />
                                </View>
                            )}
                            <View style={styles.stepWrapper}>
                                <TouchableOpacity
                                    onPress={() => !isDisabled && onStepPress(step.key)}
                                    disabled={isDisabled}
                                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                                    activeOpacity={0.7}
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
                        </React.Fragment>
                    );
                })}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        paddingVertical: 15,
        paddingHorizontal: 12,
        backgroundColor: 'transparent',
    },
    stepsContainer: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    segmentWrapper: {
        flex: 1,
        minWidth: 6,
        justifyContent: 'center',
        height: 20,
        marginBottom: 5,
        // Extend line into circle area so it meets circle edges (circle is 20px, wrapper 72px → 26px gap each side)
        marginLeft: -26,
        marginRight: -26,
    },
    segmentBackground: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 9,
        height: 2,
        backgroundColor: '#E0E0E0',
    },
    segmentProgress: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 9,
        height: 2,
    },
    stepWrapper: {
        alignItems: 'center',
        width: 72,
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
