import * as Contacts from 'expo-contacts';
import * as FileSystem from 'expo-file-system';
import { Platform, Alert, Linking } from 'react-native';

export interface ImportedContact {
  name: string;
  phoneNumbers?: string[];
  emails?: string[];
  company?: string;
  jobTitle?: string;
  birthday?: string;
  birthdayRaw?: {
    year?: number;
    month?: number;
    day?: number;
  };
  image?: any;
  imageBase64?: string;
  id?: string;
  note?: string;
  location?: string;
  addresses?: string[];
}

// Helper to format birthday - handles both string and number values
function formatBirthday(birthday?: { year?: number | string; month?: number | string; day?: number | string }): string {
  if (!birthday) return '';
  
  // Convert to numbers (expo-contacts can return strings or numbers)
  const year = typeof birthday.year === 'string' ? parseInt(birthday.year) : (birthday.year || 2000);
  // expo-contacts month is 0-indexed on iOS
  const monthRaw = typeof birthday.month === 'string' ? parseInt(birthday.month) : birthday.month;
  const month = monthRaw !== undefined ? monthRaw + 1 : 1; // Convert to 1-indexed
  const day = typeof birthday.day === 'string' ? parseInt(birthday.day) : (birthday.day || 1);
  
  if (isNaN(month) || isNaN(day)) return '';
  
  const monthStr = month.toString().padStart(2, '0');
  const dayStr = day.toString().padStart(2, '0');
  
  return `${year}-${monthStr}-${dayStr}`;
}

export async function requestContactsPermission(): Promise<boolean> {
  try {
    const { status: existingStatus } = await Contacts.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Accept both 'granted' AND 'limited' as valid permissions (iOS 18+)
    if (existingStatus !== 'granted' && existingStatus !== 'limited') {
      const { status } = await Contacts.requestPermissionsAsync();
      finalStatus = status;
    }

    // Both 'granted' and 'limited' allow contact access
    return finalStatus === 'granted' || finalStatus === 'limited';
  } catch (error) {
    console.error('Error requesting contacts permission:', error);
    return false;
  }
}

// Check if we have full access or limited access
export async function getContactAccessLevel(): Promise<'full' | 'limited' | 'denied'> {
  try {
    const { status } = await Contacts.getPermissionsAsync();
    if (status === 'granted') return 'full';
    if (status === 'limited') return 'limited';
    return 'denied';
  } catch (error) {
    return 'denied';
  }
}

