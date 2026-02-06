import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, Animated, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { fetchImageAsBase64 } from '../Service/service';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import FontAwesome5 from 'react-native-vector-icons/FontAwesome5';

const { width } = Dimensions.get('window');

const ProfileScreen = () => {
    const { logout, user, spToken } = useAuth();
    const { theme } = useTheme();
    const [imageUri, setImageUri] = useState<any | null>(null);

    // Animations
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(50)).current;

    useEffect(() => {
        const loadImage = async () => {
            if (user?.UserImage && spToken) {
                try {
                    let imageBase64 = await fetchImageAsBase64(user?.UserImage, spToken);
                    console.log('imageBase64', imageBase64)
                    setImageUri(imageBase64);
                } catch (error) {
                    console.error("fetchImageAsBase64 failed:", error);
                }
            }
        }
        loadImage();

        // Start entrance animation
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 800,
                useNativeDriver: true,
            }),
            Animated.spring(slideAnim, {
                toValue: 0,
                friction: 6,
                tension: 40,
                useNativeDriver: true,
            })
        ]).start();
    }, []);

    const ApproverItem = ({ item }: { item: any }) => (
        <View style={styles.approverItem}>
            <View style={[styles.approverAvatar, { backgroundColor: '#E1E9FF' }]}>
                <Text style={styles.approverInitials}>
                    {item.LookupValue ? item.LookupValue.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() : '??'}
                </Text>
            </View>
            <View style={styles.approverInfo}>
                <Text style={styles.approverName}>{item.LookupValue}</Text>
                <Text style={styles.approverEmail}>{item.Email}</Text>
            </View>
            <View style={styles.approverStatus}>
                <Ionicons name="checkmark-circle-outline" size={20} color="#BDC3C7" />
            </View>
        </View>
    );

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: '#F8F9FA' }]} edges={['top']}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

                {/* Header Section */}
                <Animated.View style={[styles.header, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
                    <View style={styles.imageContainer}>
                        {imageUri ? (
                            <Image source={{ uri: imageUri }} style={styles.profileImage} />
                        ) : (
                            <View style={[styles.profileImagePlaceholder, { backgroundColor: theme.colors.primary }]}>
                                <Text style={styles.profileInitials}>
                                    {user?.Title ? user.Title.charAt(0).toUpperCase() : 'U'}
                                </Text>
                            </View>
                        )}
                        <View style={styles.badgeContainer}>
                            <Text style={styles.badgeText}>{user?.Suffix || 'AM'}</Text>
                        </View>
                    </View>

                    <Text style={styles.userName}>{user?.Title || 'User Name'}</Text>
                    <Text style={styles.userEmail}>{user?.Email || 'user@example.com'}</Text>

                    <View style={styles.statusRow}>
                        {user?.IsActive && (
                            <View style={[styles.statusBadge, { backgroundColor: '#E6F4EA' }]}>
                                <Text style={[styles.statusText, { color: '#1E8E3E' }]}>ACTIVE</Text>
                            </View>
                        )}
                        {user?.IsShowTeamLeader && (
                            <View style={[styles.statusBadge, { backgroundColor: '#E8F0FE', marginLeft: 8 }]}>
                                <Text style={[styles.statusText, { color: '#1967D2' }]}>TEAM LEAD</Text>
                            </View>
                        )}
                    </View>
                </Animated.View>

                {/* Work Information Card */}
                <Animated.View style={[styles.card, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
                    <View style={styles.cardHeader}>
                        <MaterialCommunityIcons name="briefcase-outline" size={22} color="#1967D2" />
                        <Text style={styles.cardTitle}>Work Information</Text>
                    </View>

                    <View style={styles.infoRow}>
                        <View style={styles.infoColumn}>
                            <Text style={styles.label}>TEAM</Text>
                            <View style={styles.valueRow}>
                                <MaterialCommunityIcons name="web" size={16} color="#4285F4" style={{ marginRight: 6 }} />
                                <Text style={styles.valueText}>{user?.Team || 'SPFX'}</Text>
                            </View>
                        </View>
                        <View style={styles.infoColumnRight}>
                            <Text style={styles.label}>ROLES</Text>
                            <View style={styles.rolesContainer}>
                                {user?.IsShowTeamLeader && (
                                    <View style={[styles.roleBadge, { backgroundColor: '#E8F0FE' }]}>
                                        <Text style={[styles.roleText, { color: '#1967D2' }]}>Team Lead</Text>
                                    </View>
                                )}
                                {user?.Role?.map((role: string, index: number) => (
                                    <View key={index} style={[styles.roleBadge, { backgroundColor: '#F1F3F4' }]}>
                                        <Text style={[styles.roleText, { color: '#3C4043' }]}>{role}</Text>
                                    </View>
                                ))}
                            </View>
                        </View>
                    </View>
                </Animated.View>

                {/* Governance Approvers Card */}
                <Animated.View style={[styles.card, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
                    <View style={styles.cardHeaderRow}>
                        <View style={styles.cardHeaderLeft}>
                            <MaterialCommunityIcons name="account-group-outline" size={22} color="#FF7043" />
                            <Text style={styles.cardTitle}>Governance Approvers</Text>
                        </View>
                        <View style={styles.countBadge}>
                            <Text style={styles.countText}>{user?.Approver?.length || 0} Assigned</Text>
                        </View>
                    </View>

                    <View style={styles.approverList}>
                        {user?.Approver?.map((approver: any, index: number) => (
                            <ApproverItem key={approver.LookupId || index} item={approver} />
                        ))}
                    </View>
                </Animated.View>

                {/* Account Metadata Card */}
                <Animated.View style={[styles.card, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
                    <View style={styles.cardHeader}>
                        <MaterialCommunityIcons name="shield-check-outline" size={22} color="#9334E6" />
                        <Text style={styles.cardTitle}>Account Metadata</Text>
                    </View>

                    <View style={styles.metadataRow}>
                        <Text style={styles.metadataLabel}>Workspace User ID</Text>
                        <View style={styles.metadataValueContainer}>
                            <Text style={styles.metadataValue} numberOfLines={1} ellipsizeMode="middle">
                                {user?.CurrentUserId || '7169ba18-b15f...'}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.divider} />

                    <View style={styles.metadataRow}>
                        <Text style={styles.metadataLabel}>Assigned To</Text>
                        <Text style={styles.metadataValue}>{user?.AssignedTo || 'anshu.mishra@hochhuth-consulting.de'}</Text>
                    </View>
                </Animated.View>

                {/* Sign Out Button */}
                <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
                    <TouchableOpacity style={styles.signOutButton} onPress={logout}>
                        <MaterialCommunityIcons name="logout-variant" size={20} color="#D93025" style={{ marginRight: 8 }} />
                        <Text style={styles.signOutText}>Sign Out of Workspace</Text>
                    </TouchableOpacity>
                </Animated.View>

                <Text style={styles.footerText}>Session Securely Connected via Azure AD Simulation</Text>

            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
        paddingBottom: 40,
    },
    header: {
        alignItems: 'center',
        marginBottom: 24,
        marginTop: 10,
    },
    imageContainer: {
        position: 'relative',
        marginBottom: 16,
    },
    profileImage: {
        width: 100,
        height: 100,
        borderRadius: 50,
        borderWidth: 3,
        borderColor: '#fff',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    profileImagePlaceholder: {
        width: 100,
        height: 100,
        borderRadius: 50,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 3,
        borderColor: '#fff',
    },
    profileInitials: {
        fontSize: 36,
        fontWeight: 'bold',
        color: '#FFFFFF',
    },
    badgeContainer: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        backgroundColor: '#1A73E8',
        borderRadius: 12,
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderWidth: 2,
        borderColor: '#fff',
    },
    badgeText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 12,
    },
    userName: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#202124',
        marginBottom: 4,
    },
    userEmail: {
        fontSize: 14,
        color: '#5F6368',
        marginBottom: 12,
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    statusBadge: {
        paddingVertical: 4,
        paddingHorizontal: 10,
        borderRadius: 12,
    },
    statusText: {
        fontSize: 11,
        fontWeight: 'bold',
        textTransform: 'uppercase',
    },
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 2,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    cardHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    cardHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#202124',
        marginLeft: 12,
    },
    infoRow: {
        flexDirection: 'row',
    },
    infoColumn: {
        flex: 1,
    },
    infoColumnRight: {
        flex: 1,
        right: 50,
    },
    label: {
        fontSize: 11,
        fontWeight: 'bold',
        color: '#9AA0A6',
        marginBottom: 8,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    valueRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    valueText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#202124',
    },
    rolesContainer: {
        flexDirection: 'row',
        alignItems: 'center',   // vertical center align
        flexWrap: 'nowrap',
    },
    roleBadge: {
        paddingVertical: 4,
        paddingHorizontal: 10,
        borderRadius: 6,
        marginRight: 8,
    },
    roleText: {
        fontSize: 12,
        fontWeight: '500',
    },
    countBadge: {
        backgroundColor: '#F1F3F4',
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: 12,
    },
    countText: {
        fontSize: 11,
        fontWeight: 'bold',
        color: '#5F6368',
    },
    approverList: {
        marginTop: 4,
    },
    approverItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        backgroundColor: '#F8F9FA',
        marginBottom: 8,
        borderRadius: 12,
        paddingHorizontal: 12,
    },
    approverAvatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    approverInitials: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#1967D2',
    },
    approverInfo: {
        flex: 1,
    },
    approverName: {
        fontSize: 14,
        fontWeight: '600',
        color: '#202124',
    },
    approverEmail: {
        fontSize: 12,
        color: '#5F6368',
    },
    approverStatus: {
        marginLeft: 8,
    },
    metadataRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 8,
    },
    metadataLabel: {
        fontSize: 13,
        color: '#5F6368',
        flex: 1,
    },
    metadataValueContainer: {
        backgroundColor: '#F1F3F4',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        maxWidth: '50%',
    },
    metadataValue: {
        fontSize: 13,
        color: '#3C4043',
        fontWeight: '500',
        textAlign: 'right',
    },
    divider: {
        height: 1,
        backgroundColor: '#F1F3F4',
        marginVertical: 8,
    },
    signOutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FFF0F0', // Very light red
        borderRadius: 12,
        paddingVertical: 16,
        borderWidth: 1,
        borderColor: '#FAD2CF',
        marginBottom: 24,
    },
    signOutText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#D93025',
    },
    footerText: {
        textAlign: 'center',
        fontSize: 11,
        color: '#9AA0A6',
        marginBottom: 20,
    },
});

export default ProfileScreen;