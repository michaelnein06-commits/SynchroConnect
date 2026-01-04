import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Supported languages
export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹' },
  { code: 'pt', name: 'Português', flag: '🇵🇹' },
];

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
    close: 'Close',
    confirm: 'Confirm',
    yes: 'Yes',
    no: 'No',
    ok: 'OK',
    loading: 'Loading...',
    saving: 'Saving...',
    
    // Pipeline stages
    weekly: 'Weekly',
    biWeekly: 'Bi-Weekly',
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    annually: 'Annually',
    
    // Contact Card
    newContact: 'New Contact',
    contactDetails: 'Contact Details',
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
    overdue: 'Overdue',
    dueToday: 'Due Today',
    
    // Groups
    selectGroups: 'Select Groups',
    noGroupsAssigned: 'No groups assigned',
    noGroupsCreated: 'No groups created yet',
    tapToSelectGroups: 'Tap to select groups',
    groupsSelected: 'group(s) selected',
    createGroup: 'Create Group',
    groupName: 'Group Name',
    groupDescription: 'Description (optional)',
    addContacts: 'Add Contacts',
    noGroups: 'No groups yet',
    createFirstGroup: 'Create your first group to organize contacts',
    searchGroups: 'Search groups...',
    groupMembers: 'Members',
    addToGroup: 'Add to Group',
    removeFromGroup: 'Remove from Group',
    
    // Personal
    personalDetails: 'Personal Details',
    hobbies: 'Hobbies',
    favoriteFood: 'Favorite Food',
    howWeMet: 'How We Met',
    
    // Communication
    communication: 'Communication',
    language: 'Language',
    tone: 'Tone',
    exampleMessage: 'Example Message',
    exampleMessageHint: 'Sample text so AI learns your writing style for this contact',
    exampleMessagePlaceholder: 'e.g., "Hey! How are you doing?"',
    
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
    videoCall: 'Video Call',
    whatsapp: 'WhatsApp',
    textMessage: 'Text Message',
    socialMedia: 'Social Media',
    other: 'Other',
    
    // AI Draft
    generateAIDraft: 'Generate AI Draft',
    aiGeneratedDraft: 'AI Generated Draft',
    personalizedFor: 'For',
    copy: 'Copy',
    regenerate: 'Regenerate',
    copiedToClipboard: 'Copied!',
    draftCopied: 'Draft copied to clipboard',
    generatingDraft: 'Generating draft...',
    
    // Screenshots
    conversationScreenshots: 'Conversation Screenshots',
    screenshotHint: 'Upload up to 3 chat screenshots - AI learns your style from these!',
    priority: 'Priority',
    noScreenshotsUploaded: 'No screenshots uploaded',
    aiWillLearnFrom: 'AI will learn style from',
    screenshots: 'screenshots',
    exampleText: 'example text',
    toneFallback: 'Tone (Fallback)',
    toneFallbackHint: 'Used when no screenshots or example text provided',
    addScreenshot: 'Add Screenshot',
    removeScreenshot: 'Remove',
    
    // Errors & Success
    error: 'Error',
    success: 'Success',
    contactCreated: 'Contact created!',
    contactUpdated: 'Contact updated!',
    contactDeleted: 'Contact deleted',
    failedToLoad: 'Failed to load',
    failedToSave: 'Failed to save',
    failedToDelete: 'Failed to delete',
    failedToLogInteraction: 'Failed to log interaction',
    failedToGenerateDraft: 'Failed to generate AI draft',
    nameRequired: 'Name is required',
    networkError: 'Network error. Please try again.',
    
    // Delete confirmation
    deleteContact: 'Delete Contact',
    deleteContactConfirm: 'Are you sure you want to delete this contact?',
    deleteGroup: 'Delete Group',
    deleteGroupConfirm: 'Are you sure you want to delete this group?',
    
    // Settings
    settings: 'Settings',
    localization: 'Localization',
    appLanguage: 'App Language',
    defaultDraftLanguage: 'Default Draft Language',
    aiMessageDrafting: 'AI Message Drafting',
    defaultWritingStyle: 'Default Writing Style',
    writingStyleHint: 'Example to help AI learn your general writing style',
    writingStylePlaceholder: 'e.g., Hey! How have you been?',
    notifications: 'Notifications',
    enableNotifications: 'Enable Notifications',
    morningBriefingTime: 'Morning Briefing Time',
    about: 'About',
    appVersion: 'App Version',
    selectLanguage: 'Select Language',
    selectDraftLanguage: 'Default Draft Language',
    settingsSaved: 'Settings saved',
    on: 'On',
    off: 'Off',
    
    // Profile
    logout: 'Logout',
    logoutConfirm: 'Are you sure you want to logout?',
    editProfile: 'Edit Profile',
    bio: 'Bio',
    bioPlaceholder: 'Tell something about yourself...',
    profileUpdated: 'Profile updated!',
    
    // Main screen
    searchContacts: 'Search contacts...',
    morningBriefing: 'Morning Briefing',
    noContactsDue: 'No contacts due today',
    addContact: 'Add Contact',
    interactions: 'Interactions',
    contactsToReach: 'contacts to reach out to',
    
    // Drafts tab
    noAIDraftsYet: 'No AI Drafts Yet',
    generateDraftsFromContacts: 'Generate drafts from your contacts',
    deleteAll: 'Delete All',
    deleteDraft: 'Delete Draft',
    allDraftsDeleted: 'All drafts deleted',
    
    // Profile tab
    importContacts: 'Import Contacts',
    deleteAllContacts: 'Delete All Contacts',
    deleteAllContactsConfirm: 'This will permanently delete all your contacts. Are you sure?',
    allContactsDeleted: 'All contacts deleted',
    
    // Contact import
    importFromDevice: 'Import from Device',
    searchDeviceContacts: 'Search device contacts...',
    noContactsFound: 'No contacts found',
    import: 'Import',
    importing: 'Importing...',
    contactsImported: 'contacts imported!',
    selectAll: 'Select All',
    deselectAll: 'Deselect All',
    selected: 'selected',
    
    // Auth
    signIn: 'Sign In',
    signInWithGoogle: 'Sign In with Google',
    signingIn: 'Signing in...',
    welcome: 'Welcome',
    welcomeBack: 'Welcome back',
    continueWithGoogle: 'Continue with Google',
    
    // Empty states
    noContacts: 'No contacts yet',
    addFirstContact: 'Add your first contact to get started',
    noDrafts: 'No drafts yet',
    
    // Notifications
    notificationTitle: 'Time to reconnect!',
    notificationBody: 'You have contacts waiting to hear from you',
    
    // Move contact
    moveContact: 'Move Contact',
    moveTo: 'Move to',
    contactMoved: 'Contact moved!',
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
    close: 'Schließen',
    confirm: 'Bestätigen',
    yes: 'Ja',
    no: 'Nein',
    ok: 'OK',
    loading: 'Laden...',
    saving: 'Speichern...',
    
    // Pipeline stages
    weekly: 'Wöchentlich',
    biWeekly: 'Zweiwöchentlich',
    monthly: 'Monatlich',
    quarterly: 'Vierteljährlich',
    annually: 'Jährlich',
    
    // Contact Card
    newContact: 'Neuer Kontakt',
    contactDetails: 'Kontaktdetails',
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
    overdue: 'Überfällig',
    dueToday: 'Heute fällig',
    
    // Groups
    selectGroups: 'Gruppen auswählen',
    noGroupsAssigned: 'Keine Gruppen zugewiesen',
    noGroupsCreated: 'Noch keine Gruppen erstellt',
    tapToSelectGroups: 'Tippen um Gruppen auszuwählen',
    groupsSelected: 'Gruppe(n) ausgewählt',
    createGroup: 'Gruppe erstellen',
    groupName: 'Gruppenname',
    groupDescription: 'Beschreibung (optional)',
    addContacts: 'Kontakte hinzufügen',
    noGroups: 'Noch keine Gruppen',
    createFirstGroup: 'Erstelle deine erste Gruppe',
    searchGroups: 'Gruppen suchen...',
    groupMembers: 'Mitglieder',
    addToGroup: 'Zur Gruppe hinzufügen',
    removeFromGroup: 'Aus Gruppe entfernen',
    
    // Personal
    personalDetails: 'Persönliche Details',
    hobbies: 'Hobbys',
    favoriteFood: 'Lieblingsessen',
    howWeMet: 'Kennengelernt',
    
    // Communication
    communication: 'Kommunikation',
    language: 'Sprache',
    tone: 'Ton',
    exampleMessage: 'Beispielnachricht',
    exampleMessageHint: 'Beispieltext damit die KI deinen Schreibstil lernt',
    exampleMessagePlaceholder: 'z.B. "Hey! Wie gehts dir?"',
    
    // Tones
    casual: 'Locker',
    professional: 'Professionell',
    friendly: 'Freundlich',
    formal: 'Formell',
    
    // Notes
    notes: 'Notizen',
    noNotesYet: 'Noch keine Notizen',
    addNotes: 'Notizen hinzufügen...',
    
    // Interactions
    interactionHistory: 'Kontaktverlauf',
    logInteraction: 'Kontakt loggen',
    noInteractionsYet: 'Noch keine Interaktionen',
    tapToLogFirst: 'Tippe auf "Kontakt loggen" um dein erstes Treffen zu erfassen',
    interactionType: 'Art der Interaktion',
    date: 'Datum',
    notesOptional: 'Notizen (optional)',
    whatDidYouTalk: 'Worüber habt ihr gesprochen?',
    interactionLogged: 'Interaktion geloggt!',
    
    // Interaction types
    personalMeeting: 'Persönliches Treffen',
    phoneCall: 'Telefonat',
    videoCall: 'Videoanruf',
    whatsapp: 'WhatsApp',
    textMessage: 'SMS',
    socialMedia: 'Social Media',
    other: 'Sonstiges',
    
    // AI Draft
    generateAIDraft: 'KI-Entwurf erstellen',
    aiGeneratedDraft: 'KI-generierter Entwurf',
    personalizedFor: 'Für',
    copy: 'Kopieren',
    regenerate: 'Neu generieren',
    copiedToClipboard: 'Kopiert!',
    draftCopied: 'Entwurf in Zwischenablage kopiert',
    generatingDraft: 'Entwurf wird erstellt...',
    
    // Screenshots
    conversationScreenshots: 'Gesprächs-Screenshots',
    screenshotHint: 'Lade bis zu 3 Chat-Screenshots hoch - die KI lernt deinen Stil daraus!',
    priority: 'Priorität',
    noScreenshotsUploaded: 'Keine Screenshots hochgeladen',
    aiWillLearnFrom: 'KI lernt Stil aus',
    screenshots: 'Screenshots',
    exampleText: 'Beispieltext',
    toneFallback: 'Ton (Fallback)',
    toneFallbackHint: 'Wird verwendet wenn keine Screenshots oder Beispieltext vorhanden',
    addScreenshot: 'Screenshot hinzufügen',
    removeScreenshot: 'Entfernen',
    
    // Errors & Success
    error: 'Fehler',
    success: 'Erfolg',
    contactCreated: 'Kontakt erstellt!',
    contactUpdated: 'Kontakt aktualisiert!',
    contactDeleted: 'Kontakt gelöscht',
    failedToLoad: 'Laden fehlgeschlagen',
    failedToSave: 'Speichern fehlgeschlagen',
    failedToDelete: 'Löschen fehlgeschlagen',
    failedToLogInteraction: 'Interaktion konnte nicht geloggt werden',
    failedToGenerateDraft: 'KI-Entwurf konnte nicht erstellt werden',
    nameRequired: 'Name ist erforderlich',
    networkError: 'Netzwerkfehler. Bitte erneut versuchen.',
    
    // Delete confirmation
    deleteContact: 'Kontakt löschen',
    deleteContactConfirm: 'Möchtest du diesen Kontakt wirklich löschen?',
    deleteGroup: 'Gruppe löschen',
    deleteGroupConfirm: 'Möchtest du diese Gruppe wirklich löschen?',
    
    // Settings
    settings: 'Einstellungen',
    localization: 'Sprache',
    appLanguage: 'App-Sprache',
    defaultDraftLanguage: 'Standard Entwurfssprache',
    aiMessageDrafting: 'KI-Nachrichtenentwürfe',
    defaultWritingStyle: 'Standard Schreibstil',
    writingStyleHint: 'Beispiel damit die KI deinen allgemeinen Schreibstil lernt',
    writingStylePlaceholder: 'z.B. Hey! Wie gehts dir?',
    notifications: 'Benachrichtigungen',
    enableNotifications: 'Benachrichtigungen aktivieren',
    morningBriefingTime: 'Morgenbriefing Zeit',
    about: 'Über',
    appVersion: 'App-Version',
    selectLanguage: 'Sprache wählen',
    selectDraftLanguage: 'Standard Entwurfssprache',
    settingsSaved: 'Einstellungen gespeichert',
    on: 'An',
    off: 'Aus',
    
    // Profile
    logout: 'Abmelden',
    logoutConfirm: 'Möchtest du dich wirklich abmelden?',
    editProfile: 'Profil bearbeiten',
    bio: 'Bio',
    bioPlaceholder: 'Erzähle etwas über dich...',
    profileUpdated: 'Profil aktualisiert!',
    
    // Main screen
    searchContacts: 'Kontakte suchen...',
    morningBriefing: 'Morgenbriefing',
    noContactsDue: 'Heute keine Kontakte fällig',
    addContact: 'Kontakt hinzufügen',
    interactions: 'Interaktionen',
    contactsToReach: 'Kontakte zum Erreichen',
    
    // Drafts tab
    noAIDraftsYet: 'Noch keine KI-Entwürfe',
    generateDraftsFromContacts: 'Erstelle Entwürfe aus deinen Kontakten',
    deleteAll: 'Alle löschen',
    deleteDraft: 'Entwurf löschen',
    allDraftsDeleted: 'Alle Entwürfe gelöscht',
    
    // Profile tab
    importContacts: 'Kontakte importieren',
    deleteAllContacts: 'Alle Kontakte löschen',
    deleteAllContactsConfirm: 'Dies wird alle deine Kontakte dauerhaft löschen. Bist du sicher?',
    allContactsDeleted: 'Alle Kontakte gelöscht',
    
    // Contact import
    importFromDevice: 'Vom Gerät importieren',
    searchDeviceContacts: 'Gerätekontakte suchen...',
    noContactsFound: 'Keine Kontakte gefunden',
    import: 'Importieren',
    importing: 'Importiere...',
    contactsImported: 'Kontakte importiert!',
    selectAll: 'Alle auswählen',
    deselectAll: 'Alle abwählen',
    selected: 'ausgewählt',
    
    // Auth
    signIn: 'Anmelden',
    signInWithGoogle: 'Mit Google anmelden',
    signingIn: 'Anmeldung...',
    welcome: 'Willkommen',
    welcomeBack: 'Willkommen zurück',
    continueWithGoogle: 'Mit Google fortfahren',
    
    // Empty states
    noContacts: 'Noch keine Kontakte',
    addFirstContact: 'Füge deinen ersten Kontakt hinzu',
    noDrafts: 'Noch keine Entwürfe',
    
    // Notifications
    notificationTitle: 'Zeit zum Melden!',
    notificationBody: 'Du hast Kontakte, die auf dich warten',
    
    // Move contact
    moveContact: 'Kontakt verschieben',
    moveTo: 'Verschieben nach',
    contactMoved: 'Kontakt verschoben!',
  },
  
  es: {
    // Navigation
    pipeline: 'Pipeline',
    groups: 'Grupos',
    contacts: 'Contactos',
    drafts: 'Borradores',
    profile: 'Perfil',
    
    // Common actions
    save: 'Guardar',
    cancel: 'Cancelar',
    edit: 'Editar',
    delete: 'Eliminar',
    done: 'Listo',
    back: 'Atrás',
    search: 'Buscar',
    add: 'Añadir',
    create: 'Crear',
    close: 'Cerrar',
    confirm: 'Confirmar',
    yes: 'Sí',
    no: 'No',
    ok: 'OK',
    loading: 'Cargando...',
    saving: 'Guardando...',
    
    // Pipeline stages
    weekly: 'Semanal',
    biWeekly: 'Quincenal',
    monthly: 'Mensual',
    quarterly: 'Trimestral',
    annually: 'Anual',
    
    // Contact Card
    newContact: 'Nuevo Contacto',
    contactDetails: 'Detalles del Contacto',
    basicInfo: 'Información Básica',
    name: 'Nombre',
    phone: 'Teléfono',
    email: 'Email',
    jobTitle: 'Trabajo',
    location: 'Ubicación',
    education: 'Educación',
    birthday: 'Cumpleaños',
    selectBirthday: 'Seleccionar cumpleaños',
    
    // Connection
    connectionFrequency: 'Frecuencia de Contacto',
    nextDue: 'Próximo contacto',
    daysLeft: 'Días restantes',
    overdue: 'Atrasado',
    dueToday: 'Hoy',
    
    // Groups
    selectGroups: 'Seleccionar Grupos',
    noGroupsAssigned: 'Sin grupos asignados',
    noGroupsCreated: 'No hay grupos creados',
    tapToSelectGroups: 'Toca para seleccionar grupos',
    groupsSelected: 'grupo(s) seleccionado(s)',
    createGroup: 'Crear Grupo',
    groupName: 'Nombre del Grupo',
    groupDescription: 'Descripción (opcional)',
    addContacts: 'Añadir Contactos',
    noGroups: 'Sin grupos',
    createFirstGroup: 'Crea tu primer grupo',
    searchGroups: 'Buscar grupos...',
    groupMembers: 'Miembros',
    addToGroup: 'Añadir al Grupo',
    removeFromGroup: 'Quitar del Grupo',
    
    // Personal
    personalDetails: 'Detalles Personales',
    hobbies: 'Hobbies',
    favoriteFood: 'Comida Favorita',
    howWeMet: 'Cómo nos Conocimos',
    
    // Communication
    communication: 'Comunicación',
    language: 'Idioma',
    tone: 'Tono',
    exampleMessage: 'Mensaje de Ejemplo',
    exampleMessageHint: 'Texto de ejemplo para que la IA aprenda tu estilo',
    exampleMessagePlaceholder: 'ej., "¡Hola! ¿Cómo estás?"',
    
    // Tones
    casual: 'Casual',
    professional: 'Profesional',
    friendly: 'Amigable',
    formal: 'Formal',
    
    // Notes
    notes: 'Notas',
    noNotesYet: 'Sin notas aún',
    addNotes: 'Añadir notas...',
    
    // Interactions
    interactionHistory: 'Historial de Interacciones',
    logInteraction: 'Registrar Interacción',
    noInteractionsYet: 'Sin interacciones aún',
    tapToLogFirst: 'Toca "Registrar" para tu primera reunión',
    interactionType: 'Tipo de Interacción',
    date: 'Fecha',
    notesOptional: 'Notas (opcional)',
    whatDidYouTalk: '¿De qué hablaron?',
    interactionLogged: '¡Interacción registrada!',
    
    // Interaction types
    personalMeeting: 'Reunión Personal',
    phoneCall: 'Llamada',
    videoCall: 'Videollamada',
    whatsapp: 'WhatsApp',
    textMessage: 'Mensaje de Texto',
    socialMedia: 'Redes Sociales',
    other: 'Otro',
    
    // AI Draft
    generateAIDraft: 'Generar Borrador IA',
    aiGeneratedDraft: 'Borrador Generado por IA',
    personalizedFor: 'Para',
    copy: 'Copiar',
    regenerate: 'Regenerar',
    copiedToClipboard: '¡Copiado!',
    draftCopied: 'Borrador copiado',
    generatingDraft: 'Generando borrador...',
    
    // Screenshots
    conversationScreenshots: 'Capturas de Conversación',
    screenshotHint: 'Sube hasta 3 capturas - ¡la IA aprende tu estilo!',
    priority: 'Prioridad',
    noScreenshotsUploaded: 'Sin capturas',
    aiWillLearnFrom: 'La IA aprenderá de',
    screenshots: 'capturas',
    exampleText: 'texto de ejemplo',
    toneFallback: 'Tono (Alternativo)',
    toneFallbackHint: 'Usado cuando no hay capturas o texto de ejemplo',
    addScreenshot: 'Añadir Captura',
    removeScreenshot: 'Quitar',
    
    // Errors & Success
    error: 'Error',
    success: 'Éxito',
    contactCreated: '¡Contacto creado!',
    contactUpdated: '¡Contacto actualizado!',
    contactDeleted: 'Contacto eliminado',
    failedToLoad: 'Error al cargar',
    failedToSave: 'Error al guardar',
    failedToDelete: 'Error al eliminar',
    failedToLogInteraction: 'Error al registrar interacción',
    failedToGenerateDraft: 'Error al generar borrador',
    nameRequired: 'El nombre es requerido',
    networkError: 'Error de red. Intenta de nuevo.',
    
    // Delete confirmation
    deleteContact: 'Eliminar Contacto',
    deleteContactConfirm: '¿Seguro que quieres eliminar este contacto?',
    deleteGroup: 'Eliminar Grupo',
    deleteGroupConfirm: '¿Seguro que quieres eliminar este grupo?',
    
    // Settings
    settings: 'Ajustes',
    localization: 'Idioma',
    appLanguage: 'Idioma de la App',
    defaultDraftLanguage: 'Idioma de Borradores',
    aiMessageDrafting: 'Borradores IA',
    defaultWritingStyle: 'Estilo de Escritura',
    writingStyleHint: 'Ejemplo para que la IA aprenda tu estilo',
    writingStylePlaceholder: 'ej., ¡Hola! ¿Cómo estás?',
    notifications: 'Notificaciones',
    enableNotifications: 'Activar Notificaciones',
    morningBriefingTime: 'Hora del Briefing',
    about: 'Acerca de',
    appVersion: 'Versión',
    selectLanguage: 'Seleccionar Idioma',
    selectDraftLanguage: 'Idioma de Borradores',
    settingsSaved: 'Ajustes guardados',
    on: 'Sí',
    off: 'No',
    
    // Profile
    logout: 'Cerrar Sesión',
    logoutConfirm: '¿Seguro que quieres cerrar sesión?',
    editProfile: 'Editar Perfil',
    bio: 'Bio',
    bioPlaceholder: 'Cuéntanos sobre ti...',
    profileUpdated: '¡Perfil actualizado!',
    
    // Main screen
    searchContacts: 'Buscar contactos...',
    morningBriefing: 'Briefing Matutino',
    noContactsDue: 'Sin contactos pendientes hoy',
    addContact: 'Añadir Contacto',
    interactions: 'Interacciones',
    contactsToReach: 'contactos por contactar',
    
    // Drafts tab
    noAIDraftsYet: 'Sin Borradores IA',
    generateDraftsFromContacts: 'Genera borradores desde tus contactos',
    deleteAll: 'Eliminar Todo',
    deleteDraft: 'Eliminar Borrador',
    allDraftsDeleted: 'Todos los borradores eliminados',
    
    // Profile tab
    importContacts: 'Importar Contactos',
    deleteAllContacts: 'Eliminar Todos',
    deleteAllContactsConfirm: 'Esto eliminará permanentemente todos tus contactos. ¿Estás seguro?',
    allContactsDeleted: 'Todos los contactos eliminados',
    
    // Contact import
    importFromDevice: 'Importar del Dispositivo',
    searchDeviceContacts: 'Buscar contactos...',
    noContactsFound: 'No se encontraron contactos',
    import: 'Importar',
    importing: 'Importando...',
    contactsImported: '¡contactos importados!',
    selectAll: 'Seleccionar Todo',
    deselectAll: 'Deseleccionar Todo',
    selected: 'seleccionado(s)',
    
    // Auth
    signIn: 'Iniciar Sesión',
    signInWithGoogle: 'Iniciar con Google',
    signingIn: 'Iniciando sesión...',
    welcome: 'Bienvenido',
    welcomeBack: 'Bienvenido de nuevo',
    continueWithGoogle: 'Continuar con Google',
    
    // Empty states
    noContacts: 'Sin contactos',
    addFirstContact: 'Añade tu primer contacto',
    noDrafts: 'Sin borradores',
    
    // Notifications
    notificationTitle: '¡Hora de reconectar!',
    notificationBody: 'Tienes contactos esperando saber de ti',
    
    // Move contact
    moveContact: 'Mover Contacto',
    moveTo: 'Mover a',
    contactMoved: '¡Contacto movido!',
  },
  
  fr: {
    // Navigation
    pipeline: 'Pipeline',
    groups: 'Groupes',
    contacts: 'Contacts',
    drafts: 'Brouillons',
    profile: 'Profil',
    
    // Common actions
    save: 'Enregistrer',
    cancel: 'Annuler',
    edit: 'Modifier',
    delete: 'Supprimer',
    done: 'Terminé',
    back: 'Retour',
    search: 'Rechercher',
    add: 'Ajouter',
    create: 'Créer',
    close: 'Fermer',
    confirm: 'Confirmer',
    yes: 'Oui',
    no: 'Non',
    ok: 'OK',
    loading: 'Chargement...',
    saving: 'Enregistrement...',
    
    // Pipeline stages
    weekly: 'Hebdomadaire',
    biWeekly: 'Bimensuel',
    monthly: 'Mensuel',
    quarterly: 'Trimestriel',
    annually: 'Annuel',
    
    // Contact Card
    newContact: 'Nouveau Contact',
    contactDetails: 'Détails du Contact',
    basicInfo: 'Informations de Base',
    name: 'Nom',
    phone: 'Téléphone',
    email: 'Email',
    jobTitle: 'Métier',
    location: 'Lieu',
    education: 'Éducation',
    birthday: 'Anniversaire',
    selectBirthday: 'Sélectionner la date',
    
    // Connection
    connectionFrequency: 'Fréquence de Contact',
    nextDue: 'Prochain contact',
    daysLeft: 'Jours restants',
    overdue: 'En retard',
    dueToday: "Aujourd'hui",
    
    // Groups
    selectGroups: 'Sélectionner des Groupes',
    noGroupsAssigned: 'Aucun groupe assigné',
    noGroupsCreated: 'Aucun groupe créé',
    tapToSelectGroups: 'Appuyez pour sélectionner',
    groupsSelected: 'groupe(s) sélectionné(s)',
    createGroup: 'Créer un Groupe',
    groupName: 'Nom du Groupe',
    groupDescription: 'Description (optionnel)',
    addContacts: 'Ajouter des Contacts',
    noGroups: 'Aucun groupe',
    createFirstGroup: 'Créez votre premier groupe',
    searchGroups: 'Rechercher des groupes...',
    groupMembers: 'Membres',
    addToGroup: 'Ajouter au Groupe',
    removeFromGroup: 'Retirer du Groupe',
    
    // Personal
    personalDetails: 'Détails Personnels',
    hobbies: 'Loisirs',
    favoriteFood: 'Nourriture Préférée',
    howWeMet: 'Comment on s\'est rencontré',
    
    // Communication
    communication: 'Communication',
    language: 'Langue',
    tone: 'Ton',
    exampleMessage: 'Message Exemple',
    exampleMessageHint: 'Exemple pour que l\'IA apprenne votre style',
    exampleMessagePlaceholder: 'ex., "Salut ! Comment ça va ?"',
    
    // Tones
    casual: 'Décontracté',
    professional: 'Professionnel',
    friendly: 'Amical',
    formal: 'Formel',
    
    // Notes
    notes: 'Notes',
    noNotesYet: 'Pas de notes',
    addNotes: 'Ajouter des notes...',
    
    // Interactions
    interactionHistory: 'Historique des Interactions',
    logInteraction: 'Enregistrer une Interaction',
    noInteractionsYet: 'Pas d\'interactions',
    tapToLogFirst: 'Appuyez pour enregistrer votre première rencontre',
    interactionType: 'Type d\'Interaction',
    date: 'Date',
    notesOptional: 'Notes (optionnel)',
    whatDidYouTalk: 'De quoi avez-vous parlé ?',
    interactionLogged: 'Interaction enregistrée !',
    
    // Interaction types
    personalMeeting: 'Rencontre Personnelle',
    phoneCall: 'Appel',
    videoCall: 'Appel Vidéo',
    whatsapp: 'WhatsApp',
    textMessage: 'SMS',
    socialMedia: 'Réseaux Sociaux',
    other: 'Autre',
    
    // AI Draft
    generateAIDraft: 'Générer un Brouillon IA',
    aiGeneratedDraft: 'Brouillon Généré par IA',
    personalizedFor: 'Pour',
    copy: 'Copier',
    regenerate: 'Régénérer',
    copiedToClipboard: 'Copié !',
    draftCopied: 'Brouillon copié',
    generatingDraft: 'Génération...',
    
    // Screenshots
    conversationScreenshots: 'Captures de Conversation',
    screenshotHint: 'Téléchargez jusqu\'à 3 captures - l\'IA apprend votre style !',
    priority: 'Priorité',
    noScreenshotsUploaded: 'Pas de captures',
    aiWillLearnFrom: 'L\'IA apprendra de',
    screenshots: 'captures',
    exampleText: 'texte exemple',
    toneFallback: 'Ton (Alternatif)',
    toneFallbackHint: 'Utilisé quand pas de captures ou texte exemple',
    addScreenshot: 'Ajouter une Capture',
    removeScreenshot: 'Retirer',
    
    // Errors & Success
    error: 'Erreur',
    success: 'Succès',
    contactCreated: 'Contact créé !',
    contactUpdated: 'Contact mis à jour !',
    contactDeleted: 'Contact supprimé',
    failedToLoad: 'Échec du chargement',
    failedToSave: 'Échec de l\'enregistrement',
    failedToDelete: 'Échec de la suppression',
    failedToLogInteraction: 'Échec de l\'enregistrement',
    failedToGenerateDraft: 'Échec de la génération',
    nameRequired: 'Le nom est requis',
    networkError: 'Erreur réseau. Réessayez.',
    
    // Delete confirmation
    deleteContact: 'Supprimer le Contact',
    deleteContactConfirm: 'Voulez-vous vraiment supprimer ce contact ?',
    deleteGroup: 'Supprimer le Groupe',
    deleteGroupConfirm: 'Voulez-vous vraiment supprimer ce groupe ?',
    
    // Settings
    settings: 'Paramètres',
    localization: 'Langue',
    appLanguage: 'Langue de l\'App',
    defaultDraftLanguage: 'Langue des Brouillons',
    aiMessageDrafting: 'Brouillons IA',
    defaultWritingStyle: 'Style d\'Écriture',
    writingStyleHint: 'Exemple pour que l\'IA apprenne votre style',
    writingStylePlaceholder: 'ex., Salut ! Comment ça va ?',
    notifications: 'Notifications',
    enableNotifications: 'Activer les Notifications',
    morningBriefingTime: 'Heure du Briefing',
    about: 'À propos',
    appVersion: 'Version',
    selectLanguage: 'Sélectionner la Langue',
    selectDraftLanguage: 'Langue des Brouillons',
    settingsSaved: 'Paramètres enregistrés',
    on: 'Oui',
    off: 'Non',
    
    // Profile
    logout: 'Déconnexion',
    logoutConfirm: 'Voulez-vous vraiment vous déconnecter ?',
    editProfile: 'Modifier le Profil',
    bio: 'Bio',
    bioPlaceholder: 'Parlez-nous de vous...',
    profileUpdated: 'Profil mis à jour !',
    
    // Main screen
    searchContacts: 'Rechercher des contacts...',
    morningBriefing: 'Briefing du Matin',
    noContactsDue: 'Pas de contacts prévus',
    addContact: 'Ajouter un Contact',
    interactions: 'Interactions',
    contactsToReach: 'contacts à contacter',
    
    // Drafts tab
    noAIDraftsYet: 'Pas de Brouillons IA',
    generateDraftsFromContacts: 'Générez des brouillons depuis vos contacts',
    deleteAll: 'Tout Supprimer',
    deleteDraft: 'Supprimer le Brouillon',
    allDraftsDeleted: 'Tous les brouillons supprimés',
    
    // Profile tab
    importContacts: 'Importer des Contacts',
    deleteAllContacts: 'Tout Supprimer',
    deleteAllContactsConfirm: 'Ceci supprimera tous vos contacts. Êtes-vous sûr ?',
    allContactsDeleted: 'Tous les contacts supprimés',
    
    // Contact import
    importFromDevice: 'Importer de l\'Appareil',
    searchDeviceContacts: 'Rechercher...',
    noContactsFound: 'Aucun contact trouvé',
    import: 'Importer',
    importing: 'Importation...',
    contactsImported: 'contacts importés !',
    selectAll: 'Tout Sélectionner',
    deselectAll: 'Tout Désélectionner',
    selected: 'sélectionné(s)',
    
    // Auth
    signIn: 'Se Connecter',
    signInWithGoogle: 'Se connecter avec Google',
    signingIn: 'Connexion...',
    welcome: 'Bienvenue',
    welcomeBack: 'Content de vous revoir',
    continueWithGoogle: 'Continuer avec Google',
    
    // Empty states
    noContacts: 'Pas de contacts',
    addFirstContact: 'Ajoutez votre premier contact',
    noDrafts: 'Pas de brouillons',
    
    // Notifications
    notificationTitle: 'C\'est l\'heure de se reconnecter !',
    notificationBody: 'Vous avez des contacts qui attendent de vos nouvelles',
    
    // Move contact
    moveContact: 'Déplacer le Contact',
    moveTo: 'Déplacer vers',
    contactMoved: 'Contact déplacé !',
  },
  
  it: {
    // Navigation
    pipeline: 'Pipeline',
    groups: 'Gruppi',
    contacts: 'Contatti',
    drafts: 'Bozze',
    profile: 'Profilo',
    
    // Common actions
    save: 'Salva',
    cancel: 'Annulla',
    edit: 'Modifica',
    delete: 'Elimina',
    done: 'Fatto',
    back: 'Indietro',
    search: 'Cerca',
    add: 'Aggiungi',
    create: 'Crea',
    close: 'Chiudi',
    confirm: 'Conferma',
    yes: 'Sì',
    no: 'No',
    ok: 'OK',
    loading: 'Caricamento...',
    saving: 'Salvataggio...',
    
    // Pipeline stages
    weekly: 'Settimanale',
    biWeekly: 'Bisettimanale',
    monthly: 'Mensile',
    quarterly: 'Trimestrale',
    annually: 'Annuale',
    
    // Contact Card
    newContact: 'Nuovo Contatto',
    contactDetails: 'Dettagli Contatto',
    basicInfo: 'Informazioni Base',
    name: 'Nome',
    phone: 'Telefono',
    email: 'Email',
    jobTitle: 'Lavoro',
    location: 'Posizione',
    education: 'Istruzione',
    birthday: 'Compleanno',
    selectBirthday: 'Seleziona data',
    
    // ... (abbreviated for space, same pattern as other languages)
    error: 'Errore',
    success: 'Successo',
    settings: 'Impostazioni',
    logout: 'Esci',
    editProfile: 'Modifica Profilo',
    importContacts: 'Importa Contatti',
    deleteAllContacts: 'Elimina Tutti',
    signInWithGoogle: 'Accedi con Google',
    noAIDraftsYet: 'Nessuna Bozza IA',
    deleteAll: 'Elimina Tutto',
    searchContacts: 'Cerca contatti...',
  },
  
  pt: {
    // Navigation
    pipeline: 'Pipeline',
    groups: 'Grupos',
    contacts: 'Contatos',
    drafts: 'Rascunhos',
    profile: 'Perfil',
    
    // Common actions
    save: 'Salvar',
    cancel: 'Cancelar',
    edit: 'Editar',
    delete: 'Excluir',
    done: 'Pronto',
    back: 'Voltar',
    search: 'Buscar',
    add: 'Adicionar',
    create: 'Criar',
    close: 'Fechar',
    confirm: 'Confirmar',
    yes: 'Sim',
    no: 'Não',
    ok: 'OK',
    loading: 'Carregando...',
    saving: 'Salvando...',
    
    // Pipeline stages
    weekly: 'Semanal',
    biWeekly: 'Quinzenal',
    monthly: 'Mensal',
    quarterly: 'Trimestral',
    annually: 'Anual',
    
    // Contact Card
    newContact: 'Novo Contato',
    contactDetails: 'Detalhes do Contato',
    basicInfo: 'Informações Básicas',
    name: 'Nome',
    phone: 'Telefone',
    email: 'Email',
    jobTitle: 'Trabalho',
    location: 'Localização',
    education: 'Educação',
    birthday: 'Aniversário',
    selectBirthday: 'Selecionar data',
    
    // ... (abbreviated for space, same pattern as other languages)
    error: 'Erro',
    success: 'Sucesso',
    settings: 'Configurações',
    logout: 'Sair',
    editProfile: 'Editar Perfil',
    importContacts: 'Importar Contatos',
    deleteAllContacts: 'Excluir Todos',
    signInWithGoogle: 'Entrar com Google',
    noAIDraftsYet: 'Sem Rascunhos IA',
    deleteAll: 'Excluir Tudo',
    searchContacts: 'Buscar contatos...',
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
      if (storedLang && TRANSLATIONS[storedLang]) {
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
    return TRANSLATIONS[language]?.[key] || TRANSLATIONS['en']?.[key] || key;
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
