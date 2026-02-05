import React, { useState, useEffect } from 'react';
import { View, Image, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { fetchImageAsBase64 } from '../Service/service';

const UserAvatar = React.memo(({ user, spToken, isSelected, onPress, size = 40 }: any) => {
    const [imageSource, setImageSource] = useState<any>(null);

    useEffect(() => {
        let isMounted = true;
        const fetchIcon = async () => {
            let imageUrl = null;
            // Robust check for different SharePoint image field formats
            if (user?.Item_x0020_Cover?.Url) {
                imageUrl = user.Item_x0020_Cover.Url;
            } else if (user?.UserImage) {
                imageUrl = typeof user.UserImage === 'object' ? user.UserImage.Url : user.UserImage;
            } else if (user?.Item_x0020_Cover) {
                imageUrl = typeof user.Item_x0020_Cover === 'string' ? user.Item_x0020_Cover : (user.Item_x0020_Cover.Url || user.Item_x0020_Cover.Description);
            }

            if (imageUrl && imageUrl.trim()) {
                try {
                    const base64 = await fetchImageAsBase64(imageUrl, spToken);
                    if (isMounted && base64) {
                        setImageSource({ uri: base64 });
                    }
                } catch (e) {
                    console.error("Failed to fetch user icon", e);
                }
            } else if (isMounted) {
                setImageSource(null);
            }
        };
        fetchIcon();
        return () => { isMounted = false; };
    }, [user, spToken]);

    const getInitials = () => {
        // Expanded name search for initials
        const title = user?.Title || user?.Author?.Title || user?.AssingedToUser?.Title || "";
        if (!title || !title.trim()) return "?";

        const parts = title.trim().split(/\s+/);
        if (parts.length > 1) {
            return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
        }
        return title.charAt(0).toUpperCase();
    };

    const containerStyle = {
        width: size,
        height: size,
        borderRadius: size / 2,
    };

    return (
        <TouchableOpacity onPress={onPress} style={[styles.avatarContainer, containerStyle, isSelected && styles.selectedAvatarContainer]} disabled={!onPress}>
            {imageSource ? (
                <Image
                    source={imageSource}
                    style={styles.avatarImage}
                    onError={() => setImageSource(null)} // Fallback to initials if image fails
                />
            ) : (
                <View style={[styles.avatarImage, { backgroundColor: '#E8EAED', justifyContent: 'center', alignItems: 'center' }]}>
                    <Text style={{ fontSize: size * 0.35, fontWeight: 'bold', color: '#5F6368' }}>
                        {getInitials()}
                    </Text>
                </View>
            )}
            {isSelected && (
                <View style={styles.checkIcon}>
                    <Ionicons name="checkmark-circle" size={size * 0.4} color="#1A73E8" />
                </View>
            )}
        </TouchableOpacity>
    );
});

const styles = StyleSheet.create({
    avatarContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#E8EAED',
    },
    selectedAvatarContainer: {
        borderColor: '#1A73E8',
        borderWidth: 2,
    },
    checkIcon: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        backgroundColor: '#FFFFFF',
        borderRadius: 8,
    },
    avatarImage: {
        width: '100%',
        height: '100%',
    },
});

export default UserAvatar;
