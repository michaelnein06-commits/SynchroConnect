import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  Switch,
  Platform,
  RefreshControl,
  KeyboardAvoidingView,
  Keyboard,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import DateTimePicker from '@react-native-community/datetimepicker';

const EXPO_PUBLIC_BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const COLORS = {
  primary: '#6366F1',
  primaryDark: '#4F46E5',
  primaryLight: '#A5B4FC',
  accent: '#F43F5E',
  success: '#10B981',
  warning: '#F59E0B',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  text: '#0F172A',
  textSecondary: '#475569',
  textLight: '#94A3B8',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
};

const PRESET_COLORS = [
  '#8B5CF6', '#06B6D4', '#10B981', '#F59E0B', '#EC4899',
  '#3B82F6', '#EF4444', '#14B8A6', '#F97316', '#6366F1',
];

interface PipelineStage {
  name: string;
  interval_days: number;
  randomize: boolean;
  random_variation: number;
  color: string;
  enabled: boolean;
}

const DEFAULT_STAGES: PipelineStage[] = [
  { name: "Weekly", interval_days: 7, randomize: false, random_variation: 0, color: "#8B5CF6", enabled: true },
  { name: "Bi-Weekly", interval_days: 14, randomize: false, random_variation: 0, color: "#06B6D4", enabled: true },
  { name: "Monthly", interval_days: 30, randomize: false, random_variation: 0, color: "#10B981", enabled: true },
  { name: "Quarterly", interval_days: 90, randomize: false, random_variation: 0, color: "#F59E0B", enabled: true },
  { name: "Annually", interval_days: 365, randomize: false, random_variation: 0, color: "#EC4899", enabled: true },
];

