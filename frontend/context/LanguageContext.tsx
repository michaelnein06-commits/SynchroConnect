import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// All translations for the app
export const TRANSLATIONS: { [lang: string]: { [key: string]: string } } = {
  en: {
    // Navigation
    pipeline: 'Pipeline',
    groups: 'Groups',
    contacts: 'Contacts',
    drafts: 'Drafts',
    profile: 'Profile',
    
    // Common actions
    save: 'Save',
    cancel: 'Cancel',
    edit: 'Edit',
    delete: 'Delete',
    done: 'Done',
    back: 'Back',
    search: 'Search',
    add: 'Add',
    create: 'Create',
    
    // Pipeline
    weekly: 'Weekly',
    biWeekly: 'Bi-Weekly',
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    annually: 'Annually',
    
    // Contact Card
    newContact: 'New Contact',
    contactDetails: 'Contact',
    basicInfo: 'Basic Information',
    name: 'Name',
    phone: 'Phone',
    email: 'Email',
    jobTitle: 'Job Title',
    location: 'Location',
    education: 'Education',
    birthday: 'Birthday',
    selectBirthday: 'Select birthday',
    
    // Connection
    connectionFrequency: 'Connection Frequency',
    nextDue: 'Next contact due',
    daysLeft: 'Days Left',
    
    // Groups
    selectGroups: 'Select Groups',
    noGroupsAssigned: 'No groups assigned',
    noGroupsCreated: 'No groups created yet',
    tapToSelectGroups: 'Tap to select groups',
    groupsSelected: 'group(s) selected',
    
    // Personal
    personalDetails: 'Personal Details',
    hobbies: 'Hobbies',
    favoriteFood: 'Favorite Food',
    howWeMet: 'How We Met',
    
    // Communication
    communication: 'Communication',
    language: 'Language',
    tone: 'Tone',
    exampleMessage: 'Example Message (AI Tone)',
    exampleMessageHint: 'Sample text so AI learns this contact\'s specific writing style',
    exampleMessagePlaceholder: 'e.g., "Hey Digga, wie siehts aus?"',
    
    // Tones
    casual: 'Casual',
    professional: 'Professional',
    friendly: 'Friendly',
    formal: 'Formal',
    
    // Notes
    notes: 'Notes',
    noNotesYet: 'No notes yet',
    addNotes: 'Add notes about this person...',
    
    // Interactions
    interactionHistory: 'Interaction History',
    logInteraction: 'Log Interaction',
    noInteractionsYet: 'No interactions logged yet',
    tapToLogFirst: 'Tap "Log Interaction" to record your first meeting',
    interactionType: 'Interaction Type',
    date: 'Date',
    notesOptional: 'Notes (optional)',
    whatDidYouTalk: 'What did you talk about?',
    interactionLogged: 'Interaction logged!',
    
    // Interaction types
    personalMeeting: 'Personal Meeting',
    phoneCall: 'Phone Call',
    whatsapp: 'WhatsApp',
    other: 'Other',
    
    // AI Draft
    generateAIDraft: 'Generate AI Draft',
    aiGeneratedDraft: 'AI Generated Draft',
    personalizedFor: 'For',
    copy: 'Copy',
    regenerate: 'Regenerate',
    copiedToClipboard: 'Copied!',
    draftCopied: 'Draft message copied to clipboard',
    
    // Errors & Success
    error: 'Error',
    success: 'Success',
    contactCreated: 'Contact created!',
    contactUpdated: 'Contact updated!',
    contactDeleted: 'Contact deleted',
    failedToLoad: 'Failed to load contact',
    failedToSave: 'Failed to save contact',
    failedToDelete: 'Failed to delete contact',
    failedToLogInteraction: 'Failed to log interaction',
    failedToGenerateDraft: 'Failed to generate AI draft',
    nameRequired: 'Name is required',
    
    // Delete confirmation
    deleteContact: 'Delete Contact',
    deleteContactConfirm: 'Are you sure you want to delete',
    
    // Settings
    settings: 'Settings',
    localization: 'Localization',
    appLanguage: 'App Language',
    defaultDraftLanguage: 'Default Draft Language',
    aiMessageDrafting: 'AI Message Drafting',
    defaultWritingStyle: 'Default Writing Style',
    writingStyleHint: 'This example helps AI learn your general writing style. Can be overridden per contact.',
    writingStylePlaceholder: 'e.g., Hey! How have you been? Just wanted to catch up...',
    notifications: 'Notifications',
    enableNotifications: 'Enable Notifications',
    morningBriefingTime: 'Morning Briefing Time',
    about: 'About',
    appVersion: 'App Version',
    selectLanguage: 'Select App Language',
    selectDraftLanguage: 'Default Draft Language',
    settingsSaved: 'Settings saved successfully',
    on: 'On',
    off: 'Off',
    
    // Profile
    logout: 'Logout',
    logoutConfirm: 'Are you sure you want to logout?',
    
    // Main screen
    searchContacts: 'Search contacts...',
    morningBriefing: 'Morning Briefing',
    noContactsDue: 'No contacts due today',
    addContact: 'Add Contact',
    interactions: 'Interactions',
  },
  de: {
    // Navigation
    pipeline: 'Pipeline',
    groups: 'Gruppen',
    contacts: 'Kontakte',
    drafts: 'Entwürfe',
    profile: 'Profil',
    
    // Common actions
    save: 'Speichern',
    cancel: 'Abbrechen',
    edit: 'Bearbeiten',
    delete: 'Löschen',
    done: 'Fertig',
    back: 'Zurück',
    search: 'Suchen',
    add: 'Hinzufügen',
    create: 'Erstellen',
    
    // Pipeline
    weekly: 'Wöchentlich',
    biWeekly: 'Zweiwöchentlich',
    monthly: 'Monatlich',
    quarterly: 'Vierteljährlich',
    annually: 'Jährlich',
    
    // Contact Card
    newContact: 'Neuer Kontakt',
    contactDetails: 'Kontakt',
    basicInfo: 'Grundinformationen',
    name: 'Name',
    phone: 'Telefon',
    email: 'E-Mail',
    jobTitle: 'Beruf',
    location: 'Standort',
    education: 'Ausbildung',
    birthday: 'Geburtstag',
    selectBirthday: 'Geburtstag auswählen',
    
    // Connection
    connectionFrequency: 'Kontakthäufigkeit',
    nextDue: 'Nächster Kontakt fällig',
    daysLeft: 'Tage übrig',
    
    // Groups
    selectGroups: 'Gruppen auswählen',
    noGroupsAssigned: 'Keine Gruppen zugewiesen',
    noGroupsCreated: 'Noch keine Gruppen erstellt',
    tapToSelectGroups: 'Tippen um Gruppen auszuwählen',
    groupsSelected: 'Gruppe(n) ausgewählt',
    
    // Personal
    personalDetails: 'Persönliche Details',
    hobbies: 'Hobbies',
    favoriteFood: 'Lieblingsessen',
    howWeMet: 'Kennengelernt',
    
    // Communication
    communication: 'Kommunikation',
    language: 'Sprache',
    tone: 'Ton',
    exampleMessage: 'Beispielnachricht (KI-Stil)',
    exampleMessageHint: 'Beispieltext, damit die KI den Schreibstil für diesen Kontakt lernt',
    exampleMessagePlaceholder: 'z.B., "Hey Digga, wie siehts aus?"',
    
    // Tones
    casual: 'Locker',
    professional: 'Professionell',
    friendly: 'Freundlich',
    formal: 'Formell',
    
    // Notes
    notes: 'Notizen',
    noNotesYet: 'Noch keine Notizen',
    addNotes: 'Notizen über diese Person hinzufügen...',
    
    // Interactions
    interactionHistory: 'Kontaktverlauf',
    logInteraction: 'Kontakt loggen',
    noInteractionsYet: 'Noch keine Interaktionen',
    tapToLogFirst: 'Tippe "Kontakt loggen" um dein erstes Treffen zu erfassen',
    interactionType: 'Art der Interaktion',
    date: 'Datum',
    notesOptional: 'Notizen (optional)',
    whatDidYouTalk: 'Worüber habt ihr gesprochen?',
    interactionLogged: 'Interaktion geloggt!',
    
    // Interaction types
    personalMeeting: 'Persönliches Treffen',
    phoneCall: 'Telefonat',
    whatsapp: 'WhatsApp',
    other: 'Sonstiges',
    
    // AI Draft
    generateAIDraft: 'KI-Entwurf erstellen',
    aiGeneratedDraft: 'KI-generierter Entwurf',
    personalizedFor: 'Für',
    copy: 'Kopieren',
    regenerate: 'Neu generieren',
    copiedToClipboard: 'Kopiert!',
    draftCopied: 'Nachricht in Zwischenablage kopiert',
    
    // Errors & Success
    error: 'Fehler',
    success: 'Erfolg',
    contactCreated: 'Kontakt erstellt!',
    contactUpdated: 'Kontakt aktualisiert!',
    contactDeleted: 'Kontakt gelöscht',
    failedToLoad: 'Kontakt konnte nicht geladen werden',
    failedToSave: 'Kontakt konnte nicht gespeichert werden',
    failedToDelete: 'Kontakt konnte nicht gelöscht werden',
    failedToLogInteraction: 'Interaktion konnte nicht geloggt werden',
    failedToGenerateDraft: 'KI-Entwurf konnte nicht erstellt werden',
    nameRequired: 'Name ist erforderlich',
    
    // Delete confirmation
    deleteContact: 'Kontakt löschen',
    deleteContactConfirm: 'Möchtest du wirklich löschen',
    
    // Settings
    settings: 'Einstellungen',
    localization: 'Sprache',
    appLanguage: 'App-Sprache',
    defaultDraftLanguage: 'Standard Entwurfssprache',
    aiMessageDrafting: 'KI-Nachrichtenentwürfe',
    defaultWritingStyle: 'Standard Schreibstil',
    writingStyleHint: 'Dieses Beispiel hilft der KI, deinen allgemeinen Schreibstil zu lernen. Kann pro Kontakt überschrieben werden.',
    writingStylePlaceholder: 'z.B., Hey! Wie gehts dir? Wollte mal nachfragen...',
    notifications: 'Benachrichtigungen',
    enableNotifications: 'Benachrichtigungen aktivieren',
    morningBriefingTime: 'Morgenbriefing Zeit',
    about: 'Über',
    appVersion: 'App-Version',
    selectLanguage: 'App-Sprache wählen',
    selectDraftLanguage: 'Standard Entwurfssprache',
    settingsSaved: 'Einstellungen gespeichert',
    on: 'An',
    off: 'Aus',
    
    // Profile
    logout: 'Abmelden',
    logoutConfirm: 'Möchtest du dich wirklich abmelden?',
    
    // Main screen
    searchContacts: 'Kontakte suchen...',
    morningBriefing: 'Morgenbriefing',
    noContactsDue: 'Heute keine Kontakte fällig',
    addContact: 'Kontakt hinzufügen',
    interactions: 'Interaktionen',
  },
};

interface LanguageContextType {
  language: string;
  setLanguage: (lang: string) => Promise<void>;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState('en');

  useEffect(() => {
    loadLanguage();
  }, []);

  const loadLanguage = async () => {
    try {
      const storedLang = await AsyncStorage.getItem('app_language');
      if (storedLang) {
        setLanguageState(storedLang);
      }
    } catch (error) {
      console.error('Error loading language:', error);
    }
  };

  const setLanguage = async (lang: string) => {
    try {
      await AsyncStorage.setItem('app_language', lang);
      setLanguageState(lang);
    } catch (error) {
      console.error('Error saving language:', error);
    }
  };

  const t = (key: string): string => {
    return TRANSLATIONS[language]?.[key] || TRANSLATIONS['en'][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
