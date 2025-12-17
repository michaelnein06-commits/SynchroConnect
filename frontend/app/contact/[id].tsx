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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format } from 'date-fns';

const EXPO_PUBLIC_BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const COLORS = {
  primary: '#4F46E5',
  accent: '#FF6B6B',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  text: '#1E293B',
  textLight: '#64748B',
  border: '#E2E8F0',
};

const PIPELINE_STAGES = ['Weekly', 'Bi-Weekly', 'Monthly', 'Quarterly', 'Annually'];

export default function ContactDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const isNew = id === 'new';

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showBirthdayPicker, setShowBirthdayPicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedBirthday, setSelectedBirthday] = useState(new Date(1990, 0, 1));
  const [profileImage, setProfileImage] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    job: '',
    phone: '',
    email: '',
    birthday: '',
    last_met: '',
    favorite_food: '',
    notes: '',
    tags: '',
    groups: '',
    pipeline_stage: 'Monthly',
    language: 'English',
    tone: 'Casual',
    profile_picture: '',
  });

  const handleDateChange = (event: any, date?: Date) => {
    setShowDatePicker(Platform.OS === 'ios'); // Keep open on iOS
    if (date) {
      setSelectedDate(date);
      setFormData({ ...formData, last_met: format(date, 'MMM dd, yyyy') });
    }
  };

  useEffect(() => {
    if (!isNew) {
      fetchContact();
    }
  }, [id]);

  const fetchContact = async () => {
    try {
      const response = await axios.get(`${EXPO_PUBLIC_BACKEND_URL}/api/contacts/${id}`);
      const contact = response.data;
      setFormData({
        name: contact.name || '',
        job: contact.job || '',
        birthday: contact.birthday || '',
        last_met: contact.last_met || '',
        favorite_food: contact.favorite_food || '',
        notes: contact.notes || '',
        tags: contact.tags?.join(', ') || '',
        pipeline_stage: contact.pipeline_stage || 'Monthly',
      });
    } catch (error) {
      console.error('Error fetching contact:', error);
      Alert.alert('Error', 'Failed to load contact');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      Alert.alert('Error', 'Name is required');
      return;
    }

    setSaving(true);
    try {
      const contactData = {
        ...formData,
        tags: formData.tags
          .split(',')
          .map((t) => t.trim())
          .filter((t) => t),
      };

      if (isNew) {
        await axios.post(`${EXPO_PUBLIC_BACKEND_URL}/api/contacts`, contactData);
        Alert.alert('Success', 'Contact created!');
      } else {
        await axios.put(`${EXPO_PUBLIC_BACKEND_URL}/api/contacts/${id}`, contactData);
        Alert.alert('Success', 'Contact updated!');
      }
      router.back();
    } catch (error) {
      console.error('Error saving contact:', error);
      Alert.alert('Error', 'Failed to save contact');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Contact',
      `Are you sure you want to delete ${formData.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.delete(`${EXPO_PUBLIC_BACKEND_URL}/api/contacts/${id}`);
              Alert.alert('Success', 'Contact deleted');
              router.back();
            } catch (error) {
              console.error('Error deleting contact:', error);
              Alert.alert('Error', 'Failed to delete contact');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={COLORS.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{isNew ? 'New Contact' : 'Edit Contact'}</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            {saving ? (
              <ActivityIndicator color={COLORS.primary} />
            ) : (
              <Text style={styles.saveButton}>Save</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          {/* Name */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Name *</Text>
            <TextInput
              style={styles.input}
              value={formData.name}
              onChangeText={(text) => setFormData({ ...formData, name: text })}
              placeholder="John Doe"
              placeholderTextColor={COLORS.textLight}
            />
          </View>

          {/* Job */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Job Title</Text>
            <TextInput
              style={styles.input}
              value={formData.job}
              onChangeText={(text) => setFormData({ ...formData, job: text })}
              placeholder="Software Engineer"
              placeholderTextColor={COLORS.textLight}
            />
          </View>

          {/* Pipeline Stage */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Connection Frequency</Text>
            <View style={styles.stageContainer}>
              {PIPELINE_STAGES.map((stage) => (
                <TouchableOpacity
                  key={stage}
                  style={[
                    styles.stageChip,
                    formData.pipeline_stage === stage && styles.stageChipActive,
                  ]}
                  onPress={() => setFormData({ ...formData, pipeline_stage: stage })}
                >
                  <Text
                    style={[
                      styles.stageChipText,
                      formData.pipeline_stage === stage && styles.stageChipTextActive,
                    ]}
                  >
                    {stage}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Last Met */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Last Met</Text>
            <TouchableOpacity
              style={styles.datePickerButton}
              onPress={() => setShowDatePicker(true)}
            >
              <Ionicons name="calendar-outline" size={20} color={COLORS.textLight} style={{ marginRight: 12 }} />
              <Text style={[styles.datePickerText, !formData.last_met && styles.datePickerPlaceholder]}>
                {formData.last_met || 'Select date'}
              </Text>
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={selectedDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={handleDateChange}
                maximumDate={new Date()}
              />
            )}
          </View>

          {/* Birthday */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Birthday</Text>
            <TouchableOpacity
              style={styles.datePickerButton}
              onPress={() => {
                setShowDatePicker(true);
                // For birthday, set a default past date if empty
                if (!formData.birthday) {
                  const defaultDate = new Date();
                  defaultDate.setFullYear(defaultDate.getFullYear() - 30);
                  setSelectedDate(defaultDate);
                }
              }}
            >
              <Ionicons name="calendar-outline" size={20} color={COLORS.textLight} style={{ marginRight: 12 }} />
              <Text style={[styles.datePickerText, !formData.birthday && styles.datePickerPlaceholder]}>
                {formData.birthday || 'Select birthday'}
              </Text>\n            </TouchableOpacity>
          </View>

          {/* Favorite Food */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Favorite Food</Text>
            <TextInput
              style={styles.input}
              value={formData.favorite_food}
              onChangeText={(text) => setFormData({ ...formData, favorite_food: text })}
              placeholder="e.g., Italian cuisine"
              placeholderTextColor={COLORS.textLight}
            />
          </View>

          {/* Tags */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Tags (comma-separated)</Text>
            <TextInput
              style={styles.input}
              value={formData.tags}
              onChangeText={(text) => setFormData({ ...formData, tags: text })}
              placeholder="e.g., Uni, Tennis Club, Work"
              placeholderTextColor={COLORS.textLight}
            />
          </View>

          {/* Notes */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Notes</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={formData.notes}
              onChangeText={(text) => setFormData({ ...formData, notes: text })}
              placeholder="Add any notes about this person..."
              placeholderTextColor={COLORS.textLight}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          {/* Delete Button */}
          {!isNew && (
            <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
              <Ionicons name="trash-outline" size={20} color={COLORS.accent} />
              <Text style={styles.deleteButtonText}>Delete Contact</Text>
            </TouchableOpacity>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
  },
  saveButton: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primary,
    paddingHorizontal: 8,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.text,
  },
  textArea: {
    minHeight: 100,
    paddingTop: 12,
  },
  stageContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  stageChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  stageChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  stageChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  stageChipTextActive: {
    color: COLORS.surface,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: COLORS.accent + '20',
    gap: 8,
    marginTop: 20,
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.accent,
  },
  datePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  datePickerText: {
    fontSize: 16,
    color: COLORS.text,
  },
  datePickerPlaceholder: {
    color: COLORS.textLight,
  },
});