export async function importPhoneContacts(): Promise<ImportedContact[]> {
  try {
    if (Platform.OS === 'web') {
      console.log('Contacts not available on web');
      return [];
    }

    console.log('=== CONTACT IMPORT v3.0 (Robust iOS 18+ Support) ===');
    
    // STEP 0: Check and request permission with detailed logging
    console.log('Step 0: Checking permissions...');
    
    let permissionResult;
    try {
      permissionResult = await Contacts.getPermissionsAsync();
      console.log('Permission result:', JSON.stringify(permissionResult));
    } catch (permError: any) {
      console.log('Permission check error:', permError?.message || permError);
      Alert.alert('Fehler', 'Berechtigungsprüfung fehlgeschlagen: ' + (permError?.message || 'Unbekannt'));
      return [];
    }
    
    const { status, canAskAgain } = permissionResult;
    console.log('Permission status:', status, '| canAskAgain:', canAskAgain);
    
    // iOS 18+ can return 'limited' which is still valid!
    const hasAccess = status === 'granted' || status === 'limited';
    const isLimitedAccess = status === 'limited';
    
    if (!hasAccess) {
      console.log('No access, requesting permission...');
      try {
        const requestResult = await Contacts.requestPermissionsAsync();
        console.log('Request result:', JSON.stringify(requestResult));
        
        if (requestResult.status !== 'granted' && requestResult.status !== 'limited') {
          console.log('Permission denied after request');
          Alert.alert(
            'Berechtigung erforderlich', 
            'Bitte erlaube Zugriff auf Kontakte in den Einstellungen.\n\nGehe zu: Einstellungen → Datenschutz → Kontakte → Expo Go → Voller Zugriff',
            [
              { text: 'Abbrechen' },
              { text: 'Einstellungen öffnen', onPress: () => Linking.openSettings() }
            ]
          );
          return [];
        }
      } catch (reqError: any) {
        console.log('Permission request error:', reqError?.message || reqError);
        return [];
      }
    }
    
    // Log access type for debugging
    console.log('Access type:', isLimitedAccess ? 'LIMITED (iOS 18+)' : 'FULL');

    // STEP 1: Try to get contacts - start simple, no fields specified
    console.log('Step 1: Fetching contacts (simple mode first)...');
    
    let allContacts: Contacts.Contact[] = [];
    
    try {
      // First try: No fields specified - most compatible
      console.log('Trying simple fetch without field specification...');
      const simpleResult = await Contacts.getContactsAsync({
        pageSize: 10000,
      });
      
      console.log('Simple fetch result: ' + (simpleResult?.data?.length || 0) + ' contacts');
      
      if (simpleResult?.data && simpleResult.data.length > 0) {
        allContacts = simpleResult.data;
      }
    } catch (simpleError: any) {
      console.log('Simple fetch failed:', simpleError?.message || simpleError);
    }
    
    // If simple fetch failed or returned 0, try with fields
    if (allContacts.length === 0) {
      console.log('Simple fetch returned 0, trying with basic fields...');
      try {
        const basicResult = await Contacts.getContactsAsync({
          fields: [
            Contacts.Fields.ID,
            Contacts.Fields.Name,
            Contacts.Fields.FirstName,
            Contacts.Fields.LastName,
            Contacts.Fields.PhoneNumbers,
            Contacts.Fields.Emails,
          ],
          pageSize: 10000,
        });
        
        console.log('Basic fields fetch result: ' + (basicResult?.data?.length || 0) + ' contacts');
        
        if (basicResult?.data) {
          allContacts = basicResult.data;
        }
      } catch (basicError: any) {
        console.log('Basic fields fetch failed:', basicError?.message || basicError);
      }
    }
    
    if (allContacts.length === 0) {
      console.log('ERROR: Could not fetch any contacts');
      console.log('This usually means:');
      console.log('1. Permission was not properly granted');
      console.log('2. Or there are no contacts on the device');
      console.log('3. Or iOS is blocking access');
      
      Alert.alert(
        'Keine Kontakte gefunden',
        'Es konnten keine Kontakte gelesen werden.\n\n' +
        'Bitte prüfe:\n' +
        '1. Einstellungen → Datenschutz → Kontakte\n' +
        '2. Finde "Expo Go" und wähle "Voller Zugriff"\n' +
        '3. Starte die App komplett neu (nicht nur minimieren)\n' +
        '4. Versuche es erneut',
        [
          { text: 'OK' },
          { text: 'Einstellungen', onPress: () => Linking.openSettings() },
        ]
      );
      return [];
    }

    console.log('Successfully fetched ' + allContacts.length + ' contacts');

    // STEP 2: Now try to enrich each contact with extended fields
    console.log('Step 2: Enriching contacts with extended fields...');
    
    const importedContacts: ImportedContact[] = [];
    let stats = { birthdays: 0, images: 0, notes: 0, addresses: 0, enriched: 0 };

    // Extended fields to request for individual contacts
    const extendedFields = [
      Contacts.Fields.ID,
      Contacts.Fields.Name,
      Contacts.Fields.FirstName,
      Contacts.Fields.LastName,
      Contacts.Fields.PhoneNumbers,
      Contacts.Fields.Emails,
      Contacts.Fields.Company,
      Contacts.Fields.JobTitle,
      Contacts.Fields.Birthday,
      Contacts.Fields.Image,
      Contacts.Fields.Note,
      Contacts.Fields.Addresses,
    ].filter(Boolean);

    for (let i = 0; i < allContacts.length; i++) {
      let contact = allContacts[i];
      
      // Try to get extended data for each contact individually
      if (contact.id) {
        try {
          const enrichedContact = await Contacts.getContactByIdAsync(contact.id, extendedFields);
          if (enrichedContact) {
            contact = enrichedContact;
            stats.enriched++;
          }
        } catch (e) {
          // Keep using the original contact data
        }
      }
      
      const name = contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
      if (!name) continue;

      // Birthday processing
      let birthdayFormatted: string | undefined;
      let birthdayRaw: { year?: number; month?: number; day?: number } | undefined;
      
      if (contact.birthday) {
        birthdayRaw = {
          year: contact.birthday.year,
          month: contact.birthday.month,
          day: contact.birthday.day,
        };
        birthdayFormatted = formatBirthday(contact.birthday);
        if (birthdayFormatted) {
          stats.birthdays++;
          if (stats.birthdays <= 5) {
            console.log('✅ Birthday: ' + name + ' -> ' + birthdayFormatted);
          }
        }
      }

      // Addresses processing
      let location: string | undefined;
      let addressStrings: string[] = [];
      if (contact.addresses && contact.addresses.length > 0) {
        addressStrings = contact.addresses.map(addr => {
          const parts = [
            addr.street,
            addr.city, 
            addr.region,
            addr.postalCode,
            addr.country
          ].filter(Boolean);
          return parts.join(', ');
        }).filter(a => a.length > 0);
        
        location = addressStrings[0];
        if (location) stats.addresses++;
      }

      // Image to base64
      let imageBase64: string | undefined;
      if (contact.image?.uri) {
        try {
          const base64 = await FileSystem.readAsStringAsync(contact.image.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          imageBase64 = `data:image/jpeg;base64,${base64}`;
          stats.images++;
          if (stats.images <= 3) {
            console.log('✅ Image: ' + name);
          }
        } catch (e) {
          // Silent fail for image
        }
      }

      // Note processing
      if (contact.note) {
        stats.notes++;
        if (stats.notes <= 3) {
          console.log('✅ Note: ' + name);
        }
      }

      importedContacts.push({
        name,
        phoneNumbers: contact.phoneNumbers?.map(p => p.number || '').filter(Boolean) || [],
        emails: contact.emails?.map(e => e.email || '').filter(Boolean) || [],
        company: contact.company,
        jobTitle: contact.jobTitle,
        birthday: birthdayFormatted,
        birthdayRaw,
        image: contact.image,
        imageBase64,
        id: contact.id,
        note: contact.note,
        location,
        addresses: addressStrings,
      });
      
      // Progress log every 50 contacts
      if ((i + 1) % 50 === 0) {
        console.log('Progress: ' + (i + 1) + '/' + allContacts.length);
      }
    }

    console.log('=== IMPORT COMPLETE ===');
    console.log('Total contacts: ' + importedContacts.length);
    console.log('With birthday: ' + stats.birthdays);
    console.log('With image: ' + stats.images);
    console.log('With note: ' + stats.notes);
    console.log('With address: ' + stats.addresses);
    console.log('Enriched individually: ' + stats.enriched);

    // Show helpful alert if no extended data was found
    if (stats.birthdays === 0 && stats.images === 0 && importedContacts.length > 5) {
      const isIOS = Platform.OS === 'ios';
      
      if (isIOS) {
        Alert.alert(
          'Erweiterte Daten fehlen',
          'Kontakte wurden geladen, aber Geburtstage und Bilder fehlen.\n\n' +
          'Für vollen Zugriff:\n' +
          '1. Gehe zu Einstellungen → Datenschutz → Kontakte\n' +
          '2. Tippe auf "Expo Go"\n' +
          '3. Wähle "Voller Zugriff" (nicht "Eingeschränkt")\n' +
          '4. Schließe Expo Go komplett (aus App-Übersicht wischen)\n' +
          '5. Öffne die App neu und importiere erneut',
          [
            { text: 'Verstanden' },
            { text: 'Einstellungen', onPress: () => Linking.openSettings() },
          ]
        );
      }
    }

    return importedContacts;
  } catch (error: any) {
    console.error('Import error:', error?.message || error);
    Alert.alert('Import Fehler', error?.message || 'Unbekannter Fehler beim Import');
    throw error;
  }
}

export function formatContactForCRM(importedContact: ImportedContact) {
  return {
    name: importedContact.name,
    job: importedContact.jobTitle || importedContact.company || '',
    phone: importedContact.phoneNumbers?.[0] || '',
    email: importedContact.emails?.[0] || '',
    birthday: importedContact.birthday || '',
    profile_picture: importedContact.imageBase64 || '',
    device_contact_id: importedContact.id || '',
    tags: [],
    groups: [],
    pipeline_stage: 'New',
    language: 'English',
    tone: 'Casual',
    notes: importedContact.note || '',
    location: importedContact.location || '',
  };
}