export default function PipelineSettings() {
  const router = useRouter();
  const { token } = useAuth();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Pipeline stages
  const [stages, setStages] = useState<PipelineStage[]>(DEFAULT_STAGES);
  const [refreshing, setRefreshing] = useState(false);
  
  // Edit stage modal
  const [editingStage, setEditingStage] = useState<PipelineStage | null>(null);
  const [editingIndex, setEditingIndex] = useState<number>(-1);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  
  // New stage form
  const [newStageName, setNewStageName] = useState('');
  const [newStageInterval, setNewStageInterval] = useState('30');
  const [newStageRandomize, setNewStageRandomize] = useState(false);
  const [newStageVariation, setNewStageVariation] = useState('0');
  const [newStageColor, setNewStageColor] = useState(PRESET_COLORS[0]);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await axios.get(`${EXPO_PUBLIC_BACKEND_URL}/api/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const profile = response.data;
      
      if (profile.pipeline_stages && profile.pipeline_stages.length > 0) {
        // Sort by interval on load
        const sorted = [...profile.pipeline_stages].sort((a: PipelineStage, b: PipelineStage) => a.interval_days - b.interval_days);
        setStages(sorted);
      }
      setMorningBriefingEnabled(profile.morning_briefing_enabled ?? true);
      setMorningBriefingTime(profile.morning_briefing_time || '08:00');
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchSettings();
  }, []);

  const saveSettings = async () => {
    setSaving(true);
    try {
      // Filter to only enabled stages
      const enabledStages = stages.filter(s => s.enabled);
      if (enabledStages.length === 0) {
        Alert.alert('Error', 'You must have at least one enabled pipeline stage');
        setSaving(false);
        return;
      }
      
      // Sort stages by interval (smallest first)
      const sortedStages = [...stages].sort((a, b) => a.interval_days - b.interval_days);
      
      await axios.put(`${EXPO_PUBLIC_BACKEND_URL}/api/profile`, {
        pipeline_stages: sortedStages,
        morning_briefing_enabled: morningBriefingEnabled,
        morning_briefing_time: morningBriefingTime,
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setStages(sortedStages);
      Alert.alert('✓', 'Settings saved successfully');
      router.back();
    } catch (error) {
      Alert.alert('Error', 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleEditStage = (stage: PipelineStage, index: number) => {
    setEditingStage({ ...stage });
    setEditingIndex(index);
    setShowEditModal(true);
  };

  const handleSaveStageEdit = () => {
    if (!editingStage) return;
    
    const updatedStages = [...stages];
    updatedStages[editingIndex] = editingStage;
    // Sort by interval after edit
    updatedStages.sort((a, b) => a.interval_days - b.interval_days);
    setStages(updatedStages);
    setShowEditModal(false);
    setEditingStage(null);
    setEditingIndex(-1);
  };

  const handleDeleteStage = (index: number) => {
    const enabledCount = stages.filter(s => s.enabled).length;
    if (stages[index].enabled && enabledCount <= 1) {
      Alert.alert('Error', 'You must have at least one enabled pipeline stage');
      return;
    }
    
    Alert.alert(
      'Delete Stage',
      `Are you sure you want to delete "${stages[index].name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const updatedStages = stages.filter((_, i) => i !== index);
            setStages(updatedStages);
          }
        }
      ]
    );
  };

  const handleAddStage = () => {
    if (!newStageName.trim()) {
      Alert.alert('Error', 'Stage name is required');
      return;
    }
    
    const interval = parseInt(newStageInterval) || 30;
    const variation = parseInt(newStageVariation) || 0;
    
    const newStage: PipelineStage = {
      name: newStageName.trim(),
      interval_days: interval,
      randomize: newStageRandomize,
      random_variation: variation,
      color: newStageColor,
      enabled: true,
    };
    
    // Add and sort by interval (smallest first)
    const updatedStages = [...stages, newStage].sort((a, b) => a.interval_days - b.interval_days);
    setStages(updatedStages);
    setShowAddModal(false);
    resetNewStageForm();
  };

  const resetNewStageForm = () => {
    setNewStageName('');
    setNewStageInterval('30');
    setNewStageRandomize(false);
    setNewStageVariation('0');
    setNewStageColor(PRESET_COLORS[0]);
  };

  const toggleStageEnabled = (index: number) => {
    const enabledCount = stages.filter(s => s.enabled).length;
    if (stages[index].enabled && enabledCount <= 1) {
      Alert.alert('Error', 'You must have at least one enabled pipeline stage');
      return;
    }
    
    const updatedStages = [...stages];
    updatedStages[index] = { ...updatedStages[index], enabled: !updatedStages[index].enabled };
    setStages(updatedStages);
  };

  const handleTimeChange = (event: any, selectedTime?: Date) => {
    setShowTimePicker(Platform.OS === 'ios');
    if (selectedTime) {
      const hours = selectedTime.getHours().toString().padStart(2, '0');
      const minutes = selectedTime.getMinutes().toString().padStart(2, '0');
      setMorningBriefingTime(`${hours}:${minutes}`);
    }
  };

  const getTimeDate = () => {
    const [hours, minutes] = morningBriefingTime.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date;
  };

  const formatIntervalText = (stage: PipelineStage) => {
    const days = stage.interval_days;
    let text = '';
    
    if (days === 1) text = '1 day';
    else if (days === 7) text = '1 week';
    else if (days === 14) text = '2 weeks';
    else if (days === 30) text = '1 month';
    else if (days === 90) text = '3 months';
    else if (days === 365) text = '1 year';
    else text = `${days} days`;
    
    if (stage.randomize && stage.random_variation > 0) {
      text += ` ±${stage.random_variation}d`;
    }
    
    return text;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Pressable style={styles.container} onPress={Keyboard.dismiss}>
        <View style={styles.container}>
          {/* Header */}
          <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} style={styles.headerGradient}>
            <SafeAreaView edges={['top']}>
              <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                  <Ionicons name="chevron-back" size={28} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Pipeline Settings</Text>
                <TouchableOpacity onPress={saveSettings} disabled={saving} style={styles.saveButton}>
                  {saving ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <View style={styles.savePill}>
                      <Ionicons name="checkmark" size={18} color="#fff" />
                      <Text style={styles.savePillText}>Save</Text>
                    </View>
                  )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView 
        style={styles.content} 
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        keyboardShouldPersistTaps="handled"
      >
        {/* Pipeline Stages Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIconWrapper}>
              <Ionicons name="git-network" size={18} color={COLORS.primary} />
            </View>
            <Text style={styles.sectionTitle}>Pipeline Stages</Text>
            <TouchableOpacity 
              style={styles.addButton}
              onPress={() => setShowAddModal(true)}
            >
              <Ionicons name="add" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
          
          <Text style={styles.sectionHint}>
            Configure how often you want to reach out to contacts in each stage. 
            Enable randomization to add variety to your contact schedule.
          </Text>

          {stages.map((stage, index) => (
            <View key={index} style={[styles.stageCard, !stage.enabled && styles.stageCardDisabled]}>
              <TouchableOpacity 
                style={styles.stageToggle}
                onPress={() => toggleStageEnabled(index)}
              >
                <View style={[styles.stageColorDot, { backgroundColor: stage.color }]} />
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.stageContent}
                onPress={() => handleEditStage(stage, index)}
              >
                <View style={styles.stageMain}>
                  <Text style={[styles.stageName, !stage.enabled && styles.stageNameDisabled]}>
                    {stage.name}
                  </Text>
                  <View style={styles.stageDetails}>
                    <View style={[styles.intervalBadge, { backgroundColor: stage.color + '20' }]}>
                      <Ionicons name="calendar-outline" size={12} color={stage.color} />
                      <Text style={[styles.intervalText, { color: stage.color }]}>
                        {formatIntervalText(stage)}
                      </Text>
                    </View>
                    {stage.randomize && (
                      <View style={styles.randomBadge}>
                        <Ionicons name="shuffle" size={12} color={COLORS.primary} />
                      </View>
                    )}
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.deleteButton}
                onPress={() => handleDeleteStage(index)}
              >
                <Ionicons name="trash-outline" size={18} color={COLORS.accent} />
              </TouchableOpacity>
            </View>
          ))}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Time Picker */}
      {showTimePicker && (
        <DateTimePicker
          value={getTimeDate()}
          mode="time"
          is24Hour={true}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleTimeChange}
        />
      )}

      {/* Edit Stage Modal */}
      <Modal visible={showEditModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Edit Stage</Text>
            
            {editingStage && (
              <>
                <View style={styles.modalField}>
                  <Text style={styles.modalLabel}>Stage Name</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={editingStage.name}
                    onChangeText={(text) => setEditingStage({ ...editingStage, name: text })}
                    placeholder="Stage name"
                    placeholderTextColor={COLORS.textLight}
                  />
                </View>
                
                <View style={styles.modalField}>
                  <Text style={styles.modalLabel}>Interval (Days)</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={editingStage.interval_days.toString()}
                    onChangeText={(text) => setEditingStage({ ...editingStage, interval_days: parseInt(text) || 1 })}
                    keyboardType="number-pad"
                    placeholder="30"
                    placeholderTextColor={COLORS.textLight}
                  />
                </View>
                
                <View style={styles.modalSwitchRow}>
                  <View>
                    <Text style={styles.modalSwitchLabel}>Randomize Interval</Text>
                    <Text style={styles.modalSwitchHint}>Add variation to the schedule</Text>
                  </View>
                  <Switch
                    value={editingStage.randomize}
                    onValueChange={(value) => setEditingStage({ ...editingStage, randomize: value })}
                    trackColor={{ false: COLORS.border, true: COLORS.primary + '60' }}
                    thumbColor={editingStage.randomize ? COLORS.primary : COLORS.textLight}
                  />
                </View>
                
                {editingStage.randomize && (
                  <View style={styles.modalField}>
                    <Text style={styles.modalLabel}>Random Variation (±Days)</Text>
                    <TextInput
                      style={styles.modalInput}
                      value={editingStage.random_variation.toString()}
                      onChangeText={(text) => setEditingStage({ ...editingStage, random_variation: parseInt(text) || 0 })}
                      keyboardType="number-pad"
                      placeholder="2"
                      placeholderTextColor={COLORS.textLight}
                    />
                    <Text style={styles.inputHint}>
                      Example: 7 days ±2 = between 5-9 days
                    </Text>
                  </View>
                )}
                
                <View style={styles.modalField}>
                  <Text style={styles.modalLabel}>Color</Text>
                  <View style={styles.colorOptions}>
                    {PRESET_COLORS.map((color, idx) => (
                      <TouchableOpacity
                        key={idx}
                        style={[
                          styles.colorOption,
                          { backgroundColor: color },
                          editingStage.color === color && styles.colorOptionSelected
                        ]}
                        onPress={() => setEditingStage({ ...editingStage, color })}
                      >
                        {editingStage.color === color && (
                          <Ionicons name="checkmark" size={16} color="#fff" />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                
                <View style={styles.modalActions}>
                  <TouchableOpacity 
                    style={styles.modalCancelBtn}
                    onPress={() => {
                      setShowEditModal(false);
                      setEditingStage(null);
                    }}
                  >
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.modalSaveBtn}
                    onPress={handleSaveStageEdit}
                  >
                    <Text style={styles.modalSaveText}>Save</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Add Stage Modal */}
      <Modal visible={showAddModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Add Pipeline Stage</Text>
            
            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Stage Name</Text>
              <TextInput
                style={styles.modalInput}
                value={newStageName}
                onChangeText={setNewStageName}
                placeholder="e.g., Every 2 Weeks"
                placeholderTextColor={COLORS.textLight}
              />
            </View>
            
            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Interval (Days)</Text>
              <TextInput
                style={styles.modalInput}
                value={newStageInterval}
                onChangeText={setNewStageInterval}
                keyboardType="number-pad"
                placeholder="30"
                placeholderTextColor={COLORS.textLight}
              />
            </View>
            
            <View style={styles.modalSwitchRow}>
              <View>
                <Text style={styles.modalSwitchLabel}>Randomize Interval</Text>
                <Text style={styles.modalSwitchHint}>Add variation to the schedule</Text>
              </View>
              <Switch
                value={newStageRandomize}
                onValueChange={setNewStageRandomize}
                trackColor={{ false: COLORS.border, true: COLORS.primary + '60' }}
                thumbColor={newStageRandomize ? COLORS.primary : COLORS.textLight}
              />
            </View>
            
            {newStageRandomize && (
              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Random Variation (±Days)</Text>
                <TextInput
                  style={styles.modalInput}
                  value={newStageVariation}
                  onChangeText={setNewStageVariation}
                  keyboardType="number-pad"
                  placeholder="2"
                  placeholderTextColor={COLORS.textLight}
                />
              </View>
            )}
            
            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Color</Text>
              <View style={styles.colorOptions}>
                {PRESET_COLORS.map((color, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={[
                      styles.colorOption,
                      { backgroundColor: color },
                      newStageColor === color && styles.colorOptionSelected
                    ]}
                    onPress={() => setNewStageColor(color)}
                  >
                    {newStageColor === color && (
                      <Ionicons name="checkmark" size={16} color="#fff" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            
            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={styles.modalCancelBtn}
                onPress={() => {
                  setShowAddModal(false);
                  resetNewStageForm();
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.modalSaveBtn}
                onPress={handleAddStage}
              >
                <Text style={styles.modalSaveText}>Add Stage</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
        </View>
      </Pressable>
    </KeyboardAvoidingView>
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
    backgroundColor: COLORS.background,
  },
  headerGradient: {
    paddingBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  saveButton: {
    padding: 8,
  },
  savePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  savePillText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  sectionIconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: COLORS.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
    flex: 1,
  },
  sectionHint: {
    fontSize: 13,
    color: COLORS.textLight,
    marginBottom: 16,
    lineHeight: 18,
  },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchInfo: {
    flex: 1,
    marginRight: 16,
  },
  switchLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  switchHint: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 2,
  },
  timeSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  timeSelectorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  timeSelectorLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.text,
  },
  timeBadge: {
    backgroundColor: COLORS.primary + '15',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  timeBadgeText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primary,
  },
  stageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    overflow: 'hidden',
  },
  stageCardDisabled: {
    opacity: 0.5,
  },
  stageToggle: {
    padding: 16,
    borderRightWidth: 1,
    borderRightColor: COLORS.borderLight,
  },
  stageColorDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  stageContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  stageMain: {
    flex: 1,
  },
  stageName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  stageNameDisabled: {
    color: COLORS.textLight,
  },
  stageDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 8,
  },
  intervalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 6,
  },
  intervalText: {
    fontSize: 12,
    fontWeight: '600',
  },
  randomBadge: {
    backgroundColor: COLORS.primary + '15',
    padding: 4,
    borderRadius: 8,
  },
  deleteButton: {
    padding: 14,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.borderLight,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    paddingBottom: 40,
    maxHeight: '85%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 24,
  },
  modalField: {
    marginBottom: 16,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  modalInput: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  inputHint: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 6,
    fontStyle: 'italic',
  },
  modalSwitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingVertical: 8,
  },
  modalSwitchLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  modalSwitchHint: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 2,
  },
  colorOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  colorOption: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorOptionSelected: {
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: COLORS.background,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  modalSaveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
  },
  modalSaveText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
