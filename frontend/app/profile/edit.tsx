import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';

const EXPO_PUBLIC_BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

// Premium Color Palette
const COLORS = {
  primaryStart: '#6366F1',
  primaryEnd: '#8B5CF6',
  primary: '#6366F1',
  primaryLight: '#A5B4FC',
  accent: '#F43F5E',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  text: '#0F172A',
  textSecondary: '#475569',
  textLight: '#94A3B8',
  border: '#E2E8F0',
  success: '#10B981',
};

export default function EditProfile() {
  const router = useRouter();
  const { token, user, updateUser } = useAuth();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profileImage, setProfileImage] = useState('');
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    job: '',
    location: '',
    phone: '',
    bio: '',
    google_picture: '',
  });

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const response = await axios.get(`${EXPO_PUBLIC_BACKEND_URL}/api/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const profile = response.data;
      setFormData({
        name: profile.name || '',
        email: profile.email || '',
        job: profile.job || '',
        location: profile.location || '',
        phone: profile.phone || '',
        bio: profile.bio || '',
        google_picture: profile.google_picture || '',
      });
      setProfileImage(profile.profile_picture || profile.google_picture || '');
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
      setProfileImage(base64Image);
    }
  };

  const handleSave = async () => {
    Keyboard.dismiss();
    setSaving(true);
    try {
      const updateData = {
        name: formData.name,
        job: formData.job,
        location: formData.location,
        phone: formData.phone,
        bio: formData.bio,
        profile_picture: profileImage && !profileImage.startsWith('http') ? profileImage : undefined,
      };

      await axios.put(`${EXPO_PUBLIC_BACKEND_URL}/api/profile`, updateData, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // Update local user context
      await updateUser({ name: formData.name } as any);
      
      Alert.alert('✓', t('success'));
      router.back();
    } catch (error) {
      console.error('Error saving profile:', error);
      Alert.alert(t('error'), t('failedToSave'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <LinearGradient colors={[COLORS.primaryStart, COLORS.primaryEnd]} style={styles.loadingGradient}>
          <ActivityIndicator size="large" color={COLORS.surface} />
        </LinearGradient>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header with Gradient */}
      <LinearGradient colors={[COLORS.primaryStart, COLORS.primaryEnd]} style={styles.headerGradient}>
        <SafeAreaView edges={['top']}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
              <Ionicons name="chevron-back" size={28} color={COLORS.surface} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{t('edit')} {t('profile')}</Text>
            <TouchableOpacity onPress={handleSave} disabled={saving} style={styles.headerButton}>
              {saving ? (
                <ActivityIndicator color={COLORS.surface} size="small" />
              ) : (
                <View style={styles.savePill}>
                  <Ionicons name="checkmark" size={18} color={COLORS.surface} />
                  <Text style={styles.savePillText}>{t('save')}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={{ flex: 1 }}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView 
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Profile Picture */}
            <View style={styles.profileSection}>
              <TouchableOpacity style={styles.profilePictureContainer} onPress={pickImage}>
                {profileImage ? (
                  <Image source={{ uri: profileImage }} style={styles.profilePicture} />
                ) : (
                  <LinearGradient colors={['#E0E7FF', '#C7D2FE']} style={styles.profilePicturePlaceholder}>
                    <Ionicons name="person" size={60} color={COLORS.primary} />
                  </LinearGradient>
                )}
                <View style={styles.cameraButton}>
                  <Ionicons name="camera" size={18} color={COLORS.surface} />
                </View>
              </TouchableOpacity>
              <Text style={styles.changePictureText}>Tap to change photo</Text>
            </View>

            {/* Basic Info */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIconWrapper}>
                  <Ionicons name="person-outline" size={18} color={COLORS.primary} />
                </View>
                <Text style={styles.sectionTitle}>{t('basicInfo')}</Text>
              </View>
              
              <View style={styles.card}>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>{t('name')}</Text>
                  <TextInput
                    style={styles.input}
                    value={formData.name}
                    onChangeText={(text) => setFormData({ ...formData, name: text })}
                    placeholder="Your name"
                    placeholderTextColor={COLORS.textLight}
                  />
                </View>

                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>{t('email')}</Text>
                  <View style={styles.disabledInputContainer}>
                    <Ionicons name="mail-outline" size={18} color={COLORS.textLight} />
                    <Text style={styles.disabledInput}>{formData.email}</Text>
                    <View style={styles.googleBadge}>
                      <Ionicons name="logo-google" size={12} color={COLORS.surface} />
                    </View>
                  </View>
                  <Text style={styles.fieldHint}>Email cannot be changed (linked to Google)</Text>
                </View>

                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>{t('phone')}</Text>
                  <TextInput
                    style={styles.input}
                    value={formData.phone}
                    onChangeText={(text) => setFormData({ ...formData, phone: text })}
                    placeholder="+1 234 567 8900"
                    placeholderTextColor={COLORS.textLight}
                    keyboardType="phone-pad"
                  />
                </View>

                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>{t('jobTitle')}</Text>
                  <TextInput
                    style={styles.input}
                    value={formData.job}
                    onChangeText={(text) => setFormData({ ...formData, job: text })}
                    placeholder="Software Engineer"
                    placeholderTextColor={COLORS.textLight}
                  />
                </View>

                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>{t('location')}</Text>
                  <TextInput
                    style={styles.input}
                    value={formData.location}
                    onChangeText={(text) => setFormData({ ...formData, location: text })}
                    placeholder="San Francisco, CA"
                    placeholderTextColor={COLORS.textLight}
                  />
                </View>
              </View>
            </View>

            {/* Bio */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIconWrapper}>
                  <Ionicons name="document-text-outline" size={18} color={COLORS.primary} />
                </View>
                <Text style={styles.sectionTitle}>Bio</Text>
              </View>
              
              <View style={styles.card}>
                <TextInput
                  style={styles.textArea}
                  value={formData.bio}
                  onChangeText={(text) => setFormData({ ...formData, bio: text })}
                  placeholder="Tell us about yourself..."
                  placeholderTextColor={COLORS.textLight}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
              </View>
            </View>

            <View style={{ height: 40 }} />
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingContainer: { flex: 1 },
  loadingGradient: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  // Header
  headerGradient: { paddingBottom: 20 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  headerButton: { width: 80, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.surface },
  savePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 4,
  },
  savePillText: { fontSize: 14, fontWeight: '600', color: COLORS.surface },

  // Content
  content: { flex: 1 },
  contentContainer: { paddingTop: 8 },

  // Profile Section
  profileSection: { alignItems: 'center', paddingVertical: 24, backgroundColor: COLORS.surface, marginHorizontal: 16, marginTop: -10, borderRadius: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 5 },
  profilePictureContainer: { position: 'relative' },
  profilePicture: { width: 120, height: 120, borderRadius: 60, borderWidth: 4, borderColor: COLORS.surface },
  profilePicturePlaceholder: { width: 120, height: 120, borderRadius: 60, justifyContent: 'center', alignItems: 'center' },
  cameraButton: {
    position: 'absolute', bottom: 0, right: 0,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center',
    borderWidth: 3, borderColor: COLORS.surface,
  },
  changePictureText: { fontSize: 14, color: COLORS.primary, marginTop: 12, fontWeight: '500' },

  // Section
  section: { marginTop: 24, paddingHorizontal: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10 },
  sectionIconWrapper: { width: 32, height: 32, borderRadius: 10, backgroundColor: COLORS.primary + '15', justifyContent: 'center', alignItems: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  card: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },

  // Field
  field: { marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 8 },
  fieldHint: { fontSize: 12, color: COLORS.textLight, marginTop: 6 },
  input: { backgroundColor: COLORS.background, borderRadius: 12, padding: 14, fontSize: 16, color: COLORS.text },
  textArea: { backgroundColor: COLORS.background, borderRadius: 12, padding: 14, fontSize: 16, color: COLORS.text, minHeight: 100, textAlignVertical: 'top' },
  
  // Disabled Input
  disabledInputContainer: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.background, borderRadius: 12, padding: 14, gap: 10,
  },
  disabledInput: { flex: 1, fontSize: 16, color: COLORS.textLight },
  googleBadge: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#4285F4', justifyContent: 'center', alignItems: 'center',
  },
});
